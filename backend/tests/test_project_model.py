import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.project import Project


def _project(user_id: uuid.UUID, duration_seconds: float | None) -> Project:
    project_id = uuid.uuid4()
    return Project(
        id=project_id,
        user_id=user_id,
        file_name="a.jpg",
        duration_seconds=duration_seconds,
        result_r2_key=f"projects/{user_id}/{project_id}/result.png",
        thumbnail_r2_key=f"projects/{user_id}/{project_id}/thumbnail.png",
    )


@pytest.mark.parametrize("value", [float("inf"), float("nan"), -1.0])
async def test_duration_must_be_finite_and_non_negative(db_session, create_user, value):
    # Veritabanı da korumalı, yalnızca route değil. Postgres'te `NaN >= 0`
    # DOĞRU ve `'Infinity' >= 0` de doğru; yalnızca `>= 0` diyen bir kısıt
    # ikisini de geçirir.
    user_id = await create_user()
    db_session.add(_project(user_id, value))

    with pytest.raises(IntegrityError):
        await db_session.commit()


@pytest.mark.parametrize("value", [None, 0.0, 14.5])
async def test_duration_accepts_finite_non_negative_or_missing(db_session, create_user, value):
    user_id = await create_user()
    db_session.add(_project(user_id, value))

    await db_session.commit()
