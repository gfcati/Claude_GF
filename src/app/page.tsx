import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MakeAllPublicButton } from "@/components/MakeAllPublicButton";
import type { Recipe } from "@/lib/types";

export default async function RecipesPage({ searchParams }: PageProps<"/">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // .rpc() não tem tipos gerados do schema (não usamos `Database` genérico
  // no client), então encadear `.returns<T>()` nele confunde o supabase-js;
  // fazemos o cast uma vez no resultado já mesclado das duas branches.
  const { data: rawRecipes } = query
    ? await supabase.rpc("search_recipes", { search_term: query })
    : await supabase
        .from("recipes")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });
  const recipes = (rawRecipes ?? null) as Recipe[] | null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">Minhas receitas</h1>
        <div className="flex flex-wrap justify-end gap-2">
          {!query && recipes && recipes.length > 0 && <MakeAllPublicButton />}
          <Link
            href="/recipes/import"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface"
          >
            Importar de URL
          </Link>
          <Link
            href="/recipes/import-text"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface"
          >
            Colar texto
          </Link>
          <Link
            href="/recipes/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
          >
            Nova receita
          </Link>
        </div>
      </header>

      <form action="/" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por título, tag ou ingrediente..."
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface"
        >
          Buscar
        </button>
        {query && (
          <Link
            href="/"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface"
          >
            Limpar
          </Link>
        )}
      </form>

      {!recipes || recipes.length === 0 ? (
        <p className="text-sm text-foreground/70">
          {query
            ? `Nenhuma receita encontrada para "${query}".`
            : "Nenhuma receita ainda. Importe uma de um link, cole o texto de uma receita que você já tem, ou cadastre a primeira manualmente."}
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
