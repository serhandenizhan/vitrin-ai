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
        raise billing_error("auth_required", "Hesap bulunamadı.", 401)
    if sub["deletion_requested_at"]:
        raise billing_error(
            "account_deletion_pending", "Hesabınızın silinmesi işleniyor."
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
    if sub["status"] == "suspended" or (
        sub["status"] == "past_due" and period and period["ends_at"] > now
    ):
        await db.commit()
        raise billing_error("subscription_inactive", "Abonelik erişimi kapalı.", 403)
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
            "subscription_expired", "Satın alınmış erişim süresi doldu.", 403
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
    raise billing_error(
        "billing_renewal_pending",
        "Dönem ödemeniz doğrulanıyor. Bir dakika sonra yeniden deneyin.",
        retry=60,
    )


async def background_tier(db, user_id, provider):
    if await one(db, "SELECT user_id FROM admin_users WHERE user_id=:uid", uid=user_id):
        await db.commit()
        return "full"
    period = await ensure_period(db, user_id, provider)
    await db.commit()
    return period["background_tier"]


async def reserve(db, user_id, request_id, provider):
    if await one(db, "SELECT user_id FROM admin_users WHERE user_id=:uid", uid=user_id):
        await db.commit()
        return None
    await db.commit()
    await ensure_period(db, user_id, provider)
    await locked_subscription(db, user_id)
    existing = await one(
        db,
        "SELECT status FROM usage_reservations WHERE user_id=:uid AND request_id=:rid",
        uid=user_id,
        rid=request_id,
    )
    if existing:
        await db.commit()
        raise billing_error(
            "request_already_processed",
            "Bu işlem kimliği zaten kullanıldı; yeni bir işlem başlatın.",
        )
    row = await one(
        db,
        """UPDATE subscription_periods p SET used_this_period=used_this_period+1
        FROM subscriptions s WHERE p.subscription_id=s.id AND p.user_id=:uid AND p.status='active'
        AND p.starts_at<=clock_timestamp() AND p.ends_at>clock_timestamp()
        AND s.status IN ('active','trialing','canceling','canceled') AND s.deletion_requested_at IS NULL
        AND p.used_this_period<p.quota_snapshot RETURNING p.id""",
        uid=user_id,
    )
    if not row:
        await db.commit()
        raise billing_error("quota_exceeded", "Bu dönemdeki krediniz tükendi.", 402)
    reservation = await one(
        db,
        """INSERT INTO usage_reservations(period_id,user_id,request_id)
        VALUES(:pid,:uid,:rid) RETURNING id""",
        pid=row["id"],
        uid=user_id,
        rid=request_id,
    )
    await db.commit()
    return reservation["id"]


async def resolve_reservation(db, reservation_id, success):
    if reservation_id is None:
        return True
    row = await one(
        db,
        """UPDATE usage_reservations SET status=:status,resolved_at=now()
        WHERE id=:id AND status='pending' RETURNING *""",
        id=reservation_id,
        status="consumed" if success else "released",
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
            await execute(
                db,
                "UPDATE subscription_periods SET used_this_period=used_this_period-1 WHERE id=:id",
                id=row["period_id"],
            )
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
