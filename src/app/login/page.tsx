"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) console.error("signInWithOtp failed:", error);
    setStatus(error ? "error" : "sent");
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    setVerifying(true);
    setVerifyError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) {
      console.error("verifyOtp failed:", error);
      setVerifyError("Código inválido ou expirado. Tente reenviar.");
      setVerifying(false);
      return;
    }
    // Navegação completa (não client-side): garante que o proxy leia o
    // cookie de sessão recém-criado antes de decidir a rota.
    window.location.assign("/");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-surface p-8">
        <p className="text-sm text-foreground/70">
          Entre com seu e-mail para acessar suas receitas.
        </p>

        {status === "sent" ? (
          <div className="space-y-4">
            <p className="text-sm">
              Enviamos um link e um código de acesso para{" "}
              <strong>{email}</strong>.
            </p>
            <p className="text-xs text-foreground/60">
              Se o link não funcionar (ex.: abriu em outro app no celular),
              digite abaixo o código de 6 dígitos que veio no mesmo e-mail.
            </p>
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="Código de 6 dígitos"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
              >
                {verifying ? "Confirmando..." : "Confirmar código"}
              </button>
              {verifyError && (
                <p className="text-sm text-alert">{verifyError}</p>
              )}
            </form>
          </div>
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
