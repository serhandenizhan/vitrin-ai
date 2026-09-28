"""
Acilis vitrini icin takilarin ortak geometri ve render yardimcilari.

Blender'in icinde (bpy) calisir; tek basina calistirilmaz. Her takinin kendi
betigi bu modulu ice aktarir, geometriyi kurar, `export_and_render` cagirir.

Birim: 1 = 1 mm. glTF metre bekler ama sahnede model sinir kutusuna gore
olceklendigi icin mutlak birim onemli degil; mm, takinin gercek olculerini
(ic cap 17 mm, 1 ct tas ~6.5 mm) dogrudan yazabilmek icin secildi.

Yollar bu dosyanin konumundan turetilir, ortam degiskeniyle degistirilebilir
(kok CLAUDE.md ders 11):
  HERO_SOURCE_DIR  ham render ve HDRI klasoru (varsayilan ~/vitrin-ai-hero-kaynak;
                   DEPO DISINDA — ara dosyalar public/'e girmez, SECURITY.md 7)
  HERO_PUBLIC_DIR  yayinlanan .glb klasoru (varsayilan frontend/public/hero)
"""

import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

FRONTEND = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(os.environ.get("HERO_SOURCE_DIR", Path.home() / "vitrin-ai-hero-kaynak"))
PUBLIC_DIR = Path(os.environ.get("HERO_PUBLIC_DIR", FRONTEND / "public" / "hero"))
# Poly Haven "Studio Small 09", CC0 — `HDRI` degiskeniyle baska bir dosya verilebilir.
HDRI = Path(os.environ.get("HERO_HDRI", SOURCE_DIR / "hdri" / "studio_small_09_2k.hdr"))


def script_args():
    """`blender -b -P betik.py -- --preview` gibi, `--`den sonraki argumanlar."""
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _link(name, bm, smooth):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _superellipse(n_points, exponent):
    """Birim yuvarlatilmis dikdortgen kesit (konfor kesimli yuzuk govdesi)."""
    pts = []
    for i in range(n_points):
        phi = 2 * math.pi * i / n_points
        c, s = math.cos(phi), math.sin(phi)
        pts.append(
            (
                math.copysign(abs(c) ** (2 / exponent), c),
                math.copysign(abs(s) ** (2 / exponent), s),
            )
        )
    return pts


def ring_band(name, inner_radius, half_thickness, half_width, segments=192, profile=32, exponent=2.6):
    """
    Halka govdesi: XZ duzleminde bir cember, parmak Y ekseni boyunca gecer,
    tas yuvasi +Z tepesinde. `half_thickness(theta)` ve `half_width(theta)`
    tepeden (theta=0) olculen aciya gore kesiti verir — tepeye dogru incelen
    govde boyle kuruluyor.
    """
    bm = bmesh.new()
    unit = _superellipse(profile, exponent)
    rings = []
    for i in range(segments):
        theta = 2 * math.pi * i / segments
        t, w = half_thickness(theta), half_width(theta)
        radius = inner_radius + t
        radial = Vector((math.sin(theta), 0.0, math.cos(theta)))
        axial = Vector((0.0, 1.0, 0.0))
        rings.append([bm.verts.new(radial * (radius + t * x) + axial * (w * y)) for x, y in unit])
    for i in range(segments):
        a, b = rings[i], rings[(i + 1) % segments]
        for j in range(profile):
            k = (j + 1) % profile
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm, smooth=True)


