"""Faz 5 HTTP sözleşmesi; yetki token ve admin_users üzerinden belirlenir."""

import json
import uuid
from typing import Literal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Query, Form
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.auth import get_current_user, require_admin, CurrentUser
from app.core.config import settings
from app.core.db import get_db_session
from app.services.billing.db import one, many, execute, enqueue, alert
from app.services.billing.errors import billing_error
from app.services.billing.provider import (
    get_provider,
    CheckoutAbsent,
    ProviderError,
    ProviderUnavailable,
    verify_webhook,
)
from app.services.billing.checkout import start_checkout, documents
from app.services.billing.entitlements import (
    current_period,
    ensure_period,
    locked_subscription,
)
from app.services.billing.payments import verify_checkout
from app.services.billing.actions import suspend, finish_refund, stale_reference

from app.services.billing.limits import limit_checkout, limit_public

router = APIRouter()


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Address(StrictModel):
    address: str = Field(min_length=5, max_length=500)
    contact_name: str = Field(alias="contactName", min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=80)
    country: Literal["Turkey"] = "Turkey"
    zip_code: str | None = Field(default=None, alias="zipCode", max_length=12)


class Customer(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    surname: str = Field(min_length=1, max_length=80)
    gsm_number: str = Field(alias="gsmNumber", pattern=r"^\+90[0-9]{10}$")
    identity_number: str = Field(alias="identityNumber", pattern=r"^[1-9][0-9]{10}$")
    billing_address: Address = Field(alias="billingAddress")


class Consent(StrictModel):
    document_type: Literal["distance_sales", "pre_information"]
    document_version: str = Field(min_length=1, max_length=100)
    document_hash: str = Field(pattern=r"^[a-f0-9]{64}$")


class CheckoutRequest(StrictModel):
    plan_id: str = Field(pattern=r"^[a-z0-9-]{1,40}$")
    idempotency_key: uuid.UUID
    expected_plan_version_id: uuid.UUID
    consents: list[Consent] = Field(min_length=2, max_length=2)
    customer: Customer


class ActionRequest(StrictModel):
    idempotency_key: uuid.UUID


class PlanVersionRequest(StrictModel):
    price_minor_units: int = Field(ge=0)
    currency: Literal["TRY"] = "TRY"
    monthly_quota: int = Field(gt=0, le=100000)
    background_tier: Literal["basic", "full"]
    trial_period_days: int = Field(default=0, ge=0, le=7)
    iyzico_product_reference_code: str | None = Field(
        default=None, min_length=1, max_length=100
    )
    iyzico_pricing_plan_reference_code: str | None = Field(
        default=None, min_length=1, max_length=100
    )
    iyzico_trial_plan_reference_code: str | None = Field(default=None, max_length=100)


@router.get("/api/plans", dependencies=[Depends(limit_public)])
async def plans(db: AsyncSession = Depends(get_db_session)):
    return await many(
        db,
        """SELECT p.id,p.name,v.id AS plan_version_id,v.price_minor_units,v.currency,
        v.monthly_quota,v.background_tier,v.trial_period_days FROM plans p JOIN plan_versions v ON v.plan_id=p.id
        WHERE p.active AND v.published_at IS NOT NULL AND v.retired_at IS NULL ORDER BY v.price_minor_units""",
    )


@router.get("/api/billing/documents", dependencies=[Depends(limit_public)])
async def sales_documents():
    return documents()


@router.get("/api/subscriptions/me")
async def subscription_me(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    provider=Depends(get_provider),
):
    from fastapi import HTTPException

    pending = None
    try:
        await ensure_period(db, user.id, provider)
    except HTTPException as exc:
        if exc.status_code not in (403, 409):
            raise
        await db.rollback()
        pending = exc.detail
    sub = await one(
        db,
        "SELECT status,access_until,trial_used_at,deletion_requested_at FROM subscriptions WHERE user_id=:uid",
        uid=user.id,
    )
    period = await current_period(db, user.id)
    is_admin = bool(
        await one(db, "SELECT user_id FROM admin_users WHERE user_id=:uid", uid=user.id)
    )
    return {
        "subscription": sub,
        "period": period,
        "admin_exempt": is_admin,
        "billing_issue": pending,
    }


@router.post("/api/subscriptions/checkout", dependencies=[Depends(limit_checkout)])
@router.post("/api/subscriptions/change-plan", dependencies=[Depends(limit_checkout)])
async def checkout(
    payload: CheckoutRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    provider=Depends(get_provider),
):
    if not user.email:
        raise billing_error(
            "email_required", "Ödeme için doğrulanmış e-posta gerekli.", 422
        )
    try:
        return await start_checkout(db, user, payload, provider)
    except ProviderError:
        await db.rollback()
        raise billing_error(
            "billing_not_ready", "Ödeme sağlayıcısı şu anda doğrulanamıyor.", 503
        )


@router.get("/api/subscriptions/checkout/{session_id}")
async def checkout_status(
    session_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    session = await one(
        db,
        "SELECT id,status,expires_at,checkout_form_content FROM checkout_sessions WHERE id=:id AND user_id=:uid",
        id=session_id,
        uid=user.id,
    )
    if not session:
        raise billing_error("not_found", "Satın alma bulunamadı.", 404)
    result = dict(session)
    if (
        session["expires_at"] <= datetime.now(timezone.utc)
        or session["status"] != "pending"
    ):
        result["checkout_form_content"] = None
    return result


@router.post("/api/subscriptions/checkout/{session_id}/cancel")
async def cancel_checkout(
    session_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    provider=Depends(get_provider),
):
    """Devam eden satın almayı bırakıp başka bir plan seçebilmek için.

    FAIL-CLOSED: oturum kapatılmadan önce sağlayıcıya sorulur. Sağlayıcı "böyle
    bir ödeme yok" derse (kanıt uyuşmazlığı) oturum kapatılır; sağlayıcı CEVAP
    VEREMİYORSA hiçbir şey yapılmaz — uzakta gerçekten açılmış bir aboneliğin
    üstünü örtmek, kullanıcının iki abonelik ödemesi demek olurdu.
    """
    session = await one(
        db,
        "SELECT * FROM checkout_sessions WHERE id=:id AND user_id=:uid FOR UPDATE",
        id=session_id,
        uid=user.id,
    )
    if not session:
        await db.commit()
        raise billing_error("not_found", "Satın alma bulunamadı.", 404)
    if session["status"] != "pending":
        await db.commit()
        return {"status": session["status"]}
    if session["provider_subscription_reference"]:
        await db.commit()
        raise billing_error(
            "checkout_completed",
            "Bu ödeme için abonelik oluşturulmuş; iptal destek ile yapılır.",
        )
    await db.commit()
    if not session["provider_checkout_token"]:
        # Initialize gönderildi ama token hiç alınamadı: uzakta abonelik açılmış
        # olabilir ve bunu buradan bilmenin yolu yok (runbook'taki elle
        # uzlaştırma adımı).
        raise billing_error(
            "checkout_initialization_uncertain",
            "Bu ödemenin sonucu doğrulanamıyor; destek ile iletişime geçin.",
        )
    try:
        await verify_checkout(db, session, provider)
    except ProviderUnavailable:
        await db.rollback()
        raise billing_error(
            "billing_not_ready", "Ödeme sağlayıcısı şu anda doğrulanamıyor.", 503
        )
    except CheckoutAbsent:
        # Yalnızca sağlayıcının kesin "oluşmadı" sonucu yerel korumayı açar.
        await db.rollback()
    except ProviderError as exc:
        # Kanıt uyuşmazlığı veya genel provider reddi, uzakta abonelik
        # olmadığını kanıtlamaz. Çift abonelik riskine karşı fail-closed.
        await db.rollback()
        await alert(
            db,
            "checkout_cancellation_review",
            session_id,
            "Checkout iptali için uzak sonuç kesinleştirilemedi; manuel inceleme gerekli.",
        )
        await db.commit()
        raise billing_error(
            "checkout_verification_uncertain",
            "Bu ödemenin sonucu kesinleştirilemedi; oturum açık tutuldu.",
            409,
        ) from exc
    else:
        await db.commit()
        raise billing_error("checkout_completed", "Bu ödeme tamamlandı; iptal edilemez.")
    closed = await one(
        db,
        """UPDATE checkout_sessions SET status='failed',
        trial_status=CASE WHEN trial_status='reserved' THEN 'released' ELSE trial_status END,
        checkout_form_content=NULL
        WHERE id=:id AND user_id=:uid AND status='pending' AND provider_subscription_reference IS NULL
        RETURNING id,status""",
        id=session_id,
        uid=user.id,
    )
    await db.commit()
    if not closed:
        raise billing_error("checkout_completed", "Bu ödeme tamamlandı; iptal edilemez.")
    return {"status": closed["status"]}


@router.post(
    "/api/subscriptions/callback", dependencies=[Depends(limit_public)]
)
async def callback(
    token: str = Form(..., max_length=512),
    db: AsyncSession = Depends(get_db_session),
    provider=Depends(get_provider),
):
    session = await one(
        db,
        "SELECT * FROM checkout_sessions WHERE provider_checkout_token=:token",
        token=token,
    )
    await db.commit()
    if not session:
        raise billing_error("not_found", "Ödeme oturumu bulunamadı.", 404)
    try:
        await verify_checkout(db, session, provider)
    except ProviderError:
        await db.rollback()
        await alert(
            db,
            "checkout_verification",
            session["id"],
            "Callback doğrulanamadı; worker yeniden kontrol edecek.",
        )
        await db.commit()
    return RedirectResponse(
        settings.billing_frontend_url.rstrip("/") + "/odeme/" + str(session["id"]),
        status_code=303,
    )


@router.post("/api/subscriptions/cancel", status_code=202)
async def cancel(
    payload: ActionRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    sub = await locked_subscription(db, user.id)
    if not sub["provider_subscription_reference"]:
        raise billing_error("no_paid_subscription", "Ücretli aboneliğiniz yok.")
    action = await enqueue(
        db,
        user.id,
        "cancel_subscription",
        sub["provider_subscription_reference"],
        "cancel:" + sub["provider_subscription_reference"],
    )
    if sub["status"] not in ("canceled", "suspended"):
        await execute(
            db,
            "UPDATE subscriptions SET status='canceling' WHERE user_id=:uid",
            uid=user.id,
        )
    await db.commit()
    return {"action_id": action["id"], "status": action["status"]}


@router.get("/api/billing/history")
async def history(
    limit: int = Query(20, ge=1, le=100),
    before: uuid.UUID | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    cursor = (
        await one(
            db,
            "SELECT created_at,id FROM billing_transactions WHERE id=:id AND user_id=:uid",
            id=before,
            uid=user.id,
        )
        if before
        else None
    )
    if before and not cursor:
        raise billing_error("invalid_cursor", "Geçersiz sayfalama imleci.", 400)
    rows = await many(
        db,
        """SELECT id,type,status,amount_minor_units,currency,invoice_reference,created_at
        FROM billing_transactions WHERE user_id=:uid AND (:all_rows OR (created_at,id)<(CAST(:date AS timestamptz),CAST(:id AS uuid)))
        ORDER BY created_at DESC,id DESC LIMIT :limit""",
        uid=user.id,
        all_rows=not bool(cursor),
        date=cursor["created_at"] if cursor else None,
        id=before,
        limit=limit + 1,
    )
    return {
        "items": rows[:limit],
        "next_cursor": str(rows[limit - 1]["id"]) if len(rows) > limit else None,
    }


@router.post(
    "/api/webhooks/iyzico", status_code=202, dependencies=[Depends(limit_public)]
)
async def webhook(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.body()
    if len(body) > 65536:
        raise billing_error("payload_too_large", "Bildirim çok büyük.", 413)
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise billing_error("invalid_payload", "Geçersiz bildirim.", 400)
    if not isinstance(payload, dict) or not verify_webhook(
        payload, request.headers.get("X-IYZ-SIGNATURE-V3")
    ):
        raise billing_error("invalid_signature", "Geçersiz bildirim imzası.", 401)
    event_id = payload.get("iyziReferenceCode")
    if not isinstance(event_id, str) or not 0 < len(event_id) <= 200:
        raise billing_error("invalid_event_id", "Geçersiz olay kimliği.", 400)
    await execute(
        db,
        """INSERT INTO webhook_events(provider_event_id,event_type,payload)
        VALUES(:id,:kind,CAST(:body AS jsonb)) ON CONFLICT(provider,provider_event_id) DO NOTHING""",
        id=event_id,
        kind=payload["iyziEventType"],
        body=json.dumps(payload),
    )
    await db.commit()
    return {"accepted": True}


@router.post(
    "/api/admin/plans/{plan_id}/versions",
    dependencies=[Depends(require_admin)],
    status_code=201,
)
async def publish(
    plan_id: str,
    payload: PlanVersionRequest,
    db: AsyncSession = Depends(get_db_session),
    provider=Depends(get_provider),
):
    await db.commit()
    version = payload.model_dump()
    if payload.trial_period_days and not payload.iyzico_trial_plan_reference_code:
        raise billing_error(
            "trial_plan_required", "Denemeli provider planı gerekli.", 422
        )
    if plan_id == "deneme":
        if (
            payload.price_minor_units
            or payload.trial_period_days
            or payload.iyzico_product_reference_code
            or payload.iyzico_pricing_plan_reference_code
            or payload.iyzico_trial_plan_reference_code
        ):
            raise billing_error(
                "invalid_free_plan",
                "Deneme planı ücretsiz ve provider referanssız olmalı.",
                422,
            )
    else:
        if (
            not payload.price_minor_units
            or not payload.iyzico_product_reference_code
            or not payload.iyzico_pricing_plan_reference_code
        ):
            raise billing_error(
                "provider_plan_required",
                "Ücretli planın fiyatı ve provider referansları gerekli.",
                422,
            )
        try:
            await provider.verify_plan(
                version, payload.iyzico_pricing_plan_reference_code
            )
            if payload.trial_period_days:
                await provider.verify_plan(
                    version,
                    payload.iyzico_trial_plan_reference_code,
                    payload.trial_period_days,
                )
        except ProviderError:
            raise billing_error(
                "provider_plan_mismatch", "Provider planı doğrulanamadı.", 422
            )
    plan = await one(db, "SELECT id FROM plans WHERE id=:id FOR UPDATE", id=plan_id)
    if not plan:
        raise billing_error("invalid_plan", "Geçersiz ücretli plan.", 404)
    await execute(
        db,
        "UPDATE plan_versions SET retired_at=now() WHERE plan_id=:id AND retired_at IS NULL",
        id=plan_id,
    )
    row = await one(
        db,
        """INSERT INTO plan_versions(plan_id,version,price_minor_units,currency,monthly_quota,background_tier,
        trial_period_days,iyzico_product_reference_code,iyzico_pricing_plan_reference_code,iyzico_trial_plan_reference_code,published_at)
        SELECT :plan_id,COALESCE(max(version),0)+1,:price_minor_units,:currency,:monthly_quota,:background_tier,
        :trial_period_days,:iyzico_product_reference_code,:iyzico_pricing_plan_reference_code,:iyzico_trial_plan_reference_code,now()
        FROM plan_versions WHERE plan_id=:plan_id RETURNING id,version""",
        plan_id=plan_id,
        **version,
    )
    await db.commit()
    return row


class PlanPatch(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    active: bool


@router.patch("/api/admin/plans/{plan_id}", dependencies=[Depends(require_admin)])
async def patch_plan(
    plan_id: str, payload: PlanPatch, db: AsyncSession = Depends(get_db_session)
):
    row = await one(
        db,
        "UPDATE plans SET name=:name,active=:active WHERE id=:id RETURNING id,name,active",
        id=plan_id,
        **payload.model_dump(),
    )
    if not row:
        raise billing_error("not_found", "Plan bulunamadı.", 404)
    await db.commit()
    return row


@router.post(
    "/api/admin/billing/{transaction_id}/refund",
    dependencies=[Depends(require_admin)],
    status_code=202,
)
async def refund(
    transaction_id: uuid.UUID,
    payload: ActionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    transaction = await one(
        db,
        "SELECT * FROM billing_transactions WHERE id=:id AND type='charge' AND status='succeeded' FOR UPDATE",
        id=transaction_id,
    )
    if not transaction or not transaction["user_id"]:
        raise billing_error("not_found", "İade edilebilir ödeme bulunamadı.", 404)
    if await one(
        db,
        "SELECT id FROM billing_transactions WHERE original_transaction_id=:id AND type='chargeback'",
        id=transaction_id,
    ):
        raise billing_error(
            "chargeback_exists", "Banka itirazı olan ödeme tekrar iade edilemez."
        )
    action = await enqueue(
        db,
        transaction["user_id"],
        "refund_payment",
        transaction_id,
        "refund:" + str(transaction_id),
        {"ip": request.client.host if request.client else "127.0.0.1"},
    )
    await db.commit()
    return {"action_id": action["id"], "status": action["status"]}


@router.post(
    "/api/admin/subscriptions/{user_id}/suspend",
    dependencies=[Depends(require_admin)],
    status_code=202,
)
async def suspend_subscription(
    user_id: uuid.UUID,
    payload: ActionRequest,
    db: AsyncSession = Depends(get_db_session),
):
    await locked_subscription(db, user_id)
    action = await enqueue(
        db,
        user_id,
        "suspend_entitlement",
        user_id,
        "suspend:" + str(payload.idempotency_key),
    )
    await suspend(db, user_id)
    await db.commit()
    return {"action_id": action["id"], "status": "suspended"}


class Invoice(StrictModel):
    invoice_reference: str = Field(min_length=1, max_length=200)


@router.patch(
    "/api/admin/billing/{transaction_id}/invoice", dependencies=[Depends(require_admin)]
)
async def invoice(
    transaction_id: uuid.UUID,
    payload: Invoice,
    db: AsyncSession = Depends(get_db_session),
):
    row = await one(
        db,
        "UPDATE billing_transactions SET invoice_reference=:ref WHERE id=:id AND invoice_reference IS NULL RETURNING id",
        id=transaction_id,
        ref=payload.invoice_reference,
    )
    if not row:
        raise billing_error(
            "invoice_conflict", "Fatura bulunamadı veya zaten kaydedilmiş."
        )
    await db.commit()
    return row


class Dispute(StrictModel):
    provider_reference: str = Field(min_length=1, max_length=200)
    status: Literal["disputed", "won", "lost"]


@router.post(
    "/api/admin/billing/{transaction_id}/chargeback",
    dependencies=[Depends(require_admin)],
)
async def chargeback(
    transaction_id: uuid.UUID,
    payload: Dispute,
    db: AsyncSession = Depends(get_db_session),
):
    charge = await one(
        db,
        "SELECT * FROM billing_transactions WHERE id=:id AND type='charge' FOR UPDATE",
        id=transaction_id,
    )
    if not charge:
        raise billing_error("not_found", "Ödeme bulunamadı.", 404)
    # Banka itirazında refund API çağrılmaz. Kazanılan itiraz otomatik yeni kota vermez.
    kind = "chargeback_reversal" if payload.status == "won" else "chargeback"
    await execute(
        db,
        """INSERT INTO billing_transactions(user_id,period_id,type,status,amount_minor_units,currency,provider_transaction_reference,original_transaction_id)
        VALUES(:uid,:pid,:kind,:status,:amount,:currency,:ref,:original) ON CONFLICT(provider,provider_transaction_reference,type) DO NOTHING""",
        uid=charge["user_id"],
        pid=charge["period_id"],
        kind=kind,
        status=payload.status,
        amount=charge["amount_minor_units"],
        currency=charge["currency"],
        ref=payload.provider_reference + ":" + payload.status,
        original=charge["id"],
    )
    if payload.status != "won":
        # İade akışıyla aynı kural: itiraz edilen tahsilat kullanıcının GÜNCEL
        # aboneliğine ait değilse yalnızca o eski aboneliğin dönemleri kapanır,
        # bugün ödediği paket kapanmaz.
        stale = await stale_reference(db, charge)
        await suspend(db, charge["user_id"], stale)
        await enqueue(
            db,
            charge["user_id"],
            "suspend_entitlement",
            charge["user_id"],
            "chargeback:" + payload.provider_reference,
            {"provider_subscription_reference": stale} if stale else None,
        )
    await db.commit()
    return {"status": payload.status}


@router.get("/api/admin/billing/operations", dependencies=[Depends(require_admin)])
async def operations(db: AsyncSession = Depends(get_db_session)):
    return {
        "alerts": await many(
            db,
            "SELECT * FROM billing_alerts WHERE resolved_at IS NULL ORDER BY created_at LIMIT 100",
        ),
        "actions": await many(
            db,
            "SELECT id,kind,status,attempts,last_error FROM provider_actions WHERE status<>'succeeded' ORDER BY created_at LIMIT 100",
        ),
        "runs": await many(db, "SELECT * FROM billing_runs"),
    }


class RefundResolution(StrictModel):
    outcome: Literal["succeeded", "not_refunded"]
    evidence_reference: str = Field(min_length=5, max_length=300)


@router.post("/api/admin/billing/actions/{action_id}/resolve")
async def resolve_refund(
    action_id: uuid.UUID,
    payload: RefundResolution,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    # Operatör Merchant Panel/destek kaydıyla belirsiz sonucu teyit eder; karar izi saklanır.
    action = await one(
        db,
        "SELECT * FROM provider_actions WHERE id=:id AND kind='refund_payment' FOR UPDATE",
        id=action_id,
    )
    if not action or action["status"] != "uncertain":
        raise billing_error(
            "resolution_conflict",
            "Yalnızca belirsiz iadeler bu yolla sonuçlandırılabilir.",
        )
    proof = {
        "outcome": payload.outcome,
        "evidence_reference": payload.evidence_reference,
        "reviewed_by": str(admin.id),
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    await execute(
        db,
        "UPDATE provider_actions SET payload=payload || CAST(:proof AS jsonb) WHERE id=:id",
        id=action_id,
        proof=json.dumps({"resolution": proof}),
    )
    if payload.outcome == "succeeded":
        charge = await one(
            db,
            "SELECT * FROM billing_transactions WHERE id=CAST(:id AS uuid)",
            id=action["target_reference"],
        )
        await finish_refund(
            db,
            charge,
            action_id,
            suspend_access=not action["payload"].get("late_checkout"),
        )
        await execute(
            db,
            "UPDATE provider_actions SET status='succeeded',completed_at=now(),lease_until=NULL,last_error=NULL WHERE id=:id",
            id=action_id,
        )
    else:
        await execute(
            db,
            "UPDATE provider_actions SET status='pending',dispatched_at=NULL,attempts=0,lease_until=NULL,last_error=NULL WHERE id=:id",
            id=action_id,
        )
    await execute(
        db,
        "UPDATE billing_alerts SET resolved_at=now() WHERE reference=:ref AND kind IN ('refund_uncertain','provider_action_failed')",
        ref=str(action_id),
    )
    await db.commit()
    return {"status": "succeeded" if payload.outcome == "succeeded" else "pending"}


class RetryReview(StrictModel):
    evidence_reference: str = Field(min_length=5, max_length=300)


@router.post("/api/admin/billing/actions/{action_id}/retry")
async def retry_action(
    action_id: uuid.UUID,
    payload: RetryReview,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    action = await one(
        db,
        "SELECT * FROM provider_actions WHERE id=:id AND status='failed' FOR UPDATE",
        id=action_id,
    )
    if not action or action["dispatched_at"]:
        raise billing_error(
            "retry_conflict", "Bu işlem için önce uzak sonuç uzlaştırılmalı."
        )
    await execute(
        db,
        "UPDATE provider_actions SET status='pending',attempts=0,lease_until=NULL,payload=payload || CAST(:review AS jsonb) WHERE id=:id",
        id=action_id,
        review=json.dumps(
            {
                "retry_review": {
                    "actor": str(admin.id),
                    "evidence": payload.evidence_reference,
                }
            }
        ),
    )
    await db.commit()
    return {"status": "pending"}
