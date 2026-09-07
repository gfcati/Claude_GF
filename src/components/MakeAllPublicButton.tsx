"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MakeAllPublicButton() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    if (
      !confirm(
        "Tornar todas as suas receitas públicas? Qualquer pessoa com conta no mise vai poder vê-las.",
      )
    ) {
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("recipes").update({ is_public: true }).eq("user_id", user.id);
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={saving}
      className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-60"
    >
      {saving ? "Tornando públicas..." : "Tornar todas públicas"}
    </button>
  );
}