def round_brilliant(name, girdle_radius, crown_angle=34.5, pavilion_angle=40.75, table=0.56, girdle=0.03, lower_half=0.77):
    """
    Yuvarlak brilliant kesim tas (57 faset). Kose noktalari kesim oranlarindan
    hesaplanip dis bukey zarf aliniyor; yuzeyler duz golgelenir (faset gorunumu).
    Tasin merkezi rondiz (girdle) ortasi, z=0. Tac yukari (+Z).
    """
    rg = girdle_radius
    rt = table * rg
    tan_c = math.tan(math.radians(crown_angle))
    tan_p = math.tan(math.radians(pavilion_angle))
    g_top, g_bot = girdle * rg, -girdle * rg

    def crown_z(r):
        return g_top + (rg - r) * tan_c

    def pav_z(r):
        return g_bot - (rg - r) * tan_p

    pts = []
    for k in range(8):
        a = math.radians(45 * k)
        pts.append((rt * math.cos(a), rt * math.sin(a), crown_z(rt)))  # tabla
        a2 = a + math.radians(22.5)
        rs = rt + 0.5 * (rg - rt)
        pts.append((rs * math.cos(a2), rs * math.sin(a2), crown_z(rs) + 0.02 * rg))  # yildiz ucu
        rl = rg * (1 - lower_half)
        pts.append((rl * math.cos(a2), rl * math.sin(a2), pav_z(rl) - 0.015 * rg))  # alt yari faset ucu
    for k in range(16):
        a = math.radians(22.5 * k)
        pts.append((rg * math.cos(a), rg * math.sin(a), g_top))
        pts.append((rg * math.cos(a), rg * math.sin(a), g_bot))
    pts.append((0.0, 0.0, pav_z(0.0)))  # kulet

    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(bm, input=verts)
    # Ayni duzlemdeki ucgenleri birlestir: gercek fasetler tek yuzey olsun.
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _link(name, bm, smooth=False)
    obj["crown_top"] = crown_z(rt)
    obj["culet"] = pav_z(0.0)
    return obj


def _catmull_rom(points, samples_per_span=10):
    pts = [Vector(p) for p in points]
    ext = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(samples_per_span):
            t = s / samples_per_span
            out.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
                )
            )
    out.append(pts[-1])
    return out


def tube(bm, points, radius_start, radius_end, sides=16, smooth_samples=10, cap_sphere=True):
    """Yumusak bir egri boyunca incelen boru (tirnak, kolye halkasi). Ucu yuvarlak."""
    path = _catmull_rom(points, smooth_samples)
    n = len(path)
    tangent = (path[1] - path[0]).normalized()
    normal = tangent.orthogonal().normalized()
    rings = []
    for i, p in enumerate(path):
        if 0 < i < n - 1:
            new_t = (path[i + 1] - path[i - 1]).normalized()
        else:
            new_t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        # Paralel tasima: boru kivrilirken kesit burulmasin.
        normal = (normal - new_t * normal.dot(new_t)).normalized()
        tangent = new_t
        binormal = tangent.cross(normal)
        r = radius_start + (radius_end - radius_start) * (i / (n - 1))
        rings.append(
            [
                bm.verts.new(p + (normal * math.cos(2 * math.pi * j / sides) + binormal * math.sin(2 * math.pi * j / sides)) * r)
                for j in range(sides)
            ]
        )
    for i in range(n - 1):
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
    bm.faces.new(list(reversed(rings[0])))
    if cap_sphere:
        bmesh.ops.create_uvsphere(
            bm,
            u_segments=sides,
            v_segments=sides // 2 + 2,
            radius=radius_end * 1.08,
            matrix=_translation(path[-1]),
        )
    else:
        bm.faces.new(rings[-1])


def torus(bm, center, major, minor, axis="Z", segments=96, sides=16):
    """Duz halka (sepet halkasi, kolye bagi). `axis` halkanin normalidir."""
    from mathutils import Matrix

    mat = _translation(Vector(center))
    if axis == "Y":
        mat = mat @ Matrix.Rotation(math.radians(90), 4, "X")
    elif axis == "X":
        mat = mat @ Matrix.Rotation(math.radians(90), 4, "Y")
    geom = bmesh.ops.create_circle(bm, cap_ends=False, segments=segments, radius=major, matrix=mat)
    path = [v.co.copy() for v in geom["verts"]]
    for v in geom["verts"]:
        bm.verts.remove(v)
    # Kapali egri: boruyu ilk noktaya donerek kapat.
    closed = path + [path[0], path[1]]
    tube(bm, closed, minor, minor, sides=sides, smooth_samples=2, cap_sphere=False)


