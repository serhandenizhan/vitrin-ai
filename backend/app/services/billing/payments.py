"""Callback, webhook ve yenileme için tek atomik ödeme uygulama yolu."""

from datetime import datetime, timezone
from app.services.billing.db import one, execute, alert, enqueue
from app.services.billing.provider import EvidenceMismatch, provider_time, minor_units


def validated_orders(evidence, version):
    orders = []
    for order in evidence.get("orders", []):
        if order.get("orderStatus") != "SUCCESS":
            continue
        if (
            not order.get("referenceCode")
            or minor_units(order.get("price")) != version["price_minor_units"]
            or order.get("currencyCode") != version["currency"]
        ):
            raise EvidenceMismatch("payment_mismatch")
        start, end = (
            provider_time(order.get("startPeriod")),
            provider_time(order.get("endPeriod")),
        )
        if start >= end or (end - start).days > 32:
            raise EvidenceMismatch("period_mismatch")
        attempts = [
            a
            for a in order.get("paymentAttempts", [])
            if a.get("paymentStatus") == "SUCCESS" and a.get("paymentId")
        ]
        if len(attempts) != 1:
            raise EvidenceMismatch("payment_evidence_missing")
        orders.append(
            (start, end, order["referenceCode"], str(attempts[0]["paymentId"]))
        )
    return sorted(orders)


async def apply_subscription(db, user_id, evidence, checkout_id=None):
    sub = await one(
        db, "SELECT * FROM subscriptions WHERE user_id=:uid FOR UPDATE", uid=user_id
    )
    if not sub:
        raise EvidenceMismatch("owner_missing")
    session = None
    if checkout_id:
        session = await one(
            db,
            "SELECT * FROM checkout_sessions WHERE id=:id AND user_id=:uid FOR UPDATE",
            id=checkout_id,
            uid=user_id,
        )
    else:
        session = await one(
            db,
            "SELECT * FROM checkout_sessions WHERE user_id=:uid AND provider_subscription_reference=:ref",
            uid=user_id,
            ref=evidence.get("referenceCode"),
        )
    if not session:
        raise EvidenceMismatch("checkout_unmatched")
    version = await one(
        db, "SELECT * FROM plan_versions WHERE id=:id", id=session["plan_version_id"]
    )
    if (
        evidence.get("pricingPlanReferenceCode") != session["pricing_plan_reference"]
        or not evidence.get("customerReferenceCode")
        or evidence.get("customerReferenceCode") != session["customer_reference_code"]
        or evidence.get("referenceCode") != session["provider_subscription_reference"]
    ):
        raise EvidenceMismatch("subscription_plan_customer_mismatch")
    orders = validated_orders(evidence, version)
    now = datetime.now(timezone.utc)
    initial = session["status"] == "pending"
    if session["status"] in ("expired", "failed") or (
        initial and session["expires_at"] <= now
    ):
        await alert(
            db,
            "late_checkout_payment",
            session["id"],
            "Süresi dolmuş checkout; provider iptali ve ödeme incelemesi gerekli.",
        )
        await enqueue(
            db,
            user_id,
            "cancel_subscription",
            evidence["referenceCode"],
            f"late:{evidence['referenceCode']}",
        )
        for start, end, order_ref, payment_id in orders:
            period = await one(
                db,
                """INSERT INTO subscription_periods(subscription_id,user_id,plan_version_id,
                provider_subscription_reference,provider_order_reference,starts_at,ends_at,quota_snapshot,status)
                VALUES(:sid,:uid,:vid,:ref,:ord,:start,:end,:quota,'expired')
                ON CONFLICT(provider_order_reference) DO UPDATE SET provider_order_reference=excluded.provider_order_reference RETURNING id""",
                sid=sub["id"],
                uid=user_id,
                vid=version["id"],
                ref=evidence["referenceCode"],
                ord=order_ref,
                start=start,
                end=end,
                quota=version["monthly_quota"],
            )
            charge = await one(
                db,
                """INSERT INTO billing_transactions(user_id,period_id,type,status,amount_minor_units,currency,provider_transaction_reference,provider_payment_id)
                VALUES(:uid,:pid,'charge','succeeded',:amount,:currency,:ref,:payment)
                ON CONFLICT(provider,provider_transaction_reference,type) DO UPDATE SET provider_transaction_reference=excluded.provider_transaction_reference RETURNING id""",
                uid=user_id,
                pid=period["id"],
                amount=version["price_minor_units"],
                currency=version["currency"],
                ref=order_ref,
                payment=payment_id,
            )
            await enqueue(
                db,
                user_id,
                "refund_payment",
                charge["id"],
                "refund:" + str(charge["id"]),
                {"late_checkout": True},
            )
        await db.commit()
        return
    if (
        not initial
        and sub["provider_subscription_reference"] != evidence["referenceCode"]
    ):
        # Eski aboneliğin gecikmiş bildirimi yeni planı geri alamaz.
        await alert(
            db,
            "old_subscription_event",
            evidence["referenceCode"],
            "Önceki aboneliğin ödeme durumu kontrol edilmeli.",
        )
        await db.commit()
        return
    if sub["deletion_requested_at"]:
        await enqueue(
            db,
            user_id,
            "cancel_subscription",
            evidence["referenceCode"],
            f"delete-cancel:{evidence['referenceCode']}",
        )
        await db.commit()
        return
    trial = initial and session["trial_status"] == "reserved" and not orders
    if trial:
        start, end = (
            provider_time(evidence.get("trialStartDate")),
            provider_time(evidence.get("trialEndDate")),
        )
        if (
            sub["trial_used_at"]
            or evidence.get("subscriptionStatus") != "ACTIVE"
            or evidence.get("trialDays") != version["trial_period_days"]
            or not start <= now < end
            or (end - start).total_seconds() > version["trial_period_days"] * 86400
        ):
            raise EvidenceMismatch("trial_mismatch")
        periods = [(start, end, "trial:" + evidence["referenceCode"], None)]
    else:
        periods = orders
        if initial and not any(start <= now < end for start, end, _, _ in orders):
            raise EvidenceMismatch("successful_current_payment_missing")
    old_reference = sub["provider_subscription_reference"]
    for start, end, order_ref, payment_id in periods:
        if start > now:
            continue
        exists = await one(
            db,
            "SELECT id FROM subscription_periods WHERE provider_order_reference=:ref",
            ref=order_ref,
        )
        if exists:
            continue
        current = await one(
            db,
            "SELECT * FROM subscription_periods WHERE subscription_id=:sid AND status='active'",
            sid=sub["id"],
        )
        activate = start <= now < end and (
            not current
            or current["provider_subscription_reference"] != evidence["referenceCode"]
            or start >= current["ends_at"]
        )
        if sub["status"] == "suspended":
            activate = False
        if activate:
            await execute(
                db,
                "UPDATE subscription_periods SET status='superseded',closed_at=now() WHERE subscription_id=:sid AND status='active'",
                sid=sub["id"],
            )
        period = await one(
            db,
            """INSERT INTO subscription_periods(subscription_id,user_id,plan_version_id,
            provider_subscription_reference,provider_order_reference,starts_at,ends_at,quota_snapshot,status)
            VALUES(:sid,:uid,:vid,:ref,:ord,:start,:end,:quota,:status) RETURNING id""",
            sid=sub["id"],
            uid=user_id,
            vid=version["id"],
            ref=evidence["referenceCode"],
            ord=order_ref,
            start=start,
            end=end,
            quota=version["monthly_quota"],
            status="active" if activate else "expired",
        )
        if payment_id:
            await execute(
                db,
                """INSERT INTO billing_transactions(user_id,period_id,type,status,amount_minor_units,currency,provider_transaction_reference,provider_payment_id)
                VALUES(:uid,:pid,'charge','succeeded',:amount,:currency,:ref,:payment)
                ON CONFLICT(provider,provider_transaction_reference,type) DO NOTHING""",
                uid=user_id,
                pid=period["id"],
                amount=version["price_minor_units"],
                currency=version["currency"],
                ref=order_ref,
                payment=payment_id,
            )
        if activate:
            await execute(
                db,
                """UPDATE subscriptions SET provider='iyzico',provider_subscription_reference=:ref,
                access_until=:end,status=:status,updated_at=now() WHERE id=:id""",
                ref=evidence["referenceCode"],
                end=end,
                status="trialing"
                if trial
                else (
                    sub["status"]
                    if sub["status"] in ("canceling", "canceled") and not initial
                    else "active"
                ),
                id=sub["id"],
            )
    if initial:
        if session["trial_status"] == "reserved":
            changed = await execute(
                db,
                "UPDATE subscriptions SET trial_used_at=now() WHERE id=:id AND trial_used_at IS NULL",
                id=sub["id"],
            )
            if changed.rowcount != 1:
                raise EvidenceMismatch("trial_already_used")
        await execute(
            db,
            "UPDATE checkout_sessions SET status='completed',trial_status=CASE WHEN trial_status='reserved' THEN 'consumed' ELSE trial_status END,completed_at=now(),checkout_form_content=NULL WHERE id=:id",
            id=session["id"],
        )
        if old_reference and old_reference != evidence["referenceCode"]:
            await enqueue(
                db,
                user_id,
                "cancel_subscription",
                old_reference,
                "change:" + old_reference,
            )
    await db.commit()


