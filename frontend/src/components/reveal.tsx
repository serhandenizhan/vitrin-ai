"use client";

/**
 * Kaydirma ile ortaya cikan sarmalayici.
 *
 * Apple'in urun sayfalarindaki temel hareket deseni: bir bolum goruntuye
 * girdiginde icerik hafifce yukari kayarak beliriyor. Tek seferlik —
 * yukari kaydirinca tekrar gizlenmiyor, cunku bu geri donuste sayfayi
 * huzursuz gosteriyor.
 *
 * `IntersectionObserver` bilincli olarak callback ref icinde kuruluyor:
 * `useEffect` + ayri bir ref ikilisi, oge DOM'a baglandiktan sonraki ilk
 * karede gozlemciyi kaciriyor ve sayfa acilisinda ekranda ZATEN gorunen
 * bolumler bazen hic acilmiyordu.
 */

import { useCallback, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  /** Ardisik ogelerde kademeli gecikme (ms). */
  delay?: number;
  className?: string;
  /** Sarmalayici etiketi — bolum/liste ogesi olarak da kullanilabilsin. */
  as?: "div" | "li" | "section";
};

/** Ogenin bu kadari goruntuye girince acilir. */
const THRESHOLD = 0.15;

/**
 * Alt kenardan bu kadar once tetiklenir; kullanici bolume ulastiginda gecis
 * cogunlukla bitmis oluyor, "gec kalan animasyon" hissi olusmuyor.
 */
const ROOT_MARGIN = "0px 0px -8% 0px";

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: RevealProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const attach = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;

    // Tarayici desteklemiyorsa (ya da test ortaminda yoksa) icerik gizli
    // kalmamali — dogrudan gorunur yapiliyor.
    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("reveal-in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("reveal-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: THRESHOLD, rootMargin: ROOT_MARGIN },
    );

    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return (
    <Tag
      ref={attach as never}
      className={cn("reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
