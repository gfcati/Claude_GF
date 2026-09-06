"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeSchedule, type StepProgress } from "@/lib/scheduling";
import type { Recipe, RecipeStep } from "@/lib/types";

type RowState = {
  step: RecipeStep;
  plannedStart: Date;
  plannedEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
};

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Arquivos de áudio de verdade (em vez de tons gerados via Web Audio API): no
// Safari/iOS, a chavinha física de silencioso muda o Web Audio API, mas não afeta
// elementos <audio> — é o único jeito confiável de tocar som mesmo com o aparelho
// no silencioso. https://bugs.webkit.org/show_bug.cgi?id=237322
let beepAudio: HTMLAudioElement | null = null;
let alarmAudio: HTMLAudioElement | null = null;

function getAudio(kind: "beep" | "alarm"): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (kind === "beep") {
    if (!beepAudio) beepAudio = new Audio("/sounds/beep.wav");
    return beepAudio;
  }
  if (!alarmAudio) alarmAudio = new Audio("/sounds/alarm.wav");
  return alarmAudio;
}

function playAudio(kind: "beep" | "alarm") {
  try {
    const audio = getAudio(kind);
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Áudio indisponível — o alerta visual/de notificação ainda funciona.
  }
}

// Chamar a partir de um handler de clique/toque (ex.: "Iniciar timer") pra
// desbloquear a reprodução de áudio no Safari antes que algum alerta precise tocar
// sozinho depois (via setTimeout), sem gesto do usuário.
function unlockAudio() {
  try {
    const audio = getAudio("beep");
    audio?.play().then(() => audio.pause()).catch(() => {});
  } catch {
    // ignora
  }
}

function playBeep() {
  playAudio("beep");
}

function playAlarm() {
  playAudio("alarm");
}

function notify(title: string, body: string, options?: { alarm?: boolean }) {
  if (options?.alarm) {
    playAlarm();
  } else {
    playBeep();
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icons/icon.svg" });
  }
}

type StoredTimer = { endAt: number; remainingMs: number; running: boolean };

function timerStorageKey(stepId: string) {
  return `mise:timer:${stepId}`;
}

function loadTimer(stepId: string): StoredTimer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(timerStorageKey(stepId));
    return raw ? (JSON.parse(raw) as StoredTimer) : null;
  } catch {
    return null;
  }
}

