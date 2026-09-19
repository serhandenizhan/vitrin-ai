"""Faz 6 admin uçlarının HTTP sözleşmesi.

HER YETKİ KONTROLÜNDE İKİ YOL DA SINANIYOR (kök `CLAUDE.md` ders 15): yönetici
olmayan oturumun reddedildiğini görmek, yöneticinin KABUL edildiğini
göstermiyor — bozuk bir kontrol de yalnız RED yolunu doğrulayan testten yeşil
geçerdi. Bu yüzden `admin_only` her uç için ikisini birden koşuyor.
"""

import uuid
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_db_session
from app.main import app
from app.services.billing.db import execute, many, one
from app.services.billing.provider import Iyzico, get_provider
from app.services.supabase_admin import (
    SupabaseAdminError,
    SupabaseAdminService,
    get_supabase_admin,
)


@pytest.fixture
def provider():
    return AsyncMock(spec=Iyzico)


@pytest.fixture
def supabase():
    """Supabase Auth'un yerine geçen sahte yönetici servisi.

    Gerçek HTTP katmanı `tests/test_supabase_admin.py`'ın işi; burada sınanan
    şey uçların Supabase'den geleni kendi verimizle nasıl birleştirdiği.
    """
    service = AsyncMock(spec=SupabaseAdminService)
    service.accounts = {}

    async def get_user(user_id):
        return service.accounts.get(str(user_id))

    async def get_user_email(user_id):
        account = service.accounts.get(str(user_id))
        return account["email"] if account else None

    async def list_users(page, per_page, query=None):
        users = list(service.accounts.values())
        if query:
            users = [u for u in users if query.casefold() in u["email"].casefold()]
        return users[(page - 1) * per_page : page * per_page]

    service.get_user.side_effect = get_user
    service.get_user_email.side_effect = get_user_email
    service.list_users.side_effect = list_users
    return service


@pytest.fixture
async def client(db_session, provider, supabase):
    async def session_override():
        yield db_session

    app.dependency_overrides[get_db_session] = session_override
    app.dependency_overrides[get_provider] = lambda: provider
    app.dependency_overrides[get_supabase_admin] = lambda: supabase
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
async def people(create_user, grant_admin, supabase):
    """Bir yönetici ve bir sıradan kullanıcı; ikisi de Supabase'de var."""
    admin_id = await create_user("admin@vitrin.example")
    user_id = await create_user("musteri@vitrin.example")
    await grant_admin(admin_id)
    for uid, email in ((admin_id, "admin@vitrin.example"), (user_id, "musteri@vitrin.example")):
        supabase.accounts[str(uid)] = {
            "id": str(uid),
            "email": email,
            "created_at": "2026-09-01T00:00:00Z",
            "last_sign_in_at": None,
            "email_confirmed_at": "2026-09-01T00:00:00Z",
        }
    return admin_id, user_id


@pytest.fixture
def admin_only(client, people, tokens):
    """Bir ucun HEM reddettiğini HEM kabul ettiğini doğrular."""
    admin_id, _ = people

    async def _check(method, url, expected, **kwargs):
        _, user_id = people
        denied = await client.request(
            method, url, headers=tokens.headers(user_id), **kwargs
        )
        assert denied.status_code == 403, (url, denied.text)
        allowed = await client.request(
            method, url, headers=tokens.headers(admin_id), **kwargs
        )
        assert allowed.status_code == expected, (url, allowed.text)
        return allowed

    return _check


async def test_admin_me_answers_both_roles_without_an_error(client, people, tokens):
    # Iki yol da ayri ayri (ders 15): yonetici "evet", siradan kullanici HATA
    # degil "hayir" alir — arayuz menudeki baglantiyi buna gore gosteriyor.
    admin_id, user_id = people
    admin = await client.get("/api/admin/me", headers=tokens.headers(admin_id))
    assert admin.status_code == 200 and admin.json() == {"is_admin": True}
    regular = await client.get("/api/admin/me", headers=tokens.headers(user_id))
    assert regular.status_code == 200 and regular.json() == {"is_admin": False}


async def test_admin_me_requires_a_session(client):
    assert (await client.get("/api/admin/me")).status_code == 401


