"""Bonus kredilerin kota motoruyla ilişkisi (Faz 6, migration 0007).

Bu dosya uç noktaları değil, KREDİNİN KENDİSİNİ sınıyor: hangi durumda
tüketiliyor, başarısız işte hangi kovaya iade ediliyor ve hangi durumda hiç
devreye girmiyor.
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.exc import DBAPIError

from app.services.billing.db import execute, one
from app.services.billing.entitlements import (
    available_credit_grants,
    reserve,
    resolve_reservation,
)
from app.services.billing.errors import billing_error  # noqa: F401 - okunabilirlik
from app.services.billing.provider import Iyzico
from tests.test_billing import backdate_period


@pytest.fixture
def provider():
    return AsyncMock(spec=Iyzico)


async def add_grant(db, uid, amount=3, **columns):
    row = await one(
        db,
        """INSERT INTO credit_grants(user_id,amount,reason,idempotency_key,expires_at,revoked_at)
        VALUES(:uid,:amount,'test kredisi',:key,:expires,:revoked) RETURNING *""",
        uid=uid,
        amount=amount,
        key=str(uuid.uuid4()),
        expires=columns.get("expires_at"),
        revoked=columns.get("revoked_at"),
    )
    await db.commit()
    return row


async def exhaust_quota(db, uid):
    """Dönemi açık bırakıp kotayı doldurur."""
    await backdate_period(db, uid, timedelta(days=-1), timedelta(days=29), used=10)


async def test_grant_is_used_only_after_the_period_quota_is_exhausted(
    db_session, create_user, provider
):
    uid = await create_user()
    await add_grant(db_session, uid, amount=2)

    # Kota doluyken DEĞİL: normal kredi varken dönem sayacı harcanır, bonus durur.
    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    row = await one(
        db_session, "SELECT grant_id FROM usage_reservations WHERE id=:id", id=reservation.id
    )
    assert row["grant_id"] is None
    assert (await available_credit_grants(db_session, uid))["available"] == 2

    await exhaust_quota(db_session, uid)
    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    row = await one(
        db_session, "SELECT grant_id FROM usage_reservations WHERE id=:id", id=reservation.id
    )
    assert row["grant_id"] is not None
    assert (await available_credit_grants(db_session, uid))["available"] == 1


async def test_failed_job_returns_the_credit_to_the_grant_not_to_the_period(
    db_session, create_user, provider
):
    """Ders 23'ün kardeşi: iade yanlış kovaya giderse sayaç sessizce yalan söyler."""
    uid = await create_user()
    await add_grant(db_session, uid, amount=1)
    await exhaust_quota(db_session, uid)

    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    assert (await available_credit_grants(db_session, uid))["available"] == 0

    await resolve_reservation(db_session, reservation.id, success=False)

    assert (await available_credit_grants(db_session, uid))["available"] == 1
    # Dönem sayacı DOKUNULMADAN kalmalı: kredi oradan alınmamıştı. Aksi hâlde
    # kullanıcı aynı dönemde bir kredi fazla kullanabilirdi.
    period = await one(
        db_session,
        "SELECT used_this_period,quota_snapshot FROM subscription_periods WHERE user_id=:uid AND status='active'",
        uid=uid,
    )
    assert period["used_this_period"] == period["quota_snapshot"] == 10


async def test_successful_job_keeps_the_grant_spent(db_session, create_user, provider):
    uid = await create_user()
    await add_grant(db_session, uid, amount=1)
    await exhaust_quota(db_session, uid)

    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    await resolve_reservation(db_session, reservation.id, success=True, result_key="k")

    assert (await available_credit_grants(db_session, uid))["available"] == 0
    assert (
        await one(db_session, "SELECT count(*)::int AS n FROM usage_events WHERE user_id=:uid", uid=uid)
    )["n"] == 1


@pytest.mark.parametrize("column", ["expires_at", "revoked_at"])
async def test_expired_or_revoked_grants_are_never_spent(
    db_session, create_user, provider, column
):
    uid = await create_user()
    # `expires_at` SONRADAN değiştirilemiyor (değişmezlik trigger'ı); kredi
    # doğrudan süresi geçmiş olarak açılıyor. `revoked_at` ise iptal yolunun
    # kendisi, o serbest.
    await add_grant(
        db_session,
        uid,
        amount=5,
        **{column: datetime.now(timezone.utc) - timedelta(days=1)},
    )
    await exhaust_quota(db_session, uid)

    assert (await available_credit_grants(db_session, uid))["available"] == 0
    with pytest.raises(Exception) as excinfo:
        await reserve(db_session, uid, uuid.uuid4(), provider)
    assert excinfo.value.detail["code"] == "quota_exceeded"


