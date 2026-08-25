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

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio indisponível — o alerta visual/de notificação ainda funciona.
  }
}

function notify(title: string, body: string) {
  playBeep();
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icons/icon.svg" });
  }
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
