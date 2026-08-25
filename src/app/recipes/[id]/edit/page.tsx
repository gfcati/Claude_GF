import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeForm } from "@/components/RecipeForm";
import type { Recipe, RecipeIngredient, RecipeStep, RecipeDraft } from "@/lib/types";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle<Recipe>();
  if (!recipe) notFound();

  const [{ data: ingredients }, { data: steps }] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", id)
      .order("position")
      .returns<RecipeIngredient[]>(),
    supabase
      .from("recipe_steps")
      .select("*")
      .eq("recipe_id", id)
      .order("position")
      .returns<RecipeStep[]>(),
  ]);

  const orderedSteps = steps ?? [];
  const indexById = new Map(orderedSteps.map((s, i) => [s.id, i]));

  const draft: RecipeDraft = {
    title: recipe.title,
    servings: recipe.servings,
    tags: recipe.tags,
    source_type: recipe.source_type,
    source_url: recipe.source_url,
    ingredients: (ingredients ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
    })),
    steps: orderedSteps.map((s) => ({
      description: s.description,
      duration_minutes: s.duration_minutes,
      starts_with_index: s.starts_with_step_id
        ? (indexById.get(s.starts_with_step_id) ?? null)
        : null,
    })),
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="mb-6 font-serif text-2xl font-semibold text-accent">
        Editar receita
      </h1>
      <RecipeForm initialDraft={draft} editingRecipeId={id} />
    </main>
  );
}
