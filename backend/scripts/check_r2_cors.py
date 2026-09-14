"""
R2 CORS doğrulama script'i — kompozisyon editörünün dışa aktarması için
gereken GET/HEAD CORS kuralını GERÇEK bucket'a karşı kontrol eder.

Neden gerekli: editör zemin görsellerini `crossOrigin="anonymous"` ile yüklüyor
(bkz. frontend/src/components/composer/editor-stage.tsx). Bucket o origin için
`Access-Control-Allow-Origin` dönmezse tarayıcı görseli hiç yüklemiyor ve
editör SESSİZCE gradyan zemine düşüyor — küçük önizleme (CSS arka planı, CORS
gerektirmiyor) yine görünüyor, dolayısıyla hata gözle fark edilmiyor.

İki aşamalı kontrol:
  1. `GetBucketCors` ile tanımlı kurallar okunur; her origin için GET ve HEAD
     izni olup olmadığına bakılır.
  2. Bucket'taki gerçek bir nesne için imzalı URL üretilir ve her origin için
     `Origin` başlığıyla GET ve HEAD atılır; yanıttaki
     `Access-Control-Allow-Origin` doğrulanır. Kural tanımı ile R2'nin fiili
     davranışı ayrışabileceği için ikinci aşama asıl kanıttır.

Bu bir test dosyası değil, manuel bir altyapı kontrolüdür (bkz.
manual_model_check.py). `backend/.env` içindeki R2_* değişkenlerini kullanır.

Kullanım:
  .venv/bin/python scripts/check_r2_cors.py https://uretim-alan-adi http://localhost:3000
  R2_CORS_ORIGINS="https://uretim-alan-adi,http://localhost:3000" \\
      .venv/bin/python scripts/check_r2_cors.py [--key backgrounds/<uuid>.png]

Çıkış kodu: 0 = tüm origin'ler geçti, 1 = en az bir eksik, 2 = yapılandırma hatası.
"""

import argparse
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

REQUIRED_METHODS = ("GET", "HEAD")


def missing_permissions(
    rules: list[dict], origins: list[str], methods: tuple[str, ...] = REQUIRED_METHODS
) -> dict[str, list[str]]:
    """Her origin için kurallarda izin VERİLMEYEN metotları döndürür.

    S3/R2 CORS kurallarının biçimi: `AllowedOrigins` (tam eşleşme ya da `*`)
    ve `AllowedMethods`. Bir origin'in bir metodu, o ikisini birlikte içeren
    tek bir kural varsa izinlidir — iki ayrı kuralın parçaları birleşmez.
    """
    missing: dict[str, list[str]] = {}
    for origin in origins:
        absent = [
            method
            for method in methods
            if not any(
                (origin in rule.get("AllowedOrigins", []) or "*" in rule.get("AllowedOrigins", []))
                and method in rule.get("AllowedMethods", [])
                for rule in rules
            )
        ]
        if absent:
            missing[origin] = absent
    return missing


def _live_check(url: str, origin: str, method: str) -> tuple[bool, str]:
    request = urllib.request.Request(url, method=method, headers={"Origin": origin})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            allow_origin = response.headers.get("Access-Control-Allow-Origin")
            status = response.status
    except urllib.error.HTTPError as error:
        return False, f"HTTP {error.code}"
    except urllib.error.URLError as error:
        return False, f"ağ hatası: {error.reason}"

    if allow_origin in (origin, "*"):
        return True, f"HTTP {status}, Access-Control-Allow-Origin: {allow_origin}"
    return False, f"HTTP {status}, Access-Control-Allow-Origin: {allow_origin or '(yok)'}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("origins", nargs="*", help="Kontrol edilecek origin'ler")
    parser.add_argument("--key", help="İmzalı URL üretilecek nesne; verilmezse backgrounds/ altındaki ilk nesne")
    args = parser.parse_args()

    origins = args.origins or [
        origin.strip() for origin in os.environ.get("R2_CORS_ORIGINS", "").split(",") if origin.strip()
    ]
    if not origins:
        print("Origin verilmedi: argüman olarak ya da R2_CORS_ORIGINS ile verin.")
        return 2

    # Ayarlar burada, main içinde yükleniyor: modül seviyesinde yüklenseydi
    # `missing_permissions` testleri de R2_* ayarlarını isterdi.
    from botocore.exceptions import ClientError

    from app.core.config import settings
    from app.services.storage import R2StorageService, _get_client

    if not (settings.r2_account_id and settings.r2_bucket_name and settings.r2_access_key_id):
        print("R2_* değişkenleri boş — backend/.env içinde R2 kimlik bilgileri yok.")
        return 2

    client = _get_client()
    bucket = settings.r2_bucket_name

    print(f"Bucket: {bucket}")
    print("1) Tanımlı CORS kuralları")
    try:
        rules = client.get_bucket_cors(Bucket=bucket).get("CORSRules", [])
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "NoSuchCORSConfiguration":
            rules = []
        else:
            raise
    if not rules:
        print("   Bucket'ta hiç CORS kuralı yok.")
    missing = missing_permissions(rules, origins)
    for origin in origins:
        status = "eksik: " + ", ".join(missing[origin]) if origin in missing else "GET+HEAD izinli"
        print(f"   {origin}: {status}")

    print("2) İmzalı URL ile canlı istek")
    key = args.key
    if not key:
        listing = client.list_objects_v2(Bucket=bucket, Prefix="backgrounds/", MaxKeys=1)
        contents = listing.get("Contents", [])
        if not contents:
            print("   backgrounds/ altında nesne yok; canlı kontrol için --key verin.")
            return 1
        key = contents[0]["Key"]
    url = R2StorageService(bucket_name=bucket).generate_presigned_url(key)
    print(f"   Nesne: {key}")

    live_failed = False
    for origin in origins:
        for method in REQUIRED_METHODS:
            ok, detail = _live_check(url, origin, method)
            live_failed |= not ok
            print(f"   {'GEÇTİ' if ok else 'KALDI'} {method} {origin} — {detail}")

    return 1 if missing or live_failed else 0


if __name__ == "__main__":
    sys.exit(main())
