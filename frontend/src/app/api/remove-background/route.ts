/**
 * Arka plan kaldirma vekili (proxy).
 *
 * Tarayici FastAPI'ye DOGRUDAN gitmiyor; istek once bu route handler'a
 * geliyor. Iki sebep var (bkz. ROADMAP.md Faz 2):
 *  1. Backend'de CORS middleware'i yok ve Faz 4'e kadar da eklenmeyecek.
 *  2. Ileride auth/kredi anahtarlari devreye girdiginde bunlarin tarayiciya
 *     sizmamasi gerekiyor — vekil o siniri simdiden kuruyor.
 *
 * Ayrica demo (mock) modu burada yasiyor: BiRefNet 12-14 GB RAM istedigi icin
 * frontend gelistirmesi backend'i ayakta tutmaya bagimli olmamali.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ALLOWED_CONTENT_TYPES,
  EXTENSION_CONTENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  getExtension,
} from "@/lib/upload-constraints";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Demo modu. `USE_MOCK_BACKEND=true` iken backend hic cagrilmaz, sabit bir
 * ornek kesim doner.
 *
 * DIKKAT: bu bayrak `true` kaldiginda gercek backend ayakta olsa bile arayuz
 * hep ayni ornek gorseli gosterir. Onceki iterasyonda tam olarak bu unutulup
 * "neden sonuc hep ayni" karisikligina yol acmisti (bkz. CLAUDE.md ders 10) —
 * bu yuzden yanit `X-Mock-Response` basligini tasiyor ve arayuz bunu
 * kullaniciya acikca "Demo modu" olarak gosteriyor.
 */
const USE_MOCK_BACKEND = process.env.USE_MOCK_BACKEND === "true";

/** Demo modunda yapay bekleme — gercek isleme suresi hissi versin. */
const MOCK_DELAY_MS = 1200;

/**
 * Model ilk istekte bellege yuklendigi icin ~30-35sn surebiliyor; sonraki
 * istekler ~15sn (bkz. kok CLAUDE.md "Bilinen kisit"). Zaman asimi bunun
 * uzerinde tutuluyor ki yavas ama saglikli bir istek bosuna kesilmesin.
 */
const BACKEND_TIMEOUT_MS = 180_000;

const MOCK_CUTOUT_PATH = path.join(
  process.cwd(),
  "public",
  "mock",
  "sample-cutout.png",
);

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Tarayicinin bildirdigi content-type izin verilen kumede degilse uzantidan
 * turetir. Windows'ta .heic dosyalari icin tarayici cogu zaman bos ya da
 * "application/octet-stream" bildiriyor; backend ise beyan edilen turu sart
 * kosuyor, bu yuzden duzeltmeyi burada yapiyoruz.
 */
function resolveUploadContentType(file: File): string | null {
  if ((ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return file.type;
  }
  return EXTENSION_CONTENT_TYPES[getExtension(file.name)] ?? null;
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("İstek okunamadı.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Fotoğraf bulunamadı.", 400);
  }

  // Istemci tarafi dogrulama atlanabilir (dogrudan bu endpoint'e istek
  // atilabilir), bu yuzden ayni kontroller burada tekrar ediliyor. Yine de
  // ASIL guvenlik siniri backend'dir; burasi sadece gereksiz bir 20 MB'lik
  // yuklemenin BiRefNet'e kadar gitmesini engelliyor.
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonError(`Dosya çok büyük. En fazla ${MAX_FILE_SIZE_MB} MB olabilir.`, 413);
  }

  const contentType = resolveUploadContentType(file);
  if (!contentType) {
    return jsonError(
      "Desteklenmeyen dosya türü. JPEG, PNG, WebP veya HEIC bir fotoğraf seçin.",
      400,
    );
  }

  if (USE_MOCK_BACKEND) {
    return mockResponse();
  }

  // Backend'e giden dosyayi duzeltilmis content-type ile yeniden paketle.
  const upstreamForm = new FormData();
  upstreamForm.append("file", new File([file], file.name, { type: contentType }));

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/remove-background`, {
      method: "POST",
      body: upstreamForm,
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (error) {
    // Zaman asimi ile "backend hic ayakta degil" birbirinden ayriliyor:
    // kullanicinin ne yapacagi (bekle / birini uyar) buna gore degisiyor.
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return jsonError(
        "İşlem zaman aşımına uğradı. Fotoğraf çok büyük olabilir, daha küçük bir kareyle deneyin.",
        504,
      );
    }
    return jsonError(
      "Arka plan servisine ulaşılamadı. Servis çalışmıyor olabilir.",
      502,
    );
  }

  if (!upstream.ok) {
    return jsonError(await upstreamErrorMessage(upstream), upstream.status);
  }

  const result = await upstream.arrayBuffer();
  return new Response(result, {
    headers: {
      "Content-Type": "image/png",
      "X-Mock-Response": "false",
      // Kesim kullaniciya ozel bir icerik; ara katmanlarda onbeleklenmemeli.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Backend hatalarini kullanicinin anlayacagi bir cumleye cevirir.
 *
 * Backend hatalari `{"detail": "..."}` bicimindedir ve Turkce yazilmistir
 * (bkz. backend/app/validation/upload.py), bu yuzden dogrulama hatalarinda
 * dogrudan aktariliyor. Kapasite (503) ve govde boyutu (413) hatalari ise
 * altyapiya dair oldugu icin burada kullanici diline cevriliyor.
 */
async function upstreamErrorMessage(upstream: Response): Promise<string> {
  if (upstream.status === 503) {
    return "Sistem şu anda meşgul — aynı anda yalnızca bir fotoğraf işlenebiliyor. Birkaç saniye sonra tekrar deneyin.";
  }

  if (upstream.status === 413) {
    return `Dosya çok büyük. En fazla ${MAX_FILE_SIZE_MB} MB olabilir.`;
  }

  const payload = (await upstream.json().catch(() => null)) as {
    detail?: unknown;
  } | null;

  if (typeof payload?.detail === "string" && payload.detail.length > 0) {
    return payload.detail;
  }

  return "Arka plan kaldırma işlemi başarısız oldu.";
}

async function mockResponse(): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  let cutout: Buffer;
  try {
    cutout = await readFile(MOCK_CUTOUT_PATH);
  } catch {
    return jsonError(
      "Demo modu açık ama örnek kesim dosyası bulunamadı: public/mock/sample-cutout.png",
      500,
    );
  }

  return new Response(new Uint8Array(cutout), {
    headers: {
      "Content-Type": "image/png",
      "X-Mock-Response": "true",
      "Cache-Control": "no-store",
    },
  });
}
