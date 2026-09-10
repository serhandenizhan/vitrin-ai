/**
 * Arka plan kutuphanesi vekili (proxy).
 *
 * `GET /api/backgrounds` -> FastAPI `GET /api/backgrounds`. Tarayici backend'e
 * dogrudan gitmiyor; gerekce arka plan kaldirma vekilindekiyle ayni (backend'de
 * CORS yok ve Faz 4'e kadar eklenmeyecek, ayrica ileride auth anahtarlari
 * tarayiciya sizmamali).
 *
 * BU VEKIL HIC 5xx DONDURMEZ — ve bu bilincli bir karar:
 *
 * Yol haritasi (ROADMAP.md Faz 3) editorun "backend bos liste dondugunde
 * yer tutucu zeminlere SESSIZCE dusmesi, hic kirilmamasi" gerektigini
 * soyluyor. Backend'in kapali olmasi ile bos liste dondurmesi, editorun
 * bakis acisindan ayni durum: gosterilecek gercek zemin yok. Bu yuzden
 * backend'e ulasilamadiginda da 200 + bos liste donuyoruz; editor tek bir
 * yolu (bos liste) ele almak zorunda kaliyor, iki ayri hata yolunu degil.
 *
 * Hata sessizce YUTULMUYOR ama: yanit `X-Backgrounds-Source` basligiyla
 * verinin nereden geldigini soyluyor (`backend` / `unavailable`), boylece
 * "neden hep yer tutucu goruyorum" sorusu tek bir istek incelemesiyle
 * cevaplanabiliyor. Sunucu tarafinda da bir uyari log'lanir.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Zemin listesi kucuk ve DB'den geliyor; arka plan kaldirma gibi dakikalar
 * surmuyor. Kisa tutuluyor ki backend kapaliyken editor acilisi beklemesin.
 */
const BACKEND_TIMEOUT_MS = 8_000;

/**
 * Imzali URL suresi hakkinda backend bir sey soylemezse kullanilacak deger.
 *
 * Backend'in `expires_in` alani PR #7 ile geliyor; bu vekil, o alanin
 * BULUNMADIGI bir backend surumune karsi da calismak zorunda (ornegin
 * gelistirici backend'i guncellemeden frontend'i calistirdiginda). O durumda
 * bilincli olarak KISA bir sure varsayiyoruz: fazla bekleyip URL'in olmesine
 * izin vermektense, gereginden erken yenilemek daha ucuz — yenileme tek bir
 * kucuk JSON istegi.
 */
const DEFAULT_EXPIRY_SECONDS = 600;

export type BackgroundResponse = {
  id: string;
  url: string;
  expiresIn: number;
};

/** Backend'den gelen ham kaydin bekledigimiz sekle uyup uymadigini dogrular. */
function parseRecord(raw: unknown): BackgroundResponse | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.url !== "string") return null;

  // `expires_in` yoksa ya da sayi degilse varsayilana dus — alanin eksikligi
  // tum listeyi cope atmak icin bir sebep degil.
  const expiresIn =
    typeof record.expires_in === "number" && Number.isFinite(record.expires_in)
      ? record.expires_in
      : DEFAULT_EXPIRY_SECONDS;

  return { id: record.id, url: record.url, expiresIn };
}

function createResponse(
  backgrounds: BackgroundResponse[],
  source: "backend" | "unavailable",
): Response {
  return Response.json(backgrounds, {
    headers: {
      "X-Backgrounds-Source": source,
      // Imzali URL'ler sureli: bir ara katmanin bunlari onbellege almasi,
      // suresi dolmus URL'lerin servis edilmesi demek olurdu.
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(): Promise<Response> {
  try {
    const backendResponse = await fetch(`${BACKEND_URL}/api/backgrounds`, {
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!backendResponse.ok) {
      console.warn(
        `[api/backgrounds] backend ${backendResponse.status} dondu; yer tutucu zeminlere dusuluyor`,
      );
      return createResponse([], "unavailable");
    }

    const body: unknown = await backendResponse.json();
    if (!Array.isArray(body)) {
      console.warn("[api/backgrounds] backend dizi disi bir govde dondu");
      return createResponse([], "unavailable");
    }

    // Bozuk kayitlar tek tek eleniyor, tum liste degil: bir kaydin `url`'u
    // eksikse yalnizca o zemin kayboluyor, editor geri kalaniyla calisiyor.
    const backgrounds = body
      .map(parseRecord)
      .filter((record): record is BackgroundResponse => record !== null);

    return createResponse(backgrounds, "backend");
  } catch (error) {
    console.warn(
      "[api/backgrounds] backend'e ulasilamadi; yer tutucu zeminlere dusuluyor:",
      error instanceof Error ? error.message : error,
    );
    return createResponse([], "unavailable");
  }
}
