export type RecipeSourceType = "manual" | "url" | "social" | "ai";

export type Recipe = {
  id: string;
  user_id: string;
  title: string;
  photo_url: string | null;
  servings: number | null;
  total_time_minutes: number | null;
  tags: string[];
  source_type: RecipeSourceType;
  source_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position: number;
};

export type RecipeStep = {
  id: string;
  recipe_id: string;
  position: number;
  description: string;
  duration_minutes: number;
  // References another step in the same recipe. When set, this step is
  // planned to start at the same moment the referenced step starts,
  // modeling two steps that run concurrently (e.g. "enquanto o forno
  // pré-aquece, prepare o recheio"). When null, the step starts right
  // after the previous step (by `position`) ends.
  starts_with_step_id: string | null;
};

export type DraftIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type DraftStep = {
  description: string;
  duration_minutes: number;
  // Index into `RecipeDraft.steps` of the step this one runs concurrently
  // with, resolved to a real `starts_with_step_id` when the recipe is saved.
  starts_with_index: number | null;
};

export type RecipeDraft = {
  title: string;
  servings: number | null;
  tags: string[];
  source_type: RecipeSourceType;
  source_url: string | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
};

export type ExecutionStatus = "in_progress" | "done" | "abandoned";

export type Execution = {
  id: string;
  recipe_id: string;
  user_id: string;
  started_at: string;
  status: ExecutionStatus;
  created_at: string;
};

export type ExecutionStepStatus = "pending" | "in_progress" | "done";

export type ExecutionStep = {
  id: string;
  execution_id: string;
  step_id: string;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: ExecutionStepStatus;
};

export type AlertKind = "ending_soon" | "overdue" | "next_step";

export type ScheduledAlert = {
  id: string;
  execution_step_id: string;
  kind: AlertKind;
  send_at: string;
  sent: boolean;
};
