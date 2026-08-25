import type { RecipeStep } from "./types";

export type PlannedStep = {
  stepId: string;
  plannedStart: Date;
  plannedEnd: Date;
};

export type StepProgress = {
  stepId: string;
  actualStart: Date | null;
  actualEnd: Date | null;
};

/**
 * Computes the planned start/end of every step of a recipe for a given
 * kick-off time, respecting `starts_with_step_id`.
 *
 * Default rule: a step starts right after the previous step (by `position`)
 * ends — a plain sequential recipe.
 *
 * Override: a step with `starts_with_step_id` starts at the same instant its
 * referenced step starts, so both run concurrently (e.g. "enquanto o forno
 * pré-aquece, prepare o recheio").
 *
 * `progress` lets already-completed/started steps use their *real* recorded
 * times instead of the estimate, so a delay on step 2 pushes out every step
 * that comes after it — this is the replanning described in the PRD (4.5).
 */
export function computeSchedule(
  steps: RecipeStep[],
  startAt: Date,
  progress: Map<string, StepProgress> = new Map(),
): PlannedStep[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const byId = new Map(ordered.map((step) => [step.id, step]));
  const resolved = new Map<string, PlannedStep>();

  function resolve(step: RecipeStep): PlannedStep {
    const cached = resolved.get(step.id);
    if (cached) return cached;

    const known = progress.get(step.id);
    if (known?.actualStart) {
      const plannedEnd =
        known.actualEnd ??
        new Date(known.actualStart.getTime() + step.duration_minutes * 60_000);
      const result = { stepId: step.id, plannedStart: known.actualStart, plannedEnd };
      resolved.set(step.id, result);
      return result;
    }

    let plannedStart: Date;
    if (step.starts_with_step_id) {
      const sibling = byId.get(step.starts_with_step_id);
      plannedStart = sibling ? resolve(sibling).plannedStart : startAt;
    } else {
      const index = ordered.findIndex((s) => s.id === step.id);
      const previous = index > 0 ? ordered[index - 1] : null;
      plannedStart = previous ? resolve(previous).plannedEnd : startAt;
    }

    const plannedEnd = new Date(
      plannedStart.getTime() + step.duration_minutes * 60_000,
    );
    const result = { stepId: step.id, plannedStart, plannedEnd };
    resolved.set(step.id, result);
    return result;
  }

  return ordered.map(resolve);
}

export function totalDurationMinutes(steps: RecipeStep[]): number {
  const schedule = computeSchedule(steps, new Date(0));
  if (schedule.length === 0) return 0;
  const end = Math.max(...schedule.map((s) => s.plannedEnd.getTime()));
  return Math.round((end - new Date(0).getTime()) / 60_000);
}
