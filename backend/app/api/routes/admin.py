"""Faz 6 admin API'si: kullanıcılar, bonus krediler ve kullanım istatistikleri.

YETKİ: her uç `require_admin`'e bağlı — rol kontrolü backend'de ve her istekte
veritabanından yapılıyor (`SECURITY.md` 3.2). Arayüzün bir düğmeyi gizlemesi
yetkilendirme sayılmaz.

HIZ SINIRI YÖNÜ BİLİNÇLİ SEÇİLDİ (kök `CLAUDE.md` fail-open/fail-closed kuralı):
okuma uçları `limit_scoped` ile **fail-open** (Redis arızası panelin bütün
sayfalarını karartmasın), yazan uçlar `limit_admin` ile **fail-closed** (kredi
verme ve hesap silme para/erişim yüzeyi).

E-POSTALAR: `auth.users` doğrudan sorgulanmıyor; Supabase'in kendi yönetici
API'si kullanılıyor (gerekçe `app/services/supabase_admin.py` modül açıklaması).
"""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.account import same_email
from app.core.auth import CurrentUser, require_admin
from app.core.db import get_db_session
from app.services import admin_audit
from app.services.billing.db import enqueue, execute, many, one
from app.services.billing.errors import billing_error
from app.services.billing.limits import limit_admin, limit_scoped
from app.services.supabase_admin import (
    SupabaseAdminConfigurationError,
    SupabaseAdminError,
    SupabaseAdminService,
    get_supabase_admin,
)

router = APIRouter()


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CreditGrantRequest(StrictModel):
    amount: int = Field(gt=0, le=10000)
    reason: str = Field(min_length=3, max_length=500)
    idempotency_key: uuid.UUID
    # `AwareDatetime`: saat dilimi ZORUNLU. Sütun `timestamptz` olduğu için
    # veritabanından her zaman saat dilimli dönüyor; saat dilimsiz bir girdi
    # kabul edilseydi aynı anahtarla yapılan tekrar denemesinde karşılaştırma
    # (naive == aware → her zaman False) sahte bir `idempotency_conflict`
    # üretirdi. Zaten bir son kullanma anının saat dilimsizi de anlamsızdır.
    expires_at: AwareDatetime | None = None


class UserDeletionRequest(StrictModel):
    # Kullanıcının kendi silme akışındaki (`DELETE /api/account`) e-posta yazma
    # adımının aynısı: geri döndürülemez bir işlem, yanlış satıra tıklanarak
    # yapılamamalı.
    #
    # BİLİNÇLİ OLARAK `idempotency_key` YOK: silme işinin kimliği hesabın
    # kendisinden türüyor (`delete:<user_id>`), yani istemciden gelen bir
    # anahtarın hiçbir etkisi olmazdı. Etkisiz bir alan istemekten kötüsü,
    # yöneticinin "yeni anahtar yeni deneme başlatır" sanmasıdır — oysa
    # başarısız eylemi bakım turu zaten yeniden deniyor (ders 24'ün tersi
    # yönü: anahtar İŞİ tanımlıyorsa, iş zaten tekse anahtar gereksizdir).
    email: str = Field(min_length=1, max_length=254)


def _supabase_unavailable(exc: Exception):
    return billing_error(
        "supabase_unavailable",
        "Kimlik doğrulama sunucusuna ulaşılamadı; kullanıcı bilgileri okunamıyor."
        if isinstance(exc, SupabaseAdminError)
        else str(exc),
        503,
    )


#: Kullanıcı listesinin abonelik/kota/kullanım tarafı. Supabase'den gelen sayfa
#: bu sorguyla TEK seferde zenginleştiriliyor; kullanıcı başına sorgu açmak
#: 25 satırlık bir sayfada 25 gidiş-dönüş demek olurdu.
ENRICHMENT_SQL = """
SELECT s.user_id, s.status, s.access_until, s.deletion_requested_at,
 p.used_this_period, p.quota_snapshot, p.ends_at AS period_ends_at,
 v.plan_id, v.background_tier,
 COALESCE(g.available,0) AS bonus_available,
 COALESCE(pr.project_count,0) AS project_count,
 u.last_usage_at,
 (a.user_id IS NOT NULL) AS is_admin
FROM subscriptions s
LEFT JOIN subscription_periods p ON p.subscription_id=s.id AND p.status='active'
LEFT JOIN plan_versions v ON v.id=p.plan_version_id
LEFT JOIN admin_users a ON a.user_id=s.user_id
LEFT JOIN LATERAL (SELECT sum(amount-used)::int AS available FROM credit_grants c
 WHERE c.user_id=s.user_id AND c.revoked_at IS NULL AND c.used<c.amount
 AND (c.expires_at IS NULL OR c.expires_at>clock_timestamp())) g ON true
LEFT JOIN LATERAL (SELECT count(*)::int AS project_count FROM projects pj
 WHERE pj.user_id=s.user_id) pr ON true
LEFT JOIN LATERAL (SELECT max(created_at) AS last_usage_at FROM usage_events e
 WHERE e.user_id=s.user_id) u ON true
WHERE s.user_id = ANY(CAST(:ids AS uuid[]))
"""


