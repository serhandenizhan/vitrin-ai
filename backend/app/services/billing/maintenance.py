"""systemd timer tarafından çağrılan sınırlı, tekrar çalıştırılabilir bakım turu."""

import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from app.core.db import _session_factory, engine
from app.services.billing.db import one, many, execute, alert
from app.services.billing.provider import (
    get_provider,
    ProviderError,
    EvidenceMismatch,
    minor_units,
)
from app.services.billing.entitlements import expire_reservations, ensure_period
from app.services.billing.checkout import expire_checkouts
from app.services.billing.payments import verify_checkout, apply_subscription
from app.services.billing.actions import claim_action, run_action, run_storage_job
from app.services.storage import get_storage_service


async def process_webhook(db, provider):
    event = await one(
        db,
        """WITH candidate AS (SELECT id FROM webhook_events WHERE processed_at IS NULL
        AND processing_attempts<10 AND (lease_until IS NULL OR lease_until<=now())
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE webhook_events SET processing_attempts=processing_attempts+1,lease_until=now()+interval '2 minutes'
        WHERE id IN (SELECT id FROM candidate) RETURNING *""",
    )
    await db.commit()
    if not event:
        return False
    try:
        if event["event_type"] not in (
            "subscription.order.success",
            "subscription.order.failure",
        ):
            raise EvidenceMismatch("unknown_event")
        payload = event["payload"]
        session = await one(
            db,
            "SELECT * FROM checkout_sessions WHERE provider_subscription_reference=:ref",
            ref=payload["subscriptionReferenceCode"],
        )
        await db.commit()
        if not session:
            raise EvidenceMismatch("unmatched_event")
        if session["customer_reference_code"] != payload["customerReferenceCode"]:
            raise EvidenceMismatch("customer_mismatch")
        detail = await provider.subscription(payload["subscriptionReferenceCode"])
        order = next(
            (
                o
                for o in detail.get("orders", [])
                if o.get("referenceCode") == payload["orderReferenceCode"]
            ),
            None,
        )
        if not order:
            raise EvidenceMismatch("order_missing")
        if event["event_type"] == "subscription.order.success":
            if order.get("orderStatus") != "SUCCESS":
                raise EvidenceMismatch("order_status_mismatch")
            await apply_subscription(db, session["user_id"], detail)
        else:
            # Gecikmiş failure başarılı yenilemenin veya yeni planın erişimini kesemez.
            if order.get("orderStatus") == "FAILED":
                await execute(
                    db,
                    "UPDATE subscriptions SET status='past_due' WHERE user_id=:uid AND provider_subscription_reference=:ref AND access_until<=now() AND status NOT IN ('suspended','canceled')",
                    uid=session["user_id"],
                    ref=payload["subscriptionReferenceCode"],
                )
        await execute(
            db,
            "UPDATE webhook_events SET processed_at=now(),last_error=NULL,lease_until=NULL WHERE id=:id",
            id=event["id"],
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        await execute(
            db,
            "UPDATE webhook_events SET last_error=:error,lease_until=now()+interval '60 seconds' WHERE id=:id",
            error=str(exc) if isinstance(exc, ProviderError) else type(exc).__name__,
            id=event["id"],
        )
        if event["processing_attempts"] >= 10 or str(exc) == "unknown_event":
            await alert(
                db,
                "webhook_review",
                event["id"],
                "Webhook işlenemedi; olay ve provider kaydı incelenmeli.",
            )
        await db.commit()
    return True


async def reconcile_transactions(db, provider):
    # İki gün örtüşmesi, gün sonu gecikmelerini tekrar inceler; mali kayıt değiştirmez.
    today = datetime.now(ZoneInfo("Europe/Istanbul")).date()
    for day in (today - timedelta(days=2), today - timedelta(days=1)):
        page = 1
        while True:
            report = await provider.transactions(day, page)
            movements = report.get("transactions")
            if not isinstance(movements, list):
                raise EvidenceMismatch("invalid_daily_report")
            for movement in movements:
                kind = {
                    "PAYMENT": "charge",
                    "REFUND": "refund",
                    "CANCEL": "refund",
                }.get(movement.get("transactionType"))
                reference = str(movement.get("transactionId", "unknown"))
                if not kind or movement.get("transactionStatus") not in (1, 2):
                    await alert(
                        db,
                        "reconciliation_movement_review",
                        reference,
                        "Provider hareketinin türü veya sonucu kontrol edilmeli.",
                    )
                    continue
                rows = await many(
                    db,
                    "SELECT * FROM billing_transactions WHERE provider_payment_id=:pid AND type=:kind AND status='succeeded'",
                    pid=str(movement.get("paymentId")),
                    kind=kind,
                )
                if (
                    len(rows) != 1
                    or rows[0]["amount_minor_units"]
                    != minor_units(movement.get("paidPrice"))
                    or rows[0]["currency"] != movement.get("transactionCurrency")
                ):
                    await alert(
                        db,
                        "reconciliation_movement",
                        reference,
                        "Provider ödeme/iptal/iade hareketi mali defterle eşleşmiyor.",
                    )
            await db.commit()
            page_count = report.get("totalPageCount")
            if not isinstance(page_count, int) or page_count < 0:
                raise EvidenceMismatch("invalid_report_pagination")
            if page >= page_count:
                break
            page += 1


async def reconcile(db, provider):
    claimed = await one(
        db,
        """INSERT INTO billing_runs(name,last_started_at) VALUES('reconciliation',now())
        ON CONFLICT(name) DO UPDATE SET last_started_at=now()
        WHERE billing_runs.last_started_at<now()-interval '1 day' RETURNING name""",
    )
    await db.commit()
    if not claimed:
        return
    try:
        await reconcile_transactions(db, provider)
        page = 1
        while True:
            data = await provider.subscriptions(page)
            for summary in data.get("items", []):
                ref = summary["referenceCode"]
                detail = await provider.subscription(ref)
                local = await one(
                    db,
                    "SELECT * FROM subscriptions WHERE provider_subscription_reference=:ref",
                    ref=ref,
                )
                if not local and detail.get("subscriptionStatus") == "ACTIVE":
                    await alert(
                        db,
                        "unmatched_provider_subscription",
                        ref,
                        "Provider aboneliğinin yerel karşılığı yok.",
                    )
                if (
                    local
                    and detail.get("subscriptionStatus") in ("CANCELED", "EXPIRED")
                    and local["status"] not in ("canceled", "expired", "suspended")
                ):
                    await alert(
                        db,
                        "subscription_status_mismatch",
                        ref,
                        "Yerel durum provider ile farklı.",
                    )
                for order in detail.get("orders", []):
                    if order.get("orderStatus") != "SUCCESS":
                        continue
                    transaction = await one(
                        db,
                        "SELECT * FROM billing_transactions WHERE provider_transaction_reference=:ref AND type='charge'",
                        ref=order["referenceCode"],
                    )
                    if (
                        not transaction
                        or transaction["amount_minor_units"]
                        != minor_units(order.get("price"))
                        or transaction["currency"] != order.get("currencyCode")
                    ):
                        await alert(
                            db,
                            "reconciliation_payment",
                            order["referenceCode"],
                            "Provider tahsilatı ile yerel mali defter farklı.",
                        )
                await db.commit()
            if page >= data.get("pageCount", 1):
                break
            page += 1
        await execute(
            db,
            "UPDATE billing_runs SET last_succeeded_at=now(),last_error=NULL WHERE name='reconciliation'",
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        await alert(
            db, "reconciliation_failed", "daily", "Günlük mutabakat tamamlanamadı."
        )
        await execute(
            db,
            "UPDATE billing_runs SET last_error=:error,last_started_at=now()-interval '23 hours' WHERE name='reconciliation'",
            error=type(exc).__name__,
        )
        await db.commit()


async def claim_checkouts(db):
    # Hatalı eski tokenlar yeni kayıtları aç bırakmasın; her probe ileriye alınır.
    sessions = await many(
        db,
        """WITH candidates AS (
        SELECT id FROM checkout_sessions
        WHERE (status='pending' OR (status='expired' AND provider_subscription_reference IS NULL))
          AND provider_checkout_token IS NOT NULL AND next_verification_at<=now()
        ORDER BY next_verification_at,created_at FOR UPDATE SKIP LOCKED LIMIT 100)
        UPDATE checkout_sessions SET next_verification_at=now()+interval '5 minutes'
        WHERE id IN (SELECT id FROM candidates) RETURNING *""",
    )
    await db.commit()
    return sessions


async def maintenance(db, provider, storage):
    await expire_reservations(db)
    # Callback kaybolsa da token üzerinden ilk ödeme/trial bulunur.
    sessions = await claim_checkouts(db)
    for session in sessions:
        try:
            await verify_checkout(db, session, provider)
        except ProviderError:
            await db.rollback()
    await expire_checkouts(db)
    await db.commit()
    for _ in range(100):
        if not await process_webhook(db, provider):
            break
    users = await many(
        db,
        "SELECT user_id FROM subscriptions WHERE user_id IS NOT NULL AND deletion_requested_at IS NULL AND provider='iyzico' AND status IN ('active','trialing','past_due','canceling') AND access_until<=now() AND (renewal_check_after IS NULL OR renewal_check_after<=now()) ORDER BY renewal_check_after NULLS FIRST LIMIT 100",
    )
    await db.commit()
    for user in users:
        try:
            await ensure_period(db, user["user_id"], provider)
        except (HTTPException, ProviderError):
            await db.rollback()
    for _ in range(100):
        action = await claim_action(db)
        if not action:
            break
        await run_action(db, action, provider, storage)
    for _ in range(100):
        if not await run_storage_job(db, storage):
            break
    await reconcile(db, provider)
    await execute(
        db,
        "INSERT INTO billing_runs(name,last_started_at,last_succeeded_at) VALUES('maintenance',now(),now()) ON CONFLICT(name) DO UPDATE SET last_succeeded_at=now()",
    )
    await db.commit()


async def main():
    try:
        async with _session_factory() as db:
            await maintenance(db, get_provider(), get_storage_service())
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
