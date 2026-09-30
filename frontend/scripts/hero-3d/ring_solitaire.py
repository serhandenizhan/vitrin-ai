"""
Sahne 1: tek tas yuzuk (6 tirnakli, 1 ct yuvarlak brilliant, sari altin).

Calistirma (repo kokunden):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P frontend/scripts/hero-3d/ring_solitaire.py -- [--preview]

Uretilenler: frontend/public/hero/ring-solitaire.glb (yayinlanan) ve
$HERO_SOURCE_DIR/renders/ring-solitaire.png (el fotografi icin referans).
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import jewelry_lib as jl  # noqa: E402

INNER_RADIUS = 8.5  # ic cap 17 mm (TR 13-14 numara)
GIRDLE_RADIUS = 3.25  # ~6.5 mm, yaklasik 1 ct
PRONGS = 6


def taper(top, bottom, power=2.0):
    """Tepede (theta=0) `top`, altta `bottom`; yuvaya dogru incelen govde."""
    return lambda theta: bottom + (top - bottom) * ((1 + math.cos(theta)) / 2) ** power


def build():
    jl.reset_scene()
    gold = jl.gold_material("yellow")

    band = jl.ring_band("metal_band", INNER_RADIUS, taper(0.62, 0.85), taper(0.78, 1.05))
    jl.assign(band, gold)
    band_top = INNER_RADIUS + 2 * 0.62

    stone = jl.round_brilliant("diamond", GIRDLE_RADIUS)
    culet_clearance = 0.9
    stone_z = band_top + culet_clearance - stone["culet"]
    stone.location = (0.0, 0.0, stone_z)
    jl.assign(stone, jl.diamond_material())

    girdle_top = stone_z + 0.03 * GIRDLE_RADIUS
    bm = jl.new_bmesh()
    for k in range(PRONGS):
        a = math.radians(360 / PRONGS * k + 30)
        c, s = math.cos(a), math.sin(a)

        def at(r, z):
            return (r * c, r * s, z)

        # Tirnak: govdenin tepesinden cikip tasin rondizine yaslanir,
        # ucu tacin kenarina doner.
        jl.tube(
            bm,
            [
                at(1.3, band_top - 0.5),
                at(2.2, band_top + 1.2),
                at(GIRDLE_RADIUS + 0.28, stone_z - 0.4),
                at(GIRDLE_RADIUS + 0.2, girdle_top + 0.3),
                at(GIRDLE_RADIUS - 0.18, girdle_top + 0.62),
            ],
            radius_start=0.42,
            radius_end=0.3,
        )
    # Sepet: tasin altini tasiyan iki ince halka.
    jl.torus(bm, (0, 0, stone_z - 1.35), GIRDLE_RADIUS * 0.72, 0.22)
    jl.torus(bm, (0, 0, band_top + 0.75), 1.9, 0.2)
    head = jl.link_bmesh("metal_head", bm, smooth=True)
    jl.assign(head, gold)
    # Kadraj merkezi: govdenin en alti ile tasin tablasi arasi.
    bottom = -(INNER_RADIUS + 2 * 0.85)
    top = stone_z + stone["crown_top"]
    return (bottom + top) / 2


if __name__ == "__main__":
    center_z = build()
    jl.export_and_render(
        "ring-solitaire",
        target=(0.0, 0.0, center_z),
        distance=110,
        azimuth=28,
        elevation=16,
        preview="--preview" in jl.script_args(),
    )
