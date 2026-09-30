"""
Sahne: kadife kutuda uc tasli yuzuk.

Bordo kadife kutu (koyu zeminde siyah kutu kaybolurdu), fildisi ic yastik,
arkadan menteseli ~105 derece acik kapak. Yuzugun alt yarisi yastigin
yarigina gomulu; halka duzlemi yarikla AYNI (kutulardaki gibi: onden
bakinca halkanin ici gorunur), taslar yukarida.

Calistirma (repo kokunden):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
      -P frontend/scripts/hero-3d/box_ring.py -- [--preview]
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import jewelry_lib as jl  # noqa: E402

BOX = 34.0
BASE_H = 19.0
LID_H = 12.0
INNER_RADIUS = 8.5
BAND_TOP = 0.6  # yarim kalinlik, tepede
CENTER_STONE = 2.9
SIDE_STONE = 1.9
SIDE_ANGLE = 24.0

BORDO = (0.11, 0.008, 0.018, 1.0)
IVORY = (0.55, 0.47, 0.37, 1.0)


def taper(top, bottom, power=2.0):
    return lambda theta: bottom + (top - bottom) * ((1 + math.cos(theta)) / 2) ** power


def build_ring(gold, diamond):
    """Yuzugu standart duzende kurar (halka XZ'de, parmak Y boyunca)."""
    objects = []
    band = jl.ring_band("metal_band", INNER_RADIUS, taper(BAND_TOP, 0.8), taper(0.9, 1.0))
    jl.assign(band, gold)
    objects.append(band)
    outer = INNER_RADIUS + 2 * BAND_TOP

    bm = jl.new_bmesh()
    for angle, radius in ((0.0, CENTER_STONE), (-SIDE_ANGLE, SIDE_STONE), (SIDE_ANGLE, SIDE_STONE)):
        stone = jl.round_brilliant("diamond", radius)
        lift = outer + 0.7 - stone["culet"]
        matrix = Matrix.Rotation(math.radians(angle), 4, "Y") @ Matrix.Translation((0, 0, lift))
        stone.matrix_world = matrix
        jl.assign(stone, diamond)
        objects.append(stone)
        jl.prong_head(bm, matrix, radius, seat_z=stone["culet"] - 0.2, base_radius=radius * 0.35, prongs=4)
    head = jl.link_bmesh("metal_head", bm, smooth=True)
    jl.assign(head, gold)
    objects.append(head)
    return objects


def build():
    jl.reset_scene()
    gold = jl.gold_material("yellow")
    diamond = jl.diamond_material()
    velvet = jl.velvet_material("velvet_bordo", BORDO)
    satin = jl.velvet_material("velvet_ivory", IVORY)

    base = jl.rounded_box("box_base", (BOX, BOX, BASE_H), 1.6)
    base.location = (0, 0, BASE_H / 2)
    jl.assign(base, velvet)

    cushion = jl.rounded_box("box_cushion", (BOX - 5, BOX - 5, 6), 2.6)
    cushion.location = (0, 0, BASE_H - 2.2)
    jl.assign(cushion, satin)
    cushion_top = BASE_H - 2.2 + 3

    slit = jl.rounded_box("box_slit", (BOX - 10, 1.1, 0.5), 0.2, segments=2)
    slit.location = (0, 0, cushion_top + 0.05)
    jl.assign(slit, jl.velvet_material("velvet_shadow", (0.05, 0.04, 0.035, 1.0)))

    # Kapak: menteseye gore kurulur (mentese arka ust kenarda), sonra acilir.
    hinge = Matrix.Translation((0, BOX / 2, BASE_H)) @ Matrix.Rotation(math.radians(-105), 4, "X")
    lid = jl.rounded_box("box_lid", (BOX, BOX, LID_H), 1.6)
    lid.matrix_world = hinge @ Matrix.Translation((0, -BOX / 2, LID_H / 2))
    jl.assign(lid, velvet)
    padding = jl.rounded_box("box_lid_padding", (BOX - 5, BOX - 5, 1.6), 0.7)
    padding.matrix_world = hinge @ Matrix.Translation((0, -BOX / 2, -0.4))
    jl.assign(padding, satin)

    # Yuzuk: halka duzlemi yarikla ayni (XZ), alt yarisi yarikta.
    place = Matrix.Translation((0, 0, cushion_top + 3.0))
    for obj in build_ring(gold, diamond):
        obj.matrix_world = place @ obj.matrix_world


if __name__ == "__main__":
    build()
    jl.export_and_render(
        "box-ring",
        azimuth=24,
        elevation=24,
        preview="--preview" in jl.script_args(),
    )
