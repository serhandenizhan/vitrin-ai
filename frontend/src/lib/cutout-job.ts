/**
 * Arka plan kaldirma istegi — yukleme + kuyruk yoklamasi (Faz 7).
 *
 * Backend artik kesimi istek icinde yapmiyor: fotografi siraya koyup `202`
 * donuyor, kesim ayri bir iscide. Bu yardimci ekrana tek bir "sonucu bekle"
 * gibi gorunur; bilesen (`background-remover.tsx`) yalniz sonucu ya da
 * gosterilecek hatayi alir.
 *
 * "Musteriye hissettirme" karari (Serhan, 26.09.2026) burada uygulanir:
 *  - Sira numarasi hic gosterilmez; ~30 sn sonra yalniz `onSlow` cagrilir ve
 *    bilesen notr bir cumle gosterir.
 *  - Kredisi IADE EDILMIS gecici bir hata (isci coktu, sure doldu, kuyruk
 *    dolu…) kullaniciya gosterilmeden, yeni bir anahtarla sessizce tekrar
 *    denenir. Kalici bir hata (fotograf islenemedi) gosterilir.
 *
 * Anahtar kurali degismedi (bkz. bilesendeki `requestKeyRef`): yeni anahtara
 * YALNIZCA backend `retry_safe` dediginde gecilir; aksi hâlde ayni anahtar
 * korunur ki basarili ama yaniti kaybolmus is ikinci krediyi yakmasin.
 */

export class CutoutError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retrySafe = false,
  ) {
    super(message);
    this.name = "CutoutError";
  }
}

export type CutoutResult = { blob: Blob; mocked: boolean };

export type CutoutOptions = {
  file: File;
  /** Su anki idempotency anahtari. */
  getKey: () => string;
  /** Backend `retry_safe` dediginde cagrilir; yeni anahtar uretir. */
  renewKey: () => void;
  /** Bekleme uzayinca BIR KEZ cagrilir (notr cumle icin). */
  onSlow?: () => void;
  /** Kullanici ekrandan ayrildiysa yoklama durur. */
  isCancelled?: () => boolean;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  slowAfterMs?: number;
  maxWaitMs?: number;
  silentRetries?: number;
};

/** Yeni anahtarla tekrar denemesi guvenli olan GECICI hatalar. */
export const TRANSIENT_CODES = new Set([
  "worker_lost",
  "job_expired",
  "result_storage_unavailable",
  "reservation_released",
]);
const SAME_KEY_RETRY_CODES = new Set(["queue_unavailable", "queue_busy"]);

export const POLL_INTERVAL_MS = 1500;
export const SLOW_AFTER_MS = 30_000;
/** Fotograf backend'de en fazla 15 dk bekler; biraz pay birakilir. */
export const MAX_WAIT_MS = 16 * 60_000;
const MAX_CONSECUTIVE_POLL_ERRORS = 5;
const DEFAULT_RETRY_DELAY_MS = 2000;

const GENERIC_ERROR = "Arka plan kaldırma işlemi başarısız oldu.";

export class CutoutCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "CutoutCancelled";
  }
}

type Payload = { error?: string; code?: string; retry_safe?: boolean };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function errorFrom(response: Response): Promise<CutoutError> {
  const payload = (await response.json().catch(() => null)) as Payload | null;
  return new CutoutError(
    payload?.error ?? GENERIC_ERROR,
    payload?.code,
    payload?.retry_safe === true,
  );
}

function retryDelay(response: Response): number {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_DELAY_MS;
}

function isPng(response: Response): boolean {
  return response.headers.get("Content-Type")?.startsWith("image/png") ?? false;
}

async function asResult(response: Response): Promise<CutoutResult> {
  return {
    blob: await response.blob(),
    mocked: response.headers.get("X-Mock-Response") === "true",
  };
}

/**
 * Bir kesim isinin anahtarini, ekranin ortak anahtarindan (`requestKeyRef`)
 * AYIRIR. Is suresince kendi anahtarini tutar; sessiz tekrarda yeni anahtar
 * uretince ortak anahtari YALNIZ ekran hala bu isi gosteriyorsa gunceller
 * (`isCurrent`). Aksi halde ekrandan ayrilmis eski bir is, kullanicinin yeni
 * fotografinin anahtarini ezer ve iki is ayni anahtari paylasirdi.
 */
export function bindJobKey(
  shared: { current: string },
  isCurrent: () => boolean,
  newKey: () => string = () => crypto.randomUUID(),
): Pick<CutoutOptions, "getKey" | "renewKey"> {
  let key = shared.current;
  return {
    getKey: () => key,
    renewKey: () => {
      key = newKey();
      // Ekran bu isteyse kullanicinin "tekrar dene"si ayni (yeni) anahtarla gitsin.
      if (isCurrent()) shared.current = key;
    },
  };
}

