import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/types";

export default async function RecipesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: recipes } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", user?.id)
    .order("created_at", { ascending: false })
    .returns<Recipe[]>();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">Minhas receitas</h1>
        <div className="flex gap-2">
          <Link
            href="/recipes/import"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface"
          >
            Importar de URL
          </Link>
          <Link
            href="/recipes/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
          >
            Nova receita
          </Link>
        </div>
      </header>

      {!recipes || recipes.length === 0 ? (
        <p className="text-sm text-foreground/70">
          Nenhuma receita ainda. Importe uma de um link ou cadastre a
          primeira manualmente.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className="block rounded-lg border border-border bg-surface p-4 hover:border-accent"
              >
                <h2 className="font-medium">{recipe.title}</h2>
                <p className="mt-1 text-xs text-foreground/60">
                  {recipe.total_time_minutes
                    ? `${recipe.total_time_minutes} min`
                    : "Tempo não definido"}
                  {recipe.servings ? ` · ${recipe.servings} porções` : ""}
                </p>
                {recipe.tags.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {recipe.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-background px-2 py-0.5 text-[11px] text-foreground/70"
                      >
                        {tag}
                      </span>
                    ))}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
