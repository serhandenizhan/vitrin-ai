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
import { displayName, readProfile, type Profile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  clearWorks,
  deleteWork,
  discardLegacyBrowserHistory,
  listWorks,
  saveWork,
  type NewWork,
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
  recordWork: (work: NewWork) => Promise<void>;
  removeWork: (id: string) => Promise<void>;
  removeAllWorks: () => Promise<void>;
  /**
   * Listeyi sunucudan yeniden alir. Kucuk resimlerin imzali adresleri
   * suresi dolunca (varsayilan 1 saat) kenar cubugu bunu cagiriyor.
   */
  refreshWorks: () => void;

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

  /** "Giris yap / kayit ol" penceresi (bkz. `auth-dialog.tsx`). */
  isSignInOpen: boolean;
  /**
   * Pencereyi acar. `mode` verilmezse giris ekrani; "Hesap olusturun" gibi
   * cagrilar dogrudan kayit ekranini acar. Dugmelere `onClick={openSignIn}`
   * olarak da verilebiliyor — gelen olay nesnesi mod sayilmiyor.
   */
  openSignIn: (mode?: AuthMode | unknown) => void;
  signInMode: AuthMode;
  closeSignIn: () => void;

  /** Gosterilecek "Hos geldiniz" ismi; gosterilmeyecekse null. */
  welcomeName: string | null;
  dismissWelcome: () => void;

  /**
   * Oturum acmis kullanici (Faz 4, Supabase Auth).
   *
   * YALNIZCA GORUNUM ICIN: bu deger tarayicidaki cerezden okunuyor, yani
   * kullanicinin degistirebilecegi bir yerden. Arayuzde "giris yapilmis"
   * gostermek icin yeterli; yetki karari icin DEGIL — backend her istekte
   * token'i JWKS ile kendisi dogruluyor.
   */
  user: AuthUser | null;
  /** Ilk oturum bilgisi geldi mi; gelmeden "Giris yap" yanip sonmesin. */
  isAuthLoaded: boolean;
  /** Supabase env degiskenleri tanimli mi. */
  isAuthConfigured: boolean;
  signOut: () => Promise<void>;

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
  studio: StudioData | null;
  openStudio: (veri: StudioData) => void;
  closeStudio: () => void;

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
  returnToStart: () => void;
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

/**
 * Oturum acmis kullanici. Profil alanlari `user_metadata`dan; yalnizca
 * gorunum ve iletisim icin, yetki icin degil (bkz. lib/profile.ts).
 */
export type AuthUser = {
  id: string;
  email: string | null;
} & Profile;

export type AuthMode = "signin" | "signup" | "forgot";

const AUTH_MODES: readonly AuthMode[] = ["signin", "signup", "forgot"];

/**
 * "Bu kullanici icin hos geldin gosterildi" isareti. Cikis yapilinca
 * siliniyor; boylece her GIRISTE bir kez gorunuyor, sayfa yenilemede ya da
 * Supabase'in sekme odaginda tekrar gonderdigi SIGNED_IN olayinda degil.
 */
const WELCOMED_KEY = "vitrin-ai:welcomed-user";

/** E-posta dogrulama baglantisindan donuste `/auth/callback` bunu ekliyor. */
export const WELCOME_QUERY_PARAM = "hosgeldiniz";

function readWelcomed(): string | null {
  try {
    return window.localStorage.getItem(WELCOMED_KEY);
  } catch {
    return null;
  }
}

function writeWelcomed(userId: string | null): void {
  try {
    if (userId) window.localStorage.setItem(WELCOMED_KEY, userId);
    else window.localStorage.removeItem(WELCOMED_KEY);
  } catch {
    /* depolama kapali — en kotu ihtimalle hos geldin bir kez daha gorunur */
  }
}

/** Adres cubugundaki `?hosgeldiniz` isaretini okuyup kaldirir. */
function consumeWelcomeParam(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(WELCOME_QUERY_PARAM)) return false;
  url.searchParams.delete(WELCOME_QUERY_PARAM);
  window.history.replaceState(window.history.state, "", url);
  return true;
}

/**
 * Derleme aninda sabit: `NEXT_PUBLIC_` degiskenleri paketin icine gomuluyor,
 * yani sunucu ve tarayici ayni degeri goruyor (hidrasyon uyusmazligi olmaz).
 */
const IS_AUTH_CONFIGURED = getSupabaseEnv() !== null;

/** Sabit bos liste: her render'da yeni `[]` context'i bosuna yenilemesin. */
const EMPTY_WORKS: WorkRecord[] = [];

