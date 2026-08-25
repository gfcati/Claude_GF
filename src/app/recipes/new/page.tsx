import { RecipeForm } from "@/components/RecipeForm";

export default function NewRecipePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="mb-6 font-serif text-2xl font-semibold text-accent">
        Nova receita
      </h1>
      <RecipeForm />
    </main>
  );
}
