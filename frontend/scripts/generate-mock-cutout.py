"""
Demo (mock) modu ve acilis bolumu icin ornek gorselleri uretir.

Iki dosya cikariyor:

  public/mock/sample-cutout.png   seffaf arka planli kesim ("sonra")
  public/mock/sample-photo.png    ayni urun, dokulu bir yuzeyin uzerinde ("once")

Neden var: `USE_MOCK_BACKEND=true` iken vekil katmani backend'i hic cagirmadan
sabit bir kesim donduruyor (bkz. src/app/api/remove-background/route.ts), ve
acilis bolumu urunun ne yaptigini tek bakista anlatan bir once/sonra gorseli
gosteriyor. Ikili dosyalari kaynagi olmadan commit etmek ileride "bu nereden
geldi, nasil degistirilir" sorusunu cevapsiz birakir — bu yuzden ikisi de
burada uretiliyor.

Bunlar gercek BiRefNet ciktisi DEGILDIR; yalnizca yer tutucu. Arayuz demo
sonucunu her zaman "Demo modu" olarak isaretliyor.

Ek bagimlilik gerektirmez (PNG yazici dosyanin icinde):
    python scripts/generate-mock-cutout.py
"""

import math
import os
import struct
import zlib

SIZE = 1100

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUTOUT_PATH = os.path.join(BASE_DIR, "public", "mock", "sample-cutout.png")
PHOTO_PATH = os.path.join(BASE_DIR, "public", "mock", "sample-photo.png")

# --- Yuzugun olculeri (tuval genisligine oran olarak) ---
BAND_CENTER_Y = 0.60
BAND_RADIUS = 0.275
BAND_THICKNESS = 0.062

# --- Tas ---
GEM_RADIUS = 0.105
GEM_SQUASH = 0.78          # hafif ustten bakis
GEM_FACETS = 16

# Isik yonu (sol ust, one dogru).
LIGHT = (-0.50, -0.63, 0.59)

# Kenar yumusatmasi bir pikselden genis: gercek kesimlerin kenari her zaman
# yari seffaf bir bant tasir, sert kenar "yapistirilmis" duruyor.
FEATHER = 1.7


def clamp(value, low=0.0, high=1.0):
    return low if value < low else high if value > high else value


def smoothstep(edge0, edge1, x):
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------------------
# PNG yazici
# --------------------------------------------------------------------------


def write_png(path, width, height, pixels, color_type):
    """color_type 6 = RGBA, 2 = RGB."""
    channels = 4 if color_type == 6 else 3
    stride = width * channels
    raw = bytearray()
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

    header = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(chunk(b"IHDR", header))
        handle.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        handle.write(chunk(b"IEND", b""))


# --------------------------------------------------------------------------
# Malzemeler
# --------------------------------------------------------------------------


def gold(normal, along):
    """Altin bant.

    Duz diffuse+specular "plastik" duruyordu. Iki sey ekliyor:
      1. Anizotropik cizgi: metalin donme yonunde uzayan parlaklik bandi.
      2. Ortam yansimasi: yukaridan acik, asagidan koyu bir gradyan — cilali
         metalin cevresini yansitmasi bu.
    """
    diffuse = max(0.0, sum(n * l for n, l in zip(normal, LIGHT)))

    # Ortam: normalin dikey bileseni yukari baktikca acilir.
    ambient = 0.30 + 0.34 * (0.5 - 0.5 * normal[1])

    # Anizotropi — bant boyunca ince parlaklik dalgalari.
    aniso = 0.5 + 0.5 * math.sin(along * 9.0)
    aniso = 0.85 + 0.15 * aniso

    spec = diffuse**34
    level = (ambient + 0.62 * diffuse) * aniso

    red = clamp(0.86 * level + spec * 0.95, 0.0, 1.0)
    green = clamp(0.68 * level + spec * 0.93, 0.0, 1.0)
    blue = clamp(0.33 * level + spec * 0.86, 0.0, 1.0)
    return red * 255.0, green * 255.0, blue * 255.0


