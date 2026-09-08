"use client";

/**
 * Sol panel: gecmis calismalar ve ayarlar.
 *
 * Kayan bir cekmece olarak duruyor, sabit bir sutun degil — sayfanin
 * govdesi tam genislikte donusumlu bolumlerden olusuyor (bkz. tasarim dili)
 * ve kalici bir sutun o ritmi bozardi. Cekmece `fixed` konumlandirildigi
 * icin acilip kapanirken ana icerik hic kaymiyor.
 *
 * Gecmisin GECICI oldugu panelde acikca yaziyor — sessizce tarayiciya
 * kaydedip kullaniciya "calismalarim" demek yaniltici olurdu
 * (bkz. src/lib/work-history.ts bas kismi).
 */

import { useEffect, useMemo, useState } from "react";
import { Clock, Settings2, Trash2, X } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkRecord } from "@/lib/work-history";

type Tab = "works" | "settings";

export function WorkSidebar() {
  const {
    isSidebarOpen,
    closeSidebar,
    works,
    isHistoryLoaded,
    removeWork,
    removeAllWorks,
    openWork,
    settings,
    updateSettings,
  } = useWorkspace();

  const [tab, setTab] = useState<Tab>("works");

  // Cekmece acikken Esc kapatsin.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSidebarOpen, closeSidebar]);

  return (
    <>
      {/* Karartma — disariya tiklayinca kapanir */}
      {isSidebarOpen ? (
        <button
          type="button"
          aria-label="Paneli kapat"
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
        />
      ) : null}

      <aside
        aria-label="Çalışmalarım ve ayarlar"
        /* `inert` ile kapaliyken icerik klavye/ekran okuyucu icin de
           erisilemez oluyor; yalnizca gorunmez yapmak yetmiyordu. */
        inert={!isSidebarOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-white/10 bg-[#1d1d1f] text-[#f5f5f7] shadow-2xl",
          // Kayma `drawer` / `drawer-open` ile — sebebi globals.css'te yazili.
          "drawer",
          isSidebarOpen && "drawer-open",
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
            Vitrin <span className="text-gold">AI</span>
          </span>
          <button
            type="button"
            onClick={closeSidebar}
            aria-label="Paneli kapat"
            className="flex size-9 items-center justify-center rounded-full text-[#f5f5f7]/70 transition-colors hover:bg-white/10 hover:text-[#f5f5f7]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Sekmeler */}
        <div className="flex shrink-0 gap-1 border-b border-white/10 p-2">
          <TabButton
            isActive={tab === "works"}
            onClick={() => setTab("works")}
            Icon={Clock}
            label="Çalışmalarım"
            badge={works.length > 0 ? works.length : undefined}
          />
          <TabButton
            isActive={tab === "settings"}
            onClick={() => setTab("settings")}
            Icon={Settings2}
            label="Ayarlar"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "works" ? (
            <WorksPanel
              works={works}
              isLoaded={isHistoryLoaded}
              historyEnabled={settings.historyEnabled}
              onOpen={openWork}
              onDelete={removeWork}
            />
          ) : (
            <SettingsPanel
              settings={settings}
              onChange={updateSettings}
              workCount={works.length}
              onClearAll={removeAllWorks}
            />
          )}
        </div>
      </aside>
    </>
  );
}

type TabButtonProps = {
  isActive: boolean;
  onClick: () => void;
  Icon: typeof Clock;
  label: string;
  badge?: number;
};

function TabButton({ isActive, onClick, Icon, label, badge }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[0.8125rem] font-medium transition-colors",
        isActive
          ? "bg-white/12 text-[#f5f5f7]"
          : "text-[#f5f5f7]/60 hover:text-[#f5f5f7]",
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {label}
      {badge !== undefined ? (
        <span className="bg-gold ml-0.5 rounded-full px-1.5 text-[0.625rem] font-semibold text-black tabular-nums">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function WorksPanel({
  works,
  isLoaded,
  historyEnabled,
  onOpen,
  onDelete,
}: {
  works: WorkRecord[];
  isLoaded: boolean;
  historyEnabled: boolean;
  onOpen: (work: WorkRecord) => void;
  onDelete: (id: string) => void;
}) {
  if (!historyEnabled) {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-[#f5f5f7]/60">
        Geçmiş kaydı kapalı. Ayarlar sekmesinden açabilirsiniz.
      </p>
    );
  }

  if (!isLoaded) {
    return (
      <p className="text-[0.8125rem] text-[#f5f5f7]/50">Yükleniyor…</p>
    );
  }

  if (works.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[0.8125rem] font-medium">Henüz çalışma yok</p>
        <p className="text-[0.8125rem] leading-relaxed text-[#f5f5f7]/60">
          Bir fotoğrafın arka planını kaldırdığınızda sonuç burada birikir ve
          tek tıkla geri açılır.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {works.map((work) => (
          <WorkRow
            key={work.id}
            work={work}
            onOpen={() => onOpen(work)}
            onDelete={() => onDelete(work.id)}
          />
        ))}
      </ul>

      {/* Geciciligin acikca yazildigi yer — bkz. lib/work-history.ts */}
      <p className="mt-2 border-t border-white/10 pt-3 text-[0.6875rem] leading-relaxed text-[#f5f5f7]/45">
        Çalışmalar yalnızca <strong className="font-medium">bu cihazda</strong>{" "}
        ve bu tarayıcıda saklanıyor; başka bir cihazdan görünmez. Hesap sistemi
        geldiğinde geçmiş hesabınıza taşınacak. En son {works.length} çalışma
        tutulur.
      </p>
    </div>
  );
}

function WorkRow({
  work,
  onOpen,
  onDelete,
}: {
  work: WorkRecord;
  onOpen: () => void;
  onDelete: () => void;
}) {
  // Blob'dan URL uretmek pahali degil ama SERBEST BIRAKILMALI; aksi halde
  // panel her acildiginda bellekte yeni bir kopya birikiyor.
  const thumbUrl = useMemo(
    () => URL.createObjectURL(work.thumbnail),
    [work.thumbnail],
  );
  useEffect(() => () => URL.revokeObjectURL(thumbUrl), [thumbUrl]);

  return (
    <li className="group flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-white/8">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl}
          alt=""
          className="checkerboard size-11 shrink-0 rounded-md object-contain"
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[0.8125rem] font-medium">
            {work.fileName}
          </span>
          <span className="text-[0.6875rem] text-[#f5f5f7]/50">
            {formatRelative(work.createdAt)}
            {work.isMocked ? " · demo" : ""}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`${work.fileName} kaydını sil`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#f5f5f7]/40 transition-colors hover:bg-white/10 hover:text-[#f5f5f7]"
      >
        <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
      </button>
    </li>
  );
}

function SettingsPanel({
  settings,
  onChange,
  workCount,
  onClearAll,
}: {
  settings: { historyEnabled: boolean; reduceMotion: boolean };
  onChange: (patch: Partial<{ historyEnabled: boolean; reduceMotion: boolean }>) => void;
  workCount: number;
  onClearAll: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Toggle
        label="Çalışmaları bu cihazda sakla"
        description="Kapatırsanız yeni sonuçlar kaydedilmez. Mevcut kayıtlar silinmez."
        checked={settings.historyEnabled}
        onChange={(value) => onChange({ historyEnabled: value })}
      />

      <Toggle
        label="Hareketi azalt"
        description="Kaydırma animasyonlarını kapatır. İşletim sisteminizde bu ayar zaten açıksa animasyonlar hep kapalıdır."
        checked={settings.reduceMotion}
        onChange={(value) => onChange({ reduceMotion: value })}
      />

      <div className="border-t border-white/10 pt-5">
        <p className="text-[0.8125rem] font-medium">Geçmişi temizle</p>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-[#f5f5f7]/55">
          {workCount > 0
            ? `${workCount} çalışma bu cihazdan kalıcı olarak silinir.`
            : "Silinecek çalışma yok."}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={workCount === 0}
          onClick={onClearAll}
          className="mt-3 min-h-9 rounded-full border-white/20 bg-transparent text-[#f5f5f7] hover:bg-white/10 hover:text-[#f5f5f7]"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
          Tümünü sil
        </Button>
      </div>

      <p className="border-t border-white/10 pt-5 text-[0.6875rem] leading-relaxed text-[#f5f5f7]/45">
        Hesap, kredi ve ekip ayarları hesap sistemiyle birlikte gelecek. Şu
        anda kayıt gerekmiyor ve fotoğraflarınız sunucuda saklanmıyor.
      </p>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[0.8125rem] font-medium">{label}</span>
        <span className="mt-1 text-[0.75rem] leading-relaxed text-[#f5f5f7]/55">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-gold" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200 motion-reduce:transition-none",
            checked ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** "3 dk önce" gibi kisa bir zaman ifadesi. */
function formatRelative(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "az önce";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  return `${days} gün önce`;
}
