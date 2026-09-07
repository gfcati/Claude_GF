"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Recipe, RecipeIngredient, RecipeStep } from "@/lib/types";

export function SaveRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
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

    const [{ data: original }, { data: ingredients }, { data: steps }] = await Promise.all([
      supabase.from("recipes").select("*").eq("id", recipeId).maybeSingle<Recipe>(),
      supabase
        .from("recipe_ingredients")
        .select("*")
        .eq("recipe_id", recipeId)
        .order("position")
        .returns<RecipeIngredient[]>(),
      supabase
        .from("recipe_steps")
        .select("*")
        .eq("recipe_id", recipeId)
        .order("position")
        .returns<RecipeStep[]>(),
    ]);

    if (!original) {
      setError("Não foi possível carregar a receita.");
      setSaving(false);
      return;
    }

    const newRecipeId = crypto.randomUUID();
    const { error: recipeError } = await supabase.from("recipes").insert({
      id: newRecipeId,
      user_id: user.id,
      title: original.title,
      servings: original.servings,
      total_time_minutes: original.total_time_minutes,
      tags: original.tags,
      source_type: original.source_type,
      source_url: original.source_url,
      is_public: false,
    });
    if (recipeError) {
      setError(recipeError.message);
      setSaving(false);
      return;
    }

    if (ingredients && ingredients.length > 0) {
      await supabase.from("recipe_ingredients").insert(
        ingredients.map((i) => ({
          recipe_id: newRecipeId,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          position: i.position,
        })),
      );
    }

    if (steps && steps.length > 0) {
      // Novos ids pros passos copiados, remapeando `starts_with_step_id` pra
      // continuar apontando pro passo certo dentro da cópia.
      const idMap = new Map(steps.map((s) => [s.id, crypto.randomUUID()]));
      await supabase.from("recipe_steps").insert(
        steps.map((s) => ({
          id: idMap.get(s.id),
          recipe_id: newRecipeId,
          position: s.position,
          description: s.description,
          duration_minutes: s.duration_minutes,
          starts_with_step_id: s.starts_with_step_id
            ? (idMap.get(s.starts_with_step_id) ?? null)
            : null,
        })),
      );
    }

    router.push(`/recipes/${newRecipeId}`);
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        {saving ? "Salvando..." : "Salvar para mim"}
      </button>
      {error && <p className="mt-1 text-sm text-alert">{error}</p>}
    </div>
  );
}
