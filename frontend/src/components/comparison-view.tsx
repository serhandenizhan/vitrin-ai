"use client";

/**
 * Inceleme ekrani: kesim hazir, kullanici sonucu degerlendiriyor.
 *
 * Bu ekranin tek isi SONUCU GOSTERMEK. Kompozisyon buradan degil, "Arka plan
 * ekle" ile acilan studyodan yapiliyor (bkz. composer/studio.tsx) — iki farkli
 * isi ayni ekrana koymak, kullaniciyi tanitim bolumlerinin ortasinda
 * calismaya zorluyordu.
 *
 * Onceki surumde ozgun ve sonuc YAN YANA iki kare olarak gosteriliyordu. Ince
 * zincir ve tas kenarlari mucevherde kalitenin belirleyicisi ve yan yana iki
 * kucuk karede bu fark gorunmuyor. Artik ikisi UST USTE, aralarindaki cizgi
 * suruklenerek: ayni pikselde once/sonra karsilastirmasi yapilabiliyor.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, RotateCcw, Sparkles, ZoomIn, ZoomOut } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
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
  const { openStudio } = useWorkspace();
  const [vitrinAiAcik, setVitrinAiAcik] = useState(false);
  const [kesimOlculeri, setKesimOlculeri] = useState<{
    genislik: number;
    yukseklik: number;
  } | null>(null);

  // Kesimin gercek olculeri: uydurma bir "kalite puani" yerine olculebilir
  // bilgi gosteriyoruz. Cozunurluk korunuyor mu sorusunun cevabi bu.
  useEffect(() => {
    const img = new window.Image();
    let iptal = false;
    img.onload = () => {
      if (!iptal) setKesimOlculeri({ genislik: img.width, yukseklik: img.height });
    };
    img.src = resultUrl;
    return () => {
      iptal = true;
    };
  }, [resultUrl]);

  return (
    <div className="flex flex-col gap-8">
      {originalUrl ? (
        <OnceSonra originalUrl={originalUrl} resultUrl={resultUrl} />
      ) : (
        <figure className="mx-auto w-full max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Arka planı kaldırılmış ürün görseli"
            className="checkerboard aspect-square w-full rounded-2xl object-contain ring-1 ring-black/10"
          />
          <figcaption className="fine-print mt-2 text-center opacity-70">
            Özgün fotoğraf burada gösterilemediği için yalnızca kesim
            görünüyor.
          </figcaption>
        </figure>
      )}

      <dl className="mx-auto grid w-full max-w-md grid-cols-3 gap-px overflow-hidden rounded-xl bg-black/8 text-center">
        <Detay
          baslik="Çözünürlük"
          deger={
            kesimOlculeri
              ? `${kesimOlculeri.genislik}×${kesimOlculeri.yukseklik}`
              : "—"
          }
        />
        <Detay baslik="Format" deger="PNG · saydam" />
        <Detay
          baslik="Süre"
          deger={
            // 0.1 sn alt siniri: gercek inference her zaman saniyeler suruyor,
            // ama sahte/onbeleklenmis bir yanitta "0.0 saniye" bozuk gorunuyor.
            elapsedSeconds !== null && elapsedSeconds >= 0.1
              ? `${elapsedSeconds.toFixed(1)} sn`
              : "—"
          }
        />
      </dl>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Birincil eylem artik INDIRME degil, kompozisyon: urunun asil
              vaadi "satisa hazir gorsel", saydam bir PNG degil. */}
          <Button
            size="lg"
            className="press min-h-11 rounded-full"
            onClick={() => openStudio({ cutoutUrl: resultUrl, fileName })}
          >
            <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden />
            Arka plan ekle
          </Button>

          {/* min-h-11: telefonda rahat isabet ettirilebilecek hedef. */}
          <a
            href={resultUrl}
            download={toDownloadName(fileName)}
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "min-h-11 rounded-full",
            )}
          >
            <Download className="size-4" strokeWidth={1.75} aria-hidden />
            Kesimi indir
          </a>

          <Button
            variant="ghost"
            size="lg"
            className="min-h-11 rounded-full"
            onClick={onReset}
          >
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
            Yeni fotoğraf
          </Button>
        </div>

        {/*
          "Vitrin AI" burada, kesim biter bitmez: kullanicinin "simdi ne
          yapayim" diye dusundugu an tam bu an. Studyonun icinde, kullanici
          zaten elle bir sahne kurmaya baslamisken teklif etmek gec kaliyordu.

          Ozellik henuz yok; dugme acikca "yakinda" diyor. Calisir gibi
          gorunup hicbir sey yapmayan bir dugme kullaniciya kendi hatasi hissi
          verirdi (bkz. kok CLAUDE.md ders 8).
        */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setVitrinAiAcik((a) => !a)}
            aria-expanded={vitrinAiAcik}
            className="sihir-dugme press inline-flex min-h-10 items-center gap-2 rounded-full px-5 text-[0.9375rem] font-medium"
          >
            <Sparkles
              className="sihir-ikon size-4"
              strokeWidth={2}
              aria-hidden
            />
            Sahneyi Vitrin AI kursun
            <span className="rounded-full bg-black/12 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-[0.04em] uppercase">
              yakında
            </span>
          </button>

          {vitrinAiAcik ? (
            <p className="fine-print max-w-sm text-center opacity-70">
              Ürününüze uyan zemini, ışığı ve açıyı sizin yerinize seçecek.
              Üzerinde çalışıyoruz; hazır olunca bu düğme açılacak.
            </p>
          ) : null}
        </div>

        {isMocked ? (
          <p className="text-muted-foreground text-center text-xs">
            Demo modu: bu sonuç örnek bir görsel, gerçek yapay zekâ çıktısı
            değil.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Detay({ baslik, deger }: { baslik: string; deger: string }) {
  return (
    <div className="bg-white px-2 py-3">
      <dt className="fine-print opacity-55">{baslik}</dt>
      <dd className="mt-0.5 text-[0.8125rem] font-medium tabular-nums">
        {deger}
      </dd>
    </div>
  );
}

/**
 * Once/sonra surgusu.
 *
 * Iki gorsel ust uste; ustteki (sonuc) `clip-path` ile soldan kirpiliyor ve
 * kirpma orani suruklenerek degistiriliyor.
 *
 * `clip-path` tercih edildi cunku genislik degistirmek gorseli YENIDEN
 * OLCEKLERDI — o zaman iki taraf ayni pikselde ust uste gelmez ve
 * karsilastirma anlamsizlasirdi. Kirpma, gorseli oldugu yerde birakiyor.
 *
 * `rounded-[inherit]`: `clip-path` yeni bir kirpma baglami acip kapsayicinin
 * yuvarlak koselerini gecersiz kiliyordu (Faz 2'de ayni tuzaga dusulmustu).
 */
const YAKINLASTIRMA = 2.6;

function OnceSonra({
  originalUrl,
  resultUrl,
}: {
  originalUrl: string;
  resultUrl: string;
}) {
  const [oran, setOran] = useState(0.5);
  const [yakin, setYakin] = useState(false);
  /** Yakinlastirma odagi, kapsayiciya gore 0-1 araliginda. */
  const [odak, setOdak] = useState({ x: 0.5, y: 0.5 });
  const kapsayiciRef = useRef<HTMLDivElement | null>(null);
  // Suruklenip suruklenmedigi REF'te: `pointermove` icinde state okunsaydi
  // kapanis eski degeri gorur ve ilk hareket yutulurdu (Faz 2'de yasandi).
  const surukleniyorRef = useRef(false);

  const oranHesapla = useCallback((istemciX: number) => {
    const kapsayici = kapsayiciRef.current;
    if (!kapsayici) return;
    const kutu = kapsayici.getBoundingClientRect();
    setOran(Math.min(1, Math.max(0, (istemciX - kutu.left) / kutu.width)));
  }, []);

  // Yakinlastirmada surukleme, cizgiyi degil ODAGI tasiyor: buyutulmus
  // goruntude gezinmek isteniyor. Cizgi bu modda alttaki kaydiracla
  // ayarlaniyor.
  const odakHesapla = useCallback((istemciX: number, istemciY: number) => {
    const kapsayici = kapsayiciRef.current;
    if (!kapsayici) return;
    const kutu = kapsayici.getBoundingClientRect();
    setOdak({
      x: Math.min(1, Math.max(0, (istemciX - kutu.left) / kutu.width)),
      y: Math.min(1, Math.max(0, (istemciY - kutu.top) / kutu.height)),
    });
  }, []);

  // Iki gorsele de AYNI donusum uygulaniyor. Farkli uygulansaydi (ornegin
  // yalnizca sonuca) taraflar ayni pikselde ust uste gelmez ve karsilastirma
  // anlamini kaybederdi.
  const donusum = yakin
    ? {
        transform: `scale(${YAKINLASTIRMA})`,
        transformOrigin: `${odak.x * 100}% ${odak.y * 100}%`,
      }
    : undefined;

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        ref={kapsayiciRef}
        className="checkerboard relative aspect-square w-full touch-none overflow-hidden rounded-2xl ring-1 ring-black/10 select-none"
        onPointerDown={(olay) => {
          surukleniyorRef.current = true;
          try {
            olay.currentTarget.setPointerCapture(olay.pointerId);
          } catch {
            // Pointer capture bazi tarayici/girdi kombinasyonlarinda
            // reddediliyor; yakalama olmadan da surukleme calisiyor.
          }
          if (yakin) odakHesapla(olay.clientX, olay.clientY);
          else oranHesapla(olay.clientX);
        }}
        onPointerMove={(olay) => {
          if (!surukleniyorRef.current) return;
          if (yakin) odakHesapla(olay.clientX, olay.clientY);
          else oranHesapla(olay.clientX);
        }}
        onPointerUp={() => {
          surukleniyorRef.current = false;
        }}
        onPointerCancel={() => {
          surukleniyorRef.current = false;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={originalUrl}
          alt="Yüklenen özgün fotoğraf"
          draggable={false}
          style={donusum}
          className="absolute inset-0 h-full w-full rounded-[inherit] object-contain"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resultUrl}
          alt="Arka planı kaldırılmış ürün görseli"
          draggable={false}
          style={{ ...donusum, clipPath: `inset(0 ${(1 - oran) * 100}% 0 0)` }}
          className="checkerboard absolute inset-0 h-full w-full rounded-[inherit] object-contain"
        />

        <div
          aria-hidden
          style={{ left: `${oran * 100}%` }}
          className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
        >
          <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-md">
            <svg viewBox="0 0 24 24" className="size-4" fill="none">
              <path
                d="M9 7 4.5 12 9 17M15 7l4.5 5-4.5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        {/*
          Buyutec: ince zincir halkalari ve tas kenarlari mucevherde kalitenin
          belirleyicisi ve normal olcude bu detay gorunmuyor. Kullanicinin
          kesimin gercekten iyi olup olmadigina karar verebilmesi icin
          yakindan bakabilmesi gerekiyor.
        */}
        <button
          type="button"
          onClick={(olay) => {
            olay.stopPropagation();
            setYakin((y) => !y);
          }}
          onPointerDown={(olay) => olay.stopPropagation()}
          aria-pressed={yakin}
          aria-label={yakin ? "Uzaklaştır" : "Yakınlaştırıp incele"}
          title={yakin ? "Uzaklaştır" : "Yakınlaştırıp incele"}
          className="press absolute right-3 bottom-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
        >
          {yakin ? (
            <ZoomOut className="size-4" strokeWidth={1.75} aria-hidden />
          ) : (
            <ZoomIn className="size-4" strokeWidth={1.75} aria-hidden />
          )}
        </button>

        <span className="fine-print pointer-events-none absolute top-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-white backdrop-blur-sm">
          Özgün
        </span>
        <span className="fine-print pointer-events-none absolute top-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-white backdrop-blur-sm">
          Kesim
        </span>
      </div>

      {/* Klavye erisimi: surukleme fare/dokunma gerektiriyor, bu kaydirac ayni
          isi klavyeyle yapabiliyor. Gorsel olarak sade tutuldu. */}
      <p className="fine-print mt-2 text-center opacity-60">
        {yakin
          ? `${YAKINLASTIRMA}× yakınlaştırıldı. Sürükleyerek gezinin, çizgiyi alttaki kaydıraçla taşıyın.`
          : "Çizgiyi sürükleyin. Yakından bakmak için büyüteci kullanın."}
      </p>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(oran * 100)}
        aria-label="Önce/sonra karşılaştırma çizgisi"
        onChange={(olay) => setOran(Number(olay.target.value) / 100)}
        className="accent-gold mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15"
      />
    </div>
  );
}