@router.get("/api/admin/users")
async def list_users(
    request: Request,
    query: str | None = Query(default=None, max_length=254),
    page: int = Query(default=1, ge=1, le=1000),
    per_page: int = Query(default=25, ge=1, le=100),
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    supabase: SupabaseAdminService = Depends(get_supabase_admin),
):
    await limit_scoped(request, "admin", admin.id)
    try:
        users = await supabase.list_users(page, per_page, query)
    except (SupabaseAdminConfigurationError, SupabaseAdminError) as exc:
        raise _supabase_unavailable(exc) from exc
    if not users:
        return {"users": [], "page": page, "per_page": per_page}

    rows = await many(
        db, ENRICHMENT_SQL, ids=[str(user.get("id")) for user in users]
    )
    billing = {str(row["user_id"]): dict(row) for row in rows}
    return {
        "users": [
            {
                "id": user.get("id"),
                "email": user.get("email"),
                "created_at": user.get("created_at"),
                "last_sign_in_at": user.get("last_sign_in_at"),
                "email_confirmed_at": user.get("email_confirmed_at"),
                # Abonelik satırı yoksa (Supabase'de var, bizde henüz tetikleyici
                # çalışmamış) alan boş döner; liste eksik satır yüzünden kırılmaz.
                "billing": billing.get(str(user.get("id"))),
            }
            for user in users
        ],
        "page": page,
        "per_page": per_page,
    }


@router.get("/api/admin/users/{user_id}")
async def get_user(
    user_id: uuid.UUID,
    request: Request,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    supabase: SupabaseAdminService = Depends(get_supabase_admin),
):
    await limit_scoped(request, "admin", admin.id)
    try:
        account = await supabase.get_user(user_id)
    except (SupabaseAdminConfigurationError, SupabaseAdminError) as exc:
        raise _supabase_unavailable(exc) from exc

    billing = await many(db, ENRICHMENT_SQL, ids=[str(user_id)])
    if not account and not billing:
        raise billing_error("not_found", "Kullanıcı bulunamadı.", 404)
    return {
        "account": {
            "id": str(user_id),
            "email": (account or {}).get("email"),
            "created_at": (account or {}).get("created_at"),
            "last_sign_in_at": (account or {}).get("last_sign_in_at"),
            "email_confirmed_at": (account or {}).get("email_confirmed_at"),
        },
        "billing": dict(billing[0]) if billing else None,
        "periods": await many(
            db,
            """SELECT p.id,p.starts_at,p.ends_at,p.quota_snapshot,p.used_this_period,
            p.status,v.plan_id FROM subscription_periods p JOIN plan_versions v ON v.id=p.plan_version_id
            WHERE p.user_id=:uid ORDER BY p.starts_at DESC LIMIT 12""",
            uid=user_id,
        ),
        "credit_grants": await many(
            db,
            """SELECT id,amount,used,reason,granted_by,expires_at,revoked_at,created_at
            FROM credit_grants WHERE user_id=:uid ORDER BY created_at DESC LIMIT 50""",
            uid=user_id,
        ),
        "transactions": await many(
            db,
            """SELECT id,type,status,amount_minor_units,currency,invoice_reference,created_at
            FROM billing_transactions WHERE user_id=:uid ORDER BY created_at DESC LIMIT 50""",
            uid=user_id,
        ),
        "consents": await many(
            db,
            """SELECT document_type,document_version,locale,source,recorded_at FROM user_consents
            WHERE user_id=:uid ORDER BY recorded_at DESC LIMIT 50""",
            uid=user_id,
        ),
        "recent_usage": await many(
            db,
            """SELECT created_at,event_type FROM usage_events WHERE user_id=:uid
            ORDER BY created_at DESC LIMIT 20""",
            uid=user_id,
        ),
        "open_actions": await many(
            db,
            """SELECT id,kind,status,attempts,last_error,created_at FROM provider_actions
            WHERE user_id=:uid AND status<>'succeeded' ORDER BY created_at DESC LIMIT 20""",
            uid=user_id,
        ),
    }