export async function runCutout(options: CutoutOptions): Promise<CutoutResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollInterval = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const maxWait = options.maxWaitMs ?? MAX_WAIT_MS;
  let retriesLeft = options.silentRetries ?? 2;
  const startedAt = Date.now();

  const slowTimer = options.onSlow
    ? setTimeout(options.onSlow, options.slowAfterMs ?? SLOW_AFTER_MS)
    : undefined;
  const checkCancelled = () => {
    if (options.isCancelled?.()) throw new CutoutCancelled();
  };

  // Hata kullaniciya gosterilecek mi, yoksa sessizce yeniden mi denenecek?
  const handleFailure = async (response: Response, knownError?: CutoutError): Promise<void> => {
    const error = knownError ?? await errorFrom(response);
    if (error.code && SAME_KEY_RETRY_CODES.has(error.code) && retriesLeft > 0) {
      retriesLeft -= 1;
      await sleep(retryDelay(response));
      return;
    }
    if (error.retrySafe) options.renewKey();
    if (error.retrySafe && error.code && TRANSIENT_CODES.has(error.code) && retriesLeft > 0) {
      retriesLeft -= 1;
      await sleep(retryDelay(response));
      return;
    }
    throw error;
  };

  try {
    for (;;) {
      checkCancelled();
      // Anahtar YUKLEMEDEN ONCE sabitlenir ve yoklama da ayni anahtarla
      // yapilir. Yukleme surerken (20 MB birkac saniye) kullanici ekrani
      // sifirlayip ("Yeni calisma", sol panelden baska calisma) yeni fotograf
      // secerse ortak anahtar degisir; yoklama onu okursa eski is baska bir
      // isin sonucunu alir ya da kendi sonucunu
      // hic bulamazdi (kredi harcanir, sonuc gecmise yazilmazdi).
      const key = options.getKey();
      const body = new FormData();
      body.append("file", options.file);
      const submitted = await fetchImpl("/api/remove-background", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body,
      });
      if (!submitted.ok) {
        await handleFailure(submitted);
        continue;
      }
      if (isPng(submitted)) return await asResult(submitted); // demo ya da hazir sonuc

      let consecutiveErrors = 0;
      let retryJob = false;
      while (!retryJob) {
        await sleep(pollInterval);
        checkCancelled();
        if (Date.now() - startedAt > maxWait) {
          // Anahtar KORUNUR: is belki hâlâ suruyor, sonucu ayni anahtarla alinir.
          throw new CutoutError("İşlem beklenenden uzun sürdü. Birazdan tekrar deneyin.");
        }
        let polled: Response;
        try {
          polled = await fetchImpl(`/api/remove-background/jobs/${key}`, { cache: "no-store" });
        } catch {
          // Kisa bir ag kesintisi isi bozmaz; is sunucuda suruyor.
          consecutiveErrors += 1;
          if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
            throw new CutoutError("Bağlantı koptu. İnternetinizi kontrol edip tekrar deneyin.");
          }
          continue;
        }
        if (polled.ok && isPng(polled)) return await asResult(polled);
        if (polled.status === 202) {
          consecutiveErrors = 0;
          continue;
        }
        if (polled.status === 429) {
          // Backend okuma sinirini (kullanici basina 600/dk, 02.10.2026) asan bir
          // yoklama, sunucuda SUREN ve kredisi ayrilmis bir isi basarisiz yapmamali.
          // `Retry-After` kadar bekleyip AYNI anahtarla yoklamaya devam edilir;
          // ardisik 429'lar sinirsiz surmez, mesaj kullaniciya gosterilir (anahtar
          // korunur: tekrar denenirse is sonucu ayni anahtarla alinir).
          const error = await errorFrom(polled);
          consecutiveErrors += 1;
          if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw error;
          await sleep(retryDelay(polled));
          continue;
        }
        if (polled.status === 503) {
          const error = await errorFrom(polled);
          if (error.code === "queue_unavailable") {
            // Yoklama hatası işin ve kredi ayırmasının sonucunu söylemez.
            // Aynı anahtarla beklemeye devam et; yeni POST ikinci kredi açabilir.
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw error;
            continue;
          }
          await handleFailure(polled, error);
        } else {
          await handleFailure(polled);
        }
        retryJob = true; // sessiz tekrar: kredi sonucuna gore ayni ya da yeni anahtarla yukle
      }
    }
  } finally {
    if (slowTimer !== undefined) clearTimeout(slowTimer);
  }
}
