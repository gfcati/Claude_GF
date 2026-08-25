-- Mise — schema inicial (ver PRD seção 12.2)
-- Rode isto no SQL Editor do Supabase, ou via `supabase db push` com a CLI.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  photo_url text,
  servings integer,
  total_time_minutes integer,
  tags text[] not null default '{}',
  source_type text not null default 'manual'
    check (source_type in ('manual', 'url', 'social', 'ai')),
  source_url text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_id_idx on public.recipes (user_id);
create index recipes_is_public_idx on public.recipes (is_public) where is_public;

create function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- recipe_ingredients
-- ---------------------------------------------------------------------------
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  position integer not null default 0
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);

-- ---------------------------------------------------------------------------
-- recipe_steps
-- ---------------------------------------------------------------------------
create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null,
  description text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  -- Quando definido, este passo começa junto com o passo referenciado
  -- (execução em paralelo). Quando nulo, começa ao fim do passo anterior
  -- na ordem (`position`). Ver lib/scheduling.ts.
  starts_with_step_id uuid references public.recipe_steps (id) on delete set null
);

create index recipe_steps_recipe_id_idx on public.recipe_steps (recipe_id);

-- ---------------------------------------------------------------------------
-- executions — uma linha por "Cozinhar agora"
-- ---------------------------------------------------------------------------
create table public.executions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'done', 'abandoned')),
  created_at timestamptz not null default now()
);

create index executions_user_id_idx on public.executions (user_id);

-- ---------------------------------------------------------------------------
-- execution_steps — fonte da tabela de tempos previsto/real
-- ---------------------------------------------------------------------------
create table public.execution_steps (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.executions (id) on delete cascade,
  step_id uuid not null references public.recipe_steps (id) on delete cascade,
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done'))
);

create index execution_steps_execution_id_idx on public.execution_steps (execution_id);

-- ---------------------------------------------------------------------------
-- scheduled_alerts — fila de notificações (ver PRD 4.6 / 12.4)
-- ---------------------------------------------------------------------------
create table public.scheduled_alerts (
  id uuid primary key default gen_random_uuid(),
  execution_step_id uuid not null references public.execution_steps (id) on delete cascade,
  kind text not null check (kind in ('ending_soon', 'overdue', 'next_step')),
  send_at timestamptz not null,
  sent boolean not null default false
);

create index scheduled_alerts_due_idx on public.scheduled_alerts (send_at) where not sent;

-- ---------------------------------------------------------------------------
-- push_subscriptions — necessário para Web Push com o app em segundo plano
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — a privacidade descrita na seção 5 do PRD é aplicada
-- aqui, não só na UI.
-- ---------------------------------------------------------------------------
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.executions enable row level security;
alter table public.execution_steps enable row level security;
alter table public.scheduled_alerts enable row level security;
alter table public.push_subscriptions enable row level security;

-- recipes: dono tem acesso total; qualquer usuário autenticado pode ler
-- receitas públicas (comunidade, PRD 7.2).
create policy "recipes_select_own" on public.recipes
  for select using (auth.uid() = user_id);
create policy "recipes_select_public" on public.recipes
  for select using (is_public = true);
create policy "recipes_insert_own" on public.recipes
  for insert with check (auth.uid() = user_id);
create policy "recipes_update_own" on public.recipes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recipes_delete_own" on public.recipes
  for delete using (auth.uid() = user_id);

-- recipe_ingredients / recipe_steps: seguem a visibilidade da receita-mãe.
create policy "recipe_ingredients_select" on public.recipe_ingredients
  for select using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and (r.user_id = auth.uid() or r.is_public)
    )
  );
create policy "recipe_ingredients_write" on public.recipe_ingredients
  for all using (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

create policy "recipe_steps_select" on public.recipe_steps
  for select using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and (r.user_id = auth.uid() or r.is_public)
    )
  );
create policy "recipe_steps_write" on public.recipe_steps
  for all using (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

-- executions / execution_steps / scheduled_alerts / push_subscriptions:
-- sempre privados, só o dono.
create policy "executions_owner" on public.executions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "execution_steps_owner" on public.execution_steps
  for all using (
    exists (select 1 from public.executions e where e.id = execution_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.executions e where e.id = execution_id and e.user_id = auth.uid())
  );

create policy "scheduled_alerts_owner" on public.scheduled_alerts
  for all using (
    exists (
      select 1 from public.execution_steps es
      join public.executions e on e.id = es.execution_id
      where es.id = execution_step_id and e.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.execution_steps es
      join public.executions e on e.id = es.execution_id
      where es.id = execution_step_id and e.user_id = auth.uid()
    )
  );

create policy "push_subscriptions_owner" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
