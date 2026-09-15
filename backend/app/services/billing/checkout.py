"""Kabul kanıtı, plan snapshot'ı ve tekil checkout oluşturma."""

import hashlib
from urllib.parse import urlsplit

from app.core.config import settings
from app.services.billing.db import one, execute, alert
from app.services.billing.entitlements import locked_subscription, current_period
from app.services.billing.errors import billing_error
from app.services.billing.provider import ProviderError, ProviderUnavailable


def documents():
    return [
        {
            "document_type": kind,
            "document_version": settings.billing_sales_document_version,
            "document_hash": hashlib.sha256(content.encode()).hexdigest(),
            "locale": "tr",
            "text": content,
        }
        for kind, content in (
            ("distance_sales", settings.billing_sales_document_text),
            ("pre_information", settings.billing_pre_information_text),
        )
    ]


def ensure_checkout_ready():
    callback = urlsplit(settings.billing_callback_url)
    if (
        not settings.billing_checkout_enabled
        or not settings.billing_legal_approved
        or not settings.billing_invoice_process_ready
        or not settings.billing_sales_document_version
        or not settings.billing_sales_document_text
        or not settings.billing_pre_information_text
        or callback.scheme != "https"
        or not callback.netloc
        or (
            settings.iyzico_base_url == "https://api.iyzipay.com"
            and not settings.billing_production_verified
        )
    ):
        raise billing_error(
            "billing_not_ready", "Satın alma henüz kullanıma açılmadı.", 503
        )


def serialize_session(session):
    return {
        "id": session["id"],
        "status": session["status"],
        "expires_at": session["expires_at"],
        "checkout_url": "/odeme/" + str(session["id"]),
    }


async def expire_checkouts(db):
    await execute(
        db,
        "UPDATE checkout_sessions SET status='expired',trial_status=CASE WHEN trial_status='reserved' THEN 'released' ELSE trial_status END,checkout_form_content=NULL WHERE status='pending' AND expires_at<=now()",
    )


