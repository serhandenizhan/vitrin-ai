"""
Sahne: alyans cifti (sari altin).

Genis duz bir erkek alyansi (5 mm) ve ustunde kanal icinde yedi kucuk
pirlanta olan ince bir kadin alyansi (3 mm). Poz sahne 4 fotografindan:
ayni eksende yan yana, cift ~50 derece donuk.

Calistirma (repo kokunden):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
      -P frontend/scripts/hero-3d/wedding_bands.py -- [--preview]
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mathutils import Matrix  # noqa: E402

import jewelry_lib as jl  # noqa: E402

WIDE_INNER = 9.6
NARROW_INNER = 8.4
PAVE_STONES = 7
PAVE_STEP = 9.0  # derece


def build():
    jl.reset_scene()
    gold = jl.gold_material("yellow")
    diamond = jl.diamond_material()

    wide = jl.ring_band("metal_wide", WIDE_INNER, lambda t: 0.95, lambda t: 2.5, exponent=3.2)
    jl.assign(wide, gold)

    narrow_parts = []
    narrow = jl.ring_band("metal_narrow", NARROW_INNER, lambda t: 0.8, lambda t: 1.5, exponent=3.0)
    jl.assign(narrow, gold)
    narrow_parts.append(narrow)
    outer = NARROW_INNER + 2 * 0.8
    for k in range(PAVE_STONES):
        angle = (k - (PAVE_STONES - 1) / 2) * PAVE_STEP
        stone = jl.round_brilliant("diamond", 0.95)
        # Kanal: tasin tablasi gövdenin yuzeyiyle ayni hizada, kalani gomulu.
        lift = outer - stone["crown_top"] + 0.6
        stone.matrix_world = Matrix.Rotation(math.radians(angle), 4, "Y") @ Matrix.Translation((0, 0, lift))
        jl.assign(stone, diamond)
        narrow_parts.append(stone)

    # Sahne 4 fotografindaki gibi: iki alyans AYNI eksende yan yana (parmakta
    # dururken oldugu gibi), kadin alyansi eksen boyunca yaninda. Butun cift
    # dikey eksende ~50 derece donuk: onden bakinca delikler elips gorunur.
    gap = 2.5 + 1.5 + 0.3
    for obj in narrow_parts:
        obj.matrix_world = Matrix.Translation((0, gap, 0)) @ obj.matrix_world
    turn = Matrix.Rotation(math.radians(-50), 4, "Z")
    for obj in (wide, *narrow_parts):
        obj.matrix_world = turn @ obj.matrix_world

if __name__ == "__main__":
    build()
    jl.export_and_render(
        "wedding-bands",
        azimuth=18,
        elevation=14,
        preview="--preview" in jl.script_args(),
    )
