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
    RESULT_RETENTION,
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
    finish_refund,
    delete_account_action,
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


async def backdate_period(db, uid, starts, ends, used=None):
    """Aktif dönemi verilen aralığa taşır (zamanın geçmesini taklit eder).

    `period_snapshot` trigger'ı dönem snapshot'ını (plan sürümü, provider
    referansları, tarihler, kota) değişmez tutuyor ve uygulama kodu bu alanları
    HİÇ güncellemiyor. Testin zamanı geriye alması kuralın istisnası değil, o
    yüzden koruma yalnızca bu tek yardımcıda ve yalnızca işlem süresince
    kapatılıyor — üretim yolunda yürürlükte kalıyor.
    """
    await execute(
        db, "ALTER TABLE subscription_periods DISABLE TRIGGER period_snapshot"
    )
    await execute(
        db,
        """UPDATE subscription_periods SET starts_at=now()+CAST(:starts AS interval),
        ends_at=now()+CAST(:ends AS interval),
        used_this_period=COALESCE(CAST(:used AS integer),used_this_period)
        WHERE user_id=:uid AND status='active'""",
        uid=uid,
        starts=starts,
        ends=ends,
        used=used,
    )
    await execute(
        db, "ALTER TABLE subscription_periods ENABLE TRIGGER period_snapshot"
    )
    await db.commit()


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
                return (await reserve(db, uid, uuid.uuid4(), provider)).id
            except HTTPException as exc:
                return exc.status_code

    results = await asyncio.gather(run(), run())
    assert sum(isinstance(r, uuid.UUID) for r in results) == 1
    assert 402 in results


async def test_same_request_id_returns_the_stored_result_not_a_new_credit(
    db_session, create_user, provider
):
    """Başarılı ama yanıtı kaybolmuş iş, aynı anahtarla geri alınabilir.

    Eski davranış görülmüş her anahtarı sonucundan bağımsız reddediyordu:
    başarılı PNG yanıtı ağda kaybolursa kredi harcanmış oluyor, aynı anahtarla
    tekrar deneme `request_already_processed` dönüyor ve sonuç kurtarılamıyordu.
    Yeni sözleşme: sonuç geçici bir R2 nesnesinde saklanır, aynı anahtar
    inference'ı HİÇ çalıştırmadan o nesneyi işaret eder, kredi anahtar başına
    yalnızca bir kez tüketilir.
    """
    uid = await create_user()
    key = uuid.uuid4()
    first = await reserve(db_session, uid, key, provider)
    assert first.id and first.result_key is None
    assert await resolve_reservation(
        db_session, first.id, True, result_key=f"results/{uid}/{key}.png"
    )
    for _ in range(3):
        again = await reserve(db_session, uid, key, provider)
        assert again.id is None
        assert again.result_key == f"results/{uid}/{key}.png"
    assert (await one(db_session, "SELECT count(*) AS n FROM usage_events"))["n"] == 1
    assert (
        await one(
            db_session,
            "SELECT used_this_period AS n FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["n"] == 1


async def test_expired_stored_result_is_not_a_safe_retry(
    db_session, create_user, provider
):
    """Saklama süresi dolduysa aynı anahtar 'güvenli tekrar' DEĞİLDİR.

    `retry_safe` verilseydi istemci yeni anahtara geçer ve ikinci krediyi
    yakardı; kullanıcının bunu bilerek başlatması gerekiyor.
    """
    uid = await create_user()
    key = uuid.uuid4()
    first = await reserve(db_session, uid, key, provider)
    await resolve_reservation(db_session, first.id, True, result_key="results/x.png")
    await execute(
        db_session,
        "UPDATE usage_reservations SET result_expires_at=now()-interval '1 second'",
    )
    await db_session.commit()
    with pytest.raises(HTTPException) as exc:
        await reserve(db_session, uid, key, provider)
    assert exc.value.detail["code"] == "request_already_processed"
    assert "retry_safe" not in exc.value.detail


async def test_stored_result_lives_at_least_twentyfour_hours(
    db_session, create_user, provider
):
    uid = await create_user()
    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    await resolve_reservation(
        db_session, reservation.id, True, result_key="results/x.png"
    )
    row = await one(db_session, "SELECT * FROM usage_reservations")
    assert row["result_expires_at"] - datetime.now(timezone.utc) > timedelta(
        hours=23, minutes=59
    )
    assert RESULT_RETENTION == "24 hours"


async def test_released_reservation_keeps_no_result(
    db_session, create_user, provider
):
    uid = await create_user()
    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    await resolve_reservation(db_session, reservation.id, False)
    row = await one(db_session, "SELECT * FROM usage_reservations")
    assert row["result_r2_key"] is None and row["result_expires_at"] is None


async def test_expiry_and_success_race_never_double_refunds(
    db_session, create_user, provider, factory
):
    uid = await create_user()
    rid = (await reserve(db_session, uid, uuid.uuid4(), provider)).id

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
    rid = (await reserve(db_session, uid, uuid.uuid4(), provider)).id
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
    await backdate_period(db_session, uid, timedelta(days=-90), timedelta(days=-60), used=10)
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
    await backdate_period(db_session, uid, timedelta(days=-31), timedelta(days=-1))
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
    await backdate_period(db_session, uid, timedelta(days=-31), timedelta(days=-1))
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
    assert (await reserve(db_session, uid, uuid.uuid4(), provider)).id


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
        "resend_api_key": "resend-key",
        "billing_email_from": "Vitrin <bildirim@vitrin.test>",
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


# --- İnceleme bulguları: iade kapsamı, kayıt koruması, grace ve hız sınırı ---


async def _charge_of(db, uid):
    return await one(
        db,
        "SELECT * FROM billing_transactions WHERE user_id=:uid AND type='charge'",
        uid=uid,
    )


async def test_old_subscription_refund_does_not_close_current_plan(db_session, paid):
    """A paketinin eski tahsilatının iadesi, kullanıcının B paketini kapatamaz."""
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    charge = await _charge_of(db_session, uid)
    # Kullanıcı bu arada başka bir aboneliğe geçti.
    await execute(
        db_session,
        "UPDATE subscriptions SET provider_subscription_reference='subscription-2' WHERE user_id=:uid",
        uid=uid,
    )
    await db_session.commit()

    await finish_refund(db_session, charge, uuid.uuid4())
    await db_session.commit()

    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["status"] != "suspended"
    actions = await many(
        db_session, "SELECT * FROM provider_actions WHERE kind='cancel_subscription'"
    )
    # İptal eski aboneliğe gider, güncel olana değil.
    assert [a["target_reference"] for a in actions] == ["subscription"]
    period = await one(
        db_session,
        "SELECT status FROM subscription_periods WHERE provider_subscription_reference='subscription'",
    )
    assert period["status"] == "suspended"
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM billing_alerts WHERE kind='refund_old_subscription'",
        )
    )["n"] == 1


