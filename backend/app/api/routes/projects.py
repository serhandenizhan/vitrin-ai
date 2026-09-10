"""Kullanıcı projeleri (geçmiş çalışmalar) — Faz 4.

Tarayıcıdaki geçici IndexedDB deposunun (`frontend/src/lib/work-history.ts`)
sunucu karşılığı. Uç noktalar o dosyanın dört fonksiyonuyla birebir eşleşiyor,
böylece Kaan'ın tarafında yalnızca o dosyanın gövdesi değişecek:

    listWorks  → GET    /api/projects
    saveWork   → POST   /api/projects
    deleteWork → DELETE /api/projects/{id}
    clearWorks → DELETE /api/projects

IDOR (SECURITY.md 3.2): her sorgu `Project.user_id == user.id` filtresi
taşıyor — sahiplik veritabanı seviyesinde, sorgunun kendisinde doğrulanıyor.
Başkasına ait bir id için 403 değil 404 dönüyor: 403, o id'nin var olduğunu
söylemiş olurdu.
"""

import logging
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.core.db import get_db_session
from app.models.project import Project
from app.services.storage import R2ConfigurationError, R2StorageService, get_storage_service
from app.validation.upload import UploadValidationError, validate_upload

router = APIRouter()
logger = logging.getLogger(__name__)

# Sonuç, arka plan kaldırma servisinin ürettiği saydam PNG; başka bir tür
# gelmesi ya istemci hatası ya kötü niyet.
RESULT_CONTENT_TYPES = {"image/png"}
THUMBNAIL_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
THUMBNAIL_EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
# Tarayıcının ürettiği küçük resim 128×128 (bkz. work-history.ts THUMB_SIZE);
# birkaç on KB. Sınır bunun çok üzerinde ama "küçük resim" adı altında büyük
# dosya saklanmasını engelliyor.
THUMBNAIL_MAX_BYTES = 512 * 1024

MAX_FILE_NAME_LENGTH = 255
DEFAULT_LIST_LIMIT = 50
MAX_LIST_LIMIT = 100


async def _read_validated(
    upload: UploadFile, *, allowed_content_types: set[str], max_bytes: int, label: str
) -> bytes:
    content = await upload.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} çok büyük."
        )
    # Faz 1'in doğrulama katmanı (magic-byte + beyan edilen tür + piksel
    # sınırı) burada da aynen kullanılıyor — ayrı bir yol yazılmadı.
    try:
        await run_in_threadpool(
            validate_upload,
            content,
            declared_content_type=upload.content_type or "",
            max_file_size_mb=settings.max_file_size_mb,
            allowed_content_types=allowed_content_types,
            max_image_pixels=settings.max_image_pixels,
        )
    except UploadValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label}: {exc.reason}"
        ) from exc
    return content


async def _delete_objects_quietly(storage: R2StorageService, keys: list[str]) -> None:
    # R2 silmesi başarısız olursa kullanıcıya hata DÖNÜLMÜYOR: veritabanı
    # satırı zaten silindi, kullanıcının gözünde proje gitti. Kalan nesne
    # yetim (maliyet) ama erişilemez — anahtarı bilen tek yer silinen satırdı
    # ve imzalı URL üretilemez. Sessiz de değil: log'a yazılıyor.
    for key in keys:
        try:
            await storage.delete(key)
        except (BotoCoreError, ClientError, R2ConfigurationError):
            logger.warning("R2 nesnesi silinemedi, yetim kaldı: %s", key)


def _serialize(project: Project, storage: R2StorageService) -> dict:
    expires_in = settings.project_url_expiry_seconds
    return {
        "id": str(project.id),
        "file_name": project.file_name,
        "created_at": project.created_at.isoformat(),
        "is_mocked": project.is_mocked,
        "duration_seconds": project.duration_seconds,
        "result_url": storage.generate_presigned_url(
            project.result_r2_key, expires_in=expires_in
        ),
        "thumbnail_url": storage.generate_presigned_url(
            project.thumbnail_r2_key, expires_in=expires_in
        ),
        # Zeminlerdeki gibi: imzalı URL'lerin ömrünü istemci sunucudan
        # öğreniyor, kendi tarafına sabitlemiyor (ROADMAP Faz 3 uyarısı).
        "expires_in": expires_in,
    }


