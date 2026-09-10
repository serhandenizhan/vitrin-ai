import base64
import hashlib
import hmac
import json
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import auth as auth_module
from app.core.auth import get_current_user, verify_access_token
from app.core.config import settings


def _bearer(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_valid_token_returns_current_user(tokens):
    user_id = uuid.uuid4()

    user = verify_access_token(tokens.token(user_id, claims={"email": "a@test.example"}))

    assert user.id == user_id
    assert user.email == "a@test.example"
    assert user.session_id is not None


@pytest.mark.parametrize(
    ("claims", "remove", "reason"),
    [
        ({"aud": "anon"}, (), "anonim anahtarla alınmış token"),
        ({"iss": "https://baska-proje.supabase.co/auth/v1"}, (), "başka bir projenin token'ı"),
        ({"role": "anon"}, (), "oturum açmamış rol"),
        ({"role": "service_role"}, (), "sunucu anahtarının rolü"),
        ({"is_anonymous": True}, (), "anonim oturum"),
        ({"sub": "kullanici-degil"}, (), "UUID olmayan sub"),
        ({}, ("exp",), "süresiz token"),
        ({}, ("sub",), "kullanıcısız token"),
        ({}, ("aud",), "hedefsiz token"),
    ],
)
def test_rejects_invalid_claims(tokens, claims, remove, reason):
    token = tokens.token(uuid.uuid4(), claims=claims, remove=remove)

    with pytest.raises(jwt.PyJWTError):
        verify_access_token(token)


def test_rejects_expired_token_beyond_leeway(tokens):
    token = tokens.token(uuid.uuid4(), expires_in=-(auth_module.CLOCK_SKEW_LEEWAY_SECONDS + 5))

    with pytest.raises(jwt.ExpiredSignatureError):
        verify_access_token(token)


def test_rejects_token_signed_by_another_key_with_same_kid(tokens):
    # Saldırgan kendi anahtarıyla imzalayıp gerçek anahtarın `kid`'ini yazıyor.
    foreign_key = ec.generate_private_key(ec.SECP256R1())
    token = tokens.token(uuid.uuid4(), key=foreign_key)

    with pytest.raises(jwt.InvalidSignatureError):
        verify_access_token(token)


def test_rejects_unknown_kid(tokens):
    token = tokens.token(uuid.uuid4(), kid="bilinmeyen-anahtar")

    with pytest.raises(jwt.PyJWKClientError):
        verify_access_token(token)


def test_rejects_unsigned_token(tokens):
    token = jwt.encode(tokens.claims(uuid.uuid4()), key=None, algorithm="none")

    with pytest.raises(jwt.InvalidAlgorithmError):
        verify_access_token(token)


def test_rejects_hs256_when_legacy_secret_is_not_configured(tokens):
    token = jwt.encode(tokens.claims(uuid.uuid4()), "tahmin-edilen-secret" * 2, algorithm="HS256")

    with pytest.raises(jwt.InvalidAlgorithmError):
        verify_access_token(token)


def _forge_hs256(payload: dict, secret: bytes) -> str:
    # PyJWT, PEM biçimli bir anahtarı HMAC secret'ı olarak kullanmayı
    # `encode` aşamasında reddediyor; saldırganın kütüphane kullanmak zorunda
    # olmadığını taklit etmek için token elle imzalanıyor.
    def _b64(data: bytes) -> bytes:
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": "test-imza-anahtari"}).encode())
    body = _b64(json.dumps(payload).encode())
    signature = _b64(hmac.new(secret, header + b"." + body, hashlib.sha256).digest())
    return (header + b"." + body + b"." + signature).decode()


@pytest.mark.parametrize("legacy_secret", ["", "gercek-legacy-secret" * 2])
def test_rejects_hs256_signed_with_public_key_as_secret(tokens, monkeypatch, legacy_secret):
    # Klasik algoritma karıştırma saldırısı: genel anahtar herkese açık
    # (JWKS). Saldırgan onu HMAC secret'ı gibi kullanıp HS256 imzalıyor.
    # Legacy secret yoksa HS256 hiç kabul edilmemeli; varsa token genel
    # anahtarla değil legacy secret'la kontrol edildiği için geçmemeli.
    monkeypatch.setattr(settings, "supabase_legacy_jwt_secret", legacy_secret)
    public_pem = tokens.private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    token = _forge_hs256(tokens.claims(uuid.uuid4()), public_pem)

    with pytest.raises((jwt.InvalidAlgorithmError, jwt.InvalidSignatureError)):
        verify_access_token(token)


def test_accepts_hs256_with_configured_legacy_secret(tokens, monkeypatch):
    secret = "eski-projenin-jwt-secreti" * 2
    monkeypatch.setattr(settings, "supabase_legacy_jwt_secret", secret)
    user_id = uuid.uuid4()
    token = jwt.encode(tokens.claims(user_id), secret, algorithm="HS256")

    assert verify_access_token(token).id == user_id


async def test_missing_credentials_returns_401_with_bearer_challenge(tokens):
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers == {"WWW-Authenticate": "Bearer"}


async def test_invalid_token_returns_401(tokens):
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_bearer("bu.bir.token.degil"))

    assert exc_info.value.status_code == 401


async def test_valid_token_resolves_user(tokens):
    user_id = uuid.uuid4()

    user = await get_current_user(_bearer(tokens.token(user_id)))

    assert user.id == user_id


async def test_unconfigured_supabase_returns_503_not_open_access(tokens, monkeypatch):
    # Yapılandırma eksikken GEÇERLİ görünen bir token bile kabul edilmemeli:
    # hangi projenin anahtarıyla doğrulanacağı bilinmiyor.
    monkeypatch.setattr(settings, "supabase_url", "")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_bearer(tokens.token(uuid.uuid4())))

    assert exc_info.value.status_code == 503


async def test_unreachable_jwks_returns_503(tokens, monkeypatch):
    def _unreachable(self):
        raise jwt.PyJWKClientConnectionError("ağ yok")

    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", _unreachable)
    auth_module.get_jwks_client.cache_clear()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_bearer(tokens.token(uuid.uuid4())))

    assert exc_info.value.status_code == 503