async def start_checkout(db, user, request, provider):
    ensure_checkout_ready()
    provider.ensure_configured()
    sub = await locked_subscription(db, user.id)
    if sub["status"] == "suspended":
        raise billing_error(
            "subscription_suspended", "Hesabınız için destek ile iletişime geçin.", 403
        )
    await expire_checkouts(db)
    existing = await one(
        db,
        "SELECT * FROM checkout_sessions WHERE user_id=:uid AND idempotency_key=:key",
        uid=user.id,
        key=request.idempotency_key,
    )
    pending = existing or await one(
        db,
        "SELECT * FROM checkout_sessions WHERE user_id=:uid AND status='pending'",
        uid=user.id,
    )
    if pending:
        await db.commit()
        if pending["plan_version_id"] != request.expected_plan_version_id:
            raise billing_error(
                "idempotency_conflict", "Devam eden işlem başka bir plan sürümüne ait."
            )
        if pending["status"] != "pending":
            raise billing_error(
                "checkout_expired", "Yeni bir satın alma işlemi başlatın."
            )
        return serialize_session(pending)
    expected = documents()
    if sorted(
        [
            (d.document_type, d.document_version, d.document_hash)
            for d in request.consents
        ]
    ) != sorted(
        [
            (d["document_type"], d["document_version"], d["document_hash"])
            for d in expected
        ]
    ):
        raise billing_error(
            "consent_required", "Güncel satış sözleşmelerini okuyup kabul edin.", 422
        )
    version = await one(
        db,
        """SELECT v.* FROM plan_versions v JOIN plans p ON p.id=v.plan_id
        WHERE p.id=:id AND p.active AND v.published_at IS NOT NULL AND v.retired_at IS NULL""",
        id=request.plan_id,
    )
    await db.commit()
    if not version or not version["price_minor_units"]:
        raise billing_error(
            "billing_not_ready", "Bu plan satın almaya açık değil.", 503
        )
    if version["id"] != request.expected_plan_version_id:
        raise billing_error(
            "plan_changed",
            "Paket güncellendi. Güncel fiyatı incelemek için sayfayı yenileyin.",
        )
    await provider.verify_plan(version, version["iyzico_pricing_plan_reference_code"])
    if version["trial_period_days"]:
        await provider.verify_plan(
            version,
            version["iyzico_trial_plan_reference_code"],
            version["trial_period_days"],
        )
    sub = await locked_subscription(db, user.id)
    if sub["status"] == "suspended":
        raise billing_error("subscription_suspended", "Hesap erişimi kapalı.", 403)
    # Ağ çağrısı sırasında başka checkout veya yeni plan yayını gerçekleşmiş olabilir.
    pending = await one(
        db,
        "SELECT * FROM checkout_sessions WHERE user_id=:uid AND status='pending'",
        uid=user.id,
    )
    if pending:
        await db.commit()
        if pending["plan_version_id"] != version["id"]:
            raise billing_error("checkout_pending", "Devam eden satın alma işlemi var.")
        return serialize_session(pending)
    live = await one(
        db,
        "SELECT v.id FROM plan_versions v JOIN plans p ON p.id=v.plan_id WHERE v.id=:id AND v.retired_at IS NULL AND p.active FOR SHARE OF v,p",
        id=version["id"],
    )
    if not live:
        raise billing_error("plan_changed", "Paket güncellendi. Sayfayı yenileyin.")
    current = await current_period(db, user.id)
    if (
        current
        and current["plan_version_id"] == version["id"]
        and sub["status"] in ("active", "trialing")
    ):
        raise billing_error("same_plan", "Bu planı zaten kullanıyorsunuz.")
    trial = bool(version["trial_period_days"] and not sub["trial_used_at"])
    session = await one(
        db,
        """INSERT INTO checkout_sessions(user_id,plan_version_id,idempotency_key,
        expected_amount_minor_units,currency,pricing_plan_reference,trial_status,initialization_started)
        VALUES(:uid,:vid,:key,:amount,:currency,:ref,:trial,true) RETURNING *""",
        uid=user.id,
        vid=version["id"],
        key=request.idempotency_key,
        amount=version["price_minor_units"],
        currency=version["currency"],
        ref=version["iyzico_trial_plan_reference_code"]
        if trial
        else version["iyzico_pricing_plan_reference_code"],
        trial="reserved" if trial else "none",
    )
    for document in expected:
        await execute(
            db,
            """INSERT INTO user_consents(user_id,document_type,document_version,document_hash,locale,plan_version_id,checkout_session_id,source)
            VALUES(:uid,:kind,:version,:hash,'tr',:vid,:sid,'checkout')""",
            uid=user.id,
            kind=document["document_type"],
            version=document["document_version"],
            hash=document["document_hash"],
            vid=version["id"],
            sid=session["id"],
        )
    await db.commit()
    customer = request.customer.model_dump(by_alias=True)
    customer["email"] = user.email
    try:
        result = await provider.initialize(session, customer)
        if (
            str(result.get("conversationId")) != str(session["conversation_reference"])
            or not result.get("token")
            or not result.get("checkoutFormContent")
        ):
            raise ProviderUnavailable("checkout_response_incomplete")
        lifetime = min(1800, max(1, int(result.get("tokenExpireTime", 1800))))
        await execute(
            db,
            """UPDATE checkout_sessions SET provider_checkout_token=:token,checkout_form_content=:content,
            expires_at=LEAST(expires_at,now()+make_interval(secs=>:seconds)) WHERE id=:id""",
            token=result["token"],
            content=result["checkoutFormContent"],
            seconds=lifetime,
            id=session["id"],
        )
        await db.commit()
    except ProviderUnavailable:
        # conversationId'nin uzak idempotency garantisi yok. Belirsiz initialize otomatik tekrarlanmaz.
        await alert(
            db,
            "checkout_initialization_uncertain",
            session["id"],
            "Provider sonucu belirsiz; yeniden initialize gönderilmedi.",
        )
        await db.commit()
        raise billing_error(
            "checkout_initialization_pending",
            "Ödeme formu hazırlanıyor. Durum kontrolü için biraz bekleyin.",
            retry=60,
        )
    except ProviderError:
        await execute(
            db,
            "UPDATE checkout_sessions SET status='failed',trial_status=CASE WHEN trial_status='reserved' THEN 'released' ELSE trial_status END WHERE id=:id",
            id=session["id"],
        )
        await db.commit()
        raise billing_error("checkout_failed", "Ödeme formu oluşturulamadı.", 502)
    return serialize_session(session)
