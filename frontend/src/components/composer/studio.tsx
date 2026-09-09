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
import { ArrowLeft } from "lucide-react";

import { CompositionEditor } from "@/components/composer/composition-editor";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";

export function Studio() {
  const { studyo, studyoKapat } = useWorkspace();

  // Escape ile cikis ve arkadaki sayfanin kaydirilmasinin durdurulmasi.
  // Katman acikken arka planin kaydirilabilmesi, kullaniciyi "hangi sayfadayim"
  // sorusuna dusuruyor.
  useEffect(() => {
    if (!studyo) return;

    function tusaBasildi(olay: KeyboardEvent) {
      if (olay.key === "Escape") studyoKapat();
    }
    document.addEventListener("keydown", tusaBasildi);

    const oncekiTasma = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", tusaBasildi);
      document.body.style.overflow = oncekiTasma;
    };
  }, [studyo, studyoKapat]);

  if (!studyo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kompozisyon stüdyosu"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white"
    >
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-black/8 bg-white/85 px-4 backdrop-blur-xl sm:px-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={studyoKapat}
          className="press -ml-2 rounded-full"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
          Geri
        </Button>

        <span className="mx-auto flex items-center gap-2">
          <BrandMark className="size-5" aria-hidden />
          <span className="text-[0.9375rem] font-medium tracking-[-0.01em]">
            Stüdyo
          </span>
        </span>

        {/* Sagda gorunmez bir denge blogu: baslik ortada kalsin. */}
        <span aria-hidden className="w-[4.5rem]" />
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <CompositionEditor
          kesimUrl={studyo.kesimUrl}
          dosyaAdi={studyo.dosyaAdi}
        />
      </div>
    </div>
  );
}
