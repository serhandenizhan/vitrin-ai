"""Uzak yan etkiler: lease, idempotency ve belirsiz sonuç için kalıcı durum."""

from app.services.billing.db import one, many, execute, enqueue, alert
from app.services.billing.provider import ProviderError, EvidenceMismatch, minor_units
from app.services.storage import get_storage_service
from app.services.supabase_admin import get_supabase_admin


async def claim_action(db):
    row = await one(
        db,
        """WITH candidate AS (SELECT id FROM provider_actions
        WHERE status IN ('pending','running','failed') AND attempts<10 AND (lease_until IS NULL OR lease_until<=now())
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE provider_actions SET status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes'
        WHERE id IN (SELECT id FROM candidate) RETURNING *""",
    )
    await db.commit()
    return row


async def suspend(db, user_id):
    await execute(
        db,
        "UPDATE subscriptions SET status='suspended',updated_at=now() WHERE user_id=:uid",
        uid=user_id,
    )
    await execute(
        db,
        "UPDATE subscription_periods SET status='suspended',closed_at=now() WHERE user_id=:uid AND status='active'",
        uid=user_id,
    )


async def refund_action(db, action, provider):
    transaction = await one(
        db,
        "SELECT * FROM billing_transactions WHERE id=CAST(:id AS uuid)",
        id=action["target_reference"],
    )
    if (
        not transaction
        or transaction["type"] != "charge"
        or transaction["status"] != "succeeded"
    ):
        raise EvidenceMismatch("refund_target_invalid")
    existing = await one(
        db,
        "SELECT id FROM billing_transactions WHERE original_transaction_id=:id AND type IN ('refund','chargeback')",
        id=transaction["id"],
    )
    await db.commit()
    if existing:
        return
    if action["dispatched_at"]:
        # İyzico conversationId'yi idempotency anahtarı olarak garanti etmiyor.
        # Uzak başarı/yerel çökme aralığında ikinci refund gönderilmez; operatör kanıtla uzlaştırır.
        await execute(
            db,
            "UPDATE provider_actions SET status='uncertain',last_error='refund_result_unknown' WHERE id=:id",
            id=action["id"],
        )
        await alert(
            db,
            "refund_uncertain",
            action["id"],
            "Provider iade sonucu kontrol edilmeli; otomatik tekrar durduruldu.",
        )
        await db.commit()
        return
    detail = await provider.payment(transaction["provider_payment_id"])
    if (
        str(detail.get("paymentId")) != transaction["provider_payment_id"]
        or detail.get("currency") != transaction["currency"]
    ):
        raise EvidenceMismatch("refund_payment_mismatch")
    items = detail.get("itemTransactions", [])
    if (
        len(items) != 1
        or minor_units(items[0].get("paidPrice")) != transaction["amount_minor_units"]
        or not items[0].get("paymentTransactionId")
    ):
        raise EvidenceMismatch("refund_item_mismatch")
    claimed = await one(
        db,
        "UPDATE provider_actions SET dispatched_at=now() WHERE id=:id AND dispatched_at IS NULL RETURNING id",
        id=action["id"],
    )
    await db.commit()
    if not claimed:
        return
    result = await provider.refund(
        str(items[0]["paymentTransactionId"]),
        transaction["amount_minor_units"],
        transaction["currency"],
        action["id"],
        action["payload"].get("ip", "127.0.0.1"),
    )
    if (
        str(result.get("paymentTransactionId")) != str(items[0]["paymentTransactionId"])
        or minor_units(result.get("price")) != transaction["amount_minor_units"]
        or result.get("currency") != transaction["currency"]
    ):
        raise EvidenceMismatch("refund_response_mismatch")
    await finish_refund(
        db,
        transaction,
        action["id"],
        suspend_access=not action["payload"].get("late_checkout"),
    )


