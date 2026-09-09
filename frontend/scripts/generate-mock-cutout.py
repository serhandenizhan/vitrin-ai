"""
Demo (mock) modunun ornek kesimini uretir.

Cikti: public/mock/sample-cutout.png (seffaf arka planli kesim)

Neden var: `USE_MOCK_BACKEND=true` iken vekil katmani backend'i hic cagirmadan
sabit bir kesim donduruyor (bkz. src/app/api/remove-background/route.ts).
Ikili bir dosyayi kaynagi olmadan commit etmek ileride "bu nereden geldi,
nasil degistirilir" sorusunu cevapsiz birakir.

ACILIS BOLUMU ARTIK BUNU KULLANMIYOR — orada gercek urun fotograflari var
(bkz. scripts/prepare-photos.mjs). Bu dosya yalnizca demo modu icin kaldi ve
gercek backend'e karsi uretilmis bir kesimle degistirilebilir; o zaman bu
betik tamamen kaldirilir.

Bu gercek bir BiRefNet ciktisi DEGILDIR; yer tutucudur. Arayuz demo sonucunu
her zaman "Demo modu" olarak isaretliyor.

Gorsel kalitesi neden bu kadar onemsendi: ilk surum duz diffuse+specular
kullaniyordu ve sonuc "plastik oyuncak" gibi duruyordu. Metali metal yapan sey
isik degil YANSIMA — bu surum bir studyo ortami (softbox + zemin) tanimlayip
yansima vektoruyle orneklendiriyor, Fresnel ekliyor ve 2x superornekleme ile
kenarlari yumusatiyor.

Ek bagimlilik gerektirmez (PNG yazici dosyanin icinde):
    python scripts/generate-mock-cutout.py
"""

import math
import os
import struct
import zlib

# Cikti olcusu. Render bunun SS katiyle yapilip kucultuluyor (kenar
# yumusatmasi) — pure Python oldugu icin SS=2 makul bir denge.
SIZE = 1100
SS = 2
R_SIZE = SIZE * SS

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUTOUT_PATH = os.path.join(BASE_DIR, "public", "mock", "sample-cutout.png")
PHOTO_PATH = os.path.join(BASE_DIR, "public", "mock", "sample-photo.png")

# --- Yuzuk (tuval genisligine oran) ---
BAND_CENTER_Y = 0.605
BAND_RADIUS = 0.268
BAND_THICKNESS = 0.058

# --- Tas ---
GEM_RADIUS = 0.100
GEM_SQUASH = 0.80
GEM_FACETS = 16

# Anahtar isik: sol ust, one dogru.
KEY = (-0.46, -0.66, 0.60)
# Dolgu isigi: sag alt, zayif — golgelerin tamamen olmesini engelliyor.
FILL = (0.55, 0.42, 0.72)

# Altin albedosu (dogrusal). Sari altin: kirmizi tam, yesil yuksek, mavi dusuk.
GOLD = (1.00, 0.80, 0.44)

# Ton eslemesi oncesi pozlama. Bkz. gold_shade icindeki not.
EXPOSURE = 0.95
GEM_EXPOSURE = 1.5


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t):
    return a + (b - a) * t


def normalize(v):
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / n, v[1] / n, v[2] / n)


KEY = normalize(KEY)
FILL = normalize(FILL)


# --------------------------------------------------------------------------
# PNG yazici
# --------------------------------------------------------------------------


def write_png(path, width, height, pixels, color_type):
    """color_type 6 = RGBA, 2 = RGB."""
    channels = 4 if color_type == 6 else 3
    stride = width * channels
    raw = bytearray()
    for y in range(height):
        raw.append(0)
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
# Studyo ortami
# --------------------------------------------------------------------------


