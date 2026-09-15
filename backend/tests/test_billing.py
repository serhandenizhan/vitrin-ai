"""Gerçek PostgreSQL ile dönem/kota yarışları ve ödeme kabul sınırları."""

import asyncio
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db import get_db_session
from app.main import app
from app.services.billing.db import one, many, execute, enqueue
from app.services.billing.entitlements import (
    reserve,
    resolve_reservation,
    ensure_period,
    expire_reservations,
)
from app.services.billing.provider import (
    verify_webhook,
    get_provider,
    EvidenceMismatch,
    ProviderUnavailable,
    Iyzico,
)
from app.services.billing.payments import apply_subscription, verify_checkout
from app.services.billing.checkout import start_checkout, documents, expire_checkouts
from app.services.billing.actions import (
    claim_action,
    run_action,
    prune_projects,
    run_storage_job,
)
from app.services.billing.maintenance import process_webhook, reconcile
from app.api.routes.billing import CheckoutRequest
from app.core.auth import CurrentUser
from app.models.project import Project


@pytest.fixture
def provider():
    mock = AsyncMock(spec=Iyzico)
    mock.transactions.return_value = {"transactions": [], "totalPageCount": 0}
    return mock


@pytest.fixture
def factory():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def paid(db_session, create_user):
    uid = await create_user()
    version = await one(
        db_session,
        """INSERT INTO plan_versions(plan_id,version,price_minor_units,currency,monthly_quota,background_tier,
        iyzico_product_reference_code,iyzico_pricing_plan_reference_code,trial_period_days,iyzico_trial_plan_reference_code,published_at)
        VALUES('atolye',1,9900,'TRY',100,'full','product','paid-plan',7,'trial-plan',now()) RETURNING *""",
    )
    session = await one(
        db_session,
        """INSERT INTO checkout_sessions(user_id,plan_version_id,idempotency_key,expected_amount_minor_units,
        currency,pricing_plan_reference,customer_reference_code,provider_subscription_reference,provider_checkout_token)
        VALUES(:uid,:vid,:key,9900,'TRY','paid-plan','customer','subscription','token') RETURNING *""",
        uid=uid,
        vid=version["id"],
        key=uuid.uuid4(),
    )
    await db_session.commit()
    now = datetime.now(timezone.utc)
    evidence = {
        "referenceCode": "subscription",
        "pricingPlanReferenceCode": "paid-plan",
        "customerReferenceCode": "customer",
        "subscriptionStatus": "ACTIVE",
        "orders": [
            {
                "referenceCode": "order-1",
                "price": "99.00",
                "currencyCode": "TRY",
                "orderStatus": "SUCCESS",
                "startPeriod": int((now - timedelta(seconds=2)).timestamp() * 1000),
                "endPeriod": int((now + timedelta(days=30)).timestamp() * 1000),
                "paymentAttempts": [{"paymentStatus": "SUCCESS", "paymentId": 123}],
            }
        ],
    }
    return uid, version, session, evidence


async def test_last_credit_concurrent_requests_only_one_wins(
    db_session, create_user, factory, provider
):
    uid = await create_user()
    await execute(
        db_session,
        "UPDATE subscription_periods SET used_this_period=quota_snapshot-1 WHERE user_id=:uid",
        uid=uid,
    )
    await db_session.commit()

    async def run():
        async with factory() as db:
            try:
                return await reserve(db, uid, uuid.uuid4(), provider)
            except HTTPException as exc:
                return exc.status_code

    results = await asyncio.gather(run(), run())
    assert sum(isinstance(r, uuid.UUID) for r in results) == 1
    assert 402 in results


async def test_request_id_prevents_duplicate_inference(
    db_session, create_user, provider
):
    uid = await create_user()
    key = uuid.uuid4()
    rid = await reserve(db_session, uid, key, provider)
    assert await resolve_reservation(db_session, rid, True)
    with pytest.raises(HTTPException) as exc:
        await reserve(db_session, uid, key, provider)
    assert exc.value.detail["code"] == "request_already_processed"
    assert (await one(db_session, "SELECT count(*) AS n FROM usage_events"))["n"] == 1


