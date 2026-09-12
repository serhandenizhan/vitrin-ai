"use client";

/**
 * Aracin kendisi: fotograf sec -> onizle -> arka plani kaldir -> sonuc.
 *
 * Sayfanin geri kalani sunucu bileseni; durum tasiyan tek parca burasi
 * oldugu icin ayri bir dosyada. Boylece tanitim bolumlerinin hicbiri
 * gereksiz yere istemciye inmiyor.
 *
 * Istek /api/remove-background vekiline gidiyor (bkz.
 * src/app/api/remove-background/route.ts); tarayici FastAPI'ye dogrudan hic
 * baglanmiyor.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  FileImage,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { ComparisonView } from "@/components/comparison-view";
import { ProcessingState } from "@/components/processing-state";
import { UploadDropzone } from "@/components/upload-dropzone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { createPreviewUrl } from "@/lib/heic-preview";
import {
  formatBytes,
  isPreviewableInBrowser,
  validateFile,
} from "@/lib/upload-constraints";

type Status = "idle" | "ready" | "processing" | "done" | "error";

export function BackgroundRemover() {
  const {
    recordWork,
    subscribeToOpenWork,
    subscribeToReset,
    user,
    isAuthLoaded,
    openSignIn,
  } = useWorkspace();

  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isMocked, setIsMocked] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Gecmisten acilan calismanin adi — o durumda `file` null oluyor. */
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);
  /** HEIC onizlemesi tarayicida cozulurken true. */
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  /**
   * "Kaçıncı oturum" sayacı — yalnızca onizleme icin degil, ekranda o an
   * gosterilen SEYIN kimligini tutuyor. Yeni dosya secimi, "vazgec"/"basa
   * don" ve gecmisten bir calisma acma, hepsi bunu artiriyor. Bekleyen bir
   * `createPreviewUrl` cozumu ya da suren bir `handleRemoveBackground`
   * istegi kendi basladigi sayiyi bu anlik degerle karsilastirip
   * eslesmiyorsa sonucunu sessizce atiyor — aksi halde gec gelen bir sonuc,
   * kullanicinin o sirada gercekten baktigi (ac ilan bir gecmis calisma ya
   * da yeni secilen baska bir dosya) ekranin uzerine yaziyordu.
   */
  const sessionRef = useRef(0);

  // Olusturulan object URL'ler bilesen kaldirilirken serbest birakiliyor;
  // aksi halde her yeni fotografta bir oncekinin blob'u bellekte kaliyor.
  const objectUrlsRef = useRef<string[]>([]);

  const trackObjectUrl = useCallback((url: string) => {
    objectUrlsRef.current.push(url);
    return url;
  }, []);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const reset = useCallback(() => {
    // Suren bir onizleme cozumu ya da arka plan kaldirma istegi varsa
    // sonucu artik kimseye ait degil.
    sessionRef.current += 1;
    setIsPreparingPreview(false);
    setStatus("idle");
    setFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setIsMocked(false);
    setElapsedSeconds(null);
    setErrorMessage(null);
    setOpenedFileName(null);
  }, []);

  const handleFileSelected = useCallback(
    (selected: File) => {
      // Her secim (gecerli ya da gecersiz) onceki oturumu kapatiyor —
      // bekleyen bir onizleme ya da arka plan kaldirma istegi varsa artik
      // bu ekrana yazamaz.
      const session = ++sessionRef.current;
      setIsPreparingPreview(false);

      const validationError = validateFile(selected);
      if (validationError) {
        setErrorMessage(validationError.message);
        setStatus("error");
        setFile(null);
        setOriginalUrl(null);
        return;
      }

      setErrorMessage(null);
      setResultUrl(null);
      setElapsedSeconds(null);
      setFile(selected);
      setOpenedFileName(null);
      setStatus("ready");

      // JPEG/PNG/WebP icin onizleme her zaman senkron: eski davranis buydu
      // ve HEIC olmayan cogunluk yukleme icin gereksiz bir "hazirlaniyor"
      // karesi eklemenin bir faydasi yok.
      if (isPreviewableInBrowser(selected)) {
        setOriginalUrl(trackObjectUrl(URL.createObjectURL(selected)));
        return;
      }

      // HEIC onizlemesi tarayicida cozuluyor ve bu bir-iki saniye surebiliyor
      // (bkz. lib/heic-preview.ts). Bu arada kullanici baska bir dosya
      // secerse ya da "vazgec"e basarsa eski sonuc yenisinin uzerine
      // yazmasin diye oturum sayaciyla korunuyor.
      setOriginalUrl(null);
      setIsPreparingPreview(true);
      void createPreviewUrl(selected).then((url) => {
        if (session !== sessionRef.current) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        setOriginalUrl(url ? trackObjectUrl(url) : null);
        setIsPreparingPreview(false);
      });
    },
    [trackObjectUrl],
  );

  const handleRemoveBackground = useCallback(async () => {
    if (!file) return;

    // Faz 4 karari: giris yapmadan arka plan kaldirilamaz. Fotograf secimi
    // ve onizleme serbest — kullanici once araci gorsun; islemi baslatirken
    // giris penceresi aciliyor, secilen dosya yerinde kaliyor. Asil kontrol
    // vekilde ve backend'de; bu yalnizca bosuna bir istegi onluyor.
    if (!user) {
      openSignIn();
      return;
    }

    // Istek surerken kullanici gecmisten baska bir calisma acabilir ya da
    // "vazgec"e basabilir; o zaman bu oturum artik gecerli degil ve gec
    // gelen sonuc kullanicinin o an baktigi ekranin uzerine yazmamali.
    const session = sessionRef.current;

    setStatus("processing");
    setErrorMessage(null);
    const startedAt = performance.now();

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/remove-background", {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        // Oturum bu arada dustu (suresi doldu, baska sekmede cikis yapildi).
        if (payload?.code === "auth_required") openSignIn();
        throw new Error(
          payload?.error ?? "Arka plan kaldırma işlemi başarısız oldu.",
        );
      }

      const blob = await response.blob();
      const mocked = response.headers.get("X-Mock-Response") === "true";
      const duration = (performance.now() - startedAt) / 1000;

      // Gecmise yazmak, ekranda hala bu oturum gosteriliyor mu diye
      // bakmadan her zaman yapilir — kullanici baska bir ekrana gecmis olsa
      // bile az once uretilen sonuc kaybolmamali.
      void recordWork({
        fileName: file.name,
        isMocked: mocked,
        durationSeconds: duration,
        result: blob,
      });

      if (session !== sessionRef.current) return;

      setResultUrl(trackObjectUrl(URL.createObjectURL(blob)));
      setIsMocked(mocked);
      setElapsedSeconds(duration);
      setStatus("done");
    } catch (error) {
      if (session !== sessionRef.current) return;
      setErrorMessage(
        error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.",
      );
      setStatus("error");
    }
  }, [file, trackObjectUrl, recordWork, user, openSignIn]);

  /**
   * Kenar cubugundan bir calisma acilinca onu ekrana getir.
   *
   * Efekt YALNIZCA abone oluyor; setState olayin geri cagrisinda calisiyor.
   * Acilmayi context'te bir state olarak tutup efektte okumak zincirleme
   * render uretiyordu (`react-hooks/set-state-in-effect`) — acilma bir olay,
   * kalici bir durum degil.
   *
   * `file` burada null kaliyor: gecmiste yalnizca SONUC saklaniyor, ozgun
   * fotograf degil (Faz 4 urun karari, Kaan 12.09.2026). Bu yuzden acilan
   * calismada karsilastirma degil yalnizca sonuc gosteriliyor.
   *
   * Sonuc sunucudan aliniyor (`resultUrl`, ayni kokenden vekil); gelene kadar
   * ekran degismiyor. Bu arada baska bir dosya secilirse gec gelen sonuc
   * oturum sayaciyla atiliyor.
   */
  // "Basa don" olayinda arac bos duruma aliniyor. Abonelik, efekt govdesinde
  // setState cagirmadan calisiyor (bkz. workspace-provider.tsx gerekcesi).
  useEffect(() => subscribeToReset(reset), [subscribeToReset, reset]);

  useEffect(
    () =>
      subscribeToOpenWork((work) => {
        // Bekleyen bir onizleme cozumu ya da suren bir arka plan kaldirma
        // istegi varsa, ekrana simdi acilan gecmis calismanin uzerine
        // yazmasin diye oturum kapatiliyor.
        sessionRef.current += 1;
        const session = sessionRef.current;
        setIsPreparingPreview(false);
        setErrorMessage(null);

        void fetch(work.resultUrl, { cache: "no-store" })
          .then((response) => {
            if (!response.ok) throw new Error("result");
            return response.blob();
          })
          .then((blob) => {
            if (session !== sessionRef.current) return;
            setFile(null);
            setOriginalUrl(null);
            setResultUrl(trackObjectUrl(URL.createObjectURL(blob)));
            setIsMocked(work.isMocked);
            setElapsedSeconds(work.durationSeconds);
            setOpenedFileName(work.fileName);
            setStatus("done");
          })
          .catch(() => {
            if (session !== sessionRef.current) return;
            setErrorMessage(
              "Çalışma açılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
            );
          });
      }),
    [subscribeToOpenWork, trackObjectUrl],
  );

  const showDropzone = status === "idle" || (status === "error" && !file);
  const showPreview = status === "ready" || (status === "error" && file !== null);

  return (
    <div className="flex flex-col gap-6">
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>İşlem tamamlanamadı</AlertTitle>
          <AlertDescription>
            {errorMessage}
            {/*
              Yeniden deneme dugmesi. Onceden yalnizca "tekrar deneyin" YAZIYORDU
              ama dugme yoktu; kullanicinin fotografi bastan secmesi gerekiyordu.
              Hatalarin cogu geciciydi (servis mesgul, ag koptu) ve dosya zaten
              elimizde duruyor.
            */}
            {file ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRemoveBackground}
                className="press mt-3 min-h-9 rounded-full bg-white"
              >
                <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
                Tekrar dene
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Arac, tanitim bolumlerinin arasinda beyaz bir kart olarak duruyor —
          Apple'in acik zeminli bolumlerinde one cikan urun karti gibi. */}
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-9">
        {/* `soft-enter`: ekranlar (yukleme -> onizleme -> isleniyor -> sonuc)
            birden degil yumusakca beliriyor. Kosullu cizim her gecis icin
            ogeyi yeniden bagladigi icin animasyon her seferinde oynuyor. */}
        {showDropzone ? (
          <div className="soft-enter">
            <UploadDropzone onFileSelected={handleFileSelected} />
          </div>
        ) : null}

        {showPreview && file ? (
          <div className="soft-enter flex flex-col items-center gap-6">
            {isPreparingPreview ? (
              <div
                role="status"
                className="text-muted-foreground flex aspect-square w-full max-w-sm flex-col items-center justify-center gap-3 rounded-xl border px-6 text-center"
              >
                <LoaderCircle
                  className="size-6 animate-spin"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="text-sm">Önizleme hazırlanıyor</span>
              </div>
            ) : originalUrl ? (
              /* next/image kullanilmiyor: kaynak bir blob: URL, olculeri
                 onceden bilinmiyor ve optimizasyon katmani burada bir sey
                 kazandirmaz. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={originalUrl}
                alt="Seçilen fotoğrafın önizlemesi"
                className="max-h-[50vh] w-auto max-w-full rounded-xl border object-contain"
              />
            ) : (
              <div className="text-muted-foreground flex aspect-square w-full max-w-sm flex-col items-center justify-center gap-3 rounded-xl border px-6 text-center">
                <FileImage className="size-8" strokeWidth={1.25} aria-hidden />
                <span className="text-foreground text-sm font-medium">
                  Önizleme gösterilemedi
                </span>
                <span className="text-xs leading-relaxed">
                  Fotoğrafı burada açamadık ama arka planı yine de
                  kaldırabilirsiniz. Sonuç işlem bitince görünecek.
                </span>
              </div>
            )}

            <p className="text-muted-foreground text-sm">
              {file.name} · {formatBytes(file.size)}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                className="press rounded-full"
                onClick={handleRemoveBackground}
                disabled={!isAuthLoaded}
              >
                <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
                {user || !isAuthLoaded
                  ? "Arka planı kaldır"
                  : "Giriş yapın ve kaldırın"}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="rounded-full"
                onClick={reset}
              >
                Vazgeç
              </Button>
            </div>

            {isAuthLoaded && !user ? (
              <p className="text-muted-foreground -mt-2 text-center text-xs">
                Arka plan kaldırma üyelere açık.{" "}
                <button
                  type="button"
                  onClick={() => openSignIn("signup")}
                  className="text-foreground font-medium underline underline-offset-2"
                >
                  Ücretsiz hesap oluşturun
                </button>
              </p>
            ) : null}
          </div>
        ) : null}

        {status === "processing" ? (
          <div className="soft-enter">
            <ProcessingState onizlemeUrl={originalUrl} />
          </div>
        ) : null}

        {status === "done" && resultUrl && (file || openedFileName) ? (
          <div className="soft-enter">
            <ComparisonView
              originalUrl={originalUrl}
              resultUrl={resultUrl}
              fileName={file?.name ?? openedFileName ?? "urun"}
              isMocked={isMocked}
              elapsedSeconds={elapsedSeconds}
              onReset={reset}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
