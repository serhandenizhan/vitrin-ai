import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Identity, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UserConsent(Base):
    """Sunucu zamanli, kullanicinin degistiremedigi yasal bildirim kaydi."""

    __tablename__ = "user_consents"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    document_type: Mapped[str] = mapped_column(Text, nullable=False)
    document_version: Mapped[str] = mapped_column(Text, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.statement_timestamp(), nullable=False
    )
    source: Mapped[str] = mapped_column(Text, default="signup", nullable=False)
