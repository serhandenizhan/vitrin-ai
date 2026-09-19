"""Tek dönem/kota kararı; hiçbir ağ çağrısı açık DB işlemi içinde yapılmaz."""

from sqlalchemy import text

from app.services.billing.db import one, many, execute
from app.services.billing.errors import billing_error
from app.services.billing.provider import ProviderError


async def locked_subscription(db, user_id):
    sub = await one(
        db, "SELECT * FROM subscriptions WHERE user_id=:uid FOR UPDATE", uid=user_id
    )
    if not sub:
        raise billing_error("auth_required", "Hesap bulunamadı.", 401, retry_safe=True)
    if sub["deletion_requested_at"]:
        raise billing_error(
            "account_deletion_pending",
            "Hesabınızın silinmesi işleniyor.",
            retry_safe=True,
        )
    return sub


async def current_period(db, user_id):
    return await one(
        db,
        """SELECT p.*, v.background_tier, v.price_minor_units, v.currency, v.plan_id,
        v.iyzico_pricing_plan_reference_code, v.iyzico_trial_plan_reference_code
        FROM subscription_periods p JOIN plan_versions v ON v.id=p.plan_version_id
        WHERE p.user_id=:uid AND p.status='active' ORDER BY p.starts_at DESC LIMIT 1""",
        uid=user_id,
    )


async def ensure_period(db, user_id, provider):
    sub = await locked_subscription(db, user_id)
    now = await db.scalar(text("SELECT clock_timestamp()"))
    period = await current_period(db, user_id)
    if sub["status"] == "suspended":
        await db.commit()
        raise billing_error(
            "subscription_inactive", "Abonelik erişimi kapalı.", 403, retry_safe=True
        )
    # Ödeme alınamadığında erişim ANINDA kesilmez: kullanıcı kararı gereği
    # (bkz. Faz 5 spec "v5 sonrası" 3. madde) `past_due` durumunda en fazla
    # 3 gün daha mevcut dönemin KALAN kotasıyla çalışılır — yeni kredi
    # verilmez, dönem yenilenmez. Süre dolduğunda abonelik `expired` olur.
    in_grace = bool(
        sub["status"] == "past_due"
        and sub["past_due_access_until"]
        and now < sub["past_due_access_until"]
    )
    if sub["status"] == "past_due" and not in_grace:
        await execute(
            db,
            "UPDATE subscription_periods SET status='expired',closed_at=now() WHERE subscription_id=:sid AND status='active'",
            sid=sub["id"],
        )
        await execute(
            db,
            "UPDATE subscriptions SET status='expired',updated_at=now() WHERE id=:id AND status='past_due'",
            id=sub["id"],
        )
        await db.commit()
        raise billing_error(
            "subscription_expired",
            "Satın alınmış erişim süresi doldu.",
            403,
            retry_safe=True,
        )
    if (
        period
        and period["starts_at"] <= now < period["ends_at"]
        and (not sub["access_until"] or now < sub["access_until"])
    ):
        await db.commit()
        return period
    if sub["provider"] is None and sub["status"] == "active":
        # Aylık sınır eski dönemin başlangıcından türetilir; kullanılmayan aylar birikmez.
        version = await one(
            db,
            "SELECT * FROM plan_versions WHERE plan_id='deneme' AND retired_at IS NULL AND published_at IS NOT NULL",
        )
        await execute(
            db,
            "UPDATE subscription_periods SET status='expired',closed_at=now() WHERE subscription_id=:sid AND status='active'",
            sid=sub["id"],
        )
        start = period["ends_at"] if period else now
        row = await one(
            db,
            """WITH boundary AS (
              SELECT COALESCE(max(d), :now) AS start FROM generate_series(CAST(:start AS timestamptz),CAST(:now AS timestamptz),interval '1 month') d)
            INSERT INTO subscription_periods(subscription_id,user_id,plan_version_id,starts_at,ends_at,quota_snapshot)
            SELECT :sid,:uid,:vid,start,start+interval '1 month',:quota FROM boundary RETURNING *""",
            now=now,
            start=start,
            sid=sub["id"],
            uid=user_id,
            vid=version["id"],
            quota=version["monthly_quota"],
        )
        await execute(
            db,
            "UPDATE subscriptions SET access_until=:end WHERE id=:id",
            end=row["ends_at"],
            id=sub["id"],
        )
        await db.commit()
        return await current_period(db, user_id)
    if sub["status"] in ("canceled", "expired"):
        await execute(
            db,
            "UPDATE subscription_periods SET status='expired',closed_at=now() WHERE subscription_id=:sid AND status='active'",
            sid=sub["id"],
        )
        await db.commit()
        raise billing_error(
            "subscription_expired",
            "Satın alınmış erişim süresi doldu.",
            403,
            retry_safe=True,
        )
    winner = not sub["renewal_check_after"] or sub["renewal_check_after"] <= now
    if winner:
        await execute(
            db,
            "UPDATE subscriptions SET renewal_check_after=now()+interval '60 seconds' WHERE id=:id",
            id=sub["id"],
        )
    await db.commit()
    if winner and sub["provider_subscription_reference"]:
        try:
            from app.services.billing.payments import apply_subscription

            evidence = await provider.subscription(
                sub["provider_subscription_reference"]
            )
            await apply_subscription(db, user_id, evidence)
            latest = await current_period(db, user_id)
            await db.commit()
            if latest and latest["starts_at"] <= now < latest["ends_at"]:
                return latest
        except ProviderError:
            await db.rollback()
    if in_grace and period:
        # Yenileme hâlâ doğrulanamadı ama grace penceresi sürüyor: dönem
        # kapanmaz, kalan kota kullanılmaya devam eder.
        await db.commit()
        return period
    raise billing_error(
        "billing_renewal_pending",
        "Dönem ödemeniz doğrulanıyor. Bir dakika sonra yeniden deneyin.",
        retry=60,
        retry_safe=True,
    )


