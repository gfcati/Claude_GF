"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Excluir esta receita? Essa ação não pode ser desfeita.")) return;
    const supabase = createClient();
    await supabase.from("recipes").delete().eq("id", recipeId);
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="rounded-md border border-alert px-3 py-2 text-sm text-alert hover:bg-alert-bg"
    >
      Excluir
    </button>
  );
}
