"""Uzak yan etkiler: lease, idempotency ve belirsiz sonuç için kalıcı durum."""

from app.services.billing.db import one, many, execute, enqueue, alert
from app.services.billing.provider import ProviderError, EvidenceMismatch, minor_units
from app.services.storage import get_storage_service
from app.services.supabase_admin import get_supabase_admin


class DunningEmailDeferred(RuntimeError):
    """Ödeme uyarısı gönderilemedi; eylem retry/manual inceleme için açık kalır."""


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


async def suspend(db, user_id, reference=None):
    """Erişimi kapatır; `reference` verilirse YALNIZCA o provider aboneliğini.

    Hesap düzeyinde askıya alma, iadesi yapılan tahsilat kullanıcının GÜNCEL
    aboneliğine aitse doğrudur. Kullanıcı A paketinden B'ye geçmişse A'nın eski
    tahsilatını iade etmek B'yi kapatmamalı — o durumda yalnızca eski
    aboneliğin kendi dönemleri kapatılır.
    """
    if reference:
        await execute(
            db,
            """UPDATE subscription_periods SET status='suspended',closed_at=now()
            WHERE user_id=:uid AND provider_subscription_reference=:ref AND status='active'""",
            uid=user_id,
            ref=reference,
        )
        return
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


async def stale_reference(db, charge):
    """Tahsilat güncel abonelikten BAŞKA bir aboneliğe aitse o referansı döner.

    Bağ, mali kaydın dönem snapshot'ı üzerinden kurulur
    (`billing_transactions.period_id` → `subscription_periods.provider_subscription_reference`);
    dönem kaydı değişmez olduğu için bu bağ sonradan bozulmaz.
    """
    if not charge or not charge["period_id"] or not charge["user_id"]:
        return None
    period = await one(
        db,
        "SELECT provider_subscription_reference AS ref FROM subscription_periods WHERE id=:id",
        id=charge["period_id"],
    )
    if not period or not period["ref"]:
        return None
    sub = await one(
        db,
        "SELECT provider_subscription_reference AS ref FROM subscriptions WHERE user_id=:uid",
        uid=charge["user_id"],
    )
    return period["ref"] if sub and sub["ref"] != period["ref"] else None


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
    stale = await stale_reference(db, transaction)
    if stale:
        # Eski bir aboneliğin iadesi güncel erişimi kapatmaz; yalnızca o
        # aboneliğin kendi dönemleri kapatılır ve uzak abonelik iptal edilir.
        await suspend(db, transaction["user_id"], stale)
        await enqueue(
            db,
            transaction["user_id"],
            "cancel_subscription",
            stale,
            "refund-cancel:" + str(action_id),
        )
        await alert(
            db,
            "refund_old_subscription",
            action_id,
            "Eski aboneliğin iadesi güncel erişimi kapatmadı; hesap incelenmeli.",
        )
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


async def delete_user_objects(storage, user_id):
    """Kullanıcının R2'deki bütün nesneleri: projeler + geçici sonuç kopyaları.

    Idempotency sonuçları (`results/<uid>/`) proje geçmişinden ayrı bir önekte
    duruyor; burada sayılmazsa hesap silindikten sonra yetim kalırlardı.
    """
    for prefix in (f"projects/{user_id}/", f"results/{user_id}/"):
        await storage.delete_prefix(prefix)


async def scrub_deleted_checkouts(db):
    """Kimliği kopmuş checkout kayıtlarındaki kişisel/ödeme verisini siler.

    Auth FK'leri `user_id`'yi NULL yapar ama form HTML'i, token ve müşteri
    referansı satırda kalır; bunlar kişisel veri. `user_id IS NULL` üzerinden
    çalıştığı için tekrar çalıştırılabilir (idempotent).
    """
    await execute(
        db,
        """UPDATE checkout_sessions SET checkout_form_content=NULL,provider_checkout_token=NULL,
        customer_reference_code=NULL WHERE user_id IS NULL
        AND (checkout_form_content IS NOT NULL OR provider_checkout_token IS NOT NULL
             OR customer_reference_code IS NOT NULL)""",
    )
    await db.commit()


async def delete_account_action(db, action, provider, storage, admin):
    uid = action["user_id"]
    if uid is None:
        # Auth kullanıcısı silindikten SONRA çökmüş bir deneme buraya döner:
        # FK `user_id`'yi NULL yaptığı için eylem kime aitti bilgisi yalnızca
        # `target_reference`'ta kalır. Erken dönülürse checkout formu, token ve
        # müşteri referansı kalıcı olarak temizlenmeden kalırdı.
        await delete_user_objects(storage, action["target_reference"])
        await scrub_deleted_checkouts(db)
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
    await delete_user_objects(storage, uid)
    await admin.delete_user(uid)
    # Auth FK'leri kimliği null yapar; para ve kabul kayıtları cascade silinmez.
    await scrub_deleted_checkouts(db)


async def dunning_email_action(db, action, admin, mailer):
    """"Ödemeniz alınamadı" bildirimi; kuyruktan gittiği için bir kez gider."""
    from app.services.email import (
        EmailNotConfigured,
        PAST_DUE_BODY,
        PAST_DUE_SUBJECT,
    )

    if action["user_id"] is None:
        return
    try:
        mailer.ensure_configured()
    except EmailNotConfigured:
        # Alarm operatörü bilgilendirir; eylem `succeeded` sayılmaz. Worker
        # sınırlı retry yapar, sonra admin incelemesiyle yeniden açılabilir.
        await alert(
            db,
            "dunning_email_not_sent",
            action["id"],
            "Ödeme uyarısı e-postası yapılandırılmadığı için gönderilemedi.",
        )
        await db.commit()
        raise DunningEmailDeferred("email_not_configured")
    email = await admin.get_user_email(action["user_id"])
    if not email:
        await alert(
            db,
            "dunning_email_not_sent",
            action["id"],
            "Kullanıcının e-posta adresi bulunamadı; ödeme uyarısı gönderilemedi.",
        )
        await db.commit()
        raise DunningEmailDeferred("email_missing")
    # Kalıcı eylem kimliği hem yerel kuyruğun hem sağlayıcının idempotency
    # anahtarı: lease süresi dolup iş yeniden alınsa da aynı değer gider.
    await mailer.send(
        email, PAST_DUE_SUBJECT, PAST_DUE_BODY, idempotency_key=str(action["id"])
    )


async def run_action(db, action, provider, storage=None, admin=None, mailer=None):
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
            # Referans varsa askıya alma o aboneliğe sınırlıdır (eski bir
            # tahsilatın itirazı güncel paketi kapatmasın diye).
            await suspend(
                db,
                action["user_id"],
                action["payload"].get("provider_subscription_reference"),
            )
        elif action["kind"] == "delete_account":
            await delete_account_action(
                db,
                action,
                provider,
                storage or get_storage_service(),
                admin or get_supabase_admin(),
            )
        elif action["kind"] == "dunning_email":
            from app.services.email import get_email_service

            await dunning_email_action(
                db,
                action,
                admin or get_supabase_admin(),
                mailer or get_email_service(),
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
