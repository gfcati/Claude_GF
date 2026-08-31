-- Mise — busca de receitas (título, tags, ingredientes).
-- Rode isto no SQL Editor do Supabase depois do 0001_init.sql.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent(text) é STABLE no Postgres (depende do dicionário de busca), o
-- que impede usá-la direto em um índice funcional. Este wrapper assume que
-- o dicionário 'unaccent' não muda em produção e pode ser marcado IMMUTABLE.
create or replace function public.unaccented(input text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions, pg_temp
as $$
  select unaccent(input)
$$;

-- Índices trigram (busca por substring, tolerante a maiúsculas/acentos) —
-- é isso que mantém a busca rápida conforme o número de receitas cresce.
create index recipes_title_trgm_idx
  on public.recipes using gin (public.unaccented(lower(title)) gin_trgm_ops);

create index recipes_tags_trgm_idx
  on public.recipes using gin (public.unaccented(lower(array_to_string(tags, ' '))) gin_trgm_ops);

create index recipe_ingredients_name_trgm_idx
  on public.recipe_ingredients using gin (public.unaccented(lower(name)) gin_trgm_ops);

-- Função de busca: título, tags e nomes de ingredientes das receitas do
-- próprio usuário. `security invoker` (padrão) + RLS já em vigor nas
-- tabelas cobrem a autorização — não precisa de lógica extra aqui além do
-- filtro por auth.uid() para não misturar com receitas públicas de terceiros.
create or replace function public.search_recipes(search_term text)
returns setof public.recipes
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select distinct r.*
  from public.recipes r
  left join public.recipe_ingredients ri on ri.recipe_id = r.id
  where r.user_id = auth.uid()
    and (
      public.unaccented(lower(r.title)) ilike '%' || public.unaccented(lower(search_term)) || '%'
      or public.unaccented(lower(array_to_string(r.tags, ' '))) ilike '%' || public.unaccented(lower(search_term)) || '%'
      or public.unaccented(lower(ri.name)) ilike '%' || public.unaccented(lower(search_term)) || '%'
    )
  order by r.created_at desc
$$;

grant execute on function public.search_recipes(text) to authenticated;
