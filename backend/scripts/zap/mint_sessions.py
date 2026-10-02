"""Tarama veritabanına bir kullanıcı ve bir yönetici ekler; ikisi için token + Next çerezi üretir.

Çıktı: `.work/sessions.json` (git'e girmez). Veritabanı `ZAP_DB_*` ortam değişkenleriyle
verilir (varsayılanlar `backend/scripts/test.sh`'nin test Postgres'iyle aynı).
Çerez adı `sb-<ref>-auth-token`; ref, Supabase adresinin ilk etiketi ("127").
"""
import asyncio
import base64
import json
import os
import time
import uuid

import asyncpg
import jwt

from fake_supabase import KEY, KID, WORK_DIR

SUPA = os.environ.get("ZAP_SUPABASE_URL", "http://127.0.0.1:54329")
DB = dict(
    host=os.environ.get("ZAP_DB_HOST", "127.0.0.1"),
    port=int(os.environ.get("ZAP_DB_PORT", "5434")),
    user=os.environ.get("POSTGRES_USER", "vitrin_ai"),
    password=os.environ.get("POSTGRES_PASSWORD", "change_me_locally"),
    database=os.environ.get("ZAP_DB_NAME", "zap_scan"),
)
b64 = lambda v: base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip("=")  # noqa: E731


def make(email: str, admin: bool):
    user_id = str(uuid.uuid4())

    async def seed():
        con = await asyncpg.connect(**DB)
        await con.execute("insert into auth.users (id, email) values ($1::uuid,$2)", user_id, email)
        if admin:
            await con.execute("insert into admin_users (user_id) values ($1::uuid)", user_id)
        await con.close()

    asyncio.run(seed())
    now = int(time.time())
    exp = now + 4 * 3600
    claims = {
        "iss": f"{SUPA}/auth/v1", "aud": "authenticated", "sub": user_id, "role": "authenticated",
        "iat": now, "exp": exp, "email": email, "session_id": str(uuid.uuid4()),
        "is_anonymous": False, "aal": "aal1",
    }
    access = jwt.encode(claims, KEY, algorithm="ES256", headers={"kid": KID})
    session = {
        "access_token": access, "refresh_token": "sahte-yenileme", "token_type": "bearer",
        "expires_in": 4 * 3600, "expires_at": exp,
        "user": {"id": user_id, "aud": "authenticated", "role": "authenticated", "email": email,
                 "app_metadata": {}, "user_metadata": {"first_name": "Tarama", "last_name": "Kullanıcı"},
                 "created_at": "2026-10-02T00:00:00Z"},
    }
    ref = SUPA.split("//", 1)[1].split(":")[0].split(".")[0]
    return user_id, f"sb-{ref}-auth-token=base64-" + b64(session), access


if __name__ == "__main__":
    out = {}
    for name, email, admin in (("user", "zap-user@example.com", False), ("admin", "zap-admin@example.com", True)):
        user_id, cookie, access = make(email, admin)
        out[name] = {"id": user_id, "cookie": cookie, "access_token": access}
    (WORK_DIR / "sessions.json").write_text(json.dumps(out), encoding="utf-8")
    print({k: v["id"] for k, v in out.items()}, "->", WORK_DIR / "sessions.json")