@pytest.mark.parametrize("status", ["suspended", "expired"])
async def test_grant_does_not_revive_an_unusable_subscription(
    db_session, create_user, provider, status
):
    """Bonus kredi bir erişim kapısı DEĞİL: kapalı aboneliği açmaz."""
    uid = await create_user()
    await add_grant(db_session, uid, amount=5)
    await execute(
        db_session,
        "UPDATE subscriptions SET status=:status WHERE user_id=:uid",
        status=status,
        uid=uid,
    )
    await db_session.commit()

    with pytest.raises(Exception) as excinfo:
        await reserve(db_session, uid, uuid.uuid4(), provider)
    # `suspended` `ensure_period`'de, `expired` ise rezervasyonun erişim
    # koşulunda reddediliyor (dönemi hâlâ açıkken abonelik kapanmış olabilir) —
    # ikisinde de SONUÇ aynı olmalı: kredi harcanmaz.
    assert excinfo.value.detail["code"] in (
        "subscription_inactive",
        "subscription_expired",
        "quota_exceeded",
    )
    assert (await available_credit_grants(db_session, uid))["available"] == 5


async def test_the_soonest_expiring_grant_is_spent_first(
    db_session, create_user, provider
):
    uid = await create_user()
    late = await add_grant(db_session, uid, amount=1)
    early = await one(
        db_session,
        """INSERT INTO credit_grants(user_id,amount,reason,idempotency_key,expires_at)
        VALUES(:uid,1,'yakında biten',:key,now()+interval '1 day') RETURNING id""",
        uid=uid,
        key=str(uuid.uuid4()),
    )
    await db_session.commit()
    await exhaust_quota(db_session, uid)

    reservation = await reserve(db_session, uid, uuid.uuid4(), provider)
    row = await one(
        db_session, "SELECT grant_id FROM usage_reservations WHERE id=:id", id=reservation.id
    )
    assert row["grant_id"] == early["id"] and row["grant_id"] != late["id"]


async def test_grant_columns_are_immutable_except_usage_and_revocation(
    db_session, create_user
):
    """Kredi kaydı da bir kanıt: miktarı ve sebebi sonradan değiştirilemez."""
    uid = await create_user()
    grant = await add_grant(db_session, uid, amount=3)

    for column, value in (("amount", "99"), ("reason", "'başka sebep'")):
        with pytest.raises(DBAPIError, match="credit grant is immutable"):
            await execute(
                db_session,
                f"UPDATE credit_grants SET {column}={value} WHERE id=:id",
                id=grant["id"],
            )
        await db_session.rollback()

    # Serbest olan iki alan gerçekten serbest kalmalı (ders 15: yalnız RED
    # yolunu doğrulayan test, kuralın fazla geniş olduğunu göremez).
    await execute(
        db_session,
        "UPDATE credit_grants SET used=1,revoked_at=now() WHERE id=:id",
        id=grant["id"],
    )
    await db_session.commit()


async def test_an_admin_who_granted_credits_can_still_be_deleted(
    db_session, create_user
):
    """`granted_by` FK'si `ON DELETE SET NULL`; değişmezlik kuralı buna izin
    vermeliydi, vermeyince kredi vermiş bir yöneticinin hesabı HİÇ
    silinemiyordu. Bu daha önce yalnızca test temizliğinde dolaylı olarak
    görünüyordu — yani hata, testlerin BAKTIĞI yerin dışındaydı (ders 15)."""
    admin_id = await create_user()
    user_id = await create_user()
    grant = await one(
        db_session,
        """INSERT INTO credit_grants(user_id,amount,reason,granted_by,idempotency_key)
        VALUES(:uid,3,'jest',:actor,:key) RETURNING id""",
        uid=user_id,
        actor=admin_id,
        key=str(uuid.uuid4()),
    )
    await db_session.commit()

    await execute(db_session, "DELETE FROM auth.users WHERE id=:id", id=admin_id)
    await db_session.commit()

    # Kredi kaydı duruyor, yalnız kimlik koptu; kimin verdiği kalıcı olarak
    # denetim günlüğünde (FK'siz `actor_id`) saklanıyor.
    row = await one(
        db_session,
        "SELECT granted_by,amount,used FROM credit_grants WHERE id=:id",
        id=grant["id"],
    )
    assert row["granted_by"] is None and row["amount"] == 3


async def test_admin_audit_log_is_append_only(db_session, create_user):
    actor = await create_user()
    await execute(
        db_session,
        """INSERT INTO admin_audit_log(actor_id,action,subject_type,subject_id)
        VALUES(:actor,'credit_grant','user',:subject)""",
        actor=actor,
        subject=str(actor),
    )
    await db_session.commit()

    for statement in (
        "UPDATE admin_audit_log SET action='credit_revoke'",
        "DELETE FROM admin_audit_log",
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            await execute(db_session, statement)
        await db_session.rollback()

    assert (
        await one(db_session, "SELECT count(*)::int AS n FROM admin_audit_log")
    )["n"] == 1
