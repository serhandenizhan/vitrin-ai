"""
Demo (mock) modu icin ornek bir kesim gorseli uretir.

Neden var: `USE_MOCK_BACKEND=true` iken vekil katmani backend'i hic cagirmadan
sabit bir kesim donduruyor (bkz. src/app/api/remove-background/route.ts).
O kesimin depoda bulunmasi gerekiyor ama ikili (binary) bir dosyayi kaynagi
olmadan commit etmek, ileride "bu nereden geldi, nasil degistirilir" sorusunu
cevapsiz birakir — bu yuzden gorsel bu betikle uretiliyor.

Bu gercek bir BiRefNet ciktisi DEGILDIR; yalnizca seffaf arka planli, kenari
yumusak gecisli bir yer tutucu. Arayuz onu her zaman "Demo modu" olarak
isaretliyor.

Ek bagimlilik gerektirmez (PNG yazici dosyanin icinde):
    python scripts/generate-mock-cutout.py
"""

import math
import os
import struct
import zlib

SIZE = 900

OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public",
    "mock",
    "sample-cutout.png",
)

# Yuzugun olculeri (tuval genisligine oran olarak).
RING_CENTER_Y = 0.56
RING_RADIUS = 0.30
RING_THICKNESS = 0.072

# Tas (gem) olculeri.
GEM_HALF_WIDTH = 0.085
GEM_HEIGHT = 0.115

# Isik yonu — sol ustten, hafifce one dogru.
LIGHT = (-0.52, -0.62, 0.59)


def clamp(value, low=0.0, high=1.0):
    return low if value < low else high if value > high else value


def smoothstep(edge0, edge1, x):
    """Kenar yumusatmasi icin; sert 0/1 gecisi 'testere disi' kenar birakiyor."""
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def write_rgba_png(path, width, height, pixels):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # satir filtresi yok; sikistirmayi zlib yapiyor
        raw.extend(pixels[y * stride : (y + 1) * stride])

    def chunk(tag, payload):
        body = tag + payload
        return (
            struct.pack(">I", len(payload))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    # colortype 6 = RGBA
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(chunk(b"IHDR", header))
        handle.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        handle.write(chunk(b"IEND", b""))


def shade_metal(normal):
    """Altin bir yuzey icin basit diffuse + specular."""
    diffuse = max(0.0, sum(n * l for n, l in zip(normal, LIGHT)))
    specular = diffuse**26
    level = 0.30 + 0.74 * diffuse
    red = clamp(0.83 * level + specular * 0.85, 0.0, 1.0)
    green = clamp(0.66 * level + specular * 0.85, 0.0, 1.0)
    blue = clamp(0.32 * level + specular * 0.80, 0.0, 1.0)
    return red * 255.0, green * 255.0, blue * 255.0


def main():
    pixels = bytearray(SIZE * SIZE * 4)

    center_x = SIZE * 0.5
    center_y = SIZE * RING_CENTER_Y
    radius = SIZE * RING_RADIUS
    thickness = SIZE * RING_THICKNESS

    gem_center_x = center_x
    gem_base_y = center_y - radius - thickness * 0.35
    gem_half_width = SIZE * GEM_HALF_WIDTH
    gem_height = SIZE * GEM_HEIGHT

    # Kenar yumusatmasi bir pikselden biraz genis: kesimlerde kenar her zaman
    # yari seffaf bir bant tasir, sert kenar "yapistirilmis" duruyor.
    feather = 1.6

    for y in range(SIZE):
        for x in range(SIZE):
            index = (y * SIZE + x) * 4
            px = x + 0.5
            py = y + 0.5

            red = green = blue = 0.0
            alpha = 0.0

            # --- Yuzuk govdesi (halka) ---
            dx = px - center_x
            dy = py - center_y
            distance = math.hypot(dx, dy)
            offset = abs(distance - radius)
            if offset < thickness + feather and distance > 1e-6:
                coverage = 1.0 - smoothstep(
                    thickness - feather, thickness + feather, offset
                )
                if coverage > 0.0:
                    # Kesit boyunca konum: -1 ic kenar, +1 dis kenar.
                    across = clamp((distance - radius) / thickness, -1.0, 1.0)
                    depth = math.sqrt(max(0.0, 1.0 - across * across))
                    normal = (
                        across * dx / distance,
                        across * dy / distance,
                        depth,
                    )
                    red, green, blue = shade_metal(normal)
                    alpha = coverage

            # --- Tas (ust kisimda elmas silueti) ---
            if py <= gem_base_y and py >= gem_base_y - gem_height:
                # Ustte sivri, altta genis bir dortgen kesit.
                span = gem_half_width * (1.0 - (gem_base_y - py) / gem_height)
                gem_dx = abs(px - gem_center_x)
                coverage = 1.0 - smoothstep(span - feather, span + feather, gem_dx)
                if coverage > 0.0:
                    # Fasetalar: merkeze yaklastikca parlayan dikey bantlar.
                    facet = 0.62 + 0.38 * math.cos(
                        (gem_dx / max(span, 1e-6)) * math.pi * 1.6
                    )
                    height_factor = 0.72 + 0.28 * ((py - (gem_base_y - gem_height)) / gem_height)
                    level = clamp(facet * height_factor)
                    gem_r = 208.0 + 47.0 * level
                    gem_g = 226.0 + 29.0 * level
                    gem_b = 240.0 + 15.0 * level
                    # Tas, yuzugun uzerine yaziliyor (ust katman).
                    red = red * (1.0 - coverage) + gem_r * coverage
                    green = green * (1.0 - coverage) + gem_g * coverage
                    blue = blue * (1.0 - coverage) + gem_b * coverage
                    alpha = max(alpha, coverage)

            if alpha <= 0.0:
                continue

            pixels[index] = int(clamp(red, 0.0, 255.0))
            pixels[index + 1] = int(clamp(green, 0.0, 255.0))
            pixels[index + 2] = int(clamp(blue, 0.0, 255.0))
            pixels[index + 3] = int(clamp(alpha, 0.0, 1.0) * 255.0)

    write_rgba_png(OUT_PATH, SIZE, SIZE, pixels)
    print(
        "yazildi: %s (%dx%d, %.1f KB)"
        % (OUT_PATH, SIZE, SIZE, os.path.getsize(OUT_PATH) / 1024.0)
    )


if __name__ == "__main__":
    main()
