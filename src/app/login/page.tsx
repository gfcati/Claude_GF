"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-surface p-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-accent">
            Mise
          </h1>
          <p className="mt-1 text-sm text-foreground/70">
            Entre com seu e-mail para acessar suas receitas.
          </p>
        </div>

        {status === "sent" ? (
          <p className="text-sm">
            Enviamos um link de acesso para <strong>{email}</strong>. Confira
            sua caixa de entrada.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              {status === "sending" ? "Enviando..." : "Enviar link de acesso"}
            </button>
            {status === "error" && (
              <p className="text-sm text-alert">
                Não foi possível enviar o link. Tente novamente.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