async def _get_owned_project(
    db: AsyncSession, project_id: uuid.UUID, user: CurrentUser
) -> Project:
    project = await db.scalar(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proje bulunamadı.")
    return project


@router.post("/api/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    result: UploadFile = File(...),
    thumbnail: UploadFile = File(...),
    file_name: str = Form(...),
    is_mocked: bool = Form(False),
    duration_seconds: float | None = Form(None, ge=0),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> dict:
    display_name = file_name.strip()
    if not display_name or len(display_name) > MAX_FILE_NAME_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dosya adı 1-{MAX_FILE_NAME_LENGTH} karakter olmalı.",
        )

    result_content = await _read_validated(
        result,
        allowed_content_types=RESULT_CONTENT_TYPES,
        max_bytes=settings.max_file_size_bytes,
        label="Sonuç görseli",
    )
    thumbnail_content = await _read_validated(
        thumbnail,
        allowed_content_types=THUMBNAIL_CONTENT_TYPES,
        max_bytes=THUMBNAIL_MAX_BYTES,
        label="Küçük resim",
    )

    # Anahtar kullanıcı kimliği + sunucuda üretilen UUID'den; kullanıcının
    # verdiği dosya adı anahtara HİÇ girmiyor (path traversal koruması).
    # Kullanıcı kimliğinin önekte olması, bir kullanıcının tüm nesnelerini
    # (KVKK silme talebi) tek önekle bulmayı mümkün kılıyor.
    project_id = uuid.uuid4()
    prefix = f"projects/{user.id}/{project_id}"
    result_key = f"{prefix}/result.png"
    thumbnail_key = f"{prefix}/thumbnail.{THUMBNAIL_EXTENSIONS[thumbnail.content_type]}"

    # Önce R2, sonra veritabanı: yükleme başarısız olursa görseli olmayan bir
    # satır oluşmasın (arka plan yüklemesindeki sırayla aynı). İkinci yükleme
    # patlarsa ilki geri alınıyor.
    uploaded: list[str] = []
    try:
        await storage.upload(result_key, result_content, "image/png")
        uploaded.append(result_key)
        await storage.upload(thumbnail_key, thumbnail_content, thumbnail.content_type)
        uploaded.append(thumbnail_key)
    except (BotoCoreError, ClientError) as exc:
        await _delete_objects_quietly(storage, uploaded)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Proje görselleri depolamaya yüklenemedi.",
        ) from exc

    project = Project(
        id=project_id,
        user_id=user.id,
        file_name=display_name,
        is_mocked=is_mocked,
        duration_seconds=duration_seconds,
        result_r2_key=result_key,
        thumbnail_r2_key=thumbnail_key,
    )
    db.add(project)
    await db.commit()
    # `created_at` sunucu varsayılanı; commit sonrası nesnede yok.
    await db.refresh(project)
    return _serialize(project, storage)


@router.get("/api/projects")
async def list_projects(
    limit: int = Query(DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> list[dict]:
    result = await db.execute(
        select(Project)
        .where(Project.user_id == user.id)
        .order_by(Project.created_at.desc(), Project.id)
        .limit(limit)
    )
    return [_serialize(project, storage) for project in result.scalars().all()]


@router.get("/api/projects/{project_id}")
async def get_project(
    project_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> dict:
    project = await _get_owned_project(db, project_id, user)
    return _serialize(project, storage)


@router.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> Response:
    project = await _get_owned_project(db, project_id, user)
    keys = [project.result_r2_key, project.thumbnail_r2_key]
    await db.delete(project)
    await db.commit()
    await _delete_objects_quietly(storage, keys)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/projects", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_projects(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> Response:
    result = await db.execute(
        delete(Project)
        .where(Project.user_id == user.id)
        .returning(Project.result_r2_key, Project.thumbnail_r2_key)
    )
    keys = [key for row in result.all() for key in row]
    await db.commit()
    await _delete_objects_quietly(storage, keys)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
