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

  /**
   * Basa don: studyoyu kapatir, araci bos duruma alir ve sayfanin basina
   * kaydirir.
   *
   * Akisin sonunda (gorsel indirildikten sonra) kullanicinin elinde yalnizca
   * "Geri" vardi ve o da inceleme ekranina donduruyordu — is bitmisken ayni
   * fotografin sonucuna donmek bir cikmaz. Bu, akisi bastan baslatan tek
   * dugme.
   *
   * Sifirlama `subscribeToReset` ile OLAY olarak yayiliyor, state olarak
   * degil: aracin sifirlanmasi bir an, kalici bir durum degil. State
   * tutulsaydi arac bunu bir efektin govdesinde okuyup setState cagirmak
   * zorunda kalirdi ki `react-hooks/set-state-in-effect` bunu hakli olarak
   * reddediyor (ayni gerekce: `subscribeToOpenWork`).
   */
  anaMenuyeDon: () => void;
  subscribeToReset: (listener: () => void) => () => void;
};

/**
 * Arac bolumune gecerken kullanilan kaydirma ayari.
 *
 * `behavior: "instant"` — "auto" DEGIL. `globals.css` icinde
 * `html { scroll-behavior: smooth }` tanimli ve spesifikasyona gore `"auto"`,
 * CSS'teki bu degeri kullanmak demek; yani "auto" da yumusak kaydiriyor.
 * Yumusak kaydirma kare uretimine bagli ve gorunmeyen bir baglamda hic
 * ilerlemiyor (bkz. kok CLAUDE.md ders 13 ortam artefakti) — ama asil sebep
 * urunle ilgili: kullanici panelden bir calismaya tikladiginda ya da studyodan
 * ciktiginda hedefe DOGRUDAN gitmeyi bekliyor, sayfanin uzun bir yolu
 * suzulerek gecmesini degil.
 */
const KAYDIRMA: ScrollIntoViewOptions = {
  block: "start",
  behavior: "instant",
};

/**
 * Arac bolumunu goruse getirir.
 *
 * `setTimeout(..., 0)` — `requestAnimationFrame` DEGIL. Kaydirma, React durumu
 * islendikten (panel/katman kapandiktan) sonra yapilmali; ama rAF kare
 * uretimine bagli ve kare uretmeyen bir baglamda (gorunmez sekme/panel) HIC
 * calismiyor — bu dogrulama sirasinda birebir gozlendi, rAF geri cagrisi
 * saniyelerce tetiklenmedi. Sifir gecikmeli zamanlayici kare uretiminden
 * bagimsiz calisiyor ve ayni sonucu veriyor.
 */
function aracaKaydir(): void {
  setTimeout(() => {
    document.getElementById("dene")?.scrollIntoView(KAYDIRMA);
  }, 0);
}

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
    // Calisma aciliyordu ama kullanici sayfanin kaldigi yerde kaliyordu —
    // panelden bir ise tikladiginda ekranda hicbir sey degismiyor gibi
    // gorunuyordu. `requestAnimationFrame`: panel ayni karede kapaniyor,
    // kaydirma ondan SONRA yapilmali; aksi halde hedefin konumu panel hala
    // acikken olculuyor.
    aracaKaydir();
  }, []);

  // "Basa don" olayinin dinleyicileri.
  const resetListenersRef = useRef(new Set<() => void>());

  const subscribeToReset = useCallback((listener: () => void) => {
    const listeners = resetListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const anaMenuyeDon = useCallback(() => {
    setStudyo(null);
    setSidebarOpen(false);
    for (const listener of resetListenersRef.current) listener();
    // `auto`: kullanici "basa don" dedi, yumusak kaydirma burada bekleme
    // hissi veriyor — sayfa zaten tamamen degisti.
    window.scrollTo({ top: 0, behavior: "auto" });
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
      anaMenuyeDon,
      subscribeToReset,
      studyo,
      studyoAc: (veri: StudyoVerisi) => {
        setStudyo(veri);
        // Studyo tam ekran; acik kalan kenar cubugu altinda gorunmez bir
        // sekilde durup geri donuldugunde sasirtici bicimde aciliyordu.
        setSidebarOpen(false);
      },
      studyoKapat: () => {
        setStudyo(null);
        // Studyo kapaninca kullanici sayfanin kaldigi yerde kaliyordu ve bu
        // genellikle tanitim bolumlerinin ortasiydi — sonuc ekrani ekranin
        // 1600 px altinda kaliyor, kullanici "geri gelemedim" saniyordu.
        // Aracin bolumunu goruse getiriyoruz.
        //
        // `requestAnimationFrame`: katman ayni karede kaldiriliyor, kaydirma
        // ondan SONRA yapilmali; aksi halde hedefin konumu katman hala
        // yerindeyken olculuyor.
        aracaKaydir();
      },
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
      anaMenuyeDon,
      subscribeToReset,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
