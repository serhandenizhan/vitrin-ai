import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.background import Background


async def test_create_and_query_background(db_session):
    background = Background(id=uuid.uuid4(), r2_key="backgrounds/test-key.jpg")
    db_session.add(background)
    await db_session.commit()

    result = await db_session.execute(
        select(Background).where(Background.r2_key == "backgrounds/test-key.jpg")
    )
    fetched = result.scalar_one()
    assert fetched.is_active is True
    assert fetched.created_at is not None


async def test_r2_key_must_be_unique(db_session):
    db_session.add(Background(id=uuid.uuid4(), r2_key="dup-key"))
    await db_session.commit()

    db_session.add(Background(id=uuid.uuid4(), r2_key="dup-key"))
    with pytest.raises(IntegrityError):
        await db_session.commit()
