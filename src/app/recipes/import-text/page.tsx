"use client";

import { useState } from "react";
import Link from "next/link";
import { RecipeForm } from "@/components/RecipeForm";
import type { RecipeDraft } from "@/lib/types";

export default function ImportTextRecipePage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    draft: RecipeDraft;
    confidence: "high" | "low";
  } | null>(null);

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/import-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
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
        Colar texto de uma receita
      </h1>

      {!result && (
        <form onSubmit={handleParse} className="space-y-3">
          <textarea
            required
            placeholder={
              "Cole aqui o texto da receita, por exemplo:\n\nBolo de cenoura\n\nIngredientes:\n3 cenouras médias\n2 xícaras de açúcar\n...\n\nModo de preparo:\n1. Bata as cenouras...\n2. Misture com o açúcar..."
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            {loading ? "Analisando..." : "Analisar texto"}
          </button>
          <p className="text-xs text-foreground/60">
            Funciona melhor com títulos &quot;Ingredientes&quot; e &quot;Modo
            de preparo&quot; separando as seções. Prefere importar de um link?{" "}
            <Link href="/recipes/import" className="text-accent underline">
              Importar de URL
            </Link>
            .
          </p>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-alert">{error}</p>}

      {result && (
        <div className="mt-8">
          <RecipeForm
            initialDraft={result.draft}
            reviewNotice={
              result.confidence === "high"
                ? "Extraímos ingredientes e passos do texto colado. Confira tudo antes de salvar — em especial as quantidades e os tempos de cada passo, que são uma estimativa."
                : "Não conseguimos separar ingredientes e passos automaticamente deste texto. Preencha manualmente abaixo — o título já veio do texto."
            }
          />
        </div>
      )}
    </main>
  );
}
