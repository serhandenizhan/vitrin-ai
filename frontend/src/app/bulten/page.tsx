/**
 * Vitrin AI Bulteni (one alinan is, 17.09.2026).
 *
 * Iki bolum: sosyal medya gonderisi gibi gorselli paylasimlar (guncelleme
 * notlari, duyurular, yakinda gelecekler) ve gozden kacabilecek ozellikler.
 * Icerik `lib/bulletin.ts` icinde.
 *
 * Altin kuru KALDIRILDI (Kaan, 17.09.2026): ucret, lisans ya da yazili izin
 * istemeyen resmi bir kaynak yok — TCMB ticari kullanim icin yazili izin
 * istiyor, Harem ve Borsa Istanbul sozlesme istiyor.
 */

import type { Metadata } from "next";
import Image from "next/image";

import { BrandMark } from "@/components/brand-mark";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import {
  type BulletinPost,
  HIDDEN_FEATURES,
  POST_KIND_LABEL,
  formatPostDate,
  sortedPosts,
} from "@/lib/bulletin";

export const metadata: Metadata = {
  title: "Bülten — Vitrin AI",
  description:
    "Vitrin AI bülteni: güncelleme notları, duyurular ve gözden kaçabilecek özellikler.",
};

const KIND_STYLE: Record<BulletinPost["kind"], string> = {
  guncelleme: "bg-emerald-100 text-emerald-900",
  duyuru: "bg-amber-100 text-amber-900",
  yakinda: "bg-sky-100 text-sky-900",
  ipucu: "bg-violet-100 text-violet-900",
};

export default function BulletinPage() {
  const posts = sortedPosts();

  return (
    <SiteShell>
      <section className="surface-black section-rhythm page-top relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[32rem]"
          style={{
            background: "radial-gradient(50% 60% at 50% 0%, rgba(212,175,110,0.18), transparent 70%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-3xl px-5 text-center">
          <Reveal>
            <BrandMark className="text-gold mx-auto h-16 w-auto sm:h-20" />
            <h1 className="display-hero mt-5 text-balance">Vitrin AI Bülteni</h1>
            <p className="lede on-dark-muted mx-auto mt-6 max-w-xl text-pretty">
              Yeni özellikler, güncelleme notları, yakında gelecekler ve işinizi
              kolaylaştıran ama gözden kaçabilecek küçük ayrıntılar.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="surface-mist section-rhythm">
        <div className="mx-auto w-full max-w-5xl px-5">
          <Reveal>
            <h2 className="display-feature text-balance">Paylaşımlar</h2>
            <p className="on-light-muted mt-3 max-w-2xl">
              Güncellemeler, duyurular ve yakında gelecekler; en yenisi en üstte.
            </p>
          </Reveal>

          <div className="mobile-rail mt-6 grid gap-6 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <Reveal key={post.id} delay={Math.min(index, 5) * 60}>
                <article className="glass-panel-light flex h-full flex-col overflow-hidden rounded-[1.5rem] transition-transform duration-300 hover:-translate-y-1">
                  <header className="flex items-center gap-3 px-5 pt-4 pb-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1a1917]">
                      <BrandMark className="text-gold h-3.5 w-auto" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.875rem] font-semibold">Vitrin AI</span>
                      <time dateTime={post.date} className="on-light-muted fine-print block">
                        {formatPostDate(post.date)}
                      </time>
                    </span>
                    <span
                      className={
                        "rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold " + KIND_STYLE[post.kind]
                      }
                    >
                      {POST_KIND_LABEL[post.kind]}
                    </span>
                  </header>

                  {post.image ? (
                    <div className="relative aspect-[4/3] bg-black/5 sm:aspect-square">
                      <Image
                        src={post.image.src}
                        alt={post.image.alt}
                        fill
                        sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      aria-hidden
                      className="flex aspect-[2/1] items-center justify-center bg-[#1a1917]"
                    >
                      <BrandMark className="text-gold h-12 w-auto opacity-90" />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
                    <h3 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{post.title}</h3>
                    <p className="on-light-muted mt-2 text-[0.9375rem] leading-relaxed">{post.body}</p>
                    {post.notes ? (
                      <ul className="mt-3 space-y-1.5 text-[0.875rem]">
                        {post.notes.map((note) => (
                          <li key={note} className="flex gap-2">
                            <span aria-hidden className="text-gold">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-white section-rhythm">
        <div className="mx-auto w-full max-w-5xl px-5">
          <Reveal>
            <h2 className="display-feature text-balance">Gözden kaçabilecek özellikler</h2>
            <p className="on-light-muted mt-3 max-w-2xl">
              Hepsi şu an sitede var; ne işe yaradıklarıyla birlikte.
            </p>
          </Reveal>
          {/* Telefonda acilir basliklar: sekiz kart yerine kisa bir liste. */}
          <div className="glass-panel-light mt-6 divide-y divide-black/8 overflow-hidden rounded-2xl sm:hidden">
            {HIDDEN_FEATURES.map((feature) => (
              <details key={feature.title} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-[1rem] font-semibold tracking-[-0.01em]">{feature.title}</span>
                  <span aria-hidden className="text-black/40 text-[1.25rem] leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-[0.9375rem] leading-relaxed">{feature.what}</p>
                  <p className="on-light-muted mt-2 text-[0.875rem] leading-relaxed">
                    <span className="text-gold font-semibold">Ne işe yarar: </span>
                    {feature.benefit}
                  </p>
                </div>
              </details>
            ))}
          </div>
          <div className="mt-10 hidden gap-4 sm:grid sm:grid-cols-2">
            {HIDDEN_FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={Math.min(index, 5) * 50}>
                <div className="glass-panel-light h-full rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1">
                  <h3 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{feature.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed">{feature.what}</p>
                  <p className="on-light-muted mt-2 text-[0.875rem] leading-relaxed">
                    <span className="text-gold font-semibold">Ne işe yarar: </span>
                    {feature.benefit}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
