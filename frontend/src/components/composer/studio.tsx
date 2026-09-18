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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Keyboard } from "lucide-react";

import {
  CompositionEditor,
  type EditorStatus,
} from "@/components/composer/composition-editor";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { storeCatalogImport } from "@/lib/catalog-handoff";

export function Studio() {
  const { studio, works, closeStudio, returnToStart, updateWorkStatus } = useWorkspace();
  const router = useRouter();
  // Taslak kaydi calismanin DURUMUNU degistirmez, yalnizca editor ayarini
  // yazar. Tamamlanmis bir calisma kaydedilince "draft" gondermek onu
  // "Yarım kalan"a geri dusuruyor ve backend indirme zamanini siliyordu.
  // Iki kaynak: listedeki kayit (onceden indirilmis) ve bu oturumdaki
  // indirme (liste yuklu sayfada olmayabilir ya da henuz guncellenmemis olabilir).
  const downloadedHereRef = useRef(false);
  const saveStatus = (): "draft" | "completed" =>
    downloadedHereRef.current || works.some((work) => work.id === studio?.workId && work.status === "completed")
      ? "completed"
      : "draft";
  const workId = studio?.workId;
  useEffect(() => {
    downloadedHereRef.current = false;
  }, [workId]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const helpRef = useRef<HTMLDivElement | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [editorStatus, setEditorStatus] = useState<EditorStatus>({
    step: 1,
    totalSteps: 3,
    stepLabel: "Boyut",
    toolLabel: "Zemin",
  });
  const updateEditorStatus = useCallback((status: EditorStatus) => {
    setEditorStatus(status);
  }, []);

  useEffect(() => {
    if (!isHelpOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!helpRef.current?.contains(event.target as Node)) setIsHelpOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isHelpOpen]);

  // Escape ile cikis ve arkadaki sayfanin kaydirilmasinin durdurulmasi.
  // Katman acikken arka planin kaydirilabilmesi, kullaniciyi "hangi sayfadayim"
  // sorusuna dusuruyor.
  useEffect(() => {
    if (!studio) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Dialog portal kullanmiyor; SiteShell icinde header/main/footer ile ayni
    // React kokunde. Bu nedenle yalniz body cocuklarini degil, dialogdan
    // body'ye kadar HER seviyedeki kardesleri etkisizlestirmek gerekiyor.
    const inertSiblings: HTMLElement[] = [];
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement && !inertSiblings.includes(sibling)) {
          inertSiblings.push(sibling);
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    const originallyInert = inertSiblings.map((element) => element.hasAttribute("inert"));
    inertSiblings.forEach((element) => element.setAttribute("inert", ""));

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => {
          if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
          let current: HTMLElement | null = element;
          while (current && current !== dialog) {
            const style = window.getComputedStyle(current);
            if (style.display === "none" || style.visibility === "hidden") return false;
            current = current.parentElement;
          }
          return true;
        },
      );

    focusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        closeStudio();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      inertSiblings.forEach((element, index) => {
        if (!originallyInert[index]) element.removeAttribute("inert");
      });
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [studio, closeStudio]);

  if (!studio) return null;

  return (
    <div
      ref={dialogRef}
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
      className="soft-fade fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-white text-[#1a1917]"
    >
      <header className="glass-panel sticky top-3 z-20 mx-auto mt-3 grid h-14 w-[calc(100%-1.5rem)] max-w-[68rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-full px-4 sm:px-5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={closeStudio}
          className="press justify-self-start -ml-1 rounded-full border-white/20 bg-white/5 text-[#f3f0eb] hover:bg-white/10 hover:text-[#f3f0eb]"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
          Geri
        </Button>

        <span className="mx-auto flex min-w-0 items-center gap-2.5">
          <span className="flex items-center gap-2">
            <BrandMark className="text-gold h-5 w-auto" />
            <span className="text-[0.9375rem] font-medium tracking-[-0.01em]">
              Stüdyo
            </span>
          </span>
          <span className="hidden h-5 w-px bg-white/20 sm:block" aria-hidden />
          <span
            className="on-dark-muted hidden max-w-36 truncate text-[0.75rem] sm:block"
            aria-label={`${editorStatus.step}. adım: ${editorStatus.stepLabel}, ${editorStatus.toolLabel}`}
          >
            {editorStatus.step}/{editorStatus.totalSteps} · {editorStatus.toolLabel}
          </span>
        </span>

        {/*
          "Geri" inceleme ekranina donuyor; is bittiginde (gorsel indirildikten
          sonra) oraya donmek bir cikmaz -- ayni fotografin sonucu. "Ana menu"
          akisi bastan basliyor: studio kapaniyor, arac bos duruma aliniyor ve
          sayfa basa kaydiriliyor.
        */}
        <span className="flex items-center justify-self-end gap-1.5">
          <span
            ref={helpRef}
            className="relative"
            onKeyDown={(event) => {
              if (!isHelpOpen || event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              setIsHelpOpen(false);
            }}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsHelpOpen((open) => !open)}
              aria-expanded={isHelpOpen}
              aria-haspopup="dialog"
              className="press rounded-full border-white/20 bg-white/5 px-2.5 text-[#f3f0eb] hover:bg-white/10 hover:text-[#f3f0eb]"
            >
              <Keyboard className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="hidden lg:inline">Kısayollar</span>
            </Button>
            {isHelpOpen ? (
              <span
                role="dialog"
                aria-label="Klavye kısayolları"
                className="glass-panel soft-enter absolute top-full right-0 mt-2 block w-64 rounded-2xl p-3 text-left"
              >
                <span className="mb-2 block text-[0.8125rem] font-medium">Klavye kısayolları</span>
                <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[0.75rem]">
                  <kbd className="rounded-md bg-white/10 px-2 py-1">← ↑ ↓ →</kbd><span className="on-dark-muted self-center">Ürünü taşı</span>
                  <kbd className="rounded-md bg-white/10 px-2 py-1">Shift + ok</kbd><span className="on-dark-muted self-center">Hızlı taşı</span>
                  <kbd className="rounded-md bg-white/10 px-2 py-1">⌘/Ctrl + Z</kbd><span className="on-dark-muted self-center">Geri al</span>
                  <kbd className="rounded-md bg-white/10 px-2 py-1">Esc</kbd><span className="on-dark-muted self-center">Pencereyi kapat</span>
                </span>
              </span>
            ) : null}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={returnToStart}
            className="press -mr-1 rounded-full border-white/20 bg-white/5 text-[#f3f0eb] hover:bg-white/10 hover:text-[#f3f0eb]"
          >
            <Home className="size-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Ana menü</span>
          </Button>
        </span>
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
          initialDraft={studio.initialDraft}
          onReturnToStart={returnToStart}
          onStatusChange={updateEditorStatus}
          onSave={studio.workId ? (draft) => updateWorkStatus(studio.workId!, saveStatus(), draft) : undefined}
          onDownloaded={
            studio.workId
              ? () => {
                  downloadedHereRef.current = true;
                  return updateWorkStatus(studio.workId!, "completed");
                }
              : undefined
          }
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
