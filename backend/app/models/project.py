import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Project(Base):
    """Kullanıcının geçmiş çalışmalarından biri (Faz 4).

    Tarayıcıdaki geçici IndexedDB kaydının (`frontend/src/lib/work-history.ts`
    → `WorkRecord`) sunucu karşılığı. Görsellerin kendisi R2'de; burada
    yalnızca anahtarları duruyor.
    """

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # `auth.users(id)`'ye FK ve ON DELETE CASCADE veritabanında tanımlı
    # (migration 0003). ORM'de bilinçli olarak `ForeignKey` YOK: `auth.users`
    # Supabase'e ait, bu uygulamanın metadata'sında bulunmuyor ve
    # `Base.metadata.sorted_tables` bilinmeyen bir tabloya işaret eden FK'de
    # hata veriyor.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Yalnızca GÖRÜNTÜLEME metni. R2 anahtarlarında hiçbir koşulda kullanılmaz
    # (path traversal koruması, SECURITY.md bölüm 4).
    file_name: Mapped[str] = mapped_column(Text, nullable=False)
    is_mocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    result_r2_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    thumbnail_r2_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
