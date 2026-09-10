"""Supabase access token doğrulaması ve yetki bağımlılıkları (Faz 4).

AKIŞ: tarayıcı oturumu `@supabase/ssr` ile çerezde tutuyor; Next.js vekili
isteği FastAPI'ye `Authorization: Bearer <access_token>` ile iletiyor. Backend
token'ı Supabase'e sormadan, projenin genel anahtarlarıyla (JWKS) yerelde
doğruluyor.

NEDEN JWKS (asimetrik anahtar): Supabase yeni projelerde token'ları ES256/RS256
ile imzalıyor; genel anahtar `/auth/v1/.well-known/jwks.json` adresinden
okunuyor ve backend'in hiçbir secret tutması gerekmiyor. HS256 (eski, paylaşılan
secret) yalnızca `SUPABASE_LEGACY_JWT_SECRET` açıkça verilirse kabul ediliyor —
Supabase bunu üretim için önermiyor.

ALGORİTMA KARIŞTIRMA SALDIRISI: token başlığındaki `alg` bir izin listesiyle
sınırlanıyor ve anahtar TÜRÜ algoritmaya göre seçiliyor. Genel anahtarı HMAC
secret'ı gibi kullanıp HS256 imzalanmış bir token, legacy secret yoksa
reddediliyor; varsa legacy secret'la (genel anahtarla değil) kontrol ediliyor.
"""

import uuid
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db_session
from app.models.admin_user import AdminUser

ASYMMETRIC_ALGORITHMS = ("ES256", "RS256")
LEGACY_ALGORITHM = "HS256"

# Supabase JWKS yanıtını kendi kenar sunucularında 10 dakika önbellekliyor ve
# kendi istemci kütüphanelerine de 10 dakika önermiyor; aynı süre. Anahtar
# döndürüldüğünde bilinmeyen bir `kid` gelirse PyJWKClient önbelleği atlayıp
# yeniden çekiyor.
JWKS_CACHE_SECONDS = 600
JWKS_TIMEOUT_SECONDS = 5

# Supabase ile bu sunucunun saatleri arasındaki küçük farka tolerans. Yoksa
# yeni verilmiş bir token `iat` gelecekte göründüğü için reddedilebilirdi.
CLOCK_SKEW_LEEWAY_SECONDS = 30

REQUIRED_CLAIMS = ["exp", "iat", "sub", "aud", "iss"]

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str | None
    session_id: str | None


def issuer() -> str:
    return f"{settings.supabase_url.rstrip('/')}/auth/v1"


@lru_cache(maxsize=1)
def get_jwks_client() -> jwt.PyJWKClient:
    # Süreç başına tek istemci: anahtarları kendi içinde önbellekliyor.
    return jwt.PyJWKClient(
        f"{issuer()}/.well-known/jwks.json",
        cache_keys=True,
        lifespan=JWKS_CACHE_SECONDS,
        timeout=JWKS_TIMEOUT_SECONDS,
    )


def verify_access_token(token: str) -> CurrentUser:
    """Token'ı doğrular; geçersizse bir `jwt.PyJWTError` alt sınıfı fırlatır.

    Ağ çağrısı yapabildiği (JWKS) için senkron; çağıran threadpool'a taşıyor.
    """
    algorithm = jwt.get_unverified_header(token).get("alg")

    if algorithm in ASYMMETRIC_ALGORITHMS:
        key = get_jwks_client().get_signing_key_from_jwt(token).key
    elif algorithm == LEGACY_ALGORITHM and settings.supabase_legacy_jwt_secret:
        key = settings.supabase_legacy_jwt_secret
    else:
        raise jwt.InvalidAlgorithmError(f"Desteklenmeyen imza algoritması: {algorithm!r}")

    claims = jwt.decode(
        token,
        key,
        algorithms=[algorithm],
        audience=settings.supabase_jwt_audience,
        issuer=issuer(),
        leeway=CLOCK_SKEW_LEEWAY_SECONDS,
        options={"require": REQUIRED_CLAIMS},
    )

    # `aud` kontrolü anonim anahtarla alınmış token'ları (aud=anon) zaten
    # eliyor; rol ve anonim oturum kontrolleri ayrıca yapılıyor. Supabase'in
    # anonim oturumları `authenticated` rolü taşıyor — yalnızca role bakmak
    # onları gerçek kullanıcı sanardı.
    if claims.get("role") != "authenticated":
        raise jwt.InvalidTokenError("Token oturum açmış bir kullanıcıya ait değil.")
    if claims.get("is_anonymous") is True:
        raise jwt.InvalidTokenError("Anonim oturumlar kabul edilmiyor.")

    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except ValueError as exc:
        raise jwt.InvalidTokenError("`sub` bir kullanıcı kimliği değil.") from exc

    return CurrentUser(
        id=user_id,
        email=claims.get("email") or None,
        session_id=claims.get("session_id"),
    )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    # Yapılandırma eksikse 401 değil 503: kullanıcı hiçbir şeyi yanlış yapmadı.
    # Sessizce "herkese açık" davranmak da bir seçenek değil (kök CLAUDE.md
    # ders 8'in tersi — geçici çözüm fark edilmeden kalıcı olurdu).
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kimlik doğrulama yapılandırılmamış; sunucuda SUPABASE_URL ayarlanmalı.",
        )
    if credentials is None:
        raise _unauthorized("Oturum açmanız gerekiyor.")

    try:
        return await run_in_threadpool(verify_access_token, credentials.credentials)
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kimlik doğrulama anahtarlarına ulaşılamadı.",
        ) from exc
    except jwt.PyJWTError as exc:
        raise _unauthorized("Oturum geçersiz ya da süresi dolmuş.") from exc


async def require_admin(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CurrentUser:
    # Rol kontrolü backend'de ve her istekte veritabanından (SECURITY.md 3.2);
    # frontend'in bir düğmeyi gizlemesi yetkilendirme sayılmaz.
    is_admin = await db.scalar(select(exists().where(AdminUser.user_id == user.id)))
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için yönetici yetkisi gerekiyor.",
        )
    return user
