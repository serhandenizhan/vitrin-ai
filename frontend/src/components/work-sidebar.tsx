"use client";

/**
 * Sol panel: hesap ve uygulama ayarlari.
 *
 * Kayan bir cekmece olarak duruyor, sabit bir sutun degil — sayfanin govdesi
 * tam genislikte donusumlu bolumlerden olusuyor (bkz. tasarim dili) ve kalici
 * bir sutun o ritmi bozardi. `fixed` konumlandirildigi icin acilip kapanirken
 * ana icerik hic kaymiyor.
 *
 * Duzen: ustte marka, ortada calismalar (ya da ayarlar), ALTTA ikon serit —
 * ayarlar ve onun altinda cikis. Ayarlar onceden ustte bir sekmeydi; alta
 * alinmasi paneli tek isli yapiyor (govde = calismalar) ve ayari uygulamalarda
 * beklenen yere koyuyor.
 *
 * Faz 4'ten beri gecmis hesaba bagli ve sunucuda (bkz. src/lib/work-history.ts).
 * Oturum yoksa liste yerine giris cagrisi gosteriliyor.
 */

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogIn, LogOut, Settings2, Trash2, UserRound, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import type { Settings } from "@/lib/settings-store";
import { cn } from "@/lib/utils";

export function WorkSidebar() {
  const {
    isSidebarOpen,
    closeSidebar,
    works,
    removeAllWorks,
    settings,
    updateSettings,
    openSignIn,
    user,
    signOut,
  } = useWorkspace();
  const router = useRouter();

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
      {/* Karartma her zaman DOM'da: kosullu mount/unmount ile kapanirken
          hicbir gecis calismiyor, oge bir anda yok oluyordu. */}
      <button
        type="button"
        aria-label="Paneli kapat"
        aria-hidden={!isSidebarOpen}
        tabIndex={isSidebarOpen ? 0 : -1}
        onClick={closeSidebar}
        className={cn(
          // Perde ve cekmece yuzen ust cubugun (z-50) USTUNDE: telefonda cubuk
          // cekmecenin baslik satirini ortuyor, "Paneli kapat" dugmesine
          // dokunulamiyordu (mobil kontrol, 13.09.2026).
          "drawer-backdrop fixed inset-0 z-[52] bg-black/45 backdrop-blur-[2px]",
          isSidebarOpen && "drawer-backdrop-open",
        )}
      />

      <aside
        aria-label="Hesap ve ayarlar"
        /* `inert` ile kapaliyken icerik klavye/ekran okuyucu icin de
           erisilemez oluyor; yalnizca gorunmez yapmak yetmiyordu. */
        inert={!isSidebarOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-[55] flex w-[min(20rem,88vw)] flex-col border-r border-white/20 bg-[#171614]/82 text-[#f5f5f7] backdrop-blur-3xl backdrop-saturate-150",
          // Kayma `drawer` / `drawer-open` ile — sebebi globals.css'te yazili.
          "drawer",
          // Golge YALNIZCA acikken: kapali cekmece ekran disinda duruyor ama
          // 24px kaymali 70px'lik golgesi ~60px sayfanin icine tasiyor ve
          // acik bolumlerde sol kenarda gri bir serit gibi gorunuyordu.
          isSidebarOpen && "drawer-open shadow-[24px_0_70px_-32px_rgba(0,0,0,0.78)]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <span className="flex items-center gap-2 text-[1.0625rem]">
            <BrandMark className="text-gold h-[1.45rem] w-auto" />
            <span className="font-semibold tracking-[-0.01em]">Ayarlar</span>
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SettingsPanel
            settings={settings}
            onChange={updateSettings}
            workCount={works.length}
            onClearAll={removeAllWorks}
          />
        </div>

        {/* Alt serit: ayarlar, altinda cikis */}
        <div className="flex shrink-0 flex-col gap-1 border-t border-white/10 p-2">
          {/* Oturum varsa cikis, yoksa giris. Olmayan bir oturumdan "cikis"
              gostermek yaniltici olurdu. */}
          {user ? (
            <RailButton
              Icon={UserRound}
              label="Hesabım"
              onClick={() => {
                closeSidebar();
                router.push("/hesap");
              }}
            />
          ) : null}
          {user ? (
            <RailButton
              Icon={LogOut}
              label="Çıkış yap"
              hint={user.email ?? undefined}
              onClick={() => void signOut()}
            />
          ) : (
            <RailButton Icon={LogIn} label="Giriş yap" onClick={openSignIn} />
          )}
        </div>
      </aside>
    </>
  );
}

type RailButtonProps = {
  Icon: typeof Settings2;
  label: string;
  hint?: string;
  isActive?: boolean;
  isMuted?: boolean;
  onClick: () => void;
};

function RailButton({
  Icon,
  label,
  hint,
  isActive,
  isMuted,
  onClick,
}: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={hint}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.875rem] transition-colors",
        isActive
          ? "bg-white/12 text-[#f5f5f7]"
          : isMuted
            ? "text-[#f5f5f7]/45 hover:bg-white/8 hover:text-[#f5f5f7]/70"
            : "text-[#f5f5f7]/75 hover:bg-white/8 hover:text-[#f5f5f7]",
      )}
    >
      <Icon className="size-[1.05rem] shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex min-w-0 flex-col items-start">
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="text-[0.6875rem] text-[#f5f5f7]/40">{hint}</span>
        ) : null}
      </span>
    </button>
  );
}


