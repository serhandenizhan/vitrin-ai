from sqlalchemy import text

from app.core.db import get_db_session


async def test_get_db_session_yields_working_session():
    session_gen = get_db_session()
    session = await anext(session_gen)
    try:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
    finally:
        await session_gen.aclose()
