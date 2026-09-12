"""`DELETE /api/account` testleri.

Sıra kararının (bkz. app/api/routes/account.py) her dalı ayrı sınanıyor:
yapılandırma eksikken hiçbir şey silinmiyor, R2 hatasında hesap kalıyor.
"""

import uuid

import httpx
import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.main import app
from app.services import storage as storage_module
from app.services import supabase_admin as admin_module
from app.services.storage import R2StorageService, get_storage_service
from app.services.supabase_admin import (
    SupabaseAdminConfigurationError,
    SupabaseAdminError,
    SupabaseAdminService,
    get_supabase_admin,
)

USER_ID = uuid.UUID("3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b")


class FakeStorage:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.deleted_prefixes: list[str] = []

    async def delete_prefix(self, prefix: str) -> int:
        if self.error:
            raise self.error
        self.deleted_prefixes.append(prefix)
        return 2


class FakeAdmin:
    def __init__(self, configured: bool = True, error: Exception | None = None):
        self.configured = configured
        self.error = error
        self.deleted_users: list[uuid.UUID] = []

    def ensure_configured(self) -> None:
        if not self.configured:
            raise SupabaseAdminConfigurationError("yapılandırılmamış")

    async def delete_user(self, user_id: uuid.UUID) -> None:
        if self.error:
            raise self.error
        self.deleted_users.append(user_id)


def _client(storage: FakeStorage, admin: FakeAdmin, signed_in: bool = True) -> TestClient:
    app.dependency_overrides[get_storage_service] = lambda: storage
    app.dependency_overrides[get_supabase_admin] = lambda: admin
    if signed_in:
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=USER_ID, email="test@test.example", session_id=None
        )
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()
    storage_module._get_client.cache_clear()


def test_requires_session(tokens):
    storage, admin = FakeStorage(), FakeAdmin()
    client = _client(storage, admin, signed_in=False)

    response = client.delete("/api/account")

    assert response.status_code == 401
    assert storage.deleted_prefixes == []
    assert admin.deleted_users == []


def test_deletes_only_own_images_then_user():
    storage, admin = FakeStorage(), FakeAdmin()
    client = _client(storage, admin)

    response = client.delete("/api/account")

    assert response.status_code == 204
    # Önek token'daki kullanıcıdan; sonunda "/" var (başka bir kimliğin
    # önekiyle çakışmasın).
    assert storage.deleted_prefixes == [f"projects/{USER_ID}/"]
    assert admin.deleted_users == [USER_ID]


def test_missing_secret_key_deletes_nothing():
    storage, admin = FakeStorage(), FakeAdmin(configured=False)
    client = _client(storage, admin)

    response = client.delete("/api/account")

    assert response.status_code == 503
    assert storage.deleted_prefixes == []
    assert admin.deleted_users == []


def test_r2_failure_keeps_account():
    error = ClientError({"Error": {"Code": "InternalError"}}, "ListObjectsV2")
    storage, admin = FakeStorage(error=error), FakeAdmin()
    client = _client(storage, admin)

    response = client.delete("/api/account")

    assert response.status_code == 502
    assert admin.deleted_users == []


def test_unconfigured_r2_returns_503_and_keeps_account():
    # R2ConfigurationError bir RuntimeError; genel "silinemedi" (502) dalına
    # düşmemeli — kullanıcıya yanlış sebep söylenirdi.
    storage = FakeStorage(error=storage_module.R2ConfigurationError("R2 yapılandırılmamış"))
    admin = FakeAdmin()
    client = _client(storage, admin)

    response = client.delete("/api/account")

    assert response.status_code == 503
    assert admin.deleted_users == []


def test_supabase_failure_returns_502():
    storage, admin = FakeStorage(), FakeAdmin(error=SupabaseAdminError("hata"))
    client = _client(storage, admin)

    response = client.delete("/api/account")

    assert response.status_code == 502
    # Görseller silindi; tekrar denemede önek boş geçilecek.
    assert storage.deleted_prefixes == [f"projects/{USER_ID}/"]


# --- R2StorageService.delete_prefix -----------------------------------------