async def test_admin_me_reflects_a_revoked_role_immediately(
    client, people, tokens, db_session
):
    # Rol token'da degil veritabaninda: yetki geri alininca ayni token'la
    # yapilan bir sonraki istek "hayir" almali.
    admin_id, _ = people
    await execute(db_session, "DELETE FROM admin_users WHERE user_id=:uid", uid=admin_id)
    await db_session.commit()
    response = await client.get("/api/admin/me", headers=tokens.headers(admin_id))
    assert response.json() == {"is_admin": False}


async def test_user_list_joins_supabase_accounts_with_our_billing_rows(
    admin_only, people, db_session
):
    _, user_id = people
    response = await admin_only("GET", "/api/admin/users", 200)

    rows = {u["email"]: u for u in response.json()["users"]}
    assert set(rows) == {"admin@vitrin.example", "musteri@vitrin.example"}
    billing = rows["musteri@vitrin.example"]["billing"]
    # Kayıt tetikleyicisi ücretsiz planı açtı: kota var, kullanım yok.
    assert billing["plan_id"] == "deneme" and billing["quota_snapshot"] == 10
    assert billing["used_this_period"] == 0 and billing["bonus_available"] == 0
    assert billing["is_admin"] is False
    assert rows["admin@vitrin.example"]["billing"]["is_admin"] is True


async def test_user_list_search_narrows_the_page(admin_only):
    response = await admin_only("GET", "/api/admin/users?query=musteri", 200)
    assert [u["email"] for u in response.json()["users"]] == ["musteri@vitrin.example"]


async def test_user_list_reports_supabase_outage_as_503_not_an_empty_list(
    client, people, tokens, supabase
):
    """Boş liste dönmek, "hiç kullanıcı yok" gibi okunur — arıza gizlenmemeli."""
    admin_id, _ = people
    supabase.list_users.side_effect = SupabaseAdminError("ulaşılamadı")

    response = await client.get("/api/admin/users", headers=tokens.headers(admin_id))

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "supabase_unavailable"


async def test_user_detail_returns_periods_credits_and_consents(
    admin_only, people, db_session
):
    _, user_id = people
    response = await admin_only("GET", f"/api/admin/users/{user_id}", 200)

    body = response.json()
    assert body["account"]["email"] == "musteri@vitrin.example"
    assert len(body["periods"]) == 1
    assert body["credit_grants"] == [] and body["transactions"] == []
    assert body["billing"]["project_count"] == 0


async def test_user_detail_is_404_for_an_unknown_account(client, people, tokens):
    admin_id, _ = people
    response = await client.get(
        f"/api/admin/users/{uuid.uuid4()}", headers=tokens.headers(admin_id)
    )
    assert response.status_code == 404


async def test_granting_credits_is_idempotent_per_key(admin_only, people, db_session):
    _, user_id = people
    key = str(uuid.uuid4())
    payload = {"amount": 5, "reason": "destek jesti", "idempotency_key": key}

    # `admin_only` ucu iki kez çağırıyor (reddedilen + kabul edilen); kabul
    # edilen çağrı aynı anahtarla ikinci kez gelse bile TEK kredi açılmalı.
    first = await admin_only(
        "POST", f"/api/admin/users/{user_id}/credits", 201, json=payload
    )
    second = await admin_only(
        "POST", f"/api/admin/users/{user_id}/credits", 201, json=payload
    )

    assert first.json()["id"] == second.json()["id"]
    assert (
        await one(db_session, "SELECT count(*)::int AS n FROM credit_grants")
    )["n"] == 1
    assert (await one(db_session, "SELECT amount,used FROM credit_grants"))["amount"] == 5
    # Tekrar denemesi ikinci krediyi açmadığı gibi ikinci bir denetim satırı da
    # yazmamalı: günlük, tek bir krediyi iki kez verilmiş gibi göstermemeli.
    assert (
        await one(db_session, "SELECT count(*)::int AS n FROM admin_audit_log")
    )["n"] == 1
    assert "inserted" not in second.json()


async def test_reusing_a_key_for_a_different_job_is_rejected(client, people, tokens):
    """Anahtar İŞİ tanımlar: aynı anahtarla başka bir iş sessizce onaylanmaz."""
    admin_id, user_id = people
    key = str(uuid.uuid4())
    await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={"amount": 5, "reason": "ilk", "idempotency_key": key},
    )
    response = await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={"amount": 50, "reason": "ikinci", "idempotency_key": key},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "idempotency_conflict"


