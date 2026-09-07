import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeleteRecipeButton } from "@/components/DeleteRecipeButton";
import { ShareRecipe } from "@/components/ShareRecipe";
import { SaveRecipeButton } from "@/components/SaveRecipeButton";
import type { Recipe, RecipeIngredient, RecipeStep } from "@/lib/types";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: recipe }, { data: userData }] = await Promise.all([
    supabase.from("recipes").select("*").eq("id", id).maybeSingle<Recipe>(),
    supabase.auth.getUser(),
  ]);

  if (!recipe) notFound();
  const isOwner = userData.user?.id === recipe.user_id;

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

  const stepPositionById = new Map((steps ?? []).map((s, i) => [s.id, i + 1]));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-accent">
            {recipe.title}
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            {recipe.total_time_minutes ? `${recipe.total_time_minutes} min` : ""}
            {recipe.servings ? ` · ${recipe.servings} porções` : ""}
          </p>
        </div>
        {isOwner ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <ShareRecipe recipeId={id} isPublic={recipe.is_public} />
            <Link
              href={`/recipes/${id}/edit`}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface"
            >
              Editar
            </Link>
            <DeleteRecipeButton recipeId={id} />
          </div>
        ) : (
          <SaveRecipeButton recipeId={id} />
        )}
      </div>

      <Link
        href={`/recipes/${id}/cook`}
        className="mb-8 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
      >
        Cozinhar agora
      </Link>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Ingredientes</h2>
        <ul className="space-y-1 text-sm">
          {(ingredients ?? []).map((ing) => (
            <li key={ing.id}>
              {ing.quantity ? `${ing.quantity} ` : ""}
              {ing.unit ? `${ing.unit} ` : ""}
              {ing.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Passos</h2>
        <ol className="space-y-3 text-sm">
          {(steps ?? []).map((step, index) => (
            <li key={step.id} className="rounded-md border border-border p-3">
              <p>
                <span className="font-mono text-xs text-foreground/50">
                  {index + 1}.
                </span>{" "}
                {step.description}
              </p>
              <p className="mt-1 text-xs text-foreground/60">
                {step.duration_minutes} min
                {step.starts_with_step_id &&
                  ` · começa junto com o passo ${stepPositionById.get(step.starts_with_step_id)}`}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
