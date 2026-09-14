import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AdminUser(Base):
    """Yönetici yetkisi olan kullanıcılar (Faz 4, `X-Admin-Secret`'ın yerine).

    Bu tabloya satır yalnızca veritabanına doğrudan erişimi olan biri
    tarafından eklenebilir: RLS açık, politika yok, `anon`/`authenticated`
    rollerinin yetkisi yok (bkz. migration 0003). Kullanıcının kendini
    yönetici yapabileceği bir yol bilinçli olarak bırakılmadı.
    """

    __tablename__ = "admin_users"

    # `auth.users(id)`'ye FK veritabanında tanımlı; ORM'de neden olmadığı için
    # bkz. `app/models/project.py`.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
