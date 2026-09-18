"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, ImagePlus, Trash2 } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

type Tab = "draft" | "completed";

export function WorksPage() {
  const { works, isHistoryLoaded, user, openSignIn, openStudio, openWork, removeWork } = useWorkspace();
  const [tab, setTab] = useState<Tab>("draft");
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
          {visible.map((work) => (
            <li key={work.id} className="glass-panel group overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={work.thumbnailUrl} alt="" className="aspect-[4/3] w-full bg-white/5 object-contain p-5 transition-transform duration-500 group-hover:scale-[1.035]" />
              <div className="p-5">
                <h2 className="truncate font-medium">{work.fileName}</h2>
                <p className="mt-1 text-xs text-white/45">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(work.createdAt)}</p>
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => tab === "draft" ? openStudio({ cutoutUrl: work.resultUrl, fileName: work.fileName, workId: work.id, initialDraft: work.editorState }) : openWork(work)} className="press bg-gold flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-black">
                    {tab === "draft" ? <ImagePlus className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />}
                    {tab === "draft" ? "Devam et" : "Görüntüle"}
                  </button>
                  <button type="button" onClick={() => void removeWork(work.id)} aria-label={`${work.fileName} çalışmasını sil`} className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/50 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"><Trash2 className="size-4" aria-hidden /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