async def background_tier(db, user_id, provider):
    if await one(db, "SELECT user_id FROM admin_users WHERE user_id=:uid", uid=user_id):
        await db.commit()
        return "full"
    period = await ensure_period(db, user_id, provider)
    await db.commit()
    return period["background_tier"]


#: Ödeme alınamadığında erişimin ne kadar süre daha açık kalacağı (ürün kararı,
#: Faz 5 spec "v5 sonrası" 3. madde). Tek kaynak: `maintenance.py` `past_due`
#: geçişinde bu değeri kullanır, `ensure_period` de buna bakar.
PAST_DUE_GRACE = "3 days"

#: Başarılı sonucun geçici R2 nesnesi olarak ne kadar saklanacağı. Aynı
#: `Idempotency-Key` bu süre boyunca inference'ı YENİDEN ÇALIŞTIRMADAN aynı
#: PNG'yi geri verir; süre dolunca nesne bakım işi tarafından silinir.
RESULT_RETENTION = "24 hours"


class Reservation:
    """Kota kararının sonucu.

    `id` doluysa yeni bir kredi tüketildi ve iş çalıştırılmalı. `result_key`
    doluysa bu iş DAHA ÖNCE başarıyla bitmiş ve sonucu saklanıyor: inference
    çalıştırılmaz, saklanan PNG döner, ikinci kredi harcanmaz. İkisi de boşsa
    kullanıcı kotadan muaftır (admin).
    """

    __slots__ = ("id", "result_key")

    def __init__(self, id=None, result_key=None):
        self.id = id
        self.result_key = result_key


