import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Next.js varsayilan olarak frontend/ altina AGENTS.md ve CLAUDE.md uretiyor.
   * Bu depoda kok dizindeki CLAUDE.md tek dogru kaynak (bkz. kok CLAUDE.md
   * kural 1); alt dizinde ikinci bir kopya olmasi hangi dosyanin gecerli
   * oldugunu belirsizlestirir ve iki dosya kacinilmaz olarak birbirinden
   * ayrisir.
   */
  agentRules: false,
  /*
   * Gelistirme sunucusunu ayni agdaki bir telefondan acmak icin
   * (ornek: http://192.168.1.181:3000). Next.js 16 localhost disindan gelen
   * gelistirme isteklerini engelliyor; engellenince sayfa acilir ama
   * etkilesimsiz kalir. Adres makineye ozel oldugu icin koda yazilmiyor
   * (kok CLAUDE.md ders 11): `.env.local`e virgulle ayrilmis
   * `DEV_ALLOWED_ORIGINS=192.168.1.181`. Uretim derlemesini etkilemiyor.
   */
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export default nextConfig;
