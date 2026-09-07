"""
Faz 1 manuel doğrulama script'i — gerçek bir mücevher fotoğrafıyla BiRefNet
segmentasyonunu çalıştırır. Bu bir test dosyası değil (TDD kapsamı dışı),
tek seferlik/manuel bir sağlık kontrolüdür (bkz. ROADMAP.md Faz 1).

Kullanım: .venv/bin/python scripts/manual_model_check.py <girdi_dosyası> <çıktı_png>
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.background_removal import BackgroundRemovalService
from app.validation.upload import validate_upload  # pillow-heif kaydını da tetikler


def main() -> None:
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    content = input_path.read_bytes()
    print(f"Girdi: {input_path.name} ({len(content) / 1024 / 1024:.2f} MB)")

    service = BackgroundRemovalService(model_name="birefnet-general")

    start = time.monotonic()
    result = service.remove(content)
    elapsed = time.monotonic() - start

    output_path.write_bytes(result)
    print(f"Çıktı: {output_path} ({len(result) / 1024 / 1024:.2f} MB)")
    print(f"Süre: {elapsed:.1f}sn")


if __name__ == "__main__":
    main()
