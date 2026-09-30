"""
Sahne: damla uclu kolye (armut kesim tas, ince cerceve, kablo zincir, sari altin).

Zincirin iki kolu tasin askisindan yukari cikar; poz sahne 2 fotografindan
olculdu (yakinlasmada 3D model fotograftaki kolyenin yerine oturur). Tasin yuzu kameraya (-Y) bakar, sivri ucu yukarida.

Calistirma (repo kokunden):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
      -P frontend/scripts/hero-3d/necklace_drop.py -- [--preview]
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mathutils import Matrix  # noqa: E402

import jewelry_lib as jl  # noqa: E402

STONE_LENGTH = 11.0
STONE_WIDTH = 7.8


def build():
    jl.reset_scene()
    gold = jl.gold_material("yellow")
    upright = Matrix.Rotation(math.radians(90), 4, "X")  # yuz +Z -> -Y, uc +Y -> +Z

    outline = jl.pear_outline(STONE_LENGTH, STONE_WIDTH)
    stone = jl.outline_stone("diamond", outline, crown_height=1.5, pavilion_depth=3.6)
    stone.matrix_world = upright
    jl.assign(stone, jl.diamond_material())

    bm = jl.new_bmesh()
    # Cerceve: tasin rondizini saran ince metal (kapali egri).
    ring = [(x * 1.07, y * 1.07, 0.0) for x, y in outline]
    jl.tube(bm, ring + ring[:2], 0.38, 0.38, sides=10, smooth_samples=3, cap_sphere=False)
    frame = jl.link_bmesh("metal_frame", bm, smooth=True)
    frame.matrix_world = upright
    jl.assign(frame, gold)

    # Aski: tasin ucunun ustunde, zincire dik duran kucuk halka.
    tip = STONE_LENGTH / 2 * 1.07 + 0.4
    bm = jl.new_bmesh()
    jl.torus(bm, (0, 0, tip + 1.5), 1.35, 0.32, axis="X", segments=48, sides=10)
    bail = jl.link_bmesh("metal_bail", bm, smooth=True)
    jl.assign(bail, gold)

    # Zincir: sahne 2 fotografindaki poz (fotograftan olculdu, piksel -> mm):
    # sol kol isaret parmagina dik cikar, sag kol basparmagin ustunden asarak
    # yukari kivrilir. Iki kol TEPEDE BIRLESIR: fotografta uclar parmaklarin
    # arasinda kayboluyor, acik birakilinca yakinlasmada kolye "kirpilmis"
    # gorunuyordu (Serhan). Fazladan tepe, ilk karede parmaklarin arkasinda
    # kalir (el katmani modelin onunde cizilir).
    bottom = tip + 2.6
    strands = [
        [(0.0, 0.0), (-4.9, 35.3), (-6.4, 63.3), (-3.4, 73.5), (1.0, 77.0)],
        [(0.0, 0.0), (11.0, 23.9), (23.9, 53.4), (16.3, 68.6), (7.2, 74.5), (1.0, 77.0)],
    ]
    bm = jl.new_bmesh()
    for strand in strands:
        path = [(x, 0.4 * (k % 2), bottom + z) for k, (x, z) in enumerate(strand)]
        jl.chain_links(bm, path, pitch=1.3, link_length=2.0, link_width=1.35, wire=0.26)
    chain = jl.link_bmesh("metal_chain", bm, smooth=True)
    jl.assign(chain, gold)

if __name__ == "__main__":
    build()
    jl.export_and_render(
        "necklace-drop",
        azimuth=12,
        elevation=6,
        preview="--preview" in jl.script_args(),
    )
