import base64
import hashlib
import hmac
import io
import json
import time
import urllib.request
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
from tests.conftest import TEST_KEY_ID, TEST_SUPABASE_URL

# `tokens` fixture'ı JWKS indirmeyi `fetch_data`'yı değiştirerek taklit ediyor;
# önbellek davranışını sınayan testler gerçek `fetch_data`'ya (önbelleğe
# yazma dahil) geri dönüp yalnızca ağ çağrısını taklit ediyor.
_REAL_FETCH_DATA = jwt.PyJWKClient.fetch_data


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


# --- JWKS önbelleği ve yenileme ------------------------------------------------


def _public_jwk(private_key: ec.EllipticCurvePrivateKey, kid: str) -> dict:
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": kid, "alg": "ES256", "use": "sig"})
    return jwk


class _FakeJwksEndpoint:
    """Supabase'in JWKS adresini ağ katmanında taklit eder, çekimleri sayar."""

    def __init__(self, keys: list[dict]):
        self.keys = keys
        self.fetches = 0

    def urlopen(self, request, timeout=None, context=None):
        assert request.full_url == f"{TEST_SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        self.fetches += 1
        return io.BytesIO(json.dumps({"keys": self.keys}).encode())


class _Clock:
    def __init__(self):
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def jwks_endpoint(tokens, monkeypatch) -> _FakeJwksEndpoint:
    endpoint = _FakeJwksEndpoint([_public_jwk(tokens.private_key, TEST_KEY_ID)])
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", _REAL_FETCH_DATA)
    monkeypatch.setattr(urllib.request, "urlopen", endpoint.urlopen)
    auth_module.get_jwks_client.cache_clear()
    return endpoint


@pytest.fixture
def clock(monkeypatch) -> _Clock:
    # PyJWT'nin JWKS önbelleği ve yenileme sınırı `time.monotonic` ile
    # çalışıyor; testler dakikalarca beklemek yerine saati ileri sarıyor.
    fake = _Clock()
    monkeypatch.setattr(time, "monotonic", fake)
    return fake


def test_jwks_is_fetched_once_and_reused_within_its_lifespan(jwks_endpoint, tokens, clock):
    for _ in range(3):
        verify_access_token(tokens.token(uuid.uuid4()))
        clock.now += 60

    assert jwks_endpoint.fetches == 1


def test_revoked_signing_key_is_rejected_once_jwks_lifespan_passes(jwks_endpoint, tokens, clock):
    # Anahtar sızdı ve Supabase'de iptal edildi: JWKS'den çıktı, yerine yenisi
    # geldi. Eski anahtarla imzalanmış token'lar önbellek süresi dolduktan
    # sonra — süreç yeniden başlatılmadan — reddedilmeli.
    leaked_token = tokens.token(uuid.uuid4())
    verify_access_token(leaked_token)

    replacement = ec.generate_private_key(ec.SECP256R1())
    jwks_endpoint.keys = [_public_jwk(replacement, "yeni-anahtar")]
    clock.now += auth_module.JWKS_CACHE_SECONDS + 1

    with pytest.raises(jwt.PyJWKClientError):
        verify_access_token(leaked_token)


def test_unknown_kids_force_at_most_one_refresh_per_interval(jwks_endpoint, tokens, clock):
    # Oturumu olmayan biri rastgele `kid`'li token'lar yolluyor; her biri
    # Supabase'e bir ağ isteği yaptıramamalı.
    verify_access_token(tokens.token(uuid.uuid4()))

    for index in range(20):
        with pytest.raises(jwt.PyJWKClientError):
            verify_access_token(tokens.token(uuid.uuid4(), kid=f"uydurma-{index}"))

    # 1 ilk çekim + aralık içinde en fazla 1 zorunlu yenileme.
    assert jwks_endpoint.fetches == 2


def test_new_key_is_accepted_immediately_when_no_recent_refresh(jwks_endpoint, tokens, clock):
    # Meşru anahtar rotasyonu: yeni anahtar JWKS'de yayımlandı, önbellekte yok.
    verify_access_token(tokens.token(uuid.uuid4()))
    rotated = ec.generate_private_key(ec.SECP256R1())
    jwks_endpoint.keys.append(_public_jwk(rotated, "donen-anahtar"))

    user_id = uuid.uuid4()
    token = tokens.token(user_id, key=rotated, kid="donen-anahtar")

    assert verify_access_token(token).id == user_id


def test_new_key_is_accepted_after_refresh_interval_even_if_refresh_was_spent(
    jwks_endpoint, tokens, clock
):
    # Saldırgan yenileme hakkını az önce harcadıysa yeni anahtar bir süre
    # reddedilir, ama aralık dolunca kabul edilmeli — sınır rotasyonu kalıcı
    # olarak kilitlememeli.
    verify_access_token(tokens.token(uuid.uuid4()))
    with pytest.raises(jwt.PyJWKClientError):
        verify_access_token(tokens.token(uuid.uuid4(), kid="saldirgan"))

    rotated = ec.generate_private_key(ec.SECP256R1())
    jwks_endpoint.keys.append(_public_jwk(rotated, "donen-anahtar"))
    token = tokens.token(uuid.uuid4(), key=rotated, kid="donen-anahtar")
    with pytest.raises(jwt.PyJWKClientError):
        verify_access_token(token)

    clock.now += auth_module.JWKS_MIN_REFRESH_INTERVAL_SECONDS + 1

    assert verify_access_token(token).id is not None
