"use client";

/**
 * Sol panel, gecmis ve ayarlar icin paylasilan durum.
 *
 * Neden context: sayfanin govdesi sunucu bileseni (tanitim bolumleri
 * istemciye hic inmiyor), ama uc ayri istemci parcasinin ayni durumu
 * gormesi gerekiyor — ust cubuktaki menu dugmesi, sol panel ve aracin
 * kendisi. Bu saglayici cocuklarini PROP olarak aldigi icin sunucu
 * bilesenleri sunucuda kalmaya devam ediyor.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  updateSettings as writeSettings,
  type Settings,
} from "@/lib/settings-store";
import {
  clearWorks,
  deleteWork,
  listWorks,
  saveWork,
  type WorkRecord,
} from "@/lib/work-history";

type WorkspaceValue = {
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  /** Ust cubuktaki dugme icin: acikken tekrar basilinca kapansin. */
  toggleSidebar: () => void;

  works: WorkRecord[];
  isHistoryLoaded: boolean;
  recordWork: (
    work: Omit<WorkRecord, "id" | "createdAt" | "thumbnail">,
  ) => Promise<void>;
  removeWork: (id: string) => Promise<void>;
  removeAllWorks: () => Promise<void>;

  /**
   * Kenar cubugundan bir calisma acildiginda haber verir.
   *
   * Neden state degil abonelik: acilma bir OLAY, kalici bir durum degil.
   * State olarak tutulunca aracin bunu bir efektin govdesinde okuyup
   * setState cagirmasi gerekiyordu — `react-hooks/set-state-in-effect`
   * bunu hakli olarak reddediyor. Abonelikte setState olayin geri
   * cagrisinda calisiyor, efekt yalnizca abone oluyor.
   */
  openWork: (work: WorkRecord) => void;
  subscribeToOpenWork: (listener: (work: WorkRecord) => void) => () => void;

  /**
   * "Giris yap" penceresi.
   *
   * Hesap sistemi Faz 4'te geliyor. Calismayan bir dugme koymak yerine
   * dugme gorunuyor ama ne oldugunu acikca soyleyen bir pencere aciyor —
   * tasarim tamamlanmis gorunuyor, kullaniciya yalan soylenmiyor.
   */
  isSignInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;

  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;

  /**
   * Studyo — kompozisyon icin acilan tam ekran calisma alani.
   *
   * Neden ayri bir ROTA degil de tam ekran katman: studyonun girdisi bellekteki
   * bir `blob:` URL (kesim). Rota degistirmek bu URL'i tasimak icin ya
   * IndexedDB'ye yazip geri okumayi ya da global bir depo kurmayi gerektirirdi;
   * ikisi de kullanicinin gormedigi bir karmasiklik. Katman, sayfanin tamamini
   * kapatiyor — kullanici icin "baska bir alana gecmis" oluyor — ama arkadaki
   * durum korunuyor, geri donunce inceleme ekrani oldugu gibi duruyor.
   */
  studyo: StudyoVerisi | null;
  studyoAc: (veri: StudyoVerisi) => void;
  studyoKapat: () => void;
};

export type StudyoVerisi = {
  kesimUrl: string;
  dosyaAdi: string;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace, WorkspaceProvider içinde kullanılmalı.");
  }
  return value;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSignInOpen, setSignInOpen] = useState(false);
  const [studyo, setStudyo] = useState<StudyoVerisi | null>(null);
  const [works, setWorks] = useState<WorkRecord[]>([]);
  const [isHistoryLoaded, setHistoryLoaded] = useState(false);

  // Ayarlar localStorage'da, yani React disi bir kaynakta — bkz.
  // lib/settings-store.ts. Sunucu anlik goruntusu varsayilan.
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // "Calisma acildi" olayinin dinleyicileri.
  const openListenersRef = useRef(new Set<(work: WorkRecord) => void>());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const kayitlar = await listWorks();
      if (cancelled) return;
      setWorks(kayitlar);
      setHistoryLoaded(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // "Hareketi azalt" secildiginde tum kaydirma animasyonlari kapaniyor.
  // Sinif kok elemana yaziliyor ki CSS tarafinda tek bir kural yetsin.
  useEffect(() => {
    document.documentElement.classList.toggle(
      "reduce-motion",
      settings.reduceMotion,
    );
  }, [settings.reduceMotion]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    writeSettings(patch);
  }, []);

  const recordWork = useCallback<WorkspaceValue["recordWork"]>(
    async (work) => {
      if (!settings.historyEnabled) return;
      const kayit = await saveWork(work);
      if (!kayit) return;
      setWorks((current) => [kayit, ...current].slice(0, 20));
    },
    [settings.historyEnabled],
  );

  const removeWork = useCallback(async (id: string) => {
    await deleteWork(id);
    setWorks((current) => current.filter((item) => item.id !== id));
  }, []);

  const removeAllWorks = useCallback(async () => {
    await clearWorks();
    setWorks([]);
  }, []);

  const openWork = useCallback((work: WorkRecord) => {
    for (const listener of openListenersRef.current) listener(work);
    setSidebarOpen(false);
  }, []);

  const subscribeToOpenWork = useCallback(
    (listener: (work: WorkRecord) => void) => {
      const listeners = openListenersRef.current;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    [],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      isSidebarOpen,
      openSidebar: () => setSidebarOpen(true),
      closeSidebar: () => setSidebarOpen(false),
      toggleSidebar: () => setSidebarOpen((current) => !current),
      works,
      isHistoryLoaded,
      recordWork,
      removeWork,
      removeAllWorks,
      openWork,
      subscribeToOpenWork,
      isSignInOpen,
      openSignIn: () => {
        setSignInOpen(true);
        setSidebarOpen(false);
      },
      closeSignIn: () => setSignInOpen(false),
      settings,
      updateSettings,
      studyo,
      studyoAc: (veri: StudyoVerisi) => {
        setStudyo(veri);
        // Studyo tam ekran; acik kalan kenar cubugu altinda gorunmez bir
        // sekilde durup geri donuldugunde sasirtici bicimde aciliyordu.
        setSidebarOpen(false);
      },
      studyoKapat: () => setStudyo(null),
    }),
    [
      isSidebarOpen,
      works,
      isHistoryLoaded,
      recordWork,
      removeWork,
      removeAllWorks,
      openWork,
      subscribeToOpenWork,
      isSignInOpen,
      settings,
      updateSettings,
      studyo,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
