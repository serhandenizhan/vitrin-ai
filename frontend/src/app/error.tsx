"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="surface-black flex min-h-svh items-center justify-center px-5 text-center">
      <div className="max-w-md">
        <h1 className="display-section text-balance">Bir şeyler ters gitti</h1>
        <p className="lede on-dark-muted mt-4 text-pretty">
          Sayfa açılırken beklenmeyen bir hata oluştu. Yeniden deneyebilirsiniz; sürerse Destek sayfasından bize yazın.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="press flex min-h-12 items-center rounded-full bg-[linear-gradient(135deg,#f0c779,#d6a756)] px-7 text-[0.9375rem] font-semibold text-[#171614]"
          >
            Yeniden dene
          </button>
          {/* Duz baglanti bilincli: hatali durumdan tam yenilemeyle cikilir. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="flex min-h-12 items-center rounded-full bg-white/[0.045] px-6 text-[0.9375rem] font-medium text-[#f3f0eb]/82 ring-1 ring-white/14"
          >
            Ana sayfa
          </a>
        </div>
      </div>
    </main>
  );
}