#: "Bu dönem şu anda kullanılabilir mi" koşulu. Kotayı BİLİNÇLİ olarak içermez:
#: aynı koşul hem krediyi düşen atomik UPDATE'te hem de kota tükendiğinde
#: "abonelik zaten kullanılamaz mıydı" sorusunu ayıran SELECT'te kullanılıyor.
#: İkisi ayrı yazılsaydı kaçınılmaz olarak ayrışır ve bonus kredi, erişimi
#: kapalı bir aboneliği sessizce açardı. Sabit bir SQL parçası — kullanıcı
#: girdisi yok, parametreler her iki sorguda da bağlı (bound) geçiyor.
_ENTITLED_PERIOD = """p.user_id=:uid AND p.status='active'
        AND p.starts_at<=clock_timestamp() AND s.deletion_requested_at IS NULL
        AND ((s.status IN ('active','trialing','canceling','canceled') AND p.ends_at>clock_timestamp())
             OR (s.status='past_due' AND s.past_due_access_until>clock_timestamp()))"""


async def _return_credit(db, period_id, grant_id):
    """Alınan krediyi ALINDIĞI kovaya iade eder.

    Kaynağa bakmadan dönemin sayacını düşürmek, bonus krediyle yapılan bir işin
    başarısız olmasında dönemin sayacını olduğundan düşük gösterirdi: kullanıcı
    aynı dönemde bir kredi fazla kullanabilirdi.
    """
    if grant_id is not None:
        await execute(
            db, "UPDATE credit_grants SET used=used-1 WHERE id=:id", id=grant_id
        )
    else:
        await execute(
            db,
            "UPDATE subscription_periods SET used_this_period=used_this_period-1 WHERE id=:id",
            id=period_id,
        )


async def available_credit_grants(db, user_id):
    """Kullanıcının harcanabilir bonus kredisi (hesap ve admin ekranları için)."""
    return await one(
        db,
        """SELECT COALESCE(sum(amount-used),0)::int AS available, min(expires_at) AS expires_at
        FROM credit_grants WHERE user_id=:uid AND revoked_at IS NULL AND used<amount
        AND (expires_at IS NULL OR expires_at>clock_timestamp())""",
        uid=user_id,
    )


