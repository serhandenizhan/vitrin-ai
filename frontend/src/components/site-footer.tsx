/**
 * Alt bilgi.
 *
 * Apple'in footer'indan uyarlandi: acik gri zemin, cok kucuk puntolu ve
 * dusuk kontrastli dipnot metni, ustte ince bir ayirici.
 *
 * Dipnotlar suslemek icin degil: model sinirlamalari ve surelerin
 * degiskenligi burada acikca yaziyor. Bir aracin ne YAPAMADIGINI soylemek,
 * kullanicinin ilk basarisiz denemede guvenini kaybetmesini onluyor.
 */

const NOTES = [
  "İşlem süreleri fotoğrafın çözünürlüğüne ve sunucunun o anki yüküne göre değişir.",
  "Ürün elde tutularak çekildiğinde elin korunup korunmayacağı öngörülemez; ürünü tek başına çekmeniz önerilir.",
  "Parmak ya da başka bir nesne tarafından kapatılan ürün kısımları çıktıda da eksik kalır.",
];

export function SiteFooter() {
  return (
    <footer className="surface-mist">
      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        <ol className="on-light-muted space-y-1.5">
          {NOTES.map((note, index) => (
            <li key={note} className="flex gap-2 text-[0.75rem] leading-relaxed">
              <span className="shrink-0 tabular-nums">{index + 1}.</span>
              <span className="text-pretty">{note}</span>
            </li>
          ))}
        </ol>

        <div className="mt-7 border-t border-black/10 pt-5">
          <p className="on-light-muted text-[0.75rem]">
            Vitrin AI · Faz 2 geliştirme sürümü
          </p>
        </div>
      </div>
    </footer>
  );
}
