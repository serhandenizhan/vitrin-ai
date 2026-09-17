"""Zemin görsellerinin depolama biçimi ve küçük önizlemeleri.

NEDEN ÖNİZLEME: stüdyodaki zemin seçici her zemini küçük bir yuvarlak olarak
gösteriyor. Önizleme olmadan tarayıcı her yuvarlak için TAM BOYUTLU görseli
(A4 300 dpi, zemin başına 2-19 MB) indiriyordu; 90'dan fazla zeminlik bir
kütüphanede tek bir kategori sekmesi yüzlerce MB demek, telefonda seçici
donuyordu. Önizleme ~480 px ve birkaç on KB.

VERİTABANI DEĞİŞMİYOR (Kaan'ın kararı, 17.09.2026): önizlemenin R2 anahtarı
zeminin kendi anahtarından türetiliyor (`backgrounds/<id>.jpg` ->
`backgrounds/thumbs/<id>.jpg`). Yeni bir sütun ya da migration yok.
"""

import io
from pathlib import PurePosixPath

from PIL import Image, ImageOps

#: Önizlemenin uzun kenarı (px). Seçicideki yuvarlak en fazla ~80 CSS px;
#: yüksek yoğunluklu ekranlarda bile net kalsın diye birkaç kat pay var.
THUMBNAIL_MAX_EDGE = 480
THUMBNAIL_JPEG_QUALITY = 82

#: Tam boyutlu zeminin kaydedilme kalitesi. Çözünürlük DEĞİŞMİYOR; yalnızca
#: gereğinden yüksek kaliteyle kaydedilmiş dosyalar (ör. 19 MB'lık JPEG'ler)
#: gözle fark edilmeyecek bir kayıpla küçülüyor ve editör daha hızlı açılıyor.
BACKGROUND_JPEG_QUALITY = 92


def thumbnail_key(r2_key: str) -> str:
    """`backgrounds/<id>.<uzantı>` -> `backgrounds/thumbs/<id>.jpg`."""
    path = PurePosixPath(r2_key)
    return str(path.parent / "thumbs" / f"{path.stem}.jpg")


def _open_rgb(content: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(content))
    # Telefon fotoğraflarındaki döndürme bilgisi uygulanmazsa görsel yan durur.
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA", "P"):
        # JPEG'de saydamlık yok; saydam alanlar siyaha dönmesin diye beyaza
        # düzleştiriliyor (CMYK dönüşümüyle aynı kural).
        rgba = image.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.getchannel("A"))
        return flat
    return image.convert("RGB")


def make_thumbnail(content: bytes, max_edge: int = THUMBNAIL_MAX_EDGE) -> bytes:
    """Oranı koruyarak küçültülmüş JPEG önizleme döndürür (büyütmez)."""
    image = _open_rgb(content)
    image.thumbnail((max_edge, max_edge), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=THUMBNAIL_JPEG_QUALITY, optimize=True, progressive=True)
    return buffer.getvalue()


def encode_background(content: bytes) -> bytes:
    """Zemini aynı çözünürlükte JPEG olarak yeniden kaydeder."""
    image = _open_rgb(content)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=BACKGROUND_JPEG_QUALITY, optimize=True, progressive=True)
    return buffer.getvalue()