async def test_current_subscription_refund_still_suspends_account(db_session, paid):
    """Güncel aboneliğin iadesinde hesap düzeyinde askıya alma korunuyor."""
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    charge = await _charge_of(db_session, uid)
    await finish_refund(db_session, charge, uuid.uuid4())
    await db_session.commit()
    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["status"] == "suspended"
    action = await one(
        db_session, "SELECT * FROM provider_actions WHERE kind='cancel_subscription'"
    )
    assert action["target_reference"] == "subscription"


async def test_old_charge_chargeback_does_not_suspend_account(
    client, db_session, paid, grant_admin, tokens, provider
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    charge = await _charge_of(db_session, uid)
    await execute(
        db_session,
        "UPDATE subscriptions SET provider_subscription_reference='subscription-2' WHERE user_id=:uid",
        uid=uid,
    )
    admin_id = await create_admin(db_session, grant_admin)
    await db_session.commit()

    response = await client.post(
        f"/api/admin/billing/{charge['id']}/chargeback",
        json={"provider_reference": "dispute-1", "status": "lost"},
        headers=tokens.headers(admin_id),
    )
    assert response.status_code == 200
    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["status"] != "suspended"
    action = await one(
        db_session, "SELECT * FROM provider_actions WHERE kind='suspend_entitlement'"
    )
    assert action["payload"]["provider_subscription_reference"] == "subscription"
    # Kuyruktaki iş de aynı kapsamda çalışır.
    await execute(db_session, "UPDATE provider_actions SET status='running'")
    await db_session.commit()
    await run_action(db_session, dict(action) | {"status": "running"}, provider)
    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["status"] != "suspended"


async def create_admin(db, grant_admin):
    import uuid as _uuid

    admin_id = _uuid.uuid4()
    await execute(
        db,
        "insert into auth.users (id, email) values (:id, :email)",
        id=admin_id,
        email=f"{admin_id}@test.example",
    )
    await db.commit()
    await grant_admin(admin_id)
    return admin_id


async def test_uncertain_checkout_blocks_direct_account_deletion(
    db_session, create_user
):
    """Worker'daki belirsiz initialization koşulu DB trigger'ında da var.

    Oturum `expired`a düştükten sonra bile uzakta abonelik açılmış olabilir;
    yalnız `pending` bakan bir koruma panelden yapılan silmede o aboneliği
    yetim bırakırdı.
    """
    from sqlalchemy.exc import DBAPIError

    uid = await create_user()
    version = await one(
        db_session, "SELECT id FROM plan_versions WHERE plan_id='deneme'"
    )
    await execute(
        db_session,
        """INSERT INTO checkout_sessions(user_id,plan_version_id,idempotency_key,expected_amount_minor_units,
        currency,pricing_plan_reference,status,initialization_started)
        VALUES(:uid,:vid,:key,9900,'TRY','paid-plan','expired',true)""",
        uid=uid,
        vid=version["id"],
        key=uuid.uuid4(),
    )
    await db_session.commit()
    with pytest.raises(DBAPIError):
        await execute(db_session, "DELETE FROM auth.users WHERE id=:uid", uid=uid)
    await db_session.rollback()
    # Sonucu kesin olarak başarısız olan oturum silmeyi engellemez.
    await execute(db_session, "UPDATE checkout_sessions SET status='failed'")
    await db_session.commit()
    await execute(db_session, "DELETE FROM auth.users WHERE id=:uid", uid=uid)
    await db_session.commit()


async def test_period_snapshot_is_immutable_except_lifecycle_fields(
    db_session, create_user, paid
):
    from sqlalchemy.exc import DBAPIError

    uid, version, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    period = await one(
        db_session,
        "SELECT * FROM subscription_periods WHERE user_id=:uid AND status='active'",
        uid=uid,
    )
    for column, value in (
        ("starts_at", "now()"),
        ("ends_at", "now()+interval '99 days'"),
        ("quota_snapshot", "999"),
        ("provider_subscription_reference", "'other'"),
        ("provider_order_reference", "'other-order'"),
    ):
        with pytest.raises(DBAPIError):
            await execute(
                db_session,
                f"UPDATE subscription_periods SET {column}={value} WHERE id=:id",
                id=period["id"],
            )
        await db_session.rollback()
    with pytest.raises(DBAPIError):
        await execute(
            db_session,
            "UPDATE subscription_periods SET plan_version_id=:vid WHERE id=:id",
            vid=(
                await one(
                    db_session, "SELECT id FROM plan_versions WHERE plan_id='deneme'"
                )
            )["id"],
            id=period["id"],
        )
    await db_session.rollback()
    # Yaşam döngüsü alanları serbest.
    await execute(
        db_session,
        "UPDATE subscription_periods SET used_this_period=1,status='expired',closed_at=now() WHERE id=:id",
        id=period["id"],
    )
    await db_session.commit()


async def test_period_identity_detaches_on_account_deletion(db_session, create_user):
    uid = await create_user()
    await execute(db_session, "DELETE FROM auth.users WHERE id=:uid", uid=uid)
    await db_session.commit()
    period = await one(db_session, "SELECT * FROM subscription_periods")
    assert period["user_id"] is None and period["quota_snapshot"] == 10


async def install_backgrounds(db):
    """İki zemin (basic + full) ve imzalı URL üreten sahte depolama."""
    from app.models.background import Background
    from app.services.storage import get_storage_service
    from unittest.mock import Mock

    db.add_all(
        [
            Background(r2_key="basic", tier="basic"),
            Background(r2_key="full", tier="full"),
        ]
    )
    await db.commit()
    storage = Mock()
    storage.generate_presigned_url = lambda key: "https://storage.test/" + key
    app.dependency_overrides[get_storage_service] = lambda: storage


@pytest.mark.parametrize("status", ["suspended", "expired", "canceled"])
async def test_background_list_never_empties_on_billing_state(
    client, db_session, paid, tokens, status
):
    """Zemin listesi kota/ödeme kapısı değil: `basic` her durumda döner.

    Eskiden `background_tier()` 403/409 fırlatıyor, vekil bunu boş listeye
    çeviriyor ve editör sessizce gradyan yer tutucuya düşüyordu.
    """
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await install_backgrounds(db_session)

    # Önce doğrulama: ödeyen kullanıcı gerçekten full zeminleri görüyor.
    response = await client.get("/api/backgrounds", headers=tokens.headers(uid))
    assert {r["id"] for r in response.json()} and [
        r["url"] for r in response.json()
    ] == ["https://storage.test/basic", "https://storage.test/full"]

    await execute(
        db_session,
        "UPDATE subscriptions SET status=:status WHERE user_id=:uid",
        status=status,
        uid=uid,
    )
    await db_session.commit()
    # `canceled`/`expired` durumunda erişim satın alınmış dönem sonuna kadar
    # sürüyor; kapanmış erişimi sınamak için dönem de bitirilir.
    await backdate_period(db_session, uid, timedelta(days=-31), timedelta(days=-1))
    response = await client.get("/api/backgrounds", headers=tokens.headers(uid))
    assert response.status_code == 200
    urls = [r["url"] for r in response.json()]
    assert urls == ["https://storage.test/basic"]


async def test_background_list_survives_renewal_pending(
    client, db_session, paid, tokens, provider
):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await install_backgrounds(db_session)
    await backdate_period(db_session, uid, timedelta(days=-31), timedelta(days=-1))
    provider.subscription.side_effect = ProviderUnavailable()
    response = await client.get("/api/backgrounds", headers=tokens.headers(uid))
    assert response.status_code == 200
    assert [r["url"] for r in response.json()] == ["https://storage.test/basic"]


async def test_background_list_rejects_invalid_token(client, db_session, paid, tokens):
    """Kimlik hatası gerçek hatadır; kota kararı gibi `basic`e düşmez."""
    await install_backgrounds(db_session)
    response = await client.get(
        "/api/backgrounds", headers={"Authorization": "Bearer not-a-token"}
    )
    assert response.status_code == 401


async def test_public_billing_surfaces_are_rate_limited(
    client, db_session, create_user, tokens, monkeypatch
):
    """Callback ve zemin listesi hız sınırı olmadan açık bırakılmıştı."""
    from unittest.mock import AsyncMock
    from app.services.billing import limits

    await install_backgrounds(db_session)
    uid = await create_user()
    keys = []

    async def retry_after(key):
        keys.append(key)
        return 5

    monkeypatch.setattr(limits.public_limiter, "retry_after", AsyncMock(side_effect=retry_after))
    assert (await client.post("/api/subscriptions/callback", data={"token": "t"})).status_code == 429
    assert (
        await client.get("/api/backgrounds", headers=tokens.headers(uid))
    ).status_code == 429
    assert (await client.get("/api/backgrounds")).status_code == 429
    # Oturumlu istek kullanıcıya, anonim istek IP'ye bağlı kovaya düşer;
    # aksi hâlde vekil arkasındaki bütün kullanıcılar tek bütçeyi paylaşırdı.
    assert keys[1] == f"billing:backgrounds:user:{uid}"
    assert keys[2].startswith("billing:backgrounds:ip:")


def make_request(peer, forwarded=None):
    from starlette.requests import Request

    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request(
        {"type": "http", "headers": headers, "client": (peer, 1234), "method": "GET"}
    )


def test_client_ip_ignores_forged_forwarded_header(monkeypatch):
    from app.services.billing.limits import client_ip

    monkeypatch.setattr(settings, "trusted_proxy_ips", "")
    # Güvenilen proxy tanımlı değilken başlık hiç okunmaz.
    assert client_ip(make_request("203.0.113.9", "1.1.1.1")) == "203.0.113.9"
    monkeypatch.setattr(settings, "trusted_proxy_ips", "10.0.0.1")
    # Bağlantı güvenilen proxy'den gelmiyorsa da okunmaz.
    assert client_ip(make_request("203.0.113.9", "1.1.1.1")) == "203.0.113.9"


def test_client_ip_separates_real_clients_behind_trusted_proxy(monkeypatch):
    from app.services.billing.limits import client_ip

    monkeypatch.setattr(settings, "trusted_proxy_ips", "10.0.0.1, 10.0.0.2")
    first = client_ip(make_request("10.0.0.1", "198.51.100.7, 10.0.0.2"))
    second = client_ip(make_request("10.0.0.1", "198.51.100.8, 10.0.0.2"))
    assert first == "198.51.100.7" and second == "198.51.100.8"
    # Başlık yoksa proxy'nin kendi adresine düşer, uydurma bir değer üretmez.
    assert client_ip(make_request("10.0.0.1")) == "10.0.0.1"


async def fail_renewal(db, provider, evidence, event_id):
    """Sağlayıcıdan başarısız tahsilat bildirimi işler."""
    import json as _json

    detail = _json.loads(_json.dumps(evidence))
    detail["orders"][0]["orderStatus"] = "FAILED"
    provider.subscription.return_value = detail
    await execute(
        db,
        """INSERT INTO webhook_events(provider_event_id,event_type,payload)
        VALUES(:id,'subscription.order.failure',CAST(:body AS jsonb))""",
        id=event_id,
        body=_json.dumps(
            {
                "subscriptionReferenceCode": "subscription",
                "customerReferenceCode": "customer",
                "orderReferenceCode": "order-1",
            }
        ),
    )
    await db.commit()
    await process_webhook(db, provider)


async def expire_period(db, uid):
    await backdate_period(db, uid, timedelta(days=-31), timedelta(days=-1))
    await execute(
        db,
        "UPDATE subscriptions SET access_until=now()-interval '1 day' WHERE user_id=:uid",
        uid=uid,
    )
    await db.commit()


async def test_past_due_keeps_access_for_three_days_without_new_quota(
    db_session, paid, provider
):
    """Ödeme alınamadığında erişim anında kesilmiyor (ürün kararı).

    Kullanıcı kartını güncelleyene kadar 3 gün boyunca MEVCUT dönemin kalan
    kotasıyla çalışmaya devam eder; yeni kredi verilmez, dönem yenilenmez.
    """
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    period_before = await one(
        db_session,
        "SELECT * FROM subscription_periods WHERE user_id=:uid AND status='active'",
        uid=uid,
    )
    await expire_period(db_session, uid)
    await fail_renewal(db_session, provider, evidence, "evt-1")

    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["status"] == "past_due"
    grace = sub["past_due_access_until"] - datetime.now(timezone.utc)
    assert timedelta(days=2, hours=23) < grace <= timedelta(days=3)

    # Grace içinde kullanım sürüyor ve aynı dönemden düşüyor.
    periods_before = (
        await one(
            db_session,
            "SELECT count(*) AS n FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["n"]
    provider.subscription.side_effect = ProviderUnavailable()
    assert (await reserve(db_session, uid, uuid.uuid4(), provider)).id
    period_after = await one(
        db_session,
        "SELECT * FROM subscription_periods WHERE user_id=:uid AND status='active'",
        uid=uid,
    )
    assert period_after["id"] == period_before["id"]
    assert period_after["used_this_period"] == 1
    assert period_after["quota_snapshot"] == period_before["quota_snapshot"]
    # Grace yeni dönem AÇMAZ: kalan kotayla devam edilir, yeni kredi verilmez.
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["n"] == periods_before


async def test_past_due_grace_expiry_closes_access(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await expire_period(db_session, uid)
    await fail_renewal(db_session, provider, evidence, "evt-1")
    await execute(
        db_session,
        "UPDATE subscriptions SET past_due_access_until=now()-interval '1 second' WHERE user_id=:uid",
        uid=uid,
    )
    await db_session.commit()
    provider.subscription.side_effect = ProviderUnavailable()
    with pytest.raises(HTTPException) as exc:
        await ensure_period(db_session, uid, provider)
    assert exc.value.detail["code"] == "subscription_expired"
    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["status"] == "expired"
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM subscription_periods WHERE user_id=:uid AND status='active'",
            uid=uid,
        )
    )["n"] == 0


async def test_past_due_emails_the_customer_exactly_once(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await expire_period(db_session, uid)
    await fail_renewal(db_session, provider, evidence, "evt-1")
    await fail_renewal(db_session, provider, evidence, "evt-2")
    actions = await many(
        db_session, "SELECT * FROM provider_actions WHERE kind='dunning_email'"
    )
    assert len(actions) == 1 and actions[0]["user_id"] == uid


async def test_successful_payment_clears_the_grace_window(db_session, paid, provider):
    uid, _, session, evidence = paid
    await apply_subscription(db_session, uid, evidence, session["id"])
    await expire_period(db_session, uid)
    await fail_renewal(db_session, provider, evidence, "evt-1")
    evidence["orders"][0]["referenceCode"] = "renewal-2"
    evidence["orders"][0]["paymentAttempts"][0]["paymentId"] = 456
    await apply_subscription(db_session, uid, evidence)
    sub = await one(
        db_session, "SELECT * FROM subscriptions WHERE user_id=:uid", uid=uid
    )
    assert sub["status"] == "active" and sub["past_due_access_until"] is None


async def test_dunning_email_goes_out_and_alerts_when_unconfigured(
    db_session, create_user, provider
):
    from unittest.mock import AsyncMock, Mock
    from app.services.email import EmailNotConfigured, PAST_DUE_SUBJECT

    uid = await create_user()
    action = await enqueue(
        db_session, uid, "dunning_email", "subscription", "dunning:" + str(uid)
    )
    await db_session.commit()
    admin = Mock()
    admin.get_user_email = AsyncMock(return_value="musteri@test.example")

    mailer = Mock()
    mailer.ensure_configured = Mock(side_effect=EmailNotConfigured("yok"))
    mailer.send = AsyncMock()
    await execute(
        db_session,
        "UPDATE provider_actions SET status='running',attempts=1 WHERE id=:id",
        id=action["id"],
    )
    await db_session.commit()
    await run_action(
        db_session, dict(action) | {"status": "running"}, provider, None, admin, mailer
    )
    mailer.send.assert_not_awaited()
    assert (
        await one(
            db_session,
            "SELECT count(*) AS n FROM billing_alerts WHERE kind='dunning_email_not_sent'",
        )
    )["n"] == 1
    failed = await one(
        db_session, "SELECT status FROM provider_actions WHERE id=:id", id=action["id"]
    )
    assert failed["status"] == "failed"

    mailer.ensure_configured = Mock(return_value=None)
    await execute(
        db_session,
        "UPDATE provider_actions SET status='running',lease_until=NULL WHERE id=:id",
        id=action["id"],
    )
    await db_session.commit()
    await run_action(
        db_session, dict(action) | {"status": "running"}, provider, None, admin, mailer
    )
    mailer.send.assert_awaited_once()
    assert mailer.send.await_args.args[0] == "musteri@test.example"
    assert mailer.send.await_args.args[1] == PAST_DUE_SUBJECT
    # Sağlayıcıya kalıcı eylem kimliği idempotency anahtarı olarak gider:
    # timeout sonrası yeniden deneme kullanıcıya ikinci e-postayı göndermez.
    assert mailer.send.await_args.kwargs["idempotency_key"] == str(action["id"])


async def test_account_deletion_cleanup_resumes_after_crash(
    db_session, create_user, provider
):
    """Auth silindikten sonra çöken silme işi, PII temizliğini yine tamamlar.

    FK `provider_actions.user_id`'yi NULL yapıyor; eylem bu noktada erken
    dönerse checkout formu, token ve müşteri referansı kalıcı olarak temizsiz
    kalırdı.
    """
    from unittest.mock import AsyncMock, Mock

    uid = await create_user()
    version = await one(
        db_session, "SELECT id FROM plan_versions WHERE plan_id='deneme'"
    )
    await execute(
        db_session,
        """INSERT INTO checkout_sessions(user_id,plan_version_id,idempotency_key,expected_amount_minor_units,
        currency,pricing_plan_reference,provider_checkout_token,checkout_form_content,customer_reference_code,
        provider_subscription_reference,status,initialization_started)
        VALUES(:uid,:vid,:key,9900,'TRY','paid-plan','token','<form>','customer','subscription','completed',true)""",
        uid=uid,
        vid=version["id"],
        key=uuid.uuid4(),
    )
    action = await enqueue(
        db_session, uid, "delete_account", uid, "delete:" + str(uid)
    )
    await execute(
        db_session,
        "UPDATE subscriptions SET status='canceled' WHERE user_id=:uid",
        uid=uid,
    )
    await db_session.commit()
    # Auth kullanıcısı silindi, süreç temizlikten önce öldü.
    await execute(db_session, "DELETE FROM auth.users WHERE id=:uid", uid=uid)
    await db_session.commit()
    resumed = await claim_action(db_session)
    assert resumed["id"] == action["id"] and resumed["user_id"] is None

    storage = Mock()
    storage.delete_prefix = AsyncMock()
    admin = Mock()
    await run_action(db_session, resumed, provider, storage, admin)
    assert [call.args[0] for call in storage.delete_prefix.await_args_list] == [
        f"projects/{uid}/",
        f"results/{uid}/",
    ]
    session = await one(db_session, "SELECT * FROM checkout_sessions")
    assert session["checkout_form_content"] is None
    assert session["provider_checkout_token"] is None
    assert session["customer_reference_code"] is None
    assert (
        await one(
            db_session, "SELECT status FROM provider_actions WHERE id=:id", id=action["id"]
        )
    )["status"] == "succeeded"


async def test_free_plan_must_keep_a_published_version(db_session, create_user):
    from sqlalchemy.exc import DBAPIError

    # `billing_signup()` yayımlanmış ücretsiz sürümü zorunlu bekliyor; tek
    # sürümün emekliye ayrılması bütün yeni kayıtları kırardı.
    with pytest.raises(DBAPIError):
        await execute(
            db_session,
            "UPDATE plan_versions SET retired_at=now() WHERE plan_id='deneme'",
        )
        await db_session.commit()
    await db_session.rollback()
    with pytest.raises(DBAPIError):
        await execute(
            db_session, "DELETE FROM plan_versions WHERE plan_id='deneme'"
        )
        await db_session.commit()
    await db_session.rollback()
    # Yeni sürüm yayımlamak (önce emekliye ayır, sonra ekle) serbest.
    await execute(
        db_session,
        "UPDATE plan_versions SET retired_at=now() WHERE plan_id='deneme' AND retired_at IS NULL",
    )
    await execute(
        db_session,
        """INSERT INTO plan_versions(plan_id,version,price_minor_units,currency,monthly_quota,background_tier,published_at)
        VALUES('deneme',2,0,'TRY',20,'basic',now())""",
    )
    await db_session.commit()
    uid = await create_user()
    assert (
        await one(
            db_session,
            "SELECT quota_snapshot FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["quota_snapshot"] == 20


async def test_free_plan_publish_does_not_break_concurrent_signup(db_session, factory):
    """Yayın işlemi commit edilene kadar kayıt eski sürümü görmeye devam eder."""
    async with factory() as publisher:
        await execute(
            publisher,
            "UPDATE plan_versions SET retired_at=now() WHERE plan_id='deneme' AND retired_at IS NULL",
        )
        await execute(
            publisher,
            """INSERT INTO plan_versions(plan_id,version,price_minor_units,currency,monthly_quota,background_tier,published_at)
            VALUES('deneme',2,0,'TRY',30,'basic',now())""",
        )
        async with factory() as signup:
            during = uuid.uuid4()
            await execute(
                signup,
                "insert into auth.users (id, email) values (:id, :email)",
                id=during,
                email=f"{during}@test.example",
            )
            await signup.commit()
        await publisher.commit()
    assert (
        await one(
            db_session,
            "SELECT quota_snapshot FROM subscription_periods WHERE user_id=:uid",
            uid=during,
        )
    )["quota_snapshot"] == 10
    after = uuid.uuid4()
    await execute(
        db_session,
        "insert into auth.users (id, email) values (:id, :email)",
        id=after,
        email=f"{after}@test.example",
    )
    await db_session.commit()
    assert (
        await one(
            db_session,
            "SELECT quota_snapshot FROM subscription_periods WHERE user_id=:uid",
            uid=after,
        )
    )["quota_snapshot"] == 30


async def open_checkout(db, uid, version_id, token="token", trial="reserved"):
    row = await one(
        db,
        """INSERT INTO checkout_sessions(user_id,plan_version_id,idempotency_key,expected_amount_minor_units,
        currency,pricing_plan_reference,provider_checkout_token,checkout_form_content,trial_status,initialization_started)
        VALUES(:uid,:vid,:key,9900,'TRY','paid-plan',:token,'<form>',:trial,true) RETURNING *""",
        uid=uid,
        vid=version_id,
        key=uuid.uuid4(),
        token=token,
        trial=trial,
    )
    await db.commit()
    return row


async def test_pending_checkout_can_be_cancelled_when_provider_says_unpaid(
    client, db_session, paid, tokens, provider
):
    """Kullanıcı devam eden ödemeyi bırakıp başka plan seçebilmeli (madde 7)."""
    uid, version, old, _ = paid
    await execute(db_session, "DELETE FROM checkout_sessions WHERE id=:id", id=old["id"])
    session = await open_checkout(db_session, uid, version["id"])
    # GERÇEK sağlayıcı yanıtı taklit ediliyor, hata tipi uydurulmuyor: istek
    # başarılı döndü, conversationId bizim oturumumuz, ama forma bağlı bir
    # abonelik referansı yok. `CheckoutAbsent`i üretim kodu bu gövdeden
    # türetmeli — mock'a doğrudan istisna fırlattırmak, sağlayıcının hiç
    # üretemeyeceği bir tipi test etmek olurdu (kök CLAUDE.md ders 15).
    provider.checkout.return_value = {
        "status": "success",
        "conversationId": str(session["conversation_reference"]),
        "data": {"pricingPlanReferenceCode": "paid-plan"},
    }
    response = await client.post(
        f"/api/subscriptions/checkout/{session['id']}/cancel",
        headers=tokens.headers(uid),
    )
    assert response.status_code == 200 and response.json()["status"] == "failed"
    row = await one(db_session, "SELECT * FROM checkout_sessions WHERE id=:id", id=session["id"])
    assert row["trial_status"] == "released" and row["checkout_form_content"] is None


async def test_pending_checkout_cancel_keeps_session_on_evidence_mismatch(
    client, db_session, paid, tokens, provider
):
    """Uyuşmayan kanıt, uzakta abonelik olmadığını kanıtlamaz."""
    uid, version, old, _ = paid
    await execute(db_session, "DELETE FROM checkout_sessions WHERE id=:id", id=old["id"])
    session = await open_checkout(db_session, uid, version["id"])
    # Abonelik referansı VAR ama plan referansı tutmuyor: uzakta bir abonelik
    # oluşmuş olabilir, dolayısıyla bu "oluşmadı" kanıtı değildir.
    provider.checkout.return_value = {
        "status": "success",
        "conversationId": str(session["conversation_reference"]),
        "data": {
            "referenceCode": "uzak-abonelik",
            "customerReferenceCode": "customer",
            "pricingPlanReferenceCode": "baska-plan",
        },
    }
    response = await client.post(
        f"/api/subscriptions/checkout/{session['id']}/cancel",
        headers=tokens.headers(uid),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "checkout_verification_uncertain"
    row = await one(
        db_session, "SELECT status FROM checkout_sessions WHERE id=:id", id=session["id"]
    )
    assert row["status"] == "pending"
    review = await one(
        db_session,
        "SELECT id FROM billing_alerts WHERE kind='checkout_cancellation_review' AND reference=:ref",
        ref=str(session["id"]),
    )
    assert review


async def test_pending_checkout_cancel_is_fail_closed(
    client, db_session, paid, tokens, provider
):
    """Sağlayıcı cevap veremiyorsa oturum KAPATILMAZ.

    Uzakta gerçekten açılmış bir aboneliğin üstünü örtmek, kullanıcının iki
    abonelik ödemesi demek olurdu.
    """
    uid, version, old, _ = paid
    await execute(db_session, "DELETE FROM checkout_sessions WHERE id=:id", id=old["id"])
    session = await open_checkout(db_session, uid, version["id"])
    provider.checkout.side_effect = ProviderUnavailable("provider_unavailable")
    response = await client.post(
        f"/api/subscriptions/checkout/{session['id']}/cancel",
        headers=tokens.headers(uid),
    )
    assert response.status_code == 503
    row = await one(db_session, "SELECT status FROM checkout_sessions WHERE id=:id", id=session["id"])
    assert row["status"] == "pending"


async def test_uncertain_initialization_checkout_cannot_be_cancelled(
    client, db_session, paid, tokens
):
    uid, version, old, _ = paid
    await execute(db_session, "DELETE FROM checkout_sessions WHERE id=:id", id=old["id"])
    session = await open_checkout(db_session, uid, version["id"], token=None)
    response = await client.post(
        f"/api/subscriptions/checkout/{session['id']}/cancel",
        headers=tokens.headers(uid),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "checkout_initialization_uncertain"


async def test_checkout_cancel_rejects_other_owners(
    client, db_session, paid, create_user, tokens
):
    uid, version, old, _ = paid
    await execute(db_session, "DELETE FROM checkout_sessions WHERE id=:id", id=old["id"])
    session = await open_checkout(db_session, uid, version["id"])
    stranger = await create_user()
    response = await client.post(
        f"/api/subscriptions/checkout/{session['id']}/cancel",
        headers=tokens.headers(stranger),
    )
    assert response.status_code == 404


async def test_pending_checkout_error_points_at_the_open_session(
    db_session, paid, provider, monkeypatch
):
    """`checkout_pending` yanıtı devam eden işlemin adresini taşımalı."""
    uid, version, old, _ = paid
    for key, value in {
        "billing_checkout_enabled": True,
        "billing_legal_approved": True,
        "billing_invoice_process_ready": True,
        "billing_sales_document_version": "v1",
        "billing_sales_document_text": "satış",
        "billing_pre_information_text": "ön bilgi",
        "billing_callback_url": "https://example.test/api/subscriptions/callback",
        "resend_api_key": "resend-key",
        "billing_email_from": "Vitrin <bildirim@vitrin.test>",
    }.items():
        monkeypatch.setattr(settings, key, value)
    provider.ensure_configured = lambda: None
    other = await one(
        db_session,
        """INSERT INTO plan_versions(plan_id,version,price_minor_units,currency,monthly_quota,background_tier,
        iyzico_product_reference_code,iyzico_pricing_plan_reference_code,published_at)
        VALUES('magaza',1,19900,'TRY',200,'full','product-2','paid-plan-2',now()) RETURNING *""",
    )
    await db_session.commit()
    request = CheckoutRequest(
        plan_id="magaza",
        expected_plan_version_id=other["id"],
        idempotency_key=uuid.uuid4(),
        consents=[
            {k: d[k] for k in ("document_type", "document_hash", "document_version")}
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
    with pytest.raises(HTTPException) as exc:
        await start_checkout(
            db_session,
            CurrentUser(id=uid, email="test@example.test", session_id=None),
            request,
            provider,
        )
    assert exc.value.detail["code"] == "idempotency_conflict"
    assert exc.value.detail["checkout_session_id"] == str(old["id"])
    assert exc.value.detail["checkout_url"] == f"/odeme/{old['id']}"


async def test_concurrent_requests_with_one_key_reserve_once(
    db_session, create_user, factory, provider
):
    """İki hızlı tıklama tek kredi harcar; ikincisi 'devam ediyor' der."""
    uid = await create_user()
    key = uuid.uuid4()

    async def run():
        async with factory() as db:
            try:
                return (await reserve(db, uid, key, provider)).id
            except HTTPException as exc:
                return exc.detail["code"]

    results = await asyncio.gather(run(), run())
    assert sum(isinstance(r, uuid.UUID) for r in results) == 1
    assert "request_in_progress" in results
    assert (
        await one(
            db_session,
            "SELECT used_this_period AS n FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["n"] == 1


async def test_released_key_can_be_retried_after_definite_failure(
    db_session, create_user, provider
):
    """Kesin başarısızlıkta kredi iade edilir; aynı anahtar yeniden denenebilir."""
    uid = await create_user()
    key = uuid.uuid4()
    first = (await reserve(db_session, uid, key, provider)).id
    assert await resolve_reservation(db_session, first, False)
    second = (await reserve(db_session, uid, key, provider)).id
    assert second == first
    assert await resolve_reservation(db_session, second, True, result_key="results/x.png")
    assert (
        await one(
            db_session,
            "SELECT used_this_period AS n FROM subscription_periods WHERE user_id=:uid",
            uid=uid,
        )
    )["n"] == 1
    assert (await one(db_session, "SELECT count(*) AS n FROM usage_events"))["n"] == 1


async def test_past_due_email_goes_to_resend_with_the_configured_sender(monkeypatch):
    import httpx as _httpx
    from app.services.email import EmailService, EmailNotConfigured, EmailDeliveryError

    mailer = EmailService()
    # Anahtar yokken sessizce "gonderdim" demez.
    monkeypatch.setattr(settings, "resend_api_key", "")
    with pytest.raises(EmailNotConfigured):
        mailer.ensure_configured()

    monkeypatch.setattr(settings, "resend_api_key", "resend-key")
    monkeypatch.setattr(settings, "billing_email_from", "Vitrin <bildirim@vitrin.test>")
    monkeypatch.setattr(settings, "resend_base_url", "https://api.resend.test")
    original = _httpx.AsyncClient
    sent = []

    async def handle(request):
        sent.append(request)
        return _httpx.Response(200, json={"id": "email-1"})

    monkeypatch.setattr(
        "app.services.email.httpx.AsyncClient",
        lambda **kwargs: original(transport=_httpx.MockTransport(handle), **kwargs),
    )
    await mailer.send("musteri@test.example", "Konu", "Gövde")
    assert str(sent[0].url) == "https://api.resend.test/emails"
    assert sent[0].headers["Authorization"] == "Bearer resend-key"
    import json as _json

    body = _json.loads(sent[0].content)
    assert body["to"] == ["musteri@test.example"]
    assert body["from"] == "Vitrin <bildirim@vitrin.test>"

    async def reject(request):
        # Yanıt gövdesi alıcı adresini içerebilir; hata metnine konmamalı.
        return _httpx.Response(422, json={"message": "musteri@test.example geçersiz"})

    monkeypatch.setattr(
        "app.services.email.httpx.AsyncClient",
        lambda **kwargs: original(transport=_httpx.MockTransport(reject), **kwargs),
    )
    with pytest.raises(EmailDeliveryError) as exc:
        await mailer.send("musteri@test.example", "Konu", "Gövde")
    assert "musteri@test.example" not in str(exc.value)


async def test_resend_request_carries_the_action_idempotency_key(monkeypatch):
    """Timeout sonrası yeniden deneme çift e-posta göndermemeli."""
    import httpx as _httpx
    from app.services.email import EmailService

    monkeypatch.setattr(settings, "resend_api_key", "resend-key")
    monkeypatch.setattr(settings, "billing_email_from", "Vitrin <b@vitrin.test>")
    original = _httpx.AsyncClient
    sent = []

    async def handle(request):
        sent.append(request)
        return _httpx.Response(200, json={"id": "email-1"})

    monkeypatch.setattr(
        "app.services.email.httpx.AsyncClient",
        lambda **kwargs: original(transport=_httpx.MockTransport(handle), **kwargs),
    )
    action_id = str(uuid.uuid4())
    await EmailService().send("a@test.example", "K", "G", idempotency_key=action_id)
    assert sent[0].headers["Idempotency-Key"] == action_id


def test_checkout_stays_closed_without_dunning_email_configuration(monkeypatch):
    """Grace penceresi VAAT ediliyorsa uyarı e-postası da yapılandırılmış olmalı."""
    from app.services.billing.checkout import ensure_checkout_ready

    for key, value in {
        "billing_checkout_enabled": True,
        "billing_legal_approved": True,
        "billing_invoice_process_ready": True,
        "billing_sales_document_version": "v1",
        "billing_sales_document_text": "satış",
        "billing_pre_information_text": "ön bilgi",
        "billing_callback_url": "https://example.test/api/subscriptions/callback",
        "resend_api_key": "resend-key",
        "billing_email_from": "Vitrin <b@vitrin.test>",
    }.items():
        monkeypatch.setattr(settings, key, value)
    ensure_checkout_ready()
    for missing in ("resend_api_key", "billing_email_from"):
        monkeypatch.setattr(settings, missing, "")
        with pytest.raises(HTTPException) as exc:
            ensure_checkout_ready()
        assert exc.value.status_code == 503
        monkeypatch.setattr(
            settings,
            missing,
            "resend-key" if missing == "resend_api_key" else "Vitrin <b@vitrin.test>",
        )


async def test_expired_results_are_purged_from_storage(db_session, create_user, provider):
    from unittest.mock import AsyncMock, Mock
    from app.services.billing.maintenance import purge_expired_results

    uid = await create_user()
    fresh = await reserve(db_session, uid, uuid.uuid4(), provider)
    await resolve_reservation(db_session, fresh.id, True, result_key="results/fresh.png")
    stale = await reserve(db_session, uid, uuid.uuid4(), provider)
    await resolve_reservation(db_session, stale.id, True, result_key="results/stale.png")
    await execute(
        db_session,
        "UPDATE usage_reservations SET result_expires_at=now()-interval '1 second' WHERE id=:id",
        id=stale.id,
    )
    await db_session.commit()

    storage = Mock()
    storage.delete = AsyncMock()
    await purge_expired_results(db_session, storage)

    storage.delete.assert_awaited_once_with("results/stale.png")
    rows = {
        row["id"]: row["result_r2_key"]
        for row in await many(db_session, "SELECT id,result_r2_key FROM usage_reservations")
    }
    assert rows[stale.id] is None and rows[fresh.id] == "results/fresh.png"


async def test_purge_keeps_the_row_when_storage_delete_fails(
    db_session, create_user, provider
):
    """Silme başarısızsa kayıt kalır ve bir sonraki turda tekrar denenir."""
    from unittest.mock import AsyncMock, Mock
    from app.services.billing.maintenance import purge_expired_results

    uid = await create_user()
    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    await resolve_reservation(
        db_session, reservation.id, True, result_key="results/stale.png"
    )
    await execute(
        db_session,
        "UPDATE usage_reservations SET result_expires_at=now()-interval '1 second'",
    )
    await db_session.commit()

    storage = Mock()
    storage.delete = AsyncMock(side_effect=RuntimeError("R2 yok"))
    await purge_expired_results(db_session, storage)

    row = await one(db_session, "SELECT result_r2_key FROM usage_reservations")
    assert row["result_r2_key"] == "results/stale.png"