async def reserve(db, user_id, request_id, provider):
    if await one(db, "SELECT user_id FROM admin_users WHERE user_id=:uid", uid=user_id):
        await db.commit()
        return Reservation()
    await locked_subscription(db, user_id)
    await db.commit()
    existing = await one(
        db,
        """SELECT id,status,result_r2_key,result_expires_at FROM usage_reservations
        WHERE user_id=:uid AND request_id=:rid""",
        uid=user_id,
        rid=request_id,
    )
    now = await db.scalar(text("SELECT clock_timestamp()"))
    await db.commit()
    if existing and existing["status"] == "pending":
        # Aynı anahtarla ikinci bir istek: ya kullanıcı iki kez tıkladı ya da
        # istemci aynı işi tekrar gönderdi. İkinci bir rezervasyon (ikinci
        # kredi) AÇILMAZ.
        raise billing_error(
            "request_in_progress",
            "Bu işlem hâlâ sürüyor; sonucunu bekleyin.",
        )
    if existing and existing["status"] == "consumed":
        # Kredi zaten harcandı. Yanıt istemciye ulaşmamış olabilir (ağ koptu):
        # saklanan sonuç varsa inference HİÇ çalıştırılmadan o döner, ikinci
        # kredi tüketilmez. Saklama süresi dolduysa aynı anahtar artık bir şey
        # vaat etmiyor — bu hata bilinçli olarak "güvenli tekrar" DEĞİL, aksi
        # hâlde istemci yeni anahtarla ikinci krediyi yakardı.
        if existing["result_r2_key"] and existing["result_expires_at"] > now:
            return Reservation(result_key=existing["result_r2_key"])
        raise billing_error(
            "request_already_processed",
            "Bu işlemin sonucu artık saklanmıyor; yeni bir işlem başlatın.",
        )
    await ensure_period(db, user_id, provider)
    await locked_subscription(db, user_id)
    row = await one(
        db,
        f"""UPDATE subscription_periods p SET used_this_period=used_this_period+1
        FROM subscriptions s WHERE p.subscription_id=s.id AND {_ENTITLED_PERIOD}
        AND p.used_this_period<p.quota_snapshot RETURNING p.id""",
        uid=user_id,
    )
    grant_id = None
    if not row:
        # Dönem kotası tükenmiş OLABİLİR ya da abonelik zaten kullanılamaz
        # durumda olabilir; yukarıdaki tek sorgu ikisini ayırt etmiyor. Bonus
        # kredi yalnızca BİRİNCİ durumda devreye girer: admin'in verdiği kredi
        # askıya alınmış/süresi dolmuş bir aboneliği DİRİLTMEZ.
        period = await one(
            db,
            f"""SELECT p.id FROM subscription_periods p JOIN subscriptions s ON p.subscription_id=s.id
            WHERE {_ENTITLED_PERIOD}""",
            uid=user_id,
        )
        grant = (
            await one(
                db,
                """UPDATE credit_grants SET used=used+1 WHERE id=(
                SELECT id FROM credit_grants WHERE user_id=:uid AND revoked_at IS NULL
                AND used<amount AND (expires_at IS NULL OR expires_at>clock_timestamp())
                ORDER BY expires_at NULLS LAST, created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                RETURNING id""",
                uid=user_id,
            )
            if period
            else None
        )
        if not grant:
            await db.commit()
            raise billing_error(
                "quota_exceeded", "Bu dönemdeki krediniz tükendi.", 402, retry_safe=True
            )
        # Rezervasyon yine AKTİF DÖNEME bağlanır (`period_id` NOT NULL ve
        # `usage_events` dönem üzerinden raporlanıyor); krediyi hangi kovadan
        # aldığı `grant_id`'de durur.
        row, grant_id = period, grant["id"]
    # `released` bir anahtar yeniden kullanılabilir: o iş kesin BAŞARISIZ olmuş
    # ve kredi iade edilmişti, yani aynı mantıksal iş henüz tamamlanmadı.
    reservation = await one(
        db,
        """INSERT INTO usage_reservations(period_id,user_id,request_id,grant_id)
        VALUES(:pid,:uid,:rid,:gid)
        ON CONFLICT(user_id,request_id) DO UPDATE SET period_id=excluded.period_id,
        grant_id=excluded.grant_id,
        status='pending',resolved_at=NULL,result_r2_key=NULL,result_expires_at=NULL,
        created_at=now()
        WHERE usage_reservations.status='released' RETURNING id""",
        pid=row["id"],
        uid=user_id,
        rid=request_id,
        gid=grant_id,
    )
    if not reservation:
        # Araya giren başka bir istek aynı anahtarı yeniden açtı; az önce
        # alınan kredi ALINDIĞI kovaya geri verilir.
        await _return_credit(db, row["id"], grant_id)
        await db.commit()
        raise billing_error(
            "request_in_progress", "Bu işlem hâlâ sürüyor; sonucunu bekleyin."
        )
    await db.commit()
    return Reservation(id=reservation["id"])


async def resolve_reservation(db, reservation_id, success, result_key=None):
    if reservation_id is None:
        return True
    row = await one(
        db,
        f"""UPDATE usage_reservations SET status=:status,resolved_at=now(),
        result_r2_key=CAST(:key AS text),
        result_expires_at=CASE WHEN CAST(:key AS text) IS NULL THEN NULL
                          ELSE now()+interval '{RESULT_RETENTION}' END
        WHERE id=:id AND status='pending' RETURNING *""",
        id=reservation_id,
        status="consumed" if success else "released",
        key=result_key if success else None,
    )
    if row:
        if success:
            await execute(
                db,
                """INSERT INTO usage_events(period_id,reservation_id,user_id)
                VALUES(:pid,:rid,:uid)""",
                pid=row["period_id"],
                rid=row["id"],
                uid=row["user_id"],
            )
        else:
            await _return_credit(db, row["period_id"], row["grant_id"])
    await db.commit()
    return bool(row)


async def expire_reservations(db):
    rows = await many(
        db,
        "SELECT id FROM usage_reservations WHERE status='pending' AND created_at<now()-interval '5 minutes'",
    )
    await db.commit()
    for row in rows:
        await resolve_reservation(db, row["id"], False)