async def test_a_dated_grant_stays_idempotent_across_a_database_round_trip(
    client, people, tokens, db_session
):
    """Son kullanma tarihi karşılaştırmaya giriyor; veritabanı saat dilimli
    döndürdüğü için saat dilimsiz bir girdi tekrar denemede SAHTE bir çakışma
    üretirdi. Bu yüzden alan `AwareDatetime` ve tekrar gerçekten idempotent."""
    admin_id, user_id = people
    body = {
        "amount": 3,
        "reason": "kampanya",
        "idempotency_key": str(uuid.uuid4()),
        "expires_at": "2026-12-31T23:59:00+03:00",
    }
    first = await client.post(
        f"/api/admin/users/{user_id}/credits", headers=tokens.headers(admin_id), json=body
    )
    second = await client.post(
        f"/api/admin/users/{user_id}/credits", headers=tokens.headers(admin_id), json=body
    )

    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert (
        await one(db_session, "SELECT count(*)::int AS n FROM credit_grants")
    )["n"] == 1

    # Saat dilimsiz bir tarih hiç kabul edilmiyor — belirsiz bir son kullanma
    # anını sessizce yorumlamak yerine istek reddediliyor.
    naive = await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={**body, "idempotency_key": str(uuid.uuid4()), "expires_at": "2026-12-31T23:59:00"},
    )
    assert naive.status_code == 422


async def test_reusing_a_key_with_a_different_expiry_is_rejected(
    client, people, tokens
):
    admin_id, user_id = people
    key = str(uuid.uuid4())
    base = {"amount": 3, "reason": "kampanya", "idempotency_key": key}
    await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={**base, "expires_at": "2026-12-31T23:59:00+03:00"},
    )
    response = await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={**base, "expires_at": "2027-12-31T23:59:00+03:00"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "idempotency_conflict"


async def test_granting_credits_writes_an_audit_row(client, people, tokens, db_session):
    admin_id, user_id = people
    await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={"amount": 2, "reason": "telafi", "idempotency_key": str(uuid.uuid4())},
    )
    row = await one(db_session, "SELECT * FROM admin_audit_log")
    assert row["action"] == "credit_grant" and row["actor_id"] == admin_id
    assert row["detail"]["amount"] == 2 and row["detail"]["user_id"] == str(user_id)


async def test_credits_for_an_unknown_account_are_refused(client, people, tokens):
    admin_id, _ = people
    response = await client.post(
        f"/api/admin/users/{uuid.uuid4()}/credits",
        headers=tokens.headers(admin_id),
        json={"amount": 1, "reason": "yok", "idempotency_key": str(uuid.uuid4())},
    )
    assert response.status_code == 404


async def test_revoking_a_credit_twice_conflicts(client, people, tokens, admin_only):
    admin_id, user_id = people
    created = await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={"amount": 4, "reason": "geri alınacak", "idempotency_key": str(uuid.uuid4())},
    )
    grant_id = created.json()["id"]

    first = await admin_only("POST", f"/api/admin/credits/{grant_id}/revoke", 200)
    assert first.json()["revoked_at"] is not None

    again = await client.post(
        f"/api/admin/credits/{grant_id}/revoke", headers=tokens.headers(admin_id)
    )
    assert again.status_code == 409


async def test_admin_account_deletion_requires_the_users_own_email(
    client, people, tokens, db_session
):
    admin_id, user_id = people
    wrong = await client.request(
        "DELETE",
        f"/api/admin/users/{user_id}",
        headers=tokens.headers(admin_id),
        json={"email": "yanlis@vitrin.example"},
    )
    assert wrong.status_code == 400
    # Hiçbir şey kuyruğa girmemiş olmalı.
    assert await one(db_session, "SELECT id FROM provider_actions") is None


async def test_admin_account_deletion_queues_the_same_job_as_self_deletion(
    admin_only, client, people, tokens, db_session
):
    admin_id, user_id = people
    body = {"email": "musteri@vitrin.example"}
    response = await admin_only("DELETE", f"/api/admin/users/{user_id}", 202, json=body)

    assert response.json()["status"] == "pending"
    action = await one(db_session, "SELECT * FROM provider_actions")
    assert action["kind"] == "delete_account" and action["user_id"] == user_id

    # İkinci BAŞARILI çağrı: silme işinin kimliği hesabın kendisinden türüyor,
    # yani tekrar istemek ikinci bir eylem açmamalı. (`admin_only`'nin reddedilen
    # çağrısı bunu kanıtlamaz — o istek zaten hiçbir şey yazmıyor.)
    again = await client.request(
        "DELETE",
        f"/api/admin/users/{user_id}",
        headers=tokens.headers(admin_id),
        json=body,
    )
    assert again.status_code == 202 and again.json()["action_id"] == str(action["id"])
    assert (
        await one(db_session, "SELECT count(*)::int AS n FROM provider_actions")
    )["n"] == 1
    assert (
        await one(db_session, "SELECT deletion_requested_at FROM subscriptions WHERE user_id=:uid", uid=user_id)
    )["deletion_requested_at"] is not None
    audit = await many(db_session, "SELECT action FROM admin_audit_log")
    assert [row["action"] for row in audit] == ["user_delete"]


