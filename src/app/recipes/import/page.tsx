"use client";

import { useState } from "react";
import { RecipeForm } from "@/components/RecipeForm";
import type { RecipeDraft } from "@/lib/types";

export default function ImportRecipePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    draft: RecipeDraft;
    confidence: "high" | "low";
  } | null>(null);

  async function handleFetch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao importar.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="mb-6 font-serif text-2xl font-semibold text-accent">
        Importar de URL
      </h1>

      {!result && (
        <form onSubmit={handleFetch} className="flex gap-2">
          <input
            required
            type="url"
            placeholder="https://exemplo.com/receita-de-bolo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-alert">{error}</p>}

      {result && (
        <div className="mt-8">
          <RecipeForm
            initialDraft={result.draft}
            reviewNotice={
              result.confidence === "high"
                ? "Extraímos os dados da página. Confira tudo antes de salvar — em especial os tempos de cada passo, que são uma estimativa."
                : "Não conseguimos extrair ingredientes e passos automaticamente desta página. Preencha manualmente abaixo — o título já veio da página."
            }
          />
        </div>
      )}
    </main>
  );
}
