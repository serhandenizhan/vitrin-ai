"use client";

/**
 * Sonuc gorunumu: solda ozgun fotograf, sagda arka plani kaldirilmis kesim.
 *
 * Kesim dama deseninin (bkz. globals.css `checkerboard`) uzerinde gosteriliyor
 * — duz bir zeminde, ozellikle acik renkli urunlerde, arka planin gercekten
 * kalkip kalkmadigi anlasilmiyor.
 */

import { Download, RotateCcw } from "lucide-react";

import { CompositionEditor } from "@/components/composer/composition-editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ComparisonViewProps = {
  /** HEIC gibi tarayicinin goruntuleyemedigi formatlarda null olur. */
  originalUrl: string | null;
  resultUrl: string;
  fileName: string;
  isMocked: boolean;
  elapsedSeconds: number | null;
  onReset: () => void;
};

/** "yuzuk.jpg" -> "yuzuk-kesim.png" */
function toDownloadName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "urun";
  return `${base}-kesim.png`;
}

export function ComparisonView({
  originalUrl,
  resultUrl,
  fileName,
  isMocked,
  elapsedSeconds,
  onReset,
}: ComparisonViewProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {originalUrl ? (
          <figure className="flex flex-col gap-2">
            <figcaption className="text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase">
              Özgün
            </figcaption>
            {/* next/image kullanilmiyor: kaynak bir blob: URL ve olculeri
                onceden bilinmiyor; optimizasyon katmani burada bir sey
                kazandirmaz, yalnizca yapilandirma yuku getirir. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalUrl}
              alt="Yüklenen özgün fotoğraf"
              className="bg-muted aspect-square w-full rounded-lg border object-contain"
            />
          </figure>
        ) : null}

        <figure
          className={cn(
            "flex flex-col gap-2",
            originalUrl ? "" : "sm:col-span-2 sm:mx-auto sm:w-1/2",
          )}
        >
          <figcaption className="text-xs font-medium tracking-[0.08em] uppercase">
            Sonuç
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Arka planı kaldırılmış ürün görseli"
            className="checkerboard aspect-square w-full rounded-lg border object-contain"
          />
        </figure>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* min-h-11: indirme, akisin odul adimi — telefonda rahat
              isabet ettirilebilecek bir hedef olmali (hero'daki birincil
              eylemle ayni olcu). */}
          <a
            href={resultUrl}
            download={toDownloadName(fileName)}
            className={cn(buttonVariants({ size: "lg" }), "min-h-11 rounded-full")}
          >
            <Download className="size-4" strokeWidth={1.75} aria-hidden />
            PNG indir
          </a>
          <Button
            variant="outline"
            size="lg"
            className="min-h-11 rounded-full"
            onClick={onReset}
          >
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
            Yeni fotoğraf
          </Button>
        </div>

        <p className="text-muted-foreground text-center text-xs">
          {isMocked
            ? "Demo modu — bu sonuç örnek bir görseldir, gerçek yapay zekâ çıktısı değildir."
            : // 0.1 sn alt siniri: gercek inference her zaman saniyeler suruyor,
              // ama sahte/onbeleklenmis bir yanitta "0.0 saniyede islendi" yazisi
              // bozuk gorunuyor — o durumda sureyi hic gostermiyoruz.
              elapsedSeconds !== null && elapsedSeconds >= 0.1
              ? `${elapsedSeconds.toFixed(1)} saniyede işlendi`
              : null}
        </p>
      </div>

      {/*
        Faz 3 — kompozisyon editoru. Kesim hazir olduktan SONRA geliyor cunku
        girdisi tam olarak o: editorun var olabilmesi icin once bir kesim
        gerekiyor. Ayri bir sayfaya koymak, kullaniciyi akisin ortasinda bir
        yonlendirmeye sokardi; burada ayni ekranda devam ediyor.
      */}
      <section className="border-t pt-8">
        <div className="mb-6 text-center">
          <h3 className="display-feature">Vitrine yerleştirin</h3>
          <p className="lede mx-auto mt-2 max-w-xl text-balance">
            Ürünü bir zemin üzerine taşıyın, boyutlandırın ve satışa hazır
            görseli indirin.
          </p>
        </div>
        <CompositionEditor kesimUrl={resultUrl} dosyaAdi={fileName} />
      </section>
    </div>
  );
}