def environment(direction):
    """Yansima yonune bakan basit bir studyo ortami.

    Metalin metal gibi gorunmesini saglayan sey burasi. Uc katman var:
      - ustte genis ve parlak bir softbox (kuyum cekiminin klasik anahtar isigi)
      - ortada koyu bir ufuk (stüdyonun duvarlari)
      - altta orta parlaklikta bir zemin sicramasi

    Duz bir "ambient" sabiti yerine yone bagli bir deger dondurdugu icin,
    bantta gercek bir yansima bandi olusuyor.
    """
    up = -direction[1]  # gorsel koordinatlarda y asagi dogru

    # DINAMIK ARALIK burada belirleniyor ve isin puf noktasi bu. Metali metal
    # yapan sey ortalama parlaklik degil, parlak kaynakla koyu cevre
    # arasindaki KONTRAST. Ilk iki denemede ortam neredeyse duzdu (her yonde
    # benzer deger) ve sonuc once zeytin yesili, sonra bej plastik cikti.
    # Burada softbox tepe degeri koyu cevrenin ~60 katina cikiyor; bandin bir
    # kismi neredeyse beyaz, bir kismi derin kehribar oluyor.
    # Cevre neden bu kadar parlak: bir kuyum cekiminde urun beyaz kutu/scrim
    # icinde durur, yani HER yonden isik gelir. Ayrica bu geometride —
    # onden bakilan bir simit — bandin buyuk kismi normalini izleyiciye
    # dogru tutar ve yansima vektoru up~0 bolgesine duser. Cevre koyu
    # birakildiginda bandin neredeyse tamami koyu cikiyordu (olculdu).
    softbox = math.exp(-((up - 0.55) ** 2) / 0.030) * 5.0
    surround = 1.40 + 0.60 * smoothstep(-0.60, 1.00, up)
    floor_bounce = 0.90 * math.exp(-((up + 0.62) ** 2) / 0.10)

    # Yatay yonde hafif degisim — tek duze bir halka yerine canli bir yuzey.
    horizontal = 0.92 + 0.14 * math.sin(math.atan2(direction[0], direction[2]) * 2.0)

    return (softbox + surround + floor_bounce) * horizontal


def tonemap(red, green, blue):
    """Ton eslemeyi KANAL BASINA degil, PARLAKLIK uzerinden yapar.

    Kanal basina Reinhard (`c/(1+c)`) yuksek degerlerde tum kanallari 1'e
    dogru sikistiriyor; kanallar arasindaki oran bozuluyor ve doygunluk
    oluyor. Altinin mavi kanali dusuk oldugu icin sonuc once zeytin yesili,
    pozlama artirilinca bej cikiyordu — ikisi de ayni hatanin belirtisiydi.

    Burada once parlaklik sikistiriliyor, sonra RENK ORANI korunarak geri
    olcekleniyor; altin altin kaliyor.
    """
    lum = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    if lum <= 1e-6:
        return 0.0, 0.0, 0.0
    scale = (lum / (1.0 + lum)) / lum
    return (
        clamp(red * scale, 0.0, 1.0) * 255.0,
        clamp(green * scale, 0.0, 1.0) * 255.0,
        clamp(blue * scale, 0.0, 1.0) * 255.0,
    )


def gold_shade(normal, occlusion=1.0):
    """Fiziksel olmayan ama fiziksel gibi davranan altin."""
    view = (0.0, 0.0, 1.0)
    ndv = clamp(normal[2], 0.0, 1.0)

    # Yansima vektoru R = 2(N.V)N - V
    refl = (
        2.0 * ndv * normal[0],
        2.0 * ndv * normal[1],
        2.0 * ndv * normal[2] - 1.0,
    )
    env = environment(normalize(refl))

    # Fresnel: siyirtma acilarinda yansima artar; metalin kenarlarini
    # parlatan sey bu.
    fresnel = 0.04 + 0.60 * ((1.0 - ndv) ** 4)

    # Anahtar ve dolgu isiklarinin dogrudan yansimalari.
    def spec(light, power, strength):
        half = normalize((light[0] + view[0], light[1] + view[1], light[2] + view[2]))
        ndh = max(0.0, normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2])
        return (ndh**power) * strength

    highlight = spec(KEY, 160.0, 3.2) + spec(FILL, 48.0, 0.55)

    # Yumusak yonlu bilesen — tamamen yansimaya birakinca form okunmuyor.
    diffuse = max(0.0, sum(n * l for n, l in zip(normal, KEY))) * 0.12
    diffuse += max(0.0, sum(n * l for n, l in zip(normal, FILL))) * 0.05

    level = (env * (0.55 + 0.45 * fresnel) + diffuse) * occlusion * EXPOSURE

    red = level * GOLD[0] + highlight * 1.0
    green = level * GOLD[1] + highlight * 0.94
    blue = level * GOLD[2] + highlight * 0.80

    return tonemap(red, green, blue)


