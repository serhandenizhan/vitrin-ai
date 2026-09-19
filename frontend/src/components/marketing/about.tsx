import { Eye, Gem, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/reveal";

const PRINCIPLES = [
  { title: "Amacımız", icon: Gem, text: "Kuyumcuların ürünlerini profesyonel göstermek için ajans, fotoğraf stüdyosu veya karmaşık düzenleme araçlarına bağımlı kalmamasını sağlamak." },
  { title: "Misyonumuz", icon: ShieldCheck, text: "Arka plan temizleme, sahne kurma ve marka çıktısını tek, anlaşılır ve güvenli bir çalışma akışında buluşturmak." },
  { title: "Vizyonumuz", icon: Eye, text: "Mücevher ticaretinde görsel üretimin güvenilir çalışma alanı olmak; küçük işletmeden büyüyen markaya kadar aynı kalite standardını erişilebilir kılmak." },
];

export function About() {
  return <section id="hakkimizda" className="surface-charcoal section-rhythm relative overflow-hidden"><div aria-hidden className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(214,167,86,0.15),transparent_72%)]" /><div className="relative mx-auto max-w-6xl px-5"><Reveal className="max-w-2xl"><p className="text-gold text-xs font-semibold tracking-[0.18em] uppercase">Tasarım yaklaşımımız</p><h2 className="display-section mt-4 text-balance">Teknoloji geri çekilsin. Ürününüz öne çıksın.</h2><p className="lede on-dark-muted mt-4 text-pretty">Apple’ın iyi tasarımın kendini açıklamak zorunda kalmaması yaklaşımından ilham alıyoruz: araç sade kalır, kontrol sizde olur, dikkat her zaman ürününüzde kalır.</p></Reveal><div className="mt-12 grid gap-4 md:grid-cols-3">{PRINCIPLES.map(({ title, text, icon: Icon }, index) => <Reveal key={title} delay={index * 80}><article className="glass-panel h-full rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-1"><Icon className="text-gold size-5" strokeWidth={1.5} aria-hidden /><h3 className="mt-6 text-xl font-semibold">{title}</h3><p className="on-dark-muted mt-3 text-sm leading-relaxed text-pretty">{text}</p></article></Reveal>)}</div></div></section>;
}
