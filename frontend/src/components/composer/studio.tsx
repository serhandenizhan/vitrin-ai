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
import { ArrowLeft, Download, Home, Keyboard } from "lucide-react";

import {
  CompositionEditor,
  type EditorStatus,
  type StudioNavigation,
} from "@/components/composer/composition-editor";
import { STUDIO_STEPS } from "@/components/composer/studio-steps";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { storeCatalogImport } from "@/lib/catalog-handoff";
import { createSerialWriteQueue } from "@/lib/serial-write-queue";

export function Studio() {
  const { studio, works, closeStudio, returnToStart, updateWorkStatus } = useWorkspace();
  const router = useRouter();
  // Taslak kaydi calismanin DURUMUNU degistirmez, yalnizca editor ayarini
  // yazar. Tamamlanmis bir calisma kaydedilince "draft" gondermek onu
  // "Yarım kalan"a geri dusuruyor ve backend indirme zamanini siliyordu.
  // Iki kaynak: listedeki kayit (onceden indirilmis) ve bu oturumdaki
  // indirme (liste yuklu sayfada olmayabilir ya da henuz guncellenmemis olabilir).
  const downloadedHereRef = useRef(false);
  // Taslak ve indirme aynı proje satırını güncelliyor. İstekler üst üste
  // gönderilirse eski bir taslak, tamamlandı kaydından sonra işlenebiliyor.
  const [enqueueWrite] = useState(createSerialWriteQueue);
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
  const navigateRef = useRef<((request: StudioNavigation) => void) | null>(null);
  const requestTool = (tool: string, stage?: number) => navigateRef.current?.({ tool, stage });
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
      className="studio-backdrop soft-fade fixed inset-0 z-[60] flex flex-col overflow-y-auto text-[#1a1917]"
    >
      <header className="liquid-glass sticky top-3 z-20 mx-auto mt-3 grid h-14 w-[calc(100%-1.5rem)] max-w-[60rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-full px-2.5 text-[#f3f0eb]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={closeStudio}
          className="press rounded-full border-0 bg-transparent text-[#f3f0eb]/80 shadow-none hover:bg-white/10 hover:text-[#f3f0eb] justify-self-start"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
          Geri
        </Button>

        {/* Referans gorsel (19.09.2026): ortada ad, altinda numarali adimlar;
            secili adimin altinda altin cizgi. Adima basmak o adimin ilk aracini acar. */}
        <span className="mx-auto flex min-w-0 flex-col items-center">
          <span className="flex items-center gap-2">
            <BrandMark className="text-gold h-4 w-auto" />
            <span className="text-[0.875rem] font-medium tracking-[-0.01em]">Stüdyo</span>
            <span
              className="sr-only"
              aria-label={`${editorStatus.step}. adım: ${editorStatus.stepLabel}, ${editorStatus.toolLabel}`}
            >
              · {editorStatus.toolLabel}
            </span>
          </span>
          <StepNav status={editorStatus} onRequest={requestTool} />
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
              variant="ghost"
              size="sm"
              onClick={() => setIsHelpOpen((open) => !open)}
              aria-expanded={isHelpOpen}
              aria-haspopup="dialog"
              className="press rounded-full border-0 bg-transparent text-[#f3f0eb]/80 shadow-none hover:bg-white/10 hover:text-[#f3f0eb] px-2.5"
            >
              <Keyboard className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="hidden lg:inline">Kısayollar</span>
            </Button>
            {isHelpOpen ? (
              <span
                role="dialog"
                aria-label="Klavye kısayolları"
                className="liquid-glass soft-enter absolute top-full right-0 mt-3 block w-64 rounded-2xl p-3.5 text-left"
              >
                <span className="mb-2 block text-[0.8125rem] font-medium">Klavye kısayolları</span>
                <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[0.75rem]">
                  <kbd className="rounded-md bg-white/10 px-2 py-1">← ↑ ↓ →</kbd><span className="on-dark-muted self-center">Ürünü taşı</span>
                  <kbd className="rounded-md bg-white/10 px-2 py-1">Shift + ok</kbd><span className="on-dark-muted self-center">Hızlı taşı</span>
                  <kbd className="rounded-md bg-white/10 px-2 py-1">⌘/Ctrl + Z</kbd><span className="on-dark-muted self-center">Geri al</span>
                  <kbd className="rounded-md bg-white/10 px-2 py-1">Boşluk</kbd><span className="on-dark-muted self-center">Önizle (basılı tut, Düzenle)</span>
                  <kbd className="rounded-md bg-white/10 px-2 py-1">Esc</kbd><span className="on-dark-muted self-center">Pencereyi kapat</span>
                </span>
              </span>
            ) : null}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={returnToStart}
            className="press rounded-full border-0 bg-transparent text-[#f3f0eb]/80 shadow-none hover:bg-white/10 hover:text-[#f3f0eb]"
          >
            <Home className="size-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden xl:inline">Ana menü</span>
          </Button>
          {/* Referanstaki birincil eylem: altin "Disa Aktar" -> Indir araci. */}
          <button
            type="button"
            onClick={() => requestTool("indir")}
            // Masaustunde gizli: asamali akisi atlatirdi (indirme Asama 3'te).
            className="press bg-gold hover:bg-gold/90 ml-1 flex h-9 lg:hidden items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium text-[#1a1917] shadow-[0_6px_16px_-8px_rgb(209_162_91/0.8)] transition-colors"
          >
            <Download className="size-4" strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Dışa Aktar</span>
          </button>
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
          navigateRef={navigateRef}
          onSave={studio.workId ? (draft) => enqueueWrite(() => updateWorkStatus(studio.workId!, saveStatus(), draft)) : undefined}
          onDownloaded={
            studio.workId
              ? () => {
                  downloadedHereRef.current = true;
                  return enqueueWrite(() => updateWorkStatus(studio.workId!, "completed"));
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

/**
 * Ust bardaki numarali adimlar. Secili adimin altinda altin cizgi — GECISSIZ
 * (Serhan, 19.09.2026: kayan cizgi denendi, asamalar arasi bütün gecislerle
 * birlikte kaldirildi).
 */
function StepNav({
  status,
  onRequest,
}: {
  status: EditorStatus;
  onRequest: (tool: string, stage?: number) => void;
}) {
  return (
    <nav aria-label="Düzenleme adımları" className="hidden items-center sm:flex">
      {STUDIO_STEPS.map((item, index) => {
        const isCurrent = status.step === item.step;
        // Masaustu asamali akis: yalnizca GERIYE; ileri ancak ✓ ile.
        const isLocked = status.mode === "stages" && item.step > status.step;
        return (
          <span key={item.step} className="flex items-center">
            {index > 0 ? <span className="mx-1 h-2.5 w-px bg-white/15" aria-hidden /> : null}
            <button
              type="button"
              onClick={() => onRequest(item.tool, item.step)}
              disabled={isLocked}
              aria-current={isCurrent ? "step" : undefined}
              className={
                "press relative flex items-center gap-1.5 px-2 pt-0.5 pb-1 text-[0.6875rem] disabled:cursor-default disabled:opacity-40 " +
                (isCurrent ? "text-[#f3f0eb]" : "on-dark-muted hover:text-[#f3f0eb]")
              }
            >
              <span className={"tabular-nums " + (isCurrent ? "text-gold" : "")}>0{item.step}</span>
              {item.label}
              {isCurrent ? <span aria-hidden className="bg-gold absolute inset-x-2 bottom-0 h-px rounded-full" /> : null}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