async def test_expiry_and_success_race_never_double_refunds(
    db_session, create_user, provider, factory
):
    uid = await create_user()
    rid = await reserve(db_session, uid, uuid.uuid4(), provider)

    async def resolve(success):
        async with factory() as db:
            return await resolve_reservation(db, rid, success)

    results = await asyncio.gather(resolve(False), resolve(False), resolve(True))
    assert results.count(True) == 1
    row = await one(
        db_session, "SELECT status FROM usage_reservations WHERE id=:id", id=rid
    )
    period = await one(
        db_session,
        "SELECT used_this_period FROM subscription_periods WHERE user_id=:uid",
        uid=uid,
    )
    assert period["used_this_period"] == (1 if row["status"] == "consumed" else 0)


async def test_abandoned_reservation_released_once(db_session, create_user, provider):
    uid = await create_user()
    rid = await reserve(db_session, uid, uuid.uuid4(), provider)
    await execute(
        db_session,
        "UPDATE usage_reservations SET created_at=now()-interval '6 minutes' WHERE id=:id",
        id=rid,
    )
    await db_session.commit()
    await expire_reservations(db_session)
    await expire_reservations(db_session)
    assert not await resolve_reservation(db_session, rid, True)
    assert (
        await one(
            db_session,
            "SELECT used_this_period FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["used_this_period"] == 0


async def test_free_period_renews_without_accumulating(
    db_session, create_user, provider
):
    uid = await create_user()
    await execute(
        db_session,
        "UPDATE subscription_periods SET starts_at=now()-interval '3 months',ends_at=now()-interval '2 months',used_this_period=10 WHERE user_id=:uid",
        uid=uid,
    )
    await db_session.commit()
    period = await ensure_period(db_session, uid, provider)
    assert period["used_this_period"] == 0 and period["quota_snapshot"] == 10
    assert period["ends_at"] > datetime.now(timezone.utc)
    provider.subscription.assert_not_called()


async def test_verified_payment_is_idempotent_and_wrong_amount_never_grants(
    db_session, paid
):
    uid, version, session, evidence = paid
    evidence["orders"][0]["price"] = "98"
    with pytest.raises(EvidenceMismatch):
        await apply_subscription(db_session, uid, evidence, session["id"])
    await db_session.rollback()
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_transactions"))[
        "n"
    ] == 0
    evidence["orders"][0]["price"] = "99"
    await apply_subscription(db_session, uid, evidence, session["id"])
    await apply_subscription(db_session, uid, evidence, session["id"])
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_transactions"))[
        "n"
    ] == 1
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM subscription_periods WHERE status='active'",
        )
    )["n"] == 1


@pytest.mark.parametrize(
    "field,value", [("currencyCode", "USD"), ("price", "0"), ("orderStatus", "WAITING")]
)
async def test_unverified_order_rejected(db_session, paid, field, value):
    uid, _, session, evidence = paid
    evidence["orders"][0][field] = value
    with pytest.raises(EvidenceMismatch):
        await apply_subscription(db_session, uid, evidence, session["id"])
    await db_session.rollback()
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_transactions"))[
        "n"
    ] == 0


async def test_renewal_before_webhook_creates_one_period(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await execute(
        db_session,
        "UPDATE subscription_periods SET starts_at=now()-interval '31 days',ends_at=now()-interval '1 day' WHERE user_id=:uid AND status='active'",
        uid=uid,
    )
    await execute(
        db_session,
        "UPDATE subscriptions SET access_until=now()-interval '1 day' WHERE user_id=:uid",
        uid=uid,
    )
    await db_session.commit()
    evidence["orders"][0]["referenceCode"] = "renewal-2"
    evidence["orders"][0]["paymentAttempts"][0]["paymentId"] = 456
    provider.subscription.return_value = evidence
    period = await ensure_period(db_session, uid, provider)
    assert period["used_this_period"] == 0
    await apply_subscription(db_session, uid, evidence)
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_transactions"))[
        "n"
    ] == 2
    provider.subscription.assert_awaited_once()


