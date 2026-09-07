"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ShareRecipe({
  recipeId,
  isPublic,
}: {
  recipeId: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function toggle() {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("recipes").update({ is_public: !isPublic }).eq("id", recipeId);
    setSaving(false);
    router.refresh();
  }

  async function copyLink() {
    const url = `${window.location.origin}/recipes/${recipeId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copie o link:", url);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-60"
      >
        {isPublic ? "Tornar privada" : "Tornar pública"}
      </button>
      {isPublic && (
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface"
        >
          {copied ? "Link copiado!" : "Copiar link"}
        </button>
      )}
    </div>
  );
}