function saveTimer(stepId: string, timer: StoredTimer | null) {
  if (typeof window === "undefined") return;
  try {
    if (timer) {
      window.localStorage.setItem(timerStorageKey(stepId), JSON.stringify(timer));
    } else {
      window.localStorage.removeItem(timerStorageKey(stepId));
    }
  } catch {
    // localStorage indisponível (modo privado etc.) — timer só vive em memória.
  }
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function StepTimer({
  stepId,
  durationMinutes,
  description,
  isDone,
}: {
  stepId: string;
  durationMinutes: number;
  description: string;
  isDone: boolean;
}) {
  const [timer, setTimer] = useState<StoredTimer | null>(() => loadTimer(stepId));
  const [now, setNow] = useState(() => Date.now());
  // Passo concluído força o timer a parar, sem precisar sincronizar `timer` via setState.
  const effectiveTimer = isDone ? null : timer;

  useEffect(() => {
    if (isDone) saveTimer(stepId, null);
  }, [isDone, stepId]);

  // Re-render a cada segundo enquanto o timer roda, para atualizar o MM:SS exibido.
  useEffect(() => {
    if (!effectiveTimer?.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [effectiveTimer?.running]);

  // Dispara o alarme no horário certo; usar setTimeout (mesmo com delay 0) em vez de
  // checar e disparar direto no corpo do efeito também cobre o caso do iOS ter
  // suspendido a aba em segundo plano: ao montar de novo com `endAt` já no passado,
  // o alarme dispara no próximo tick em vez de nunca disparar.
  useEffect(() => {
    if (!effectiveTimer?.running) return;
    const remaining = effectiveTimer.endAt - Date.now();
    const id = setTimeout(() => {
      notify("Tempo esgotado", description, { alarm: true });
      saveTimer(stepId, null);
      setTimer(null);
    }, Math.max(0, remaining));
    return () => clearTimeout(id);
  }, [effectiveTimer?.running, effectiveTimer?.endAt, stepId, description]);

  // Mantém a tela acesa enquanto um timer estiver rodando (importante em iPad/iPhone).
  useEffect(() => {
    if (!effectiveTimer?.running) return;
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Falhou (ex.: aba em segundo plano) — o timer continua funcionando sem isso.
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible" && !cancelled) acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [effectiveTimer?.running]);

  function start() {
    unlockAudio();
    const durationMs = timer?.remainingMs ?? durationMinutes * 60_000;
    const next: StoredTimer = {
      endAt: Date.now() + durationMs,
      remainingMs: durationMs,
      running: true,
    };
    setTimer(next);
    setNow(Date.now());
    saveTimer(stepId, next);
  }

  function pause() {
    if (!timer?.running) return;
    const remainingMs = Math.max(0, timer.endAt - Date.now());
    const next: StoredTimer = { ...timer, remainingMs, running: false };
    setTimer(next);
    saveTimer(stepId, next);
  }

  function cancel() {
    setTimer(null);
    saveTimer(stepId, null);
  }

  if (isDone) return null;

  const remainingMs = timer
    ? timer.running
      ? Math.max(0, timer.endAt - now)
      : timer.remainingMs
    : durationMinutes * 60_000;

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="font-mono text-sm tabular-nums">{formatCountdown(remainingMs)}</span>
      {!timer && (
        <button
          type="button"
          onClick={start}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium"
        >
          Iniciar timer
        </button>
      )}
      {timer?.running && (
        <>
          <button
            type="button"
            onClick={pause}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium"
          >
            Pausar
          </button>
          <button type="button" onClick={cancel} className="text-xs text-foreground/60 underline">
            Cancelar
          </button>
        </>
      )}
      {timer && !timer.running && (
        <>
          <button
            type="button"
            onClick={start}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium"
          >
            Retomar
          </button>
          <button type="button" onClick={cancel} className="text-xs text-foreground/60 underline">
            Cancelar
          </button>
        </>
      )}
    </div>
  );
}

export function CookMode({ recipe, steps }: { recipe: Recipe; steps: RecipeStep[] }) {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());
  const orderedSteps = useMemo(
    () => [...steps].sort((a, b) => a.position - b.position),
    [steps],
  );

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const timerMap = timers.current;
    return () => {
      timerMap.forEach((list) => list.forEach(clearTimeout));
    };
  }, []);

  function scheduleAlertsFor(row: RowState, executionStart: Date) {
    const existing = timers.current.get(row.step.id);
    existing?.forEach(clearTimeout);
    if (row.actualEnd) return;

    const nowMs = new Date().getTime();
    const newTimers: ReturnType<typeof setTimeout>[] = [];

    if (row.plannedStart.getTime() > executionStart.getTime()) {
      const delay = row.plannedStart.getTime() - nowMs;
      if (delay > 0) {
        newTimers.push(
          setTimeout(
            () => notify("Hora de começar", `Passo: ${row.step.description}`),
            delay,
          ),
        );
      }
    }

    const endingSoonAt = row.plannedEnd.getTime() - 2 * 60_000;
    const endingSoonDelay = endingSoonAt - nowMs;
    if (endingSoonDelay > 0) {
      newTimers.push(
        setTimeout(
          () => notify("Faltam 2 minutos", row.step.description),
          endingSoonDelay,
        ),
      );
    }

    const overdueDelay = row.plannedEnd.getTime() - nowMs;
    if (overdueDelay > 0) {
      newTimers.push(
        setTimeout(() => {
          setRows((current) => {
            const target = current.find((r) => r.step.id === row.step.id);
            if (target && !target.actualEnd) {
              notify("Passo atrasado", target.step.description);
            }
            return current;
          });
        }, overdueDelay),
      );
    }

    timers.current.set(row.step.id, newTimers);
  }

  async function handleStart(startAt: Date) {
    unlockAudio();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    const schedule = computeSchedule(orderedSteps, startAt);
    const nextRows: RowState[] = orderedSteps.map((step) => {
      const planned = schedule.find((s) => s.stepId === step.id)!;
      return {
        step,
        plannedStart: planned.plannedStart,
        plannedEnd: planned.plannedEnd,
        actualStart: null,
        actualEnd: null,
      };
    });
    setRows(nextRows);
    nextRows.forEach((row) => scheduleAlertsFor(row, startAt));

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const newExecutionId = crypto.randomUUID();
    await supabase.from("executions").insert({
      id: newExecutionId,
      recipe_id: recipe.id,
      user_id: user.id,
      started_at: startAt.toISOString(),
      status: "in_progress",
    });
    await supabase.from("execution_steps").insert(
      nextRows.map((row) => ({
        execution_id: newExecutionId,
        step_id: row.step.id,
        planned_start: row.plannedStart.toISOString(),
        planned_end: row.plannedEnd.toISOString(),
        status: "pending",
      })),
    );
    setExecutionId(newExecutionId);
  }

  function replan(updatedRows: RowState[], executionStart: Date) {
    const progress = new Map<string, StepProgress>(
      updatedRows
        .filter((r) => r.actualStart)
        .map((r) => [r.step.id, { stepId: r.step.id, actualStart: r.actualStart, actualEnd: r.actualEnd }]),
    );
    const schedule = computeSchedule(orderedSteps, executionStart, progress);
    return updatedRows.map((row) => {
      const planned = schedule.find((s) => s.stepId === row.step.id)!;
      return row.actualEnd
        ? row
        : { ...row, plannedStart: planned.plannedStart, plannedEnd: planned.plannedEnd };
    });
  }

  async function handleCompleteStep(stepId: string) {
    const now = new Date();
    const executionStart = rows[0]?.actualStart ?? rows[0]?.plannedStart ?? now;

    const withCompletion = rows.map((row) =>
      row.step.id === stepId
        ? { ...row, actualStart: row.actualStart ?? now, actualEnd: now }
        : row,
    );
    const replanned = replan(withCompletion, executionStart);
    setRows(replanned);
    replanned.forEach((row) => scheduleAlertsFor(row, executionStart));

    if (!executionId) return;
    const supabase = createClient();
    const completed = withCompletion.find((r) => r.step.id === stepId)!;
    await supabase
      .from("execution_steps")
      .update({
        actual_start: completed.actualStart?.toISOString(),
        actual_end: completed.actualEnd?.toISOString(),
        status: "done",
      })
      .eq("execution_id", executionId)
      .eq("step_id", stepId);

    for (const row of replanned) {
      if (row.actualEnd) continue;
      await supabase
        .from("execution_steps")
        .update({
          planned_start: row.plannedStart.toISOString(),
          planned_end: row.plannedEnd.toISOString(),
        })
        .eq("execution_id", executionId)
        .eq("step_id", row.step.id);
    }

    if (replanned.every((r) => r.actualEnd)) {
      await supabase.from("executions").update({ status: "done" }).eq("id", executionId);
    }
  }

  if (rows.length === 0) {
    return <StartForm onStart={handleStart} />;
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-3">
        {rows.map((row) => {
          const isDone = Boolean(row.actualEnd);
          const isLate =
            !isDone &&
            row.plannedEnd.getTime() < now.getTime() &&
            now.getTime() > row.plannedStart.getTime();
          return (
            <li
              key={row.step.id}
              className={`flex items-start gap-3 rounded-md border p-3 ${
                isDone
                  ? "border-border opacity-60"
                  : isLate
                    ? "border-alert bg-alert-bg"
                    : "border-border"
              }`}
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => !isDone && handleCompleteStep(row.step.id)}
                className="mt-1 h-5 w-5 accent-[var(--accent)]"
              />
              <div className="flex-1">
                <p className={isDone ? "line-through" : ""}>{row.step.description}</p>
                <p className="mt-1 font-mono text-xs text-foreground/60">
                  previsto {timeFmt.format(row.plannedStart)}–{timeFmt.format(row.plannedEnd)}
                  {row.actualStart &&
                    ` · real ${timeFmt.format(row.actualStart)}${row.actualEnd ? `–${timeFmt.format(row.actualEnd)}` : ""}`}
                </p>
                <StepTimer
                  stepId={row.step.id}
                  durationMinutes={row.step.duration_minutes}
                  description={row.step.description}
                  isDone={isDone}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2 text-left">Passo</th>
              <th className="px-3 py-2 text-left font-mono">Previsto</th>
              <th className="px-3 py-2 text-left font-mono">Real</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.step.id} className="border-t border-border">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2 font-mono">
                  {timeFmt.format(row.plannedStart)}–{timeFmt.format(row.plannedEnd)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {row.actualStart
                    ? `${timeFmt.format(row.actualStart)}${row.actualEnd ? `–${timeFmt.format(row.actualEnd)}` : "–…"}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StartForm({ onStart }: { onStart: (startAt: Date) => void }) {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const [hours, minutes] = time.split(":").map(Number);
    const startAt = new Date();
    startAt.setHours(hours, minutes, 0, 0);
    onStart(startAt);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-6">
      <div>
        <label className="block text-sm font-medium">Hora de início</label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
      >
        Começar a cozinhar
      </button>
    </form>
  );
}
