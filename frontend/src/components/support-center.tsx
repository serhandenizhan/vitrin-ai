"use client";

import { useState, type FormEvent } from "react";
import { Bug, ChevronDown, Lightbulb, Send } from "lucide-react";

import { Reveal } from "@/components/reveal";

const FAQ = [
  ["Hangi fotoğraf türlerini yükleyebilirim?", "JPEG, PNG, WebP ve HEIC dosyalarını, dosya başına 20 MB sınırına kadar yükleyebilirsiniz."],
  ["Özgün fotoğrafım saklanıyor mu?", "Özgün dosya arka plan kaldırma işlemi için kullanılır ve çalışma geçmişine kaydedilmez. Hesabınızda yalnız üretilen kesim ve çalışma kaydı tutulur."],
  ["Yarım kalan çalışmaya nasıl dönerim?", "Çalışmalar sayfasında Yarım kalan sekmesini açın ve ilgili karttaki Devam et düğmesini kullanın."],
  ["Bir çalışma ne zaman tamamlanmış sayılır?", "Stüdyoda hazırladığınız çıktıyı indirdiğinizde çalışma Tamamlanan bölümüne taşınır."],
  ["İnce zincir veya taşlar neden eksik çıkabilir?", "Ürünü örten el, etiket veya başka bir nesne görünmeyen pikselleri geri getirmeyi imkânsız kılar. Ürünü tek başına ve zeminden ayrışacak ışıkta çekmek sonucu iyileştirir."],
] as const;

export function SupportCenter() {
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, kind: "Sorun bildirimi" | "Geliştirme önerisi") {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = String(data.get("message") ?? "").trim();
    if (!message) return;
    setSending(true); setSent(null);
    const response = await fetch("/api/support-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: kind === "Sorun bildirimi" ? "issue" : "suggestion", message, email: String(data.get("email") ?? "") || null }) });
    setSending(false);
    if (response.status === 401) { setSent("Mesaj göndermek için önce giriş yapın."); return; }
    if (response.status === 429) { setSent("Kısa sürede çok fazla mesaj gönderdiniz. Lütfen bir süre sonra tekrar deneyin."); return; }
    if (!response.ok) { setSent("Mesaj gönderilemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin."); return; }
    event.currentTarget.reset();
    setSent("Mesajınız alındı. İnceleyip hesabınızdaki e-posta üzerinden dönüş yapacağız.");
  }

  return <div className="mx-auto max-w-6xl px-5"><div className="grid gap-5 lg:grid-cols-2">{[["Sorun bildirin", "Karşılaştığınız adımları ve beklediğiniz sonucu yazın.", Bug, "Sorun bildirimi"], ["Geliştirme önerin", "İş akışınızı hızlandıracak fikri ve kullanım amacını anlatın.", Lightbulb, "Geliştirme önerisi"]].map(([title, description, Icon, kind], index) => <Reveal key={String(title)} delay={index * 80}><form onSubmit={(event) => void submit(event, kind as "Sorun bildirimi" | "Geliştirme önerisi")} className="glass-panel rounded-3xl p-6 sm:p-8"><Icon className="text-gold size-5" strokeWidth={1.6} aria-hidden /><h2 className="mt-5 text-2xl font-semibold">{String(title)}</h2><p className="on-dark-muted mt-2 text-sm">{String(description)}</p><label className="mt-6 block text-sm">Mesaj<textarea name="message" required minLength={10} maxLength={4000} rows={5} className="mt-2 w-full resize-y rounded-2xl bg-white/8 p-4 text-white ring-1 ring-white/15 outline-none focus:ring-[#d6a756]" /></label><label className="mt-4 block text-sm">E-posta <span className="text-white/40">(isteğe bağlı)</span><input name="email" type="email" className="mt-2 min-h-11 w-full rounded-full bg-white/8 px-4 text-white ring-1 ring-white/15 outline-none focus:ring-[#d6a756]" /></label><button type="submit" disabled={sending} className="press bg-gold mt-5 flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-45"><Send className="size-4" aria-hidden />{sending ? "Gönderiliyor" : "Gönder"}</button></form></Reveal>)}</div>{sent ? <p role="status" className="mt-5 text-center text-sm text-emerald-300">{sent}</p> : null}<section className="mt-20"><Reveal className="text-center"><p className="text-gold text-xs font-semibold tracking-[0.18em] uppercase">Sık sorulanlar</p><h2 className="display-section mt-4">Hızlı yanıtlar</h2></Reveal><div className="mx-auto mt-10 max-w-3xl space-y-3">{FAQ.map(([question, answer], index) => <Reveal key={question} delay={Math.min(index, 5) * 50}><details className="glass-panel group rounded-2xl px-5 py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{question}<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden /></summary><p className="on-dark-muted mt-3 pr-8 text-sm leading-relaxed">{answer}</p></details></Reveal>)}</div></section></div>;
}