@router.delete(
    "/api/admin/users/{user_id}",
    status_code=202,
    dependencies=[Depends(limit_admin)],
)
async def delete_user(
    user_id: uuid.UUID,
    payload: UserDeletionRequest,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    supabase: SupabaseAdminService = Depends(get_supabase_admin),
):
    """Silme, kullanıcının kendi akışıyla AYNI kuyruğa girer.

    Ayrı bir silme yolu yazmak, `billing_delete_guard` ve uzak abonelik iptali
    gibi Faz 5 korumalarını ikinci kez (ve er ya da geç farklı) uygulamak
    demekti. Buradaki tek fark onayın kimden geldiği ve denetim satırı.
    """
    try:
        account = await supabase.get_user(user_id)
    except (SupabaseAdminConfigurationError, SupabaseAdminError) as exc:
        raise _supabase_unavailable(exc) from exc
    if not account or not account.get("email"):
        raise billing_error("not_found", "Kullanıcı bulunamadı.", 404)
    if not same_email(payload.email, account["email"]):
        raise billing_error(
            "confirmation_mismatch",
            "Hesabı silmek için kullanıcının e-posta adresini doğru yazın.",
            400,
        )

    subscription = await one(
        db, "SELECT id FROM subscriptions WHERE user_id=:uid FOR UPDATE", uid=user_id
    )
    if not subscription:
        raise billing_error("not_found", "Hesap bulunamadı.", 404)
    await execute(
        db,
        """UPDATE subscriptions SET deletion_requested_at=COALESCE(deletion_requested_at,now())
        WHERE user_id=:uid""",
        uid=user_id,
    )
    # Anahtar İŞİ tanımlıyor (kullanıcının kendi akışıyla aynı desen): aynı
    # hesap için ikinci bir silme isteği ikinci bir eylem açmaz.
    action = await enqueue(db, user_id, "delete_account", user_id, "delete:" + str(user_id))
    await admin_audit.record(
        db, admin.id, "user_delete", "user", user_id, {"action_id": str(action["id"])}
    )
    await db.commit()
    return {"action_id": str(action["id"]), "status": action["status"]}