function SettingsPanel({
  settings,
  onChange,
  workCount,
  onClearAll,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  workCount: number;
  onClearAll: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-[#f5f5f7]/45 uppercase">
        Ayarlar
      </h2>

      <SettingsGroup title="Çalışmalar">
        <Toggle
          label="Çalışmalarımı sakla"
          description="Yeni sonuçları hesabınızdaki geçmişe ekler."
          checked={settings.historyEnabled}
          onChange={(value) => onChange({ historyEnabled: value })}
        />
        <Toggle
          label="Silmeden önce sor"
          description="Tek çalışma ve tüm geçmiş silmelerinde onay ister."
          checked={settings.confirmDeletes}
          onChange={(value) => onChange({ confirmDeletes: value })}
        />
      </SettingsGroup>

      <SettingsGroup title="Görünüm ve erişilebilirlik">
        <Toggle
          label="Kompakt çalışma ızgarası"
          description="Çalışmalar panelinde aynı anda daha fazla kart gösterir."
          checked={settings.compactSidebar}
          onChange={(value) => onChange({ compactSidebar: value })}
        />
        <Toggle
          label="Yüksek kontrast"
          description="İkincil metinleri ve cam yüzey kenarlarını belirginleştirir."
          checked={settings.highContrast}
          onChange={(value) => onChange({ highContrast: value })}
        />
        <Toggle
          label="Hareketi azalt"
          description="Geçiş ve kaydırma animasyonlarını kapatır."
          checked={settings.reduceMotion}
          onChange={(value) => onChange({ reduceMotion: value })}
        />
      </SettingsGroup>

      <SettingsGroup title="Hesap">
        <SettingsLink href="/hesap" label="Profil ve güvenlik" />
        <SettingsLink href="/hesap#abonelik" label="Paket, kredi ve ödemeler" />
        <SettingsLink href="/gizlilik" label="Gizlilik tercihleri" />
      </SettingsGroup>

      <div className="border-t border-white/10 pt-5">
        <p className="text-[0.8125rem] font-medium">Geçmişi temizle</p>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-[#f5f5f7]/55">
          {workCount > 0
            ? `${workCount} çalışma hesabınızdan kalıcı olarak silinir.`
            : "Silinecek çalışma yok."}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={workCount === 0}
          onClick={() => {
            if (!settings.confirmDeletes || window.confirm("Tüm çalışma geçmişiniz kalıcı olarak silinsin mi?")) {
              onClearAll();
            }
          }}
          className="mt-3 min-h-9 rounded-full border-white/20 bg-transparent text-[#f5f5f7] hover:bg-white/10 hover:text-[#f5f5f7]"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
          Tümünü sil
        </Button>
      </div>

      <p className="border-t border-white/10 pt-5 text-[0.6875rem] leading-relaxed text-[#f5f5f7]/45">
        Tercihler bu tarayıcıda saklanır. Özgün fotoğraflarınız sunucuda
        tutulmaz; yalnızca kaydetmeyi seçtiğiniz sonuçlar hesabınızda durur.
      </p>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4 first:border-0 first:pt-0">
      <h3 className="text-[0.6875rem] font-semibold tracking-[0.07em] text-[#f5f5f7]/45 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-10 items-center justify-between rounded-lg px-2 text-[0.8125rem] text-[#f5f5f7]/75 transition-colors hover:bg-white/8 hover:text-white"
    >
      {label}
      <ChevronRight className="size-3.5 opacity-50" strokeWidth={1.75} aria-hidden />
    </Link>
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