async def test_failed_renewal_no_grace_and_throttled(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await execute(
        db_session,
        "UPDATE subscription_periods SET starts_at=now()-interval '31 days',ends_at=now()-interval '1 day' WHERE user_id=:uid AND status='active'",
        uid=uid,
    )
    await db_session.commit()
    provider.subscription.side_effect = ProviderUnavailable()
    for _ in range(2):
        with pytest.raises(HTTPException) as exc:
            await ensure_period(db_session, uid, provider)
        assert (
            exc.value.detail["code"] == "billing_renewal_pending"
            and exc.value.headers["Retry-After"] == "60"
        )
    provider.subscription.assert_awaited_once()


async def test_cancellation_preserves_paid_access(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await execute(
        db_session,
        "UPDATE subscriptions SET status='canceled' WHERE user_id=:uid",
        uid=uid,
    )
    await db_session.commit()
    assert await reserve(db_session, uid, uuid.uuid4(), provider)


def test_webhook_v3_accepts_only_correct_signature(monkeypatch):
    monkeypatch.setattr(settings, "iyzico_secret_key", "secret")
    monkeypatch.setattr(settings, "iyzico_merchant_id", "merchant")
    payload = {
        "merchantId": "merchant",
        "iyziEventType": "subscription.order.success",
        "subscriptionReferenceCode": "s",
        "orderReferenceCode": "o",
        "customerReferenceCode": "c",
    }
    signature = hmac.new(
        b"secret", b"merchantsecretsubscription.order.successsoc", hashlib.sha256
    ).hexdigest()
    assert verify_webhook(payload, signature)
    assert not verify_webhook(payload, "bad")
    assert not verify_webhook({**payload, "orderReferenceCode": "wrong"}, signature)
    assert not verify_webhook(payload, "ğ")


async def test_delete_failure_does_not_touch_auth_or_r2(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    action = await enqueue(db_session, uid, "delete_account", uid, "delete:test")
    await db_session.commit()
    action = await claim_action(db_session)
    provider.cancel.side_effect = ProviderUnavailable()
    storage = AsyncMock()
    admin = AsyncMock()
    admin.ensure_configured = lambda: None
    await run_action(db_session, action, provider, storage, admin)
    storage.delete_prefix.assert_not_called()
    admin.delete_user.assert_not_called()
    assert (
        await one(
            db_session,
            "SELECT status FROM provider_actions WHERE id=:id",
            id=action["id"],
        )
    )["status"] == "failed"


async def test_uncertain_refund_is_not_sent_twice(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    charge = await one(
        db_session, "SELECT * FROM billing_transactions WHERE type='charge'"
    )
    await enqueue(db_session, uid, "refund_payment", charge["id"], "refund:test")
    await execute(
        db_session,
        "UPDATE provider_actions SET dispatched_at=now() WHERE kind='refund_payment'",
    )
    await db_session.commit()
    action = await claim_action(db_session)
    await run_action(db_session, action, provider)
    provider.refund.assert_not_called()
    assert (
        await one(
            db_session,
            "SELECT status FROM provider_actions WHERE id=:id",
            id=action["id"],
        )
    )["status"] == "uncertain"


async def test_project_pruning_waits_for_r2(db_session, create_user):
    uid = await create_user()
    for i in range(11):
        db_session.add(
            Project(
                user_id=uid,
                file_name=str(i),
                result_r2_key=f"r/{i}",
                thumbnail_r2_key=f"t/{i}",
            )
        )
    await db_session.flush()
    await prune_projects(db_session, uid)
    await db_session.commit()
    storage = AsyncMock()
    storage.delete.side_effect = RuntimeError()
    await run_storage_job(db_session, storage)
    assert (await one(db_session, "SELECT count(*) AS n FROM projects"))["n"] == 11
    storage.delete.side_effect = None
    await execute(db_session, "UPDATE storage_deletion_jobs SET lease_until=NULL")
    await db_session.commit()
    await run_storage_job(db_session, storage)
    assert (await one(db_session, "SELECT count(*) AS n FROM projects"))["n"] == 10


async def test_checkout_trial_race(db_session, paid, provider, factory, monkeypatch):
    uid, version, old, _ = paid
    await execute(
        db_session, "DELETE FROM checkout_sessions WHERE id=:id", id=old["id"]
    )
    await db_session.commit()
    for key, value in {
        "billing_checkout_enabled": True,
        "billing_legal_approved": True,
        "billing_invoice_process_ready": True,
        "billing_sales_document_version": "v1",
        "billing_sales_document_text": "satış",
        "billing_pre_information_text": "ön bilgi",
        "billing_callback_url": "https://example.test/api/subscriptions/callback",
    }.items():
        monkeypatch.setattr(settings, key, value)
    provider.ensure_configured = lambda: None

    async def initialize(session, customer):
        await asyncio.sleep(0.05)
        return {
            "conversationId": str(session["conversation_reference"]),
            "token": "new-token",
            "checkoutFormContent": "<div>form</div>",
        }

    provider.initialize.side_effect = initialize

    def request():
        return CheckoutRequest(
            plan_id="atolye",
            expected_plan_version_id=version["id"],
            idempotency_key=uuid.uuid4(),
            consents=[
                {
                    k: d[k]
                    for k in ("document_type", "document_hash", "document_version")
                }
                for d in documents()
            ],
            customer={
                "name": "Test",
                "surname": "User",
                "gsmNumber": "+905551234567",
                "identityNumber": "11111111111",
                "billingAddress": {
                    "address": "Test address",
                    "contactName": "Test User",
                    "city": "Istanbul",
                },
            },
        )

    async def run():
        async with factory() as db:
            return await start_checkout(
                db,
                CurrentUser(id=uid, email="test@example.test", session_id=None),
                request(),
                provider,
            )

    a, b = await asyncio.gather(run(), run())
    assert a["id"] == b["id"]
    provider.initialize.assert_awaited_once()
    assert (
        await one(
            db_session,
            "SELECT trial_used_at FROM subscriptions WHERE user_id=:uid",
            uid=uid,
        )
    )["trial_used_at"] is None
    await execute(
        db_session, "UPDATE checkout_sessions SET expires_at=now()-interval '1 second'"
    )
    await expire_checkouts(db_session)
    await db_session.commit()
    assert (await one(db_session, "SELECT trial_status FROM checkout_sessions"))[
        "trial_status"
    ] == "released"


@pytest.fixture
async def client(db_session, provider):
    async def session_override():
        yield db_session

    app.dependency_overrides[get_db_session] = session_override
    app.dependency_overrides[get_provider] = lambda: provider
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


async def test_api_public_plans_only_published_and_checkout_closed(
    client, create_user, tokens
):
    uid = await create_user()
    response = await client.get("/api/plans")
    assert response.status_code == 200
    assert [p["id"] for p in response.json()] == ["deneme"]
    response = await client.get("/api/subscriptions/me", headers=tokens.headers(uid))
    assert (
        response.status_code == 200
        and response.json()["period"]["quota_snapshot"] == 10
    )
    assert (await client.get("/api/subscriptions/me")).status_code == 401


async def test_billing_history_and_checkout_idor(
    client, paid, create_user, tokens, db_session
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    other = await create_user()
    response = await client.get("/api/billing/history", headers=tokens.headers(other))
    assert response.json()["items"] == []
    response = await client.get(
        "/api/subscriptions/checkout/" + str(session["id"]),
        headers=tokens.headers(other),
    )
    assert response.status_code == 404
    response = await client.get("/api/billing/history", headers=tokens.headers(uid))
    assert len(response.json()["items"]) == 1
    charge_id = response.json()["items"][0]["id"]
    response = await client.post(
        "/api/admin/billing/" + charge_id + "/refund",
        headers=tokens.headers(uid),
        json={"idempotency_key": str(uuid.uuid4())},
    )
    assert response.status_code == 403


async def test_webhook_is_durable_and_duplicate_delivery_noop(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(settings, "iyzico_secret_key", "secret")
    monkeypatch.setattr(settings, "iyzico_merchant_id", "merchant")
    payload = {
        "merchantId": "merchant",
        "iyziEventType": "subscription.order.success",
        "subscriptionReferenceCode": "s",
        "orderReferenceCode": "o",
        "customerReferenceCode": "c",
        "iyziReferenceCode": "event-1",
    }
    signature = hmac.new(
        b"secret", b"merchantsecretsubscription.order.successsoc", hashlib.sha256
    ).hexdigest()
    assert (await client.post("/api/webhooks/iyzico", json=payload)).status_code == 401
    for _ in range(2):
        assert (
            await client.post(
                "/api/webhooks/iyzico",
                json=payload,
                headers={"X-IYZ-SIGNATURE-V3": signature},
            )
        ).status_code == 202
    assert (await one(db_session, "SELECT count(*) AS n FROM webhook_events"))["n"] == 1


async def test_callback_trial_is_consumed_only_on_verified_provider_evidence(
    db_session, paid, provider
):
    uid, _, session, evidence = paid
    await execute(
        db_session,
        "UPDATE checkout_sessions SET pricing_plan_reference='trial-plan',trial_status='reserved' WHERE id=:id",
        id=session["id"],
    )
    await db_session.commit()
    session = await one(
        db_session, "SELECT * FROM checkout_sessions WHERE id=:id", id=session["id"]
    )
    await db_session.commit()
    now = datetime.now(timezone.utc)
    evidence.update(
        orders=[],
        pricingPlanReferenceCode="trial-plan",
        trialDays=7,
        trialStartDate=int((now - timedelta(seconds=1)).timestamp() * 1000),
        trialEndDate=int((now + timedelta(days=7, seconds=-1)).timestamp() * 1000),
    )
    provider.checkout.return_value = {
        "conversationId": str(session["conversation_reference"]),
        "data": evidence,
    }
    provider.subscription.return_value = evidence
    await verify_checkout(db_session, session, provider)
    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["trial_used_at"] is not None and sub["status"] == "trialing"
    await db_session.commit()
    await verify_checkout(db_session, session, provider)
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_transactions"))[
        "n"
    ] == 0
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM subscription_periods WHERE provider_order_reference LIKE 'trial:%'",
        )
    )["n"] == 1


async def test_basic_cannot_get_full_background_url(
    client, db_session, create_user, tokens
):
    from app.models.background import Background
    from app.services.storage import get_storage_service
    from unittest.mock import Mock

    uid = await create_user()
    db_session.add_all(
        [
            Background(r2_key="basic", tier="basic"),
            Background(r2_key="full", tier="full"),
        ]
    )
    await db_session.commit()
    storage = Mock()
    storage.generate_presigned_url = lambda key: "https://storage.test/" + key
    app.dependency_overrides[get_storage_service] = lambda: storage
    response = await client.get("/api/backgrounds", headers=tokens.headers(uid))
    assert response.status_code == 200
    assert [r["url"] for r in response.json()] == ["https://storage.test/basic"]


async def test_wrong_plan_or_customer_has_no_entitlement(db_session, paid):
    uid, _, session, evidence = paid
    for field in ("pricingPlanReferenceCode", "customerReferenceCode"):
        original = evidence[field]
        evidence[field] = "wrong"
        with pytest.raises(EvidenceMismatch):
            await apply_subscription(db_session, uid, evidence, session["id"])
        await db_session.rollback()
        evidence[field] = original
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_transactions"))[
        "n"
    ] == 0


async def test_plan_and_financial_snapshots_are_immutable(db_session, paid):
    from sqlalchemy.exc import DBAPIError

    uid, version, session, evidence = paid
    with pytest.raises(DBAPIError):
        await execute(
            db_session,
            "UPDATE plan_versions SET monthly_quota=999 WHERE id=:id",
            id=version["id"],
        )
    await db_session.rollback()
    await apply_subscription(db_session, uid, evidence, session["id"])
    with pytest.raises(DBAPIError):
        await execute(
            db_session, "UPDATE billing_transactions SET amount_minor_units=1"
        )
    await db_session.rollback()


async def test_financial_history_survives_account_deletion(db_session, paid):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await execute(
        db_session,
        "UPDATE subscriptions SET status='canceled' WHERE user_id=:uid",
        uid=uid,
    )
    await execute(db_session, "DELETE FROM auth.users WHERE id=:uid", uid=uid)
    await db_session.commit()
    row = await one(db_session, "SELECT * FROM billing_transactions")
    assert (
        row["user_id"] is None
        and row["amount_minor_units"] == 9900
        and row["retention_subject"]
    )


async def test_active_paid_account_cannot_be_deleted_directly(db_session, paid):
    from sqlalchemy.exc import DBAPIError

    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    with pytest.raises(DBAPIError):
        await execute(db_session, "DELETE FROM auth.users WHERE id=:uid", uid=uid)
    await db_session.rollback()


async def test_webhook_retry_and_unknown_events_alarm(db_session, provider):
    await execute(
        db_session,
        "INSERT INTO webhook_events(provider_event_id,event_type,payload) VALUES('unknown','unknown','{}')",
    )
    await db_session.commit()
    await process_webhook(db_session, provider)
    row = await one(db_session, "SELECT * FROM webhook_events")
    assert row["processed_at"] is None and row["processing_attempts"] == 1
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_alerts"))["n"] == 1


async def test_reconciliation_detects_missing_payment_without_granting(
    db_session, paid, provider
):
    uid, _, _, evidence = paid
    provider.subscriptions.return_value = {
        "items": [{"referenceCode": "subscription"}],
        "pageCount": 1,
    }
    provider.subscription.return_value = evidence
    await reconcile(db_session, provider)
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_alerts"))["n"] == 2
    assert (await one(db_session, "SELECT count(*) AS n FROM billing_transactions"))[
        "n"
    ] == 0


async def test_cancel_retry_observes_remote_success_after_crash(
    db_session, paid, provider
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await enqueue(db_session, uid, "cancel_subscription", "subscription", "cancel:test")
    await db_session.commit()
    action = await claim_action(db_session)
    provider.cancel.side_effect = ProviderUnavailable()
    await run_action(db_session, action, provider)
    await execute(db_session, "UPDATE provider_actions SET lease_until=NULL")
    await db_session.commit()
    provider.cancel.side_effect = None
    action = await claim_action(db_session)
    await run_action(db_session, action, provider)
    assert (
        await one(
            db_session, "SELECT status FROM subscriptions WHERE user_id=:uid", uid=uid
        )
    )["status"] == "canceled"


async def test_chargeback_does_not_refund(
    client, db_session, paid, grant_admin, tokens, provider
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await grant_admin(uid)
    charge = await one(db_session, "SELECT id FROM billing_transactions")
    await db_session.commit()
    response = await client.post(
        "/api/admin/billing/" + str(charge["id"]) + "/chargeback",
        headers=tokens.headers(uid),
        json={"provider_reference": "bank-dispute", "status": "disputed"},
    )
    assert response.status_code == 200
    provider.refund.assert_not_called()
    assert (
        await one(
            db_session, "SELECT status FROM subscriptions WHERE user_id=:uid", uid=uid
        )
    )["status"] == "suspended"


async def test_successful_refund_has_one_ledger_entry_and_cancellation(
    db_session, paid, provider
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    charge = await one(db_session, "SELECT * FROM billing_transactions")
    await enqueue(db_session, uid, "refund_payment", charge["id"], "refund:success")
    await db_session.commit()
    provider.payment.return_value = {
        "paymentId": "123",
        "currency": "TRY",
        "itemTransactions": [{"paymentTransactionId": "item", "paidPrice": "99.00"}],
    }
    provider.refund.return_value = {
        "paymentTransactionId": "item",
        "price": "99.00",
        "currency": "TRY",
    }
    action = await claim_action(db_session)
    await run_action(db_session, action, provider)
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM billing_transactions WHERE type='refund'",
        )
    )["n"] == 1
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM provider_actions WHERE kind='cancel_subscription'",
        )
    )["n"] == 1
    assert (
        await one(
            db_session, "SELECT status FROM subscriptions WHERE user_id=:uid", uid=uid
        )
    )["status"] == "suspended"


async def test_provider_query_signature_and_checkout_echo(monkeypatch):
    import base64
    import httpx

    monkeypatch.setattr(settings, "iyzico_api_key", "api-key")
    monkeypatch.setattr(settings, "iyzico_secret_key", "secret")
    monkeypatch.setattr(settings, "iyzico_base_url", "https://sandbox-api.iyzipay.com")
    monkeypatch.setattr(
        "app.services.billing.provider.secrets.token_hex", lambda n: "nonce"
    )
    original = httpx.AsyncClient
    calls = []

    async def handle(request):
        calls.append(request)
        auth = base64.b64decode(
            request.headers["Authorization"].split(" ", 1)[1]
        ).decode()
        digest = hmac.new(
            b"secret",
            ("nonce" + request.url.path + request.content.decode()).encode(),
            hashlib.sha256,
        ).hexdigest()
        assert auth == "apiKey:api-key&randomKey:nonce&signature:" + digest
        return httpx.Response(
            200,
            json={
                "status": "success",
                "conversationId": request.url.params.get("conversationId"),
                "data": {},
            },
        )

    monkeypatch.setattr(
        "app.services.billing.provider.httpx.AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    provider = Iyzico()
    result = await provider.checkout("token", "conversation")
    await provider.subscriptions(2)
    assert result["conversationId"] == "conversation"
    assert calls[1].url.params["page"] == "2"


async def test_expired_checkout_is_refunded_without_access(db_session, paid, provider):
    uid, _, session, evidence = paid
    await execute(
        db_session,
        "UPDATE checkout_sessions SET expires_at=now()-interval '1 minute',status='expired' WHERE id=:id",
        id=session["id"],
    )
    await db_session.commit()
    await apply_subscription(db_session, uid, evidence, session["id"])
    assert (
        await one(
            db_session, "SELECT provider FROM subscriptions WHERE user_id=:uid", uid=uid
        )
    )["provider"] is None
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM provider_actions WHERE kind='refund_payment'",
        )
    )["n"] == 1
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM provider_actions WHERE kind='cancel_subscription'",
        )
    )["n"] == 1