async def verify_checkout(db, session, provider):
    # Token ve conversationId tek satın almaya bağlanır; müşteri kodunu sağlayıcı üretir.
    result = await provider.checkout(
        session["provider_checkout_token"], session["conversation_reference"]
    )
    evidence = result.get("data", {})
    if str(result.get("conversationId")) != str(session["conversation_reference"]):
        raise EvidenceMismatch("conversation_mismatch")
    if (
        evidence.get("pricingPlanReferenceCode") != session["pricing_plan_reference"]
        or not evidence.get("referenceCode")
        or not evidence.get("customerReferenceCode")
    ):
        raise EvidenceMismatch("checkout_mismatch")
    detail = await provider.subscription(evidence["referenceCode"])
    if detail.get("customerReferenceCode") != evidence["customerReferenceCode"]:
        raise EvidenceMismatch("customer_mismatch")
    await one(
        db,
        "SELECT id FROM subscriptions WHERE user_id=:uid FOR UPDATE",
        uid=session["user_id"],
    )
    await execute(
        db,
        """UPDATE checkout_sessions SET customer_reference_code=:customer,provider_subscription_reference=:ref
        WHERE id=:id AND (provider_subscription_reference IS NULL OR provider_subscription_reference=:ref)""",
        customer=evidence["customerReferenceCode"],
        ref=evidence["referenceCode"],
        id=session["id"],
    )
    await apply_subscription(db, session["user_id"], detail, session["id"])
