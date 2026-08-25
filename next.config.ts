import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que o Turbopack suba até o package-lock.json solto em
  // /Users/giancatinella (fora deste repositório) para decidir a raiz do projeto.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
