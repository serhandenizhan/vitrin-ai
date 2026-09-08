from unittest.mock import MagicMock

from app.services import background_removal


def teardown_function():
    # `_get_session` süreç ömrü boyunca `lru_cache`'lendiği için testler arası
    # sızıntıyı önlemek adına her testten sonra temizle.
    background_removal._get_session.cache_clear()


def test_session_created_with_model_name_and_forced_cpu_provider(monkeypatch):
    fake_session = object()
    new_session_mock = MagicMock(return_value=fake_session)
    remove_mock = MagicMock(return_value=b"cutout-bytes")
    monkeypatch.setattr(background_removal.rembg, "new_session", new_session_mock)
    monkeypatch.setattr(background_removal.rembg, "remove", remove_mock)

    service = background_removal.BackgroundRemovalService(model_name="test-model-xyz")
    result = service.remove(b"input-bytes")

    new_session_mock.assert_called_once_with(
        "test-model-xyz", providers=["CPUExecutionProvider"]
    )
    remove_mock.assert_called_once_with(b"input-bytes", session=fake_session)
    assert result == b"cutout-bytes"


def test_session_is_cached_across_multiple_service_instances(monkeypatch):
    new_session_mock = MagicMock(side_effect=lambda *args, **kwargs: object())
    monkeypatch.setattr(background_removal.rembg, "new_session", new_session_mock)
    monkeypatch.setattr(background_removal.rembg, "remove", MagicMock(return_value=b"x"))

    service_a = background_removal.BackgroundRemovalService(model_name="cached-model")
    service_b = background_removal.BackgroundRemovalService(model_name="cached-model")

    service_a.remove(b"content-a")
    service_b.remove(b"content-b")

    # Aynı model adı için `rembg.new_session` yalnızca bir kez çağrılmalı;
    # ikinci servis örneği önbelleklenmiş oturumu yeniden kullanmalı.
    assert new_session_mock.call_count == 1


def test_different_model_names_get_separate_sessions(monkeypatch):
    new_session_mock = MagicMock(side_effect=lambda *args, **kwargs: object())
    monkeypatch.setattr(background_removal.rembg, "new_session", new_session_mock)
    monkeypatch.setattr(background_removal.rembg, "remove", MagicMock(return_value=b"x"))

    background_removal.BackgroundRemovalService(model_name="model-a").remove(b"a")
    background_removal.BackgroundRemovalService(model_name="model-b").remove(b"b")

    assert new_session_mock.call_count == 2
