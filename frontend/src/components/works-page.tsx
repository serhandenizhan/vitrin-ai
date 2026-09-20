"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, CheckCircle2, Clock3, Download, ImagePlus, Pencil, Trash2, X } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

type Tab = "draft" | "completed";

export function WorksPage() {
  const { works, isHistoryLoaded, user, openSignIn, openStudio, openWork, removeWork, renameWork } = useWorkspace();
  const [tab, setTab] = useState<Tab>("draft");
  /** Silme iki adimli (Serhan, 19.09.2026): once kartin kendisinde onay sorulur. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const visible = useMemo(() => works.filter((work) => work.status === tab), [works, tab]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5">
      <div className="glass-panel mx-auto flex w-fit gap-1 rounded-full p-1.5" role="tablist" aria-label="Çalışma durumu">
        {([
          ["draft", "Yarım kalan", Clock3],
          ["completed", "Tamamlanan", CheckCircle2],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex min-h-10 items-center gap-2 rounded-full px-5 text-sm transition-colors", tab === id ? "bg-[#d6a756] text-[#171614]" : "text-white/65 hover:bg-white/8 hover:text-white")}>
            <Icon className="size-4" strokeWidth={1.7} aria-hidden />{label}
          </button>
        ))}
      </div>

      {/* `key`: sekme degisince icerik "tak diye" degil, yumusakca gelir. */}
      <div key={tab} className="soft-fade">
      {!isHistoryLoaded ? <p className="mt-14 text-center text-white/55">Çalışmalar yükleniyor…</p> : !user ? (
        <div className="glass-panel mx-auto mt-12 max-w-xl rounded-3xl p-8 text-center">
          <h2 className="text-xl font-semibold">Çalışmalarınız hesabınıza bağlıdır</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">Yarım bıraktığınız düzenlemelere dönmek ve tamamladığınız görselleri görmek için giriş yapın.</p>
          <button type="button" onClick={() => openSignIn()} className="press bg-gold mt-6 min-h-11 rounded-full px-6 text-sm font-medium text-black">Giriş yap</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-panel mx-auto mt-12 max-w-xl rounded-3xl p-8 text-center">
          <h2 className="text-xl font-semibold">{tab === "draft" ? "Yarım kalan çalışma yok" : "Henüz tamamlanan çalışma yok"}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{tab === "draft" ? "Yeni bir fotoğrafla başladığınız işler burada görünür." : "Stüdyodan indirdiğiniz hazır görseller burada toplanır."}</p>
        </div>
      ) : (
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((work, index) => (
            <Reveal as="li" key={work.id} delay={Math.min(index, 5) * 60} className="glass-panel group overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={work.thumbnailUrl} alt="" className="aspect-[4/3] w-full bg-white/5 object-contain p-5 transition-transform duration-500 group-hover:scale-[1.035]" />
              <div className="p-5">
                <WorkTitle name={work.fileName} onRename={(name) => renameWork(work.id, name)} />
                <p className="mt-1 text-xs text-white/45">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(work.createdAt)}</p>
                {confirmId === work.id ? (
                  <div role="group" aria-label="Silme onayı" className="soft-fade mt-5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm text-white/75">Bu çalışma silinsin mi?</p>
                    <button type="button" onClick={() => { setConfirmId(null); void removeWork(work.id); }} className="press min-h-10 shrink-0 rounded-full bg-red-500/20 px-4 text-sm text-red-200 transition-colors hover:bg-red-500/30">Sil</button>
                    <button type="button" autoFocus onClick={() => setConfirmId(null)} className="press min-h-10 shrink-0 rounded-full px-4 text-sm text-white/65 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white">Vazgeç</button>
                  </div>
                ) : (
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => tab === "draft" ? openStudio({ cutoutUrl: work.resultUrl, fileName: work.fileName, workId: work.id, initialDraft: work.editorState }) : openWork(work)} className="press bg-gold flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-black">
                    {tab === "draft" ? <ImagePlus className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />}
                    {tab === "draft" ? "Devam et" : "Görüntüle"}
                  </button>
                  <button type="button" onClick={() => setConfirmId(work.id)} aria-label={`${work.fileName} çalışmasını sil`} className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/50 ring-1 ring-white/15 hover:bg-white/10 hover:text-red-200"><Trash2 className="size-4" aria-hidden /></button>
                </div>
                )}
              </div>
            </Reveal>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}

/** Backend ile ayni sinir (`MAX_FILE_NAME_LENGTH`, projects.py). */
const MAX_NAME_LENGTH = 255;

/**
 * Calisma adi — kalem simgesiyle yerinde duzenlenir (Kaan, 18.09.2026).
 * Enter kaydeder, Escape vazgecer. Ad yalnizca goruntuleme metni; R2
 * anahtarlari sunucuda uretilen kimlikten geldigi icin hicbir dosya yolu
 * degismiyor.
 */
function WorkTitle({ name, onRename }: { name: string; onRename: (name: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = (draft ?? "").trim();
    if (!next || next.length > MAX_NAME_LENGTH) {
      setError(`Ad 1-${MAX_NAME_LENGTH} karakter olmalı.`);
      return;
    }
    if (next === name) {
      setDraft(null);
      return;
    }
    setSaving(true);
    const ok = await onRename(next);
    setSaving(false);
    if (!ok) {
      setError("Ad kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
      return;
    }
    setDraft(null);
    setError("");
  }

  if (draft === null) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 className="min-w-0 truncate font-medium">{name}</h2>
        <button
          type="button"
          onClick={() => setDraft(name)}
          aria-label={`${name} adını değiştir`}
          className="press flex size-7 shrink-0 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="soft-fade">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          maxLength={MAX_NAME_LENGTH}
          onChange={(event) => {
            setDraft(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setDraft(null);
              setError("");
            }
          }}
          aria-label="Çalışma adı"
          aria-invalid={error ? true : undefined}
          className="min-h-9 min-w-0 flex-1 rounded-full bg-white/8 px-3 text-sm text-white ring-1 ring-white/15 outline-none focus:ring-[#d6a756]"
        />
        <button
          type="submit"
          disabled={saving}
          aria-label="Adı kaydet"
          className="press bg-gold flex size-9 shrink-0 items-center justify-center rounded-full text-black disabled:opacity-50"
        >
          <Check className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            setError("");
          }}
          aria-label="Vazgeç"
          className="press flex size-9 shrink-0 items-center justify-center rounded-full text-white/55 ring-1 ring-white/15 hover:text-white"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