def brilliant(dx, dy, radius):
    """Yuvarlak briyan kesim tas.

    Fasetalar merkezden disa dogru dilimlere bolunuyor; her dilim komsusundan
    farkli parlakligda — tasa "kivilcim" veren sey bu. Merkezde masa (table)
    duz ve parlak, kenarda tac fasetalari daha koyu.
    """
    r = math.hypot(dx, dy) / radius
    if r > 1.0:
        return None

    angle = math.atan2(dy, dx)
    slice_index = int((angle + math.pi) / (2 * math.pi) * GEM_FACETS)
    # Ardisik dilimler arasinda sabit ama duzensiz gorunen bir parlaklik farki.
    jitter = ((slice_index * 37) % 11) / 10.0

    if r < 0.42:
        # Masa: duz, cok parlak, hafif mavi.
        level = 0.97 + 0.03 * jitter
        tint = (0.96, 0.98, 1.0)
    else:
        # Tac fasetalari: dilimden dilime degisen parlaklik.
        #
        # Ilk denemede alt sinir cok dusuktu (0.34) ve tas gri, donuk bir
        # diske donusuyordu — parlak tas, KOYU fasetalarla degil, parlak
        # fasetalar arasindaki KONTRASTLA okunuyor. Taban yukseltildi,
        # dilimler arasi fark korundu.
        edge = (r - 0.42) / 0.58
        level = mix(1.0, 0.62, edge) * (0.82 + 0.30 * jitter)
        tint = (0.92, 0.96, 1.0)

    # Kenar cizgisi — tasin siluetini belirginlestiriyor.
    level = mix(level, 1.06, smoothstep(0.9, 1.0, r) * 0.6)

    # Kivilcim: birkac dilim digerlerinden belirgin parlak.
    if slice_index % 5 == 0 and r > 0.5:
        level *= 1.12

    return (
        clamp(level * tint[0]) * 255.0,
        clamp(level * tint[1]) * 255.0,
        clamp(level * tint[2]) * 255.0,
    )


# --------------------------------------------------------------------------
# Kesim
# --------------------------------------------------------------------------


def render_cutout():
    pixels = bytearray(SIZE * SIZE * 4)

    cx = SIZE * 0.5
    cy = SIZE * BAND_CENTER_Y
    radius = SIZE * BAND_RADIUS
    thickness = SIZE * BAND_THICKNESS

    gem_r = SIZE * GEM_RADIUS
    gem_cx = cx
    gem_cy = cy - radius - gem_r * GEM_SQUASH * 0.55

    # Tirnaklar (prong): tasi tutan dort kucuk pençe.
    prongs = []
    for k in range(4):
        a = math.pi * (0.25 + 0.5 * k)
        prongs.append(
            (gem_cx + math.cos(a) * gem_r * 0.86, gem_cy + math.sin(a) * gem_r * GEM_SQUASH * 0.86)
        )
    prong_r = gem_r * 0.20

    for y in range(SIZE):
        py = y + 0.5
        for x in range(SIZE):
            px = x + 0.5
            index = (y * SIZE + x) * 4

            red = green = blue = 0.0
            alpha = 0.0

            # --- Bant ---
            dx = px - cx
            dy = py - cy
            dist = math.hypot(dx, dy)
            offset = abs(dist - radius)
            if offset < thickness + FEATHER and dist > 1e-6:
                cover = 1.0 - smoothstep(thickness - FEATHER, thickness + FEATHER, offset)
                if cover > 0.0:
                    across = clamp((dist - radius) / thickness, -1.0, 1.0)
                    depth = math.sqrt(max(0.0, 1.0 - across * across))
                    ux, uy = dx / dist, dy / dist
                    normal = (across * ux, across * uy, depth)
                    along = math.atan2(dy, dx)
                    red, green, blue = gold(normal, along)
                    alpha = cover

            # --- Tirnaklar (tasin altinda, bandin ustunde) ---
            for (ppx, ppy) in prongs:
                pdist = math.hypot(px - ppx, py - ppy)
                pcover = 1.0 - smoothstep(prong_r - FEATHER, prong_r + FEATHER, pdist)
                if pcover <= 0.0:
                    continue
                nx = (px - ppx) / max(prong_r, 1e-6)
                ny = (py - ppy) / max(prong_r, 1e-6)
                nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
                pr, pg, pb = gold((nx, ny, nz), 0.0)
                red = mix(red, pr, pcover)
                green = mix(green, pg, pcover)
                blue = mix(blue, pb, pcover)
                alpha = max(alpha, pcover)

            # --- Tas (en ustte) ---
            gdx = px - gem_cx
            gdy = (py - gem_cy) / GEM_SQUASH
            gdist = math.hypot(gdx, gdy)
            gcover = 1.0 - smoothstep(gem_r - FEATHER, gem_r + FEATHER, gdist)
            if gcover > 0.0:
                gem = brilliant(gdx, gdy, gem_r)
                if gem is not None:
                    red = mix(red, gem[0], gcover)
                    green = mix(green, gem[1], gcover)
                    blue = mix(blue, gem[2], gcover)
                    alpha = max(alpha, gcover)

            if alpha <= 0.0:
                continue

            pixels[index] = int(clamp(red, 0.0, 255.0))
            pixels[index + 1] = int(clamp(green, 0.0, 255.0))
            pixels[index + 2] = int(clamp(blue, 0.0, 255.0))
            pixels[index + 3] = int(clamp(alpha) * 255.0)

    return pixels