async def finish_refund(db, transaction, action_id, suspend_access=True):
    await one(
        db,
        "SELECT id FROM subscriptions WHERE user_id=:uid FOR UPDATE",
        uid=transaction["user_id"],
    )
    await execute(
        db,
        """INSERT INTO billing_transactions(user_id,period_id,type,status,amount_minor_units,currency,
        provider_transaction_reference,provider_payment_id,original_transaction_id)
        VALUES(:uid,:pid,'refund','succeeded',:amount,:currency,:ref,:payment,:original)
        ON CONFLICT(provider,provider_transaction_reference,type) DO NOTHING""",
        uid=transaction["user_id"],
        pid=transaction["period_id"],
        amount=transaction["amount_minor_units"],
        currency=transaction["currency"],
        ref=str(action_id),
        payment=transaction["provider_payment_id"],
        original=transaction["id"],
    )
    if not suspend_access:
        return
    await suspend(db, transaction["user_id"])
    sub = await one(
        db, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=transaction["user_id"]
    )
    if sub and sub["provider_subscription_reference"]:
        await enqueue(
            db,
            transaction["user_id"],
            "cancel_subscription",
            sub["provider_subscription_reference"],
            "refund-cancel:" + str(action_id),
        )


async def delete_account_action(db, action, provider, storage, admin):
    uid = action["user_id"]
    if uid is None:
        return
    pending = await one(
        db,
        "SELECT id FROM checkout_sessions WHERE user_id=:uid AND status='pending'",
        uid=uid,
    )
    refs = await many(
        db,
        """SELECT DISTINCT provider_subscription_reference AS ref FROM checkout_sessions
        WHERE user_id=:uid AND provider_subscription_reference IS NOT NULL
        UNION SELECT provider_subscription_reference FROM subscriptions WHERE user_id=:uid AND provider_subscription_reference IS NOT NULL""",
        uid=uid,
    )
    await db.commit()
    if pending:
        raise ProviderError("checkout_pending")
    unknown = await one(
        db,
        "SELECT id FROM checkout_sessions WHERE user_id=:uid AND initialization_started AND status<>'failed' AND provider_subscription_reference IS NULL",
        uid=uid,
    )
    await db.commit()
    if unknown:
        raise ProviderError("checkout_initialization_uncertain")
    admin.ensure_configured()
    for row in refs:
        await provider.cancel(row["ref"])
    unresolved = await one(
        db,
        "SELECT id FROM provider_actions WHERE user_id=:uid AND kind='refund_payment' AND status<>'succeeded'",
        uid=uid,
    )
    if unresolved:
        raise ProviderError("refund_pending")
    # Uzak iptaller doğrulanmadan R2/Auth'a dokunulmaz.
    await execute(
        db, "UPDATE subscriptions SET status='canceled' WHERE user_id=:uid", uid=uid
    )
    await execute(
        db,
        "UPDATE provider_actions SET status='succeeded',completed_at=now() WHERE user_id=:uid AND kind='cancel_subscription'",
        uid=uid,
    )
    await db.commit()
    await storage.delete_prefix(f"projects/{uid}/")
    await admin.delete_user(uid)
    # Auth FK'leri kimliği null yapar; para ve kabul kayıtları cascade silinmez.
    await execute(
        db,
        "UPDATE checkout_sessions SET checkout_form_content=NULL,provider_checkout_token=NULL,customer_reference_code=NULL WHERE user_id IS NULL",
    )
    await db.commit()