async def test_admin_deletion_of_an_already_requested_account_writes_no_audit_row(
    client, people, tokens, db_session
):
    """Kullanıcı silmeyi zaten kendisi istediyse admin'in isteği bir şey başlatmadı."""
    admin_id, user_id = people
    await execute(
        db_session,
        "UPDATE subscriptions SET deletion_requested_at=now() WHERE user_id=:uid",
        uid=user_id,
    )
    await db_session.commit()
    response = await client.request(
        "DELETE",
        f"/api/admin/users/{user_id}",
        headers=tokens.headers(admin_id),
        json={"email": "musteri@vitrin.example"},
    )
    assert response.status_code == 202
    assert await one(db_session, "SELECT id FROM admin_audit_log") is None


@pytest.mark.parametrize("target", ["self", "other_admin"])
async def test_admin_accounts_cannot_be_deleted_from_the_panel(
    client, people, tokens, db_session, create_user, grant_admin, supabase, target
):
    admin_id, _ = people
    if target == "self":
        target_id, email = admin_id, "admin@vitrin.example"
    else:
        email = "ikinci-admin@vitrin.example"
        target_id = await create_user(email)
        await grant_admin(target_id)
        supabase.accounts[str(target_id)] = {"id": str(target_id), "email": email}
    response = await client.request(
        "DELETE",
        f"/api/admin/users/{target_id}",
        headers=tokens.headers(admin_id),
        json={"email": email},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "admin_target"
    assert await one(db_session, "SELECT id FROM provider_actions") is None
    assert await one(db_session, "SELECT id FROM admin_audit_log") is None
    assert (
        await one(db_session, "SELECT deletion_requested_at FROM subscriptions WHERE user_id=:uid", uid=target_id)
    )["deletion_requested_at"] is None


async def test_add_admin_requires_email_confirmation_and_writes_audit(
    client, people, tokens, db_session
):
    admin_id, user_id = people
    wrong = await client.post(
        f"/api/admin/users/{user_id}/admin",
        headers=tokens.headers(admin_id),
        json={"email": "yanlis@vitrin.example"},
    )
    assert wrong.status_code == 400
    assert not await one(db_session, "SELECT 1 FROM admin_users WHERE user_id=:uid", uid=user_id)

    response = await client.post(
        f"/api/admin/users/{user_id}/admin",
        headers=tokens.headers(admin_id),
        json={"email": "musteri@vitrin.example"},
    )
    assert response.status_code == 201
    assert response.json() == {"is_admin": True}
    assert await one(db_session, "SELECT 1 FROM admin_users WHERE user_id=:uid", uid=user_id)
    audit = await many(
        db_session,
        "SELECT actor_id,action,detail FROM admin_audit_log WHERE subject_id=:id",
        id=str(user_id),
    )
    assert len(audit) == 1
    assert audit[0]["action"] == "admin_add"
    assert audit[0]["actor_id"] == admin_id


async def test_add_admin_is_idempotent_and_does_not_duplicate_audit(
    client, people, tokens, db_session, grant_admin
):
    admin_id, user_id = people
    await grant_admin(user_id)

    response = await client.post(
        f"/api/admin/users/{user_id}/admin",
        headers=tokens.headers(admin_id),
        json={"email": "musteri@vitrin.example"},
    )
    assert response.status_code == 201
    assert response.json() == {"is_admin": True}
    assert await one(db_session, "SELECT id FROM admin_audit_log") is None


async def test_add_admin_requires_admin(client, people, tokens):
    _, user_id = people
    response = await client.post(
        f"/api/admin/users/{user_id}/admin",
        headers=tokens.headers(user_id),
        json={"email": "musteri@vitrin.example"},
    )
    assert response.status_code == 403


async def test_remove_admin_requires_email_confirmation_and_writes_audit(
    client, people, tokens, db_session, create_user, grant_admin, supabase
):
    admin_id, _ = people
    second_email = "ikinci-admin@vitrin.example"
    second_id = await create_user(second_email)
    await grant_admin(second_id)
    supabase.accounts[str(second_id)] = {"id": str(second_id), "email": second_email}

    wrong = await client.request(
        "DELETE",
        f"/api/admin/users/{second_id}/admin",
        headers=tokens.headers(admin_id),
        json={"email": "yanlis@vitrin.example"},
    )
    assert wrong.status_code == 400
    assert await one(db_session, "SELECT 1 FROM admin_users WHERE user_id=:uid", uid=second_id)

    response = await client.request(
        "DELETE",
        f"/api/admin/users/{second_id}/admin",
        headers=tokens.headers(admin_id),
        json={"email": second_email},
    )
    assert response.status_code == 200
    assert response.json() == {"is_admin": False}
    assert not await one(db_session, "SELECT 1 FROM admin_users WHERE user_id=:uid", uid=second_id)
    audit = await many(
        db_session,
        "SELECT actor_id,action FROM admin_audit_log WHERE subject_id=:id",
        id=str(second_id),
    )
    assert len(audit) == 1
    assert audit[0]["action"] == "admin_remove"


async def test_remove_admin_rejects_the_last_admin(client, people, tokens, db_session):
    admin_id, _ = people
    response = await client.request(
        "DELETE",
        f"/api/admin/users/{admin_id}/admin",
        headers=tokens.headers(admin_id),
        json={"email": "admin@vitrin.example"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "last_admin"
    assert await one(db_session, "SELECT 1 FROM admin_users WHERE user_id=:uid", uid=admin_id)
    assert await one(db_session, "SELECT id FROM admin_audit_log") is None


async def test_remove_admin_requires_admin(client, people, tokens):
    admin_id, user_id = people
    response = await client.request(
        "DELETE",
        f"/api/admin/users/{admin_id}/admin",
        headers=tokens.headers(user_id),
        json={"email": "admin@vitrin.example"},
    )
    assert response.status_code == 403


async def test_stats_fills_every_day_of_the_window(admin_only):
    """Delikli bir seri grafikte "o gün olmadı" gibi okunur; boş günler sıfır."""
    response = await admin_only("GET", "/api/admin/stats?days=7", 200)

    body = response.json()
    assert len(body["daily_usage"]) == 7 and len(body["daily_signups"]) == 7
    assert all(day["count"] == 0 for day in body["daily_usage"])
    assert body["usage"]["today"] == 0
    assert body["operations"]["open_alerts"] == 0


async def test_stats_counts_real_usage_and_grants(
    client, people, tokens, db_session, provider
):
    from app.services.billing.entitlements import reserve, resolve_reservation

    admin_id, user_id = people
    await client.post(
        f"/api/admin/users/{user_id}/credits",
        headers=tokens.headers(admin_id),
        json={"amount": 6, "reason": "istatistik", "idempotency_key": str(uuid.uuid4())},
    )
    reservation = await reserve(db_session, user_id, uuid.uuid4(), provider)
    await resolve_reservation(db_session, reservation.id, success=True, result_key="k")

    body = (
        await client.get("/api/admin/stats?days=30", headers=tokens.headers(admin_id))
    ).json()

    assert body["usage"]["today"] == 1 and body["usage"]["all_time"] == 1
    assert body["reservations"]["consumed"] == 1
    assert body["credit_grants"] == {"granted": 6, "used": 0, "outstanding": 6}
    assert sum(day["count"] for day in body["daily_usage"]) == 1
    assert dict(
        (row["status"], row["count"]) for row in body["subscriptions_by_status"]
    ) == {"active": 2}


async def test_stats_outstanding_excludes_expired_credit_grants(
    client, people, tokens, db_session
):
    admin_id, user_id = people
    await execute(
        db_session,
        """INSERT INTO credit_grants(
             user_id,amount,reason,granted_by,idempotency_key,expires_at
           ) VALUES(:user_id,10,'süresi dolmuş',:admin_id,:key,clock_timestamp()-interval '1 day')""",
        user_id=user_id,
        admin_id=admin_id,
        key=str(uuid.uuid4()),
    )
    await db_session.commit()

    body = (
        await client.get("/api/admin/stats?days=30", headers=tokens.headers(admin_id))
    ).json()

    assert body["credit_grants"] == {"granted": 10, "used": 0, "outstanding": 0}
