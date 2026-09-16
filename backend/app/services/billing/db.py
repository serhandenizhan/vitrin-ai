"""Parametreli sorgular ve kısa işlem sınırları için ortak yardımcılar."""

import json
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def one(db, sql, **params):
    return (await db.execute(text(sql), params)).mappings().first()


async def many(db, sql, **params):
    return (await db.execute(text(sql), params)).mappings().all()


async def execute(db, sql, **params):
    return await db.execute(text(sql), params)


async def alert(db, kind, reference, detail):
    logger.error("Billing alarm: %s reference=%s", kind, reference)
    await execute(
        db,
        """INSERT INTO billing_alerts(deduplication_key,kind,reference,detail)
        VALUES(:key,:kind,:ref,:detail) ON CONFLICT(deduplication_key) DO NOTHING""",
        key=f"{kind}:{reference}",
        kind=kind,
        ref=str(reference),
        detail=detail,
    )


async def enqueue(db, user_id, kind, reference, key, payload=None):
    row = await one(
        db,
        """INSERT INTO provider_actions(user_id,kind,target_reference,idempotency_key,payload)
        VALUES(:uid,:kind,:ref,:key,CAST(:payload AS jsonb)) ON CONFLICT(idempotency_key)
        DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING *""",
        uid=user_id,
        kind=kind,
        ref=str(reference),
        key=str(key),
        payload=json.dumps(payload or {}),
    )
    return row