async def test_unresolved_expired_checkout_blocks_account_delete(
    db_session, paid, provider
):
    uid, _, session, _ = paid
    await execute(
        db_session,
        "UPDATE checkout_sessions SET status='expired',initialization_started=true,provider_subscription_reference=NULL WHERE id=:id",
        id=session["id"],
    )
    await enqueue(db_session, uid, "delete_account", uid, "delete:unknown")
    await db_session.commit()
    action = await claim_action(db_session)
    storage = AsyncMock()
    admin = AsyncMock()
    admin.ensure_configured = lambda: None
    await run_action(db_session, action, provider, storage, admin)
    storage.delete_prefix.assert_not_called()
    admin.delete_user.assert_not_called()


async def test_chargeback_lost_appends_outcome(
    client, db_session, paid, grant_admin, tokens
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await grant_admin(uid)
    charge = await one(db_session, "SELECT id FROM billing_transactions")
    await db_session.commit()
    for state in ("disputed", "lost", "lost"):
        response = await client.post(
            "/api/admin/billing/" + str(charge["id"]) + "/chargeback",
            headers=tokens.headers(uid),
            json={"provider_reference": "bank-case", "status": state},
        )
        assert response.status_code == 200
    rows = await many(
        db_session, "SELECT status FROM billing_transactions WHERE type='chargeback'"
    )
    assert sorted(r["status"] for r in rows) == ["disputed", "lost"]


async def test_operator_can_resolve_uncertain_refund_once(
    client, db_session, paid, grant_admin, tokens, provider
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await grant_admin(uid)
    charge = await one(db_session, "SELECT * FROM billing_transactions")
    action = await enqueue(
        db_session, uid, "refund_payment", charge["id"], "refund:uncertain"
    )
    await execute(
        db_session,
        "UPDATE provider_actions SET status='uncertain',dispatched_at=now() WHERE id=:id",
        id=action["id"],
    )
    await db_session.commit()
    for expected in (200, 409):
        response = await client.post(
            "/api/admin/billing/actions/" + str(action["id"]) + "/resolve",
            headers=tokens.headers(uid),
            json={
                "outcome": "succeeded",
                "evidence_reference": "iyzico-support-case-123",
            },
        )
        assert response.status_code == expected
    provider.refund.assert_not_called()
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM billing_transactions WHERE type='refund'",
        )
    )["n"] == 1


