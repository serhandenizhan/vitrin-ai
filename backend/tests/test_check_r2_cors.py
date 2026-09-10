import importlib.util
from pathlib import Path

# `scripts/` bir paket değil (manuel altyapı script'leri); modül dosya yolundan
# yükleniyor. Script ayarları yalnızca `main()` içinde okuduğu için bu import
# R2 kimlik bilgisi gerektirmiyor.
_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check_r2_cors.py"
_spec = importlib.util.spec_from_file_location("check_r2_cors", _SCRIPT)
check_r2_cors = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_r2_cors)

missing_permissions = check_r2_cors.missing_permissions

PROD = "https://vitrin.example"
LOCAL = "http://localhost:3000"


def test_accepts_origins_with_get_and_head():
    rules = [{"AllowedOrigins": [PROD, LOCAL], "AllowedMethods": ["GET", "HEAD"]}]

    assert missing_permissions(rules, [PROD, LOCAL]) == {}


def test_reports_missing_head_method():
    # Yalnızca GET'e izin veren bir kural: tarayıcı dışa aktarmada GET atıyor
    # ama HEAD eksikliği önbellek doğrulamasında sessizce CORS hatası verir.
    rules = [{"AllowedOrigins": [PROD], "AllowedMethods": ["GET"]}]

    assert missing_permissions(rules, [PROD]) == {PROD: ["HEAD"]}


def test_reports_origin_absent_from_every_rule():
    # En sık hata: kural yalnızca production için yazılıp localhost unutuluyor
    # (ya da tersi) — geliştirmede çalışan export üretimde kırılıyor.
    rules = [{"AllowedOrigins": [PROD], "AllowedMethods": ["GET", "HEAD"]}]

    assert missing_permissions(rules, [PROD, LOCAL]) == {LOCAL: ["GET", "HEAD"]}


def test_wildcard_origin_allows_any_origin():
    rules = [{"AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"]}]

    assert missing_permissions(rules, [PROD, LOCAL]) == {}


def test_does_not_combine_methods_across_separate_rules():
    # GET bir kuralda PROD için, HEAD başka bir kuralda yalnızca LOCAL için:
    # PROD'un HEAD izni YOK. Kurallar birleştirilseydi yanlışlıkla geçerdi.
    rules = [
        {"AllowedOrigins": [PROD], "AllowedMethods": ["GET"]},
        {"AllowedOrigins": [LOCAL], "AllowedMethods": ["HEAD"]},
    ]

    assert missing_permissions(rules, [PROD]) == {PROD: ["HEAD"]}


def test_no_rules_means_everything_missing():
    assert missing_permissions([], [LOCAL]) == {LOCAL: ["GET", "HEAD"]}
