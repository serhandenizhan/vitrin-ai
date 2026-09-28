"use client";

/**
 * Stüdyoyu YALNIZCA açıldığında yükler (Faz 7, görsel/yükleme optimizasyonu).
 *
 * `SiteShell` her sayfada çizildiği için `Studio`'yu doğrudan içe aktarmak,
 * stüdyonun bütün arayüz kodunu (kompozisyon editörü, paneller, zemin rafları)
 * stüdyoyu hiç açmayan ziyaretçiye de her sayfada indiriyordu. Ölçüm
 * (28.09.2026, üretim derlemesi): `/paketler` gibi düz bir sayfa ana sayfa
 * kadar JS çekiyordu. Artık o kod ayrı bir parça ve yalnızca bir çalışma
 * stüdyoda açılınca iniyor; açılış perdesi (`stage-curtain`) bu kısa
 * yüklemeyi zaten örtüyor.
 *
 * `Studio` kapalıyken zaten `null` çiziyordu ve kapalıyken çalışması gereken
 * bir etkisi yok; bu yüzden onu kapalıyken hiç bağlamamak davranışı
 * değiştirmez. Tek fark: stüdyo her açılışta temiz bir durumla kurulur
 * (yardım penceresi kapalı, adım bilgisi editörden yeniden gelir).
 */
import dynamic from "next/dynamic";

import { useWorkspace } from "@/components/workspace-provider";

const Studio = dynamic(() => import("@/components/composer/studio").then((m) => m.Studio), {
  ssr: false,
});

export function StudioHost() {
  const { studio } = useWorkspace();
  return studio ? <Studio /> : null;
}