async def test_admin_can_publish_new_free_version_without_changing_old_period(
    client, db_session, create_user, grant_admin, tokens
):
    uid = await create_user()
    await grant_admin(uid)
    old = await one(
        db_session,
        "SELECT id FROM plan_versions WHERE plan_id='deneme' AND retired_at IS NULL",
    )
    await db_session.commit()
    response = await client.post(
        "/api/admin/plans/deneme/versions",
        headers=tokens.headers(uid),
        json={"price_minor_units": 0, "monthly_quota": 20, "background_tier": "basic"},
    )
    assert response.status_code == 201
    assert (
        await one(
            db_session,
            "SELECT quota_snapshot FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["quota_snapshot"] == 10
    assert (
        await one(
            db_session,
            "SELECT monthly_quota FROM plan_versions WHERE id=:id",
            id=old["id"],
        )
    )["monthly_quota"] == 10


async def test_daily_reconciliation_detects_external_refund_without_mutation(
    db_session, paid, provider
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    provider.subscriptions.return_value = {"items": [], "pageCount": 1}
    provider.transactions.side_effect = [
        {
            "transactions": [
                {
                    "transactionType": "REFUND",
                    "transactionStatus": 1,
                    "transactionId": "external-refund",
                    "paymentId": 123,
                    "paidPrice": "99.00",
                    "transactionCurrency": "TRY",
                }
            ],
            "totalPageCount": 2,
        },
        {"transactions": [], "totalPageCount": 2},
        {"transactions": [], "totalPageCount": 0},
    ]
    await reconcile(db_session, provider)
    assert provider.transactions.await_count == 3
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM billing_alerts WHERE kind='reconciliation_movement'",
        )
    )["n"] == 1
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM billing_transactions WHERE type='refund'",
        )
    )["n"] == 0
    assert (
        await one(
            db_session, "SELECT status FROM subscriptions WHERE user_id=:uid", uid=uid
        )
    )["status"] == "active"


