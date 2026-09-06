import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que o Turbopack suba até o package-lock.json solto em
  // /Users/giancatinella (fora deste repositório) para decidir a raiz do projeto.
  turbopack: {
    root: __dirname,
  },
  env: {
    // Exibido no rodapé pra dar certeza de qual deploy está no ar — a Vercel
    // preenche VERCEL_GIT_COMMIT_SHA sozinha em todo build, sem precisar
    // habilitar a exposição automática de env vars do sistema.
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
  },
};

export default nextConfig;