# --------------------------------------------------------------------------
# "Once" fotografi: ayni urun dokulu bir yuzeyin uzerinde
# --------------------------------------------------------------------------


def render_photo(cutout):
    """Kesimi kadife benzeri dokulu bir zeminin uzerine yerlestirir.

    Amac guzel bir zemin degil — arka plan kaldirmanin GORUNUR bir isi olmasi
    icin belirgin dokulu, urunle karisan bir yuzey.
    """
    pixels = bytearray(SIZE * SIZE * 3)

    for y in range(SIZE):
        ny = (y / SIZE - 0.5) * 2.0
        for x in range(SIZE):
            nx = (x / SIZE - 0.5) * 2.0

            # Kadife dokusu: cok frekansli, yumusak dalgalar.
            weave = (
                0.55
                + 0.22 * math.sin(x * 0.09 + math.sin(y * 0.021) * 2.4)
                + 0.14 * math.sin(y * 0.075 + math.sin(x * 0.017) * 2.1)
                + 0.09 * math.sin((x + y) * 0.031)
            )

            # Sol ustten gelen isik + kose karartmasi.
            light = 1.12 - 0.40 * ((x / SIZE) * 0.45 + (y / SIZE) * 0.55)
            vignette = 1.0 - 0.42 * clamp((nx * nx + ny * ny) * 0.66)
            level = clamp(weave * light * vignette, 0.0, 1.6)

            # Koyu bordo kadife — altin urunle kontrast yaratiyor.
            index = (y * SIZE + x) * 3
            pixels[index] = int(clamp(96.0 * level, 0.0, 255.0))
            pixels[index + 1] = int(clamp(30.0 * level, 0.0, 255.0))
            pixels[index + 2] = int(clamp(42.0 * level, 0.0, 255.0))

    # Temas golgesi: kesimin alfasini kaydirip yumusatarak zemini koyulastir.
    shadow_dx, shadow_dy = int(SIZE * 0.012), int(SIZE * 0.020)
    blur = max(3, SIZE // 150)
    for y in range(SIZE):
        for x in range(SIZE):
            total = 0.0
            count = 0
            for oy in range(-blur, blur + 1, max(1, blur // 2)):
                sy = y - shadow_dy + oy
                if sy < 0 or sy >= SIZE:
                    continue
                for ox in range(-blur, blur + 1, max(1, blur // 2)):
                    sx = x - shadow_dx + ox
                    if sx < 0 or sx >= SIZE:
                        continue
                    total += cutout[(sy * SIZE + sx) * 4 + 3]
                    count += 1
            if count == 0:
                continue
            strength = clamp((total / count) / 255.0 * 1.25)
            if strength <= 0.004:
                continue
            factor = 1.0 - 0.55 * strength
            index = (y * SIZE + x) * 3
            pixels[index] = int(pixels[index] * factor)
            pixels[index + 1] = int(pixels[index + 1] * factor)
            pixels[index + 2] = int(pixels[index + 2] * factor)

    # Urunu yerlestir.
    for y in range(SIZE):
        for x in range(SIZE):
            src = (y * SIZE + x) * 4
            a = cutout[src + 3] / 255.0
            if a <= 0.004:
                continue
            dst = (y * SIZE + x) * 3
            for c in range(3):
                pixels[dst + c] = int(mix(pixels[dst + c], cutout[src + c], a))

    return pixels


def main():
    cutout = render_cutout()
    write_png(CUTOUT_PATH, SIZE, SIZE, cutout, color_type=6)
    print("yazildi: %s (%.1f KB)" % (CUTOUT_PATH, os.path.getsize(CUTOUT_PATH) / 1024.0))

    photo = render_photo(cutout)
    write_png(PHOTO_PATH, SIZE, SIZE, photo, color_type=2)
    print("yazildi: %s (%.1f KB)" % (PHOTO_PATH, os.path.getsize(PHOTO_PATH) / 1024.0))


if __name__ == "__main__":
    main()