def gem_shade(dx, dy, radius):
    """Yuvarlak briyan kesim tas."""
    r = math.hypot(dx, dy) / radius
    if r > 1.0:
        return None

    angle = math.atan2(dy, dx)
    slice_index = int((angle + math.pi) / (2 * math.pi) * GEM_FACETS)
    jitter = ((slice_index * 37) % 11) / 10.0

    if r < 0.40:
        # Masa (table): duz ve cok parlak.
        level = 1.02 + 0.05 * jitter
        tint = (0.97, 0.99, 1.0)
    else:
        # Tac fasetalari: parlak fasetalar arasindaki KONTRAST tasi tas yapiyor;
        # koyu fasetalar degil. Taban yuksek, dilimler arasi fark belirgin.
        edge = (r - 0.40) / 0.60
        level = mix(1.35, 0.42, edge) * (0.65 + 0.80 * jitter)
        tint = (0.93, 0.96, 1.0)

        # Dagilim (dispersion) ipucu: bazi fasetalarda hafif renk kaymasi.
        if slice_index % 3 == 0:
            tint = (tint[0] * 1.03, tint[1] * 0.99, tint[2] * 0.97)
        elif slice_index % 3 == 1:
            tint = (tint[0] * 0.97, tint[1] * 0.99, tint[2] * 1.04)

    # Kenar (girdle) parlakligi.
    level = mix(level, 1.15, smoothstep(0.88, 1.0, r) * 0.65)

    # Kivilcim.
    if slice_index % 5 == 0 and r > 0.5:
        level *= 1.14

    level *= GEM_EXPOSURE
    return tonemap(level * tint[0], level * tint[1], level * tint[2])


# --------------------------------------------------------------------------
# Kesim
# --------------------------------------------------------------------------


def render_cutout_supersampled():
    """Yuksek cozunurlukte render eder, RGBA bytearray dondurur (R_SIZE)."""
    pixels = bytearray(R_SIZE * R_SIZE * 4)

    cx = R_SIZE * 0.5
    cy = R_SIZE * BAND_CENTER_Y
    radius = R_SIZE * BAND_RADIUS
    thickness = R_SIZE * BAND_THICKNESS

    gem_r = R_SIZE * GEM_RADIUS
    gem_cx = cx
    gem_cy = cy - radius - gem_r * GEM_SQUASH * 0.52

    prongs = []
    for k in range(4):
        a = math.pi * (0.25 + 0.5 * k)
        prongs.append(
            (
                gem_cx + math.cos(a) * gem_r * 0.84,
                gem_cy + math.sin(a) * gem_r * GEM_SQUASH * 0.84,
            )
        )
    prong_r = gem_r * 0.19

    # Superornekleme kenari zaten yumusattigi icin burada dar tutuluyor.
    feather = 1.0 * SS

    for y in range(R_SIZE):
        py = y + 0.5
        row = y * R_SIZE * 4
        for x in range(R_SIZE):
            px = x + 0.5

            red = green = blue = 0.0
            alpha = 0.0

            # --- Bant ---
            dx = px - cx
            dy = py - cy
            dist = math.hypot(dx, dy)
            offset = abs(dist - radius)
            if offset < thickness + feather and dist > 1e-6:
                cover = 1.0 - smoothstep(thickness - feather, thickness + feather, offset)
                if cover > 0.0:
                    across = clamp((dist - radius) / thickness, -1.0, 1.0)
                    depth = math.sqrt(max(0.0, 1.0 - across * across))
                    ux, uy = dx / dist, dy / dist
                    normal = (across * ux, across * uy, depth)

                    # Ic kenarda kapanma (ambient occlusion): halkanin ic
                    # yuzeyi kendi govdesini gordugu icin daha koyu.
                    inner = smoothstep(0.0, -1.0, across)
                    occ = 1.0 - 0.34 * inner

                    red, green, blue = gold_shade(normal, occ)
                    alpha = cover

            # --- Tirnaklar ---
            for ppx, ppy in prongs:
                pdist = math.hypot(px - ppx, py - ppy)
                pcover = 1.0 - smoothstep(prong_r - feather, prong_r + feather, pdist)
                if pcover <= 0.0:
                    continue
                nx = (px - ppx) / max(prong_r, 1e-6)
                ny = (py - ppy) / max(prong_r, 1e-6)
                nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
                pr, pg, pb = gold_shade((nx, ny, nz))
                red = mix(red, pr, pcover)
                green = mix(green, pg, pcover)
                blue = mix(blue, pb, pcover)
                alpha = max(alpha, pcover)

            # --- Tas ---
            gdx = px - gem_cx
            gdy = (py - gem_cy) / GEM_SQUASH
            gdist = math.hypot(gdx, gdy)
            gcover = 1.0 - smoothstep(gem_r - feather, gem_r + feather, gdist)
            if gcover > 0.0:
                gem = gem_shade(gdx, gdy, gem_r)
                if gem is not None:
                    red = mix(red, gem[0], gcover)
                    green = mix(green, gem[1], gcover)
                    blue = mix(blue, gem[2], gcover)
                    alpha = max(alpha, gcover)

            if alpha <= 0.0:
                continue

            i = row + x * 4
            pixels[i] = int(clamp(red, 0.0, 255.0))
            pixels[i + 1] = int(clamp(green, 0.0, 255.0))
            pixels[i + 2] = int(clamp(blue, 0.0, 255.0))
            pixels[i + 3] = int(clamp(alpha) * 255.0)

    return pixels