async def run_action(db, action, provider, storage=None, admin=None):
    try:
        if action["kind"] == "cancel_subscription":
            await provider.cancel(action["target_reference"])
            await execute(
                db,
                "UPDATE subscriptions SET status=CASE WHEN status='suspended' THEN status ELSE 'canceled' END,updated_at=now() WHERE user_id=:uid AND provider_subscription_reference=:ref",
                uid=action["user_id"],
                ref=action["target_reference"],
            )
        elif action["kind"] == "refund_payment":
            await refund_action(db, action, provider)
        elif action["kind"] == "suspend_entitlement":
            await suspend(db, action["user_id"])
        elif action["kind"] == "delete_account":
            await delete_account_action(
                db,
                action,
                provider,
                storage or get_storage_service(),
                admin or get_supabase_admin(),
            )
        await execute(
            db,
            "UPDATE provider_actions SET status='succeeded',completed_at=now(),lease_until=NULL,last_error=NULL WHERE id=:id AND status='running'",
            id=action["id"],
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        if isinstance(exc, ProviderError) and str(exc) in (
            "checkout_pending",
            "refund_pending",
        ):
            # Başka bir işin bitmesini beklemek, dış servis hatası değildir.
            await execute(
                db,
                "UPDATE provider_actions SET status='pending',attempts=greatest(attempts-1,0),last_error=:reason,lease_until=now()+interval '60 seconds' WHERE id=:id",
                reason=str(exc),
                id=action["id"],
            )
            await db.commit()
            return
        current = await one(
            db,
            "SELECT dispatched_at FROM provider_actions WHERE id=:id",
            id=action["id"],
        )
        uncertain = (
            action["kind"] == "refund_payment" and current and current["dispatched_at"]
        )
        await execute(
            db,
            "UPDATE provider_actions SET status=:status,last_error=:error,lease_until=now()+interval '60 seconds' WHERE id=:id",
            status="uncertain" if uncertain else "failed",
            error=type(exc).__name__,
            id=action["id"],
        )
        if uncertain or action["attempts"] >= 10:
            await alert(
                db,
                "provider_action_failed",
                action["id"],
                "Uzak işlem için manuel inceleme gerekli.",
            )
        await db.commit()


async def prune_projects(db, user_id):
    await one(
        db, "SELECT id FROM subscriptions WHERE user_id=:uid FOR UPDATE", uid=user_id
    )
    period = await one(
        db,
        "SELECT v.price_minor_units FROM subscription_periods p JOIN plan_versions v ON v.id=p.plan_version_id WHERE p.user_id=:uid AND p.status='active'",
        uid=user_id,
    )
    if not period or period["price_minor_units"]:
        return
    rows = await many(
        db,
        "SELECT * FROM projects WHERE user_id=:uid ORDER BY created_at DESC,id DESC OFFSET 10 FOR UPDATE",
        uid=user_id,
    )
    for project in rows:
        await execute(
            db,
            """INSERT INTO storage_deletion_jobs(project_id,r2_key,thumbnail_r2_key,reason)
            VALUES(:id,:result,:thumb,'free_history_limit') ON CONFLICT(project_id) DO NOTHING""",
            id=project["id"],
            result=project["result_r2_key"],
            thumb=project["thumbnail_r2_key"],
        )


async def run_storage_job(db, storage):
    job = await one(
        db,
        """WITH candidate AS (SELECT id FROM storage_deletion_jobs WHERE status<>'succeeded'
        AND attempts<10 AND (lease_until IS NULL OR lease_until<=now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE storage_deletion_jobs SET status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes'
        WHERE id IN (SELECT id FROM candidate) RETURNING *""",
    )
    await db.commit()
    if not job:
        return False
    try:
        await storage.delete(job["r2_key"])
        await storage.delete(job["thumbnail_r2_key"])
        await execute(db, "DELETE FROM projects WHERE id=:id", id=job["project_id"])
        await execute(
            db,
            "UPDATE storage_deletion_jobs SET status='succeeded',lease_until=NULL WHERE id=:id",
            id=job["id"],
        )
    except Exception as exc:
        await db.rollback()
        await execute(
            db,
            "UPDATE storage_deletion_jobs SET status='failed',last_error=:error,lease_until=now()+interval '60 seconds' WHERE id=:id",
            error=type(exc).__name__,
            id=job["id"],
        )
        if job["attempts"] >= 10:
            await alert(
                db, "storage_deletion_failed", job["id"], "R2 silme işlemi başarısız."
            )
    await db.commit()
    return True
