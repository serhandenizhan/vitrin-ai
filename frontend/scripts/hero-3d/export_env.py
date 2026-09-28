"""
3D yakinlasmanin isik ortami: Poly Haven "Studio Small 09" (CC0) HDRI'sinin
tarayici icin kucultulmus kopyasi -> frontend/public/hero/studio.hdr.

Metal ve tas yansimalari icin 512x256 yeterli (tas fasetleri yansimayi zaten
parcaliyor); 2K kaynagin 6 MB'ina karsi ~300 KB. Yalniz yakinlasmada iner.

Calistirma:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P frontend/scripts/hero-3d/export_env.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import jewelry_lib as jl  # noqa: E402

WIDTH, HEIGHT = 512, 256

image = bpy.data.images.load(str(jl.HDRI))
image.scale(WIDTH, HEIGHT)
jl.PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
out = jl.PUBLIC_DIR / "studio.hdr"
image.filepath_raw = str(out)
image.file_format = "HDR"
image.save()
print(f"env: {out} ({out.stat().st_size / 1024:.0f} KB)")