def downsample_rgba(src):
    """SSxSS blok ortalamasi. Alfa ile carpilmis ortalama aliniyor — duz
    ortalama, kenarda seffaf piksellerin siyah RGB'sini karistirip koyu bir
    hale birakiyor."""
    out = bytearray(SIZE * SIZE * 4)
    for y in range(SIZE):
        for x in range(SIZE):
            r = g = b = a = 0.0
            for oy in range(SS):
                base = ((y * SS + oy) * R_SIZE + x * SS) * 4
                for ox in range(SS):
                    i = base + ox * 4
                    pa = src[i + 3] / 255.0
                    r += src[i] * pa
                    g += src[i + 1] * pa
                    b += src[i + 2] * pa
                    a += pa
            n = SS * SS
            i = (y * SIZE + x) * 4
            if a <= 0.0004:
                continue
            out[i] = int(clamp(r / a, 0.0, 255.0))
            out[i + 1] = int(clamp(g / a, 0.0, 255.0))
            out[i + 2] = int(clamp(b / a, 0.0, 255.0))
            out[i + 3] = int(clamp(a / n) * 255.0)
    return out


# --------------------------------------------------------------------------
# "Once" fotografi
# --------------------------------------------------------------------------


def render_photo(cutout):
    """Kesimi koyu, dokulu bir kadife zeminin uzerine yerlestirir."""
    pixels = bytearray(SIZE * SIZE * 3)

    for y in range(SIZE):
        ny = (y / SIZE - 0.5) * 2.0
        for x in range(SIZE):
            nx = (x / SIZE - 0.5) * 2.0

            # Kadife: yumusak, cok frekansli bir doku.
            weave = (
                0.52
                + 0.20 * math.sin(x * 0.055 + math.sin(y * 0.019) * 2.6)
                + 0.13 * math.sin(y * 0.048 + math.sin(x * 0.014) * 2.2)
                + 0.08 * math.sin((x + y) * 0.022)
            )

            light = 1.14 - 0.42 * ((x / SIZE) * 0.42 + (y / SIZE) * 0.58)
            vignette = 1.0 - 0.46 * clamp((nx * nx + ny * ny) * 0.68)
            level = clamp(weave * light * vignette, 0.0, 1.7)

            i = (y * SIZE + x) * 3
            pixels[i] = int(clamp(88.0 * level, 0.0, 255.0))
            pixels[i + 1] = int(clamp(26.0 * level, 0.0, 255.0))
            pixels[i + 2] = int(clamp(38.0 * level, 0.0, 255.0))

    # Temas golgesi.
    dx_off, dy_off = int(SIZE * 0.010), int(SIZE * 0.018)
    blur = max(3, SIZE // 140)
    step = max(1, blur // 2)
    for y in range(SIZE):
        for x in range(SIZE):
            total = 0.0
            count = 0
            for oy in range(-blur, blur + 1, step):
                sy = y - dy_off + oy
                if sy < 0 or sy >= SIZE:
                    continue
                for ox in range(-blur, blur + 1, step):
                    sx = x - dx_off + ox
                    if sx < 0 or sx >= SIZE:
                        continue
                    total += cutout[(sy * SIZE + sx) * 4 + 3]
                    count += 1
            if not count:
                continue
            strength = clamp((total / count) / 255.0 * 1.3)
            if strength <= 0.004:
                continue
            factor = 1.0 - 0.58 * strength
            i = (y * SIZE + x) * 3
            pixels[i] = int(pixels[i] * factor)
            pixels[i + 1] = int(pixels[i + 1] * factor)
            pixels[i + 2] = int(pixels[i + 2] * factor)

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
    print("render ediliyor (%dx%d, %dx superornekleme)..." % (SIZE, SIZE, SS))
    hi = render_cutout_supersampled()
    cutout = downsample_rgba(hi)
    write_png(CUTOUT_PATH, SIZE, SIZE, cutout, color_type=6)
    print("yazildi: %s (%.1f KB)" % (CUTOUT_PATH, os.path.getsize(CUTOUT_PATH) / 1024.0))


if __name__ == "__main__":
    main()
