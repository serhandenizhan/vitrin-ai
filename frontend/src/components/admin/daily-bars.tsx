"use client";

/**
 * Günlük sayı grafiği (Faz 6 yönetim paneli) — tek seri, tek renk (altın).
 *
 * dataviz kuralları: tek seri olduğu için lejant yok, başlık seriyi adlandırıyor;
 * ince barlar, tepede 4px yuvarlak, tabana oturmuş, aralarında 2px boşluk;
 * değerler seri renginde değil metin renginde; her barda üzerine gelince ipucu
 * (dokunma hedefi barın kendisinden büyük: bütün sütun); ekran okuyucu için
 * gizli tablo. Altının koyu yüzeydeki kontrastı betikle ölçüldü (≥3:1).
 * Boş günler backend'de sıfırla dolduruluyor (`_daily`), seri deliksiz.
 */

import { useState } from "react";

import { formatDay, formatNumber } from "@/components/admin/admin-client";

export function DailyBars({
  title,
  unit,
  series,
}: {
  title: string;
  /** İpucundaki birim ("kesim", "kayıt"). */
  unit: string;
  series: { day: string; count: number }[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((point) => point.count));
  const total = series.reduce((sum, point) => sum + point.count, 0);
  const active = hovered === null ? null : series[hovered];

  return (
    <figure aria-label={title} className="glass-panel rounded-3xl p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="on-dark-muted text-xs tabular-nums">
          {active
            ? `${formatDay(active.day)}: ${formatNumber(active.count)} ${unit}`
            : `Toplam ${formatNumber(total)}`}
        </span>
      </figcaption>
      <div
        className="mt-4 flex h-28 items-end gap-[2px] border-b border-white/15"
        onMouseLeave={() => setHovered(null)}
        aria-hidden
      >
        {series.map((point, index) => (
          <div
            key={point.day}
            onMouseEnter={() => setHovered(index)}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className={
                "w-full rounded-t-[4px] transition-opacity duration-200 " +
                (hovered === null || hovered === index ? "bg-gold opacity-100" : "bg-gold opacity-45")
              }
              // Sifir gunu 1px'lik iz: "veri yok" degil "o gun olmadi" okunsun.
              style={{ height: point.count ? `${(point.count / max) * 100}%` : "1px" }}
            />
          </div>
        ))}
      </div>
      <div className="on-dark-muted mt-1.5 flex justify-between text-[0.6875rem] tabular-nums" aria-hidden>
        <span>{series[0] ? formatDay(series[0].day) : ""}</span>
        <span>{series.at(-1) ? formatDay(series.at(-1)!.day) : ""}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Gün</th>
            <th scope="col">Sayı</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.day}>
              <td>{formatDay(point.day)}</td>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
