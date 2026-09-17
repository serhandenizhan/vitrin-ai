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
import { useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";

import { CompositionEditor } from "@/components/composer/composition-editor";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { storeCatalogImport } from "@/lib/catalog-handoff";

export function Studio() {
  const { studio, closeStudio, returnToStart } = useWorkspace();
  const router = useRouter();

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
      /*
        KOYU ARAC YUZEYI (17.09.2026, Serhan). Studyo bir SAYFA degil bir ARAC:
        koyu zemin urunun kendi rengini dogru gosteriyor (beyaz panelin
        yanindaki altin, urunun uzerindeki altini yaniltiyordu) ve camli
        denetci/dock tuvali tamamen ortmeden uzerinde durabiliyor. Kilitli
        tasarim dili iptal edilmedi; bkz. kok CLAUDE.md "arac yuzeyi".
      */
      className="soft-fade surface-black fixed inset-0 z-[60] flex flex-col overflow-y-auto"
    >
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0c0b0a]/80 px-4 backdrop-blur-xl sm:px-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={closeStudio}
          className="press -ml-1 rounded-full border-white/20 bg-white/5 text-[#f3f0eb] hover:bg-white/10 hover:text-[#f3f0eb]"
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
          className="press -mr-1 rounded-full border-white/20 bg-white/5 text-[#f3f0eb] hover:bg-white/10 hover:text-[#f3f0eb]"
        >
          <Home className="size-4" strokeWidth={1.75} aria-hidden />
          Ana menü
        </Button>
      </header>

      {/*
        Editor artik kendi duzenini kuruyor (yuzen denetci + alt dock), bu
        yuzden eski `max-w-7xl` + padding sarmalayicisi kaldirildi: dock'un
        tuvalin uzerinde dogru yerde durabilmesi icin kapsayicinin tam
        genislikte ve konumlandirma baglami olmasi gerekiyor.
      */}
      <div className="relative w-full flex-1">
        <CompositionEditor
          cutoutUrl={studio.cutoutUrl}
          fileName={studio.fileName}
          onReturnToStart={returnToStart}
          onSendToCatalog={(dataUrl) => {
            if (!storeCatalogImport(dataUrl)) return false;
            router.push("/katalog");
            return true;
          }}
        />
      </div>
    </div>
  );
}