@router.post(
    "/api/admin/users/{user_id}/credits",
    status_code=201,
    dependencies=[Depends(limit_admin)],
)
async def grant_credits(
    user_id: uuid.UUID,
    payload: CreditGrantRequest,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Dönem kotasının DIŞINDA bonus kredi verir.

    Dönemin `quota_snapshot`'ı değiştirilmiyor: o alan bir kanıt kaydı ve
    migration 0006'daki trigger'la değişmez. Bonus kredi kendi tablosunda durur
    ve dönem kotası tükendiğinde tüketilir (`entitlements.reserve`).
    """
    if not await one(db, "SELECT id FROM subscriptions WHERE user_id=:uid", uid=user_id):
        raise billing_error("not_found", "Hesap bulunamadı.", 404)

    # İdempotency anahtarı İŞİ tanımlar, isteği değil (kök CLAUDE.md ders 24):
    # ağda kaybolan bir yanıt yüzünden tekrar gönderilen istek İKİNCİ krediyi
    # açmaz, var olan kaydı geri döndürür.
    grant = await one(
        db,
        """INSERT INTO credit_grants(user_id,amount,reason,granted_by,idempotency_key,expires_at)
        VALUES(:uid,:amount,:reason,:actor,:key,:expires)
        ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key
        RETURNING id,user_id,amount,used,reason,expires_at,revoked_at,created_at""",
        uid=user_id,
        amount=payload.amount,
        reason=payload.reason,
        actor=admin.id,
        key=f"admin-credit:{payload.idempotency_key}",
        expires=payload.expires_at,
    )
    # Aynı anahtarın BAŞKA bir iş için yeniden kullanılması sessizce "başarılı"
    # sayılmaz: istemci hangi işi tekrarladığını sanıyorsa onun sonucunu almalı.
    # `reason` karşılaştırmaya girmiyor (yalnız açıklama metni); kullanıcı,
    # miktar ve son kullanma tarihi işin KENDİSİNİ tanımlıyor.
    if (
        grant["user_id"] != user_id
        or grant["amount"] != payload.amount
        or grant["expires_at"] != payload.expires_at
    ):
        raise billing_error(
            "idempotency_conflict",
            "Bu anahtar farklı bir kredi işlemi için kullanılmış.",
        )
    await admin_audit.record(
        db,
        admin.id,
        "credit_grant",
        "credit_grant",
        grant["id"],
        {"user_id": str(user_id), "amount": payload.amount, "reason": payload.reason},
    )
    await db.commit()
    return dict(grant)


@router.post("/api/admin/credits/{grant_id}/revoke", dependencies=[Depends(limit_admin)])
async def revoke_credits(
    grant_id: uuid.UUID,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Kullanılmamış kalanı geri alır; harcanmış kısım harcanmış kalır."""
    grant = await one(
        db,
        """UPDATE credit_grants SET revoked_at=now() WHERE id=:id AND revoked_at IS NULL
        RETURNING id,user_id,amount,used,revoked_at""",
        id=grant_id,
    )
    if not grant:
        raise billing_error(
            "revoke_conflict", "Kredi bulunamadı veya zaten iptal edilmiş.", 409
        )
    await admin_audit.record(
        db,
        admin.id,
        "credit_revoke",
        "credit_grant",
        grant_id,
        {"remaining": grant["amount"] - grant["used"]},
    )
    await db.commit()
    return dict(grant)


#: Günlük seriler. Boş günler `generate_series` ile sıfırla dolduruluyor:
#: delikli bir seri grafikte "o gün veri yok" değil "o gün olmadı" gibi okunur.
#: Tablo adları BURADA sabit; dışarıdan gelen tek değer `:days` ve o da bağlı
#: parametre olarak geçiyor.
#: `signups` bilinçli olarak `subscriptions` üzerinden sayılıyor: kayıt anında
#: tetikleyici her kullanıcı için bir abonelik satırı açıyor ve bu, `auth`
#: şemasını sorgulamadan yeni hesap sayısını verir. Sonuç: Supabase'de var olup
#: bizde abonelik satırı OLMAYAN bir hesap (tetikleyici öncesinden kalma) bu
#: seride görünmez.
_SERIES = {
    "usage": "SELECT created_at FROM usage_events",
    "signups": "SELECT created_at FROM subscriptions",
}


async def _daily(db, source: str, days: int):
    return await many(
        db,
        f"""WITH span AS (
         SELECT generate_series(date_trunc('day',clock_timestamp())-make_interval(days=>:days-1),
          date_trunc('day',clock_timestamp()),interval '1 day') AS day),
        rows AS (SELECT date_trunc('day',created_at) AS day,count(*)::int AS count
         FROM ({_SERIES[source]}) s
         WHERE created_at>=date_trunc('day',clock_timestamp())-make_interval(days=>:days-1)
         GROUP BY 1)
        SELECT span.day::date AS day,COALESCE(rows.count,0) AS count
        FROM span LEFT JOIN rows ON rows.day=span.day ORDER BY span.day""",
        days=days,
    )


@router.get("/api/admin/stats")
async def stats(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    await limit_scoped(request, "admin", admin.id)
    return {
        "days": days,
        "usage": await one(
            db,
            """SELECT
             count(*) FILTER (WHERE created_at>=date_trunc('day',clock_timestamp()))::int AS today,
             count(*) FILTER (WHERE created_at>=clock_timestamp()-interval '7 days')::int AS last_7_days,
             count(*) FILTER (WHERE created_at>=clock_timestamp()-interval '30 days')::int AS last_30_days,
             count(*)::int AS all_time FROM usage_events""",
        ),
        # Başarısız iş = kredisi iade edilmiş rezervasyon. Oranın kendisi burada
        # HESAPLANMIYOR: iki sayı ayrı ayrı veriliyor ki payda sıfırken arayüz
        # "%0 hata" gibi yanıltıcı bir şey göstermek zorunda kalmasın.
        "reservations": await one(
            db,
            """SELECT count(*) FILTER (WHERE status='consumed')::int AS consumed,
             count(*) FILTER (WHERE status='released')::int AS released,
             count(*) FILTER (WHERE status='pending')::int AS pending
            FROM usage_reservations WHERE created_at>=clock_timestamp()-make_interval(days=>:days)""",
            days=days,
        ),
        "subscriptions_by_status": await many(
            db, "SELECT status,count(*)::int AS count FROM subscriptions GROUP BY 1 ORDER BY 1"
        ),
        "active_periods_by_plan": await many(
            db,
            """SELECT v.plan_id,count(*)::int AS count FROM subscription_periods p
            JOIN plan_versions v ON v.id=p.plan_version_id WHERE p.status='active'
            GROUP BY 1 ORDER BY 1""",
        ),
        "revenue": await many(
            db,
            """SELECT type,status,currency,count(*)::int AS count,
             sum(amount_minor_units)::bigint AS amount_minor_units
            FROM billing_transactions
            WHERE created_at>=clock_timestamp()-make_interval(days=>:days)
            GROUP BY 1,2,3 ORDER BY 1,2""",
            days=days,
        ),
        "credit_grants": await one(
            db,
            """SELECT COALESCE(sum(amount),0)::int AS granted,
             COALESCE(sum(used),0)::int AS used,
             COALESCE(sum(amount-used) FILTER (WHERE revoked_at IS NULL),0)::int AS outstanding
            FROM credit_grants""",
        ),
        "daily_usage": await _daily(db, "usage", days),
        "daily_signups": await _daily(db, "signups", days),
        "operations": await one(
            db,
            """SELECT
             (SELECT count(*)::int FROM billing_alerts WHERE resolved_at IS NULL) AS open_alerts,
             (SELECT count(*)::int FROM provider_actions WHERE status<>'succeeded') AS open_actions,
             (SELECT count(*)::int FROM storage_deletion_jobs WHERE status<>'succeeded') AS open_storage_jobs""",
        ),
    }
