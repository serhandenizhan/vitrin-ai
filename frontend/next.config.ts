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
};

export default nextConfig;