class _FakePaginator:
    def __init__(self, pages):
        self.pages = pages
        self.kwargs = None

    def paginate(self, **kwargs):
        self.kwargs = kwargs
        return iter(self.pages)


class _FakeS3Client:
    def __init__(self, pages, errors=None):
        self.paginator = _FakePaginator(pages)
        self.errors = errors
        self.delete_calls = []

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return self.paginator

    def delete_objects(self, **kwargs):
        self.delete_calls.append(kwargs)
        return {"Errors": self.errors} if self.errors else {}


@pytest.mark.asyncio
async def test_delete_prefix_deletes_every_page(monkeypatch):
    fake = _FakeS3Client(
        pages=[
            {"Contents": [{"Key": "projects/u/1/result.png"}, {"Key": "projects/u/1/thumbnail.png"}]},
            {"Contents": [{"Key": "projects/u/2/result.png"}]},
            {},
        ]
    )
    monkeypatch.setattr(storage_module, "_get_client", lambda: fake)

    deleted = await R2StorageService(bucket_name="kova").delete_prefix("projects/u/")

    assert deleted == 3
    assert fake.paginator.kwargs == {"Bucket": "kova", "Prefix": "projects/u/"}
    assert len(fake.delete_calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("prefix", ["", "projects/u"])
async def test_delete_prefix_refuses_prefix_that_could_match_too_much(monkeypatch, prefix):
    # Boş önek bucket'ın TAMAMINI, "/" olmayan önek başka kullanıcıları
    # ("projects/u" -> "projects/u2/...") silebilirdi.
    monkeypatch.setattr(storage_module, "_get_client", lambda: pytest.fail("çağrılmamalı"))

    with pytest.raises(ValueError):
        await R2StorageService(bucket_name="kova").delete_prefix(prefix)


@pytest.mark.asyncio
async def test_delete_prefix_raises_when_some_objects_fail(monkeypatch):
    fake = _FakeS3Client(
        pages=[{"Contents": [{"Key": "projects/u/1/result.png"}]}],
        errors=[{"Key": "projects/u/1/result.png", "Code": "AccessDenied"}],
    )
    monkeypatch.setattr(storage_module, "_get_client", lambda: fake)

    with pytest.raises(RuntimeError):
        await R2StorageService(bucket_name="kova").delete_prefix("projects/u/")


# --- SupabaseAdminService ----------------------------------------------------


@pytest.mark.asyncio
async def test_admin_refuses_without_secret_key(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://proje.supabase.co")
    monkeypatch.setattr(settings, "supabase_secret_key", "")

    with pytest.raises(SupabaseAdminConfigurationError):
        await SupabaseAdminService().delete_user(USER_ID)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("key", "expects_bearer"),
    [("sb_secret_ornek", False), ("eyJhbGciOiJIUzI1NiJ9.eski.anahtar", True)],
)
async def test_admin_sends_key_headers_and_treats_404_as_done(monkeypatch, key, expects_bearer):
    monkeypatch.setattr(settings, "supabase_url", "https://proje.supabase.co/")
    monkeypatch.setattr(settings, "supabase_secret_key", key)
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["apikey"] = request.headers.get("apikey")
        seen["authorization"] = request.headers.get("authorization")
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        admin_module.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )

    await SupabaseAdminService().delete_user(USER_ID)

    assert seen["url"] == f"https://proje.supabase.co/auth/v1/admin/users/{USER_ID}"
    assert seen["apikey"] == key
    assert (seen["authorization"] == f"Bearer {key}") is expects_bearer
    if not expects_bearer:
        assert seen["authorization"] is None


@pytest.mark.asyncio
async def test_admin_error_does_not_leak_key(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://proje.supabase.co")
    monkeypatch.setattr(settings, "supabase_secret_key", "sb_secret_gizli")
    transport = httpx.MockTransport(lambda request: httpx.Response(500, text="sb_secret_gizli"))
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        admin_module.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )

    with pytest.raises(SupabaseAdminError) as info:
        await SupabaseAdminService().delete_user(USER_ID)

    assert "sb_secret_gizli" not in str(info.value)