async def test_checkout_probe_rotates_past_old_abandoned_tokens(db_session, paid):
    from app.services.billing.maintenance import claim_checkouts

    uid, version, _, _ = paid
    for index in range(101):
        await execute(
            db_session,
            """INSERT INTO checkout_sessions(user_id,plan_version_id,idempotency_key,
            expected_amount_minor_units,currency,pricing_plan_reference,provider_checkout_token,status)
            VALUES(:uid,:vid,:key,9900,'TRY','paid-plan',:token,'expired')""",
            uid=uid,
            vid=version["id"],
            key=uuid.uuid4(),
            token=f"abandoned-{index}",
        )
    await db_session.commit()
    first = await claim_checkouts(db_session)
    second = await claim_checkouts(db_session)
    assert len(first) == 100
    assert len(second) == 2
    assert not {r["id"] for r in first} & {r["id"] for r in second}


async def test_delete_waiting_on_checkout_does_not_exhaust_retries(
    db_session, paid, provider
):
    uid, _, session, evidence = paid
    await enqueue(db_session, uid, "delete_account", uid, "delete:waiting")
    await db_session.commit()
    storage = AsyncMock()
    admin = AsyncMock()
    admin.ensure_configured = lambda: None
    for _ in range(12):
        action = await claim_action(db_session)
        await run_action(db_session, action, provider, storage, admin)
        await execute(
            db_session,
            "UPDATE provider_actions SET lease_until=NULL WHERE id=:id",
            id=action["id"],
        )
        await db_session.commit()
    row = await one(
        db_session, "SELECT * FROM provider_actions WHERE id=:id", id=action["id"]
    )
    assert row["status"] == "pending" and row["attempts"] == 0
    storage.delete_prefix.assert_not_awaited()
    await execute(
        db_session,
        "UPDATE checkout_sessions SET status='failed' WHERE id=:id",
        id=session["id"],
    )
    await db_session.commit()
    await run_action(
        db_session, await claim_action(db_session), provider, storage, admin
    )
    admin.delete_user.assert_awaited_once_with(uid)