export type StudioData = {
  cutoutUrl: string;
  fileName: string;
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
  const [signInMode, setSignInMode] = useState<AuthMode>("signin");
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const dismissWelcome = useCallback(() => setWelcomeName(null), []);
  const [studio, setStudio] = useState<StudioData | null>(null);
  /**
   * Gecmis, HANGI KULLANICI icin yuklendigiyle birlikte tutuluyor. Cikis
   * yapildiginda ya da baska bir hesaba gecildiginde onceki kullanicinin
   * listesi bir an bile gosterilmiyor: `works` yalnizca kayit mevcut
   * kullaniciya aitse doluyor. (Efektte `setWorks([])` cagirmak yerine
   * turetiliyor — react-hooks/set-state-in-effect.)
   */
  const [history, setHistory] = useState<{
    userId: string | null;
    works: WorkRecord[];
  }>({ userId: null, works: [] });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Yapilandirma yoksa beklenecek bir oturum da yok.
  const [isAuthLoaded, setAuthLoaded] = useState(!IS_AUTH_CONFIGURED);

  // Oturum degisikliklerine abone ol. `onAuthStateChange` ilk olarak
  // INITIAL_SESSION ile mevcut durumu bildiriyor, sonra giris/cikis/token
  // yenilemede tekrar cagriliyor — ayrica bir `getSession()` gerekmiyor.
  // setState olayin geri cagrisinda (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!IS_AUTH_CONFIGURED) return;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user;
      const next: AuthUser | null = sessionUser
        ? {
            id: sessionUser.id,
            email: sessionUser.email ?? null,
            ...readProfile(sessionUser.user_metadata),
          }
        : null;
      setUser(next);
      setAuthLoaded(true);

      if (event === "SIGNED_OUT") {
        writeWelcomed(null);
        return;
      }
      // Hos geldin: pencereden giris (SIGNED_IN) ya da e-posta baglantisindan
      // donus (sunucuda acilan oturum, istemcide INITIAL_SESSION + adres
      // isareti). Ayni kullanici icin cikis yapilana kadar bir kez.
      const cameFromEmailLink = event === "INITIAL_SESSION" && consumeWelcomeParam();
      if (next && (event === "SIGNED_IN" || cameFromEmailLink) && readWelcomed() !== next.id) {
        writeWelcomed(next.id);
        setWelcomeName(displayName(next));
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) return;
    // Kullanici null'a SIGNED_OUT olayiyla dusuyor. `scope: "local"`: yalnizca
    // bu cihazdaki oturum kapaniyor; diger cihazlardaki oturumlar suruyor.
    await createClient().auth.signOut({ scope: "local" });
    setSidebarOpen(false);
  }, []);

  // Ayarlar localStorage'da, yani React disi bir kaynakta — bkz.
  // lib/settings-store.ts. Sunucu anlik goruntusu varsayilan.
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // "Calisma acildi" olayinin dinleyicileri.
  const openListenersRef = useRef(new Set<(work: WorkRecord) => void>());

  const userId = user?.id ?? null;
  const works = useMemo(
    () => (userId && history.userId === userId ? history.works : EMPTY_WORKS),
    [userId, history],
  );
  // Oturum yoksa beklenecek bir liste de yok.
  const isHistoryLoaded = isAuthLoaded && (!userId || history.userId === userId);

  // Faz 2'nin tarayici deposu tek seferlik siliniyor (urun karari: eski
  // kayitlar hesaba tasinmiyor).
  useEffect(() => {
    discardLegacyBrowserHistory();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listWorks().then((kayitlar) => {
      if (cancelled) return;
      setHistory({ userId, works: kayitlar });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, historyVersion]);

  const refreshWorks = useCallback(() => {
    setHistoryVersion((current) => current + 1);
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
      if (!settings.historyEnabled || !userId) return;
      const kayit = await saveWork(work);
      if (!kayit) return;
      // Kayit sirasinda kullanici degistiyse (cikis) listeye eklenmiyor.
      setHistory((current) =>
        current.userId === userId
          ? { userId, works: [kayit, ...current.works] }
          : current,
      );
    },
    [settings.historyEnabled, userId],
  );

  const removeWork = useCallback(async (id: string) => {
    // Sunucuda silinemediyse listede kalsin; "silindi" gorunup yeniden
    // acilista geri gelmesi kullaniciyi yaniltirdi.
    if (!(await deleteWork(id))) return;
    setHistory((current) => ({
      ...current,
      works: current.works.filter((item) => item.id !== id),
    }));
  }, []);

  const removeAllWorks = useCallback(async () => {
    if (!(await clearWorks())) return;
    setHistory((current) => ({ ...current, works: [] }));
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

  const returnToStart = useCallback(() => {
    setStudio(null);
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
      refreshWorks,
      openWork,
      subscribeToOpenWork,
      isSignInOpen,
      openSignIn: (mode?: AuthMode | unknown) => {
        setSignInMode(
          AUTH_MODES.includes(mode as AuthMode) ? (mode as AuthMode) : "signin",
        );
        setSignInOpen(true);
        setSidebarOpen(false);
      },
      signInMode,
      closeSignIn: () => setSignInOpen(false),
      welcomeName,
      dismissWelcome,
      user,
      isAuthLoaded,
      isAuthConfigured: IS_AUTH_CONFIGURED,
      signOut,
      settings,
      updateSettings,
      returnToStart,
      subscribeToReset,
      studio,
      openStudio: (veri: StudioData) => {
        setStudio(veri);
        // Studyo tam ekran; acik kalan kenar cubugu altinda gorunmez bir
        // sekilde durup geri donuldugunde sasirtici bicimde aciliyordu.
        setSidebarOpen(false);
      },
      closeStudio: () => {
        setStudio(null);
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
      refreshWorks,
      openWork,
      subscribeToOpenWork,
      isSignInOpen,
      signInMode,
      welcomeName,
      dismissWelcome,
      user,
      isAuthLoaded,
      signOut,
      settings,
      updateSettings,
      studio,
      returnToStart,
      subscribeToReset,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
