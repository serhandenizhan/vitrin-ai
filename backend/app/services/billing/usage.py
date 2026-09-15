"""Inference yaşam döngüsüne bağlanan kota hizmeti."""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db_session
from app.services.billing.provider import get_provider
from app.services.billing.entitlements import reserve, resolve_reservation


class UsageQuota:
    def __init__(self, db, provider):
        self.db = db
        self.provider = provider

    async def reserve(self, user_id, request_id):
        return await reserve(self.db, user_id, request_id, self.provider)

    async def resolve(self, reservation_id, success):
        return await resolve_reservation(self.db, reservation_id, success)


def get_usage_quota(
    db: AsyncSession = Depends(get_db_session), provider=Depends(get_provider)
):
    return UsageQuota(db, provider)
