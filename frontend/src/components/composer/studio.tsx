"use client";

/**
 * Studyo — kompozisyon icin acilan tam ekran calisma alani.
 *
 * Neden ayri bir "alan": arka plan kaldirma ile kompozisyon kurma iki farkli
 * is. Ikisini ayni sayfada alt alta gostermek, kullaniciyi tanitim
 * bolumlerinin ortasinda calismaya zorluyordu — sayfayi kaydirdiginda editor
 * ekrandan cikiyor, geri gelmek icin ariyor. Studyo ekranin tamamini aliyor;
 * icinde tanitim metni, kaydirma ya da dikkat dagitan baska bir sey yok.
 *
 * Ayri bir ROTA degil, tam ekran bir katman — gerekcesi
 * `workspace-provider.tsx` icinde (`blob:` URL'i rota degisimi arasinda
 * tasimak, kullanicinin gormedigi bir karmasiklik olurdu).
 */

import { useEffect } from "react";
import { ArrowLeft, Home } from "lucide-react";

import { CompositionEditor } from "@/components/composer/composition-editor";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";

export function Studio() {
  const { studio, closeStudio, returnToStart } = useWorkspace();

  // Escape ile cikis ve arkadaki sayfanin kaydirilmasinin durdurulmasi.
  // Katman acikken arka planin kaydirilabilmesi, kullaniciyi "hangi sayfadayim"
  // sorusuna dusuruyor.
  useEffect(() => {
    if (!studio) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeStudio();
    }
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [studio, closeStudio]);

  if (!studio) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kompozisyon stüdyosu"
      /*
        z-60: site basligi ve kenar cubugu z-50'de. Studyo da z-50 iken ust
        56 px'teki her tiklamayi SITE BASLIGI yutuyordu — esit z-index'te
        kazanani DOM sirasi belirliyor ve site basligi studyodan sonra
        geliyor. Sonuc: "Geri" ve "Ana menu" dugmeleri gorunuyor ama
        basilamiyordu. (Kok CLAUDE.md ders 13'un ayni sinifi: esit
        ozgullukte/oncelikte kazanani SIRA belirler.)
      */
      className="soft-fade fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-white"
    >
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-black/8 bg-white/85 px-4 backdrop-blur-xl sm:px-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={closeStudio}
          className="press -ml-1 rounded-full bg-white"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
          Geri
        </Button>

        <span className="mx-auto flex items-center gap-2">
          <BrandMark className="text-gold h-5 w-auto" />
          <span className="text-[0.9375rem] font-medium tracking-[-0.01em]">
            Stüdyo
          </span>
        </span>

        {/*
          "Geri" inceleme ekranina donuyor; is bittiginde (gorsel indirildikten
          sonra) oraya donmek bir cikmaz -- ayni fotografin sonucu. "Ana menu"
          akisi bastan basliyor: studio kapaniyor, arac bos duruma aliniyor ve
          sayfa basa kaydiriliyor.
        */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={returnToStart}
          className="press -mr-1 rounded-full bg-white"
        >
          <Home className="size-4" strokeWidth={1.75} aria-hidden />
          Ana menü
        </Button>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <CompositionEditor
          cutoutUrl={studio.cutoutUrl}
          fileName={studio.fileName}
        />
      </div>
    </div>
  );
}
