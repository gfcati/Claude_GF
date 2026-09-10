import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CookMode } from "@/components/CookMode";
import type { Recipe, RecipeIngredient, RecipeStep } from "@/lib/types";

export default async function CookPage({
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

  const [{ data: steps }, { data: ingredients }] = await Promise.all([
    supabase
      .from("recipe_steps")
      .select("*")
      .eq("recipe_id", id)
      .order("position")
      .returns<RecipeStep[]>(),
    supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", id)
      .order("position")
      .returns<RecipeIngredient[]>(),
  ]);

  if (!steps || steps.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <p className="text-sm text-foreground/70">
          Esta receita ainda não tem passos cadastrados.{" "}
          <Link href={`/recipes/${id}/edit`} className="text-accent underline">
            Adicione os passos
          </Link>{" "}
          antes de cozinhar.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="mb-6 font-serif text-2xl font-semibold text-accent">
        {recipe.title}
      </h1>
      <CookMode recipe={recipe} steps={steps} ingredients={ingredients ?? []} />
    </main>
  );
}
