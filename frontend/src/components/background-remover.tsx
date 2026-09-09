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
import { AlertCircle, FileImage, Sparkles } from "lucide-react";

import { ComparisonView } from "@/components/comparison-view";
import { ProcessingState } from "@/components/processing-state";
import { UploadDropzone } from "@/components/upload-dropzone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import {
  formatBytes,
  isPreviewableInBrowser,
  validateFile,
} from "@/lib/upload-constraints";

type Status = "idle" | "ready" | "processing" | "done" | "error";

export function BackgroundRemover() {
  const { recordWork, subscribeToOpenWork, subscribeToReset } = useWorkspace();

  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isMocked, setIsMocked] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Gecmisten acilan calismanin adi — o durumda `file` null oluyor. */
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);

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
      // HEIC'i tarayicilarin cogu goruntuleyemiyor; onizleme yerine bir dosya
      // karti gosteriyoruz. Backend HEIC'i sorunsuz isliyor.
      setOriginalUrl(
        isPreviewableInBrowser(selected)
          ? trackObjectUrl(URL.createObjectURL(selected))
          : null,
      );
      setStatus("ready");
    },
    [trackObjectUrl],
  );

  const handleRemoveBackground = useCallback(async () => {
    if (!file) return;

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
        } | null;
        throw new Error(
          payload?.error ?? "Arka plan kaldırma işlemi başarısız oldu.",
        );
      }

      const blob = await response.blob();
      const mocked = response.headers.get("X-Mock-Response") === "true";
      const duration = (performance.now() - startedAt) / 1000;

      setResultUrl(trackObjectUrl(URL.createObjectURL(blob)));
      setIsMocked(mocked);
      setElapsedSeconds(duration);
      setStatus("done");

      // Gecmise yazmak asil akisi bloklamamali: kota dolu ya da depolama
      // kapaliysa sessizce atlanir, kullanici sonucu yine de gorur/indirir.
      void recordWork({
        fileName: file.name,
        isMocked: mocked,
        durationSeconds: duration,
        result: blob,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.",
      );
      setStatus("error");
    }
  }, [file, trackObjectUrl, recordWork]);

  /**
   * Kenar cubugundan bir calisma acilinca onu ekrana getir.
   *
   * Efekt YALNIZCA abone oluyor; setState olayin geri cagrisinda calisiyor.
   * Acilmayi context'te bir state olarak tutup efektte okumak zincirleme
   * render uretiyordu (`react-hooks/set-state-in-effect`) — acilma bir olay,
   * kalici bir durum degil.
   *
   * `file` burada null kaliyor: gecmiste yalnizca SONUC saklaniyor, ozgun
   * fotograf degil. Sebep kota — ozgun dosyalar 20 MB'a kadar cikabiliyor ve
   * yirmi kaydin ozguniyle birlikte saklanmasi tarayici kotasini hizla
   * doldurur. Bu yuzden acilan calismada karsilastirma degil yalnizca sonuc
   * gosteriliyor; kullanici indirebiliyor.
   */
  // "Basa don" olayinda arac bos duruma aliniyor. Abonelik, efekt govdesinde
  // setState cagirmadan calisiyor (bkz. workspace-provider.tsx gerekcesi).
  useEffect(() => subscribeToReset(reset), [subscribeToReset, reset]);

  useEffect(
    () =>
      subscribeToOpenWork((work) => {
        setErrorMessage(null);
        setFile(null);
        setOriginalUrl(null);
        setResultUrl(trackObjectUrl(URL.createObjectURL(work.result)));
        setIsMocked(work.isMocked);
        setElapsedSeconds(work.durationSeconds);
        setOpenedFileName(work.fileName);
        setStatus("done");
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
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* Arac, tanitim bolumlerinin arasinda beyaz bir kart olarak duruyor —
          Apple'in acik zeminli bolumlerinde one cikan urun karti gibi. */}
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-9">
        {showDropzone ? (
          <UploadDropzone onFileSelected={handleFileSelected} />
        ) : null}

        {showPreview && file ? (
          <div className="flex flex-col items-center gap-6">
            {originalUrl ? (
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
                  Bu format tarayıcıda önizlenemiyor
                </span>
                <span className="text-xs leading-relaxed">
                  HEIC dosyaları yalnızca işlendikten sonra görüntülenir. Arka
                  plan kaldırma normal çalışır.
                </span>
              </div>
            )}

            <p className="text-muted-foreground text-sm">
              {file.name} · {formatBytes(file.size)}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" className="press rounded-full" onClick={handleRemoveBackground}>
                <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
                Arka planı kaldır
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
          </div>
        ) : null}

        {status === "processing" ? (
          <ProcessingState onizlemeUrl={originalUrl} />
        ) : null}

        {status === "done" && resultUrl && (file || openedFileName) ? (
          <ComparisonView
            originalUrl={originalUrl}
            resultUrl={resultUrl}
            fileName={file?.name ?? openedFileName ?? "urun"}
            isMocked={isMocked}
            elapsedSeconds={elapsedSeconds}
            onReset={reset}
          />
        ) : null}
      </div>
    </div>
  );
}
