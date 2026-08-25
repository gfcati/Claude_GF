"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RecipeDraft } from "@/lib/types";

const EMPTY_DRAFT: RecipeDraft = {
  title: "",
  servings: null,
  tags: [],
  source_type: "manual",
  source_url: null,
  ingredients: [{ name: "", quantity: null, unit: null }],
  steps: [{ description: "", duration_minutes: 5, starts_with_index: null }],
};

export function RecipeForm({
  initialDraft,
  reviewNotice,
  editingRecipeId,
}: {
  initialDraft?: RecipeDraft;
  reviewNotice?: string;
  /** When set, updates this recipe instead of creating a new one. */
  editingRecipeId?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RecipeDraft>(initialDraft ?? EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateIngredient(index: number, patch: Partial<RecipeDraft["ingredients"][number]>) {
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)),
    }));
  }

  function updateStep(index: number, patch: Partial<RecipeDraft["steps"][number]>) {
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Sessão expirada. Faça login novamente.");
      setSaving(false);
      return;
    }

    const recipeId = editingRecipeId ?? crypto.randomUUID();
    const totalTime = draft.steps.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const recipeFields = {
      title: draft.title,
      servings: draft.servings,
      total_time_minutes: totalTime,
      tags: draft.tags,
      source_type: draft.source_type,
      source_url: draft.source_url,
    };

    if (editingRecipeId) {
      const { error: updateError } = await supabase
        .from("recipes")
        .update(recipeFields)
        .eq("id", editingRecipeId);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
      // Regravar filhos do zero é mais simples e seguro do que fazer diff
      // linha a linha para um formulário deste tamanho.
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
      await supabase.from("recipe_steps").delete().eq("recipe_id", recipeId);
    } else {
      const { error: recipeError } = await supabase
        .from("recipes")
        .insert({ id: recipeId, user_id: user.id, ...recipeFields });
      if (recipeError) {
        setError(recipeError.message);
        setSaving(false);
        return;
      }
    }

    const ingredientRows = draft.ingredients
      .filter((i) => i.name.trim())
      .map((i, index) => ({
        recipe_id: recipeId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        position: index,
      }));
    if (ingredientRows.length > 0) {
      const { error: ingredientsError } = await supabase
        .from("recipe_ingredients")
        .insert(ingredientRows);
      if (ingredientsError) {
        setError(ingredientsError.message);
        setSaving(false);
        return;
      }
    }

    const validSteps = draft.steps.filter((s) => s.description.trim());
    const stepIds = validSteps.map(() => crypto.randomUUID());
    const stepRows = validSteps.map((s, index) => ({
      id: stepIds[index],
      recipe_id: recipeId,
      position: index,
      description: s.description,
      duration_minutes: s.duration_minutes,
      starts_with_step_id:
        s.starts_with_index !== null ? stepIds[s.starts_with_index] ?? null : null,
    }));
    if (stepRows.length > 0) {
      const { error: stepsError } = await supabase.from("recipe_steps").insert(stepRows);
      if (stepsError) {
        setError(stepsError.message);
        setSaving(false);
        return;
      }
    }

    router.push(`/recipes/${recipeId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {reviewNotice && (
        <p className="rounded-md border border-alert bg-alert-bg px-4 py-3 text-sm text-alert">
          {reviewNotice}
        </p>
      )}

      <section className="space-y-3">
        <label className="block text-sm font-medium">Título</label>
        <input
          required
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <div className="flex gap-3">
          <div>
            <label className="block text-sm font-medium">Porções</label>
            <input
              type="number"
              min={1}
              value={draft.servings ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  servings: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium">
              Tags (separadas por vírgula)
            </label>
            <input
              value={draft.tags.join(", ")}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                }))
              }
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ingredientes</h2>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                ingredients: [...d.ingredients, { name: "", quantity: null, unit: null }],
              }))
            }
            className="text-xs text-accent underline"
          >
            + adicionar
          </button>
        </div>
        {draft.ingredients.map((ing, index) => (
          <div key={index} className="flex gap-2">
            <input
              placeholder="Quantidade"
              type="number"
              value={ing.quantity ?? ""}
              onChange={(e) =>
                updateIngredient(index, {
                  quantity: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              placeholder="Unidade"
              value={ing.unit ?? ""}
              onChange={(e) => updateIngredient(index, { unit: e.target.value })}
              className="w-28 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              placeholder="Ingrediente"
              value={ing.name}
              onChange={(e) => updateIngredient(index, { name: e.target.value })}
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Passos</h2>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                steps: [
                  ...d.steps,
                  { description: "", duration_minutes: 5, starts_with_index: null },
                ],
              }))
            }
            className="text-xs text-accent underline"
          >
            + adicionar
          </button>
        </div>
        {draft.steps.map((step, index) => (
          <div key={index} className="space-y-1 rounded-md border border-border p-3">
            <div className="flex gap-2">
              <span className="mt-2 font-mono text-xs text-foreground/50">
                {index + 1}.
              </span>
              <textarea
                placeholder="Descrição do passo"
                value={step.description}
                onChange={(e) => updateStep(index, { description: e.target.value })}
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-3 pl-6">
              <label className="text-xs text-foreground/60">
                Duração (min)
                <input
                  type="number"
                  min={1}
                  value={step.duration_minutes}
                  onChange={(e) =>
                    updateStep(index, { duration_minutes: Number(e.target.value) })
                  }
                  className="ml-2 w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                />
              </label>
              {index > 0 && (
                <label className="text-xs text-foreground/60">
                  Começa junto com
                  <select
                    value={step.starts_with_index ?? ""}
                    onChange={(e) =>
                      updateStep(index, {
                        starts_with_index: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="ml-2 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                  >
                    <option value="">passo anterior (sequencial)</option>
                    {draft.steps.slice(0, index).map((s, i) => (
                      <option key={i} value={i}>
                        passo {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        ))}
      </section>

      {error && <p className="text-sm text-alert">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        {saving ? "Salvando..." : "Salvar receita"}
      </button>
    </form>
  );
}