def _translation(vec):
    from mathutils import Matrix

    return Matrix.Translation(Vector(vec))


def new_bmesh():
    return bmesh.new()


def link_bmesh(name, bm, smooth=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm, smooth)


# --- Malzemeler -----------------------------------------------------------

def _principled(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree.nodes["Principled BSDF"]


def _set(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def gold_material(tone="yellow"):
    # Dogrusal (linear) renkler. "yellow", sahne 1'in el fotografindaki
    # yuzugun olculen tonuna esitlendi (orta tonlar ton acisi 27 derece; eski
    # deger 40 derecede, fotograftan belirgin sari duruyordu ve fotograftan
    # 3D modele geciste renk sicriyordu). sRGB karsiligi ~#efbb82.
    colors = {
        "yellow": (0.86, 0.5, 0.22, 1.0),
        "rose": (0.98, 0.58, 0.45, 1.0),
        "white": (0.86, 0.86, 0.88, 1.0),
    }
    mat, bsdf = _principled(f"metal_{tone}")
    _set(bsdf, "Base Color", colors[tone])
    _set(bsdf, "Metallic", 1.0)
    _set(bsdf, "Roughness", 0.13)
    return mat


def diamond_material():
    mat, bsdf = _principled("diamond")
    _set(bsdf, "Base Color", (1.0, 1.0, 1.0, 1.0))
    _set(bsdf, "Roughness", 0.0)
    _set(bsdf, "IOR", 2.417)
    _set(bsdf, "Transmission Weight", 1.0)
    _set(bsdf, "Dispersion", 0.35)
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# --- Render ve disa aktarma ----------------------------------------------

def _setup_world(strength=1.3):
    world = bpy.data.worlds.new("studio")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(HDRI))
    bg = nodes["Background"]
    bg.inputs["Strength"].default_value = strength
    links.new(env.outputs["Color"], bg.inputs["Color"])


def _setup_camera(target, distance, azimuth, elevation, lens=100):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    az, el = math.radians(azimuth), math.radians(elevation)
    t = Vector(target)
    cam.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    direction = t - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def _setup_cycles(samples, size):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for dev in prefs.devices:
            dev.use = True
        scene.cycles.device = "GPU"
    except (TypeError, AttributeError):
        scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    # Tas icinde isik cok kez kirilir; varsayilan sekme sayisi tasi karartir.
    scene.cycles.max_bounces = 32
    scene.cycles.transmission_bounces = 24
    scene.cycles.glossy_bounces = 16
    scene.render.film_transparent = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"


def export_and_render(slug, target, distance, azimuth=30, elevation=20, samples=256, size=1200, preview=False):
    """`.glb`'yi public/hero'ya, render'i depo disindaki kaynak klasorune yazar."""
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    (SOURCE_DIR / "renders").mkdir(parents=True, exist_ok=True)
    glb = PUBLIC_DIR / f"{slug}.glb"
    # Meshopt: cozucusu three.js'in kendi paketinde (dis bir wasm/CDN istegi yok;
    # Draco'nun cozucusu varsayilan olarak gstatic'ten iner).
    bpy.ops.export_scene.gltf(
        filepath=str(glb),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_meshopt_compression_enable=True,
    )
    print(f"glb: {glb} ({glb.stat().st_size / 1024:.0f} KB)")

    _setup_world()
    _setup_camera(target, distance, azimuth, elevation)
    _setup_cycles(64 if preview else samples, 700 if preview else size)
    out = SOURCE_DIR / "renders" / f"{slug}{'-preview' if preview else ''}.png"
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print(f"render: {out}")
