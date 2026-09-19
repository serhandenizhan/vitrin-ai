"""Hesaba bağlı sorun bildirimi ve geliştirme önerisi alımı."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.db import get_db_session
from app.services.billing.limits import limit_scoped, support_limiter

router = APIRouter()


class SupportRequestBody(BaseModel):
    kind: Literal["issue", "suggestion"]
    message: str = Field(min_length=10, max_length=4000)
    email: str | None = Field(default=None, max_length=254)

    @field_validator("message", mode="before")
    @classmethod
    def clean_message(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, value: object) -> object:
        cleaned = value.strip() if isinstance(value, str) else None
        return cleaned or None


@router.post("/api/support-requests", status_code=status.HTTP_201_CREATED)
async def create_support_request(
    request: Request,
    body: SupportRequestBody,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, UUID]:
    await limit_scoped(request, "support", user.id, limiter=support_limiter)
    request_id = await db.scalar(
        text("""
            insert into support_requests (user_id, kind, email, message)
            values (:user_id, :kind, :email, :message)
            returning id
        """),
        {"user_id": user.id, "kind": body.kind, "email": body.email, "message": body.message},
    )
    await db.commit()
    return {"id": request_id}
