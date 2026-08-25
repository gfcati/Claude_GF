# Mise

Esqueleto do app descrito no PRD "Mise" — organização de receitas com cronograma
de execução guiada, checklist e alertas de tempo. Stack: Next.js (App Router) +
Supabase (Postgres, Auth, RLS), conforme a seção 12 do PRD.

## Rodando localmente

### 1. Crie um projeto no Supabase

1. Crie uma conta/projeto em [supabase.com](https://supabase.com) (free tier).
2. No **SQL Editor** do projeto, cole e rode o conteúdo de
   `supabase/migrations/0001_init.sql`. Isso cria as tabelas e as políticas de
   RLS (linha 12.2 do PRD).
3. Em **Project Settings → API**, copie a **Project URL** e a **anon/public key**.

### 2. Configure as variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com os
valores copiados acima.

### 3. Instale e rode

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). O login é por link mágico
enviado por e-mail (Supabase Auth) — não é preciso senha.

## O que já funciona

- CRUD de receitas (título, porções, tags, ingredientes, passos com duração).
- Importação por URL (`/recipes/import`): busca a página, extrai dados
  `schema.org/Recipe` (JSON-LD) quando existem, e sempre passa por uma tela
  de revisão antes de salvar — a mesma usada na criação manual.
- Modo de execução (`/recipes/[id]/cook`): define hora de início, calcula o
  cronograma de cada passo (`src/lib/scheduling.ts`), mostra o checklist e a
  tabela de tempos previsto/real, e **replaneja automaticamente** os passos
  seguintes quando um atraso acontece.
- Passos podem ser marcados como "começa junto com o passo N" para modelar
  execução em paralelo (ex.: enquanto o forno pré-aquece, prepare o recheio).
- Alertas sonoros + `Notification` do navegador para "hora de começar",
  "faltam 2 minutos" e "passo atrasado", enquanto a aba está aberta.
- Row-Level Security no Postgres: cada usuário só acessa suas próprias
  receitas/execuções; `is_public = true` já libera leitura para a fase de
  comunidade (PRD 7.2), embora a tela de publicar/navegar a comunidade ainda
  não exista.
- PWA instalável (manifest + service worker mínimo cacheando o app shell).

## O que ainda falta (próximos incrementos, ver PRD seções 7 e 12.4)

- **Alertas em segundo plano de verdade**: hoje os alertas dependem da aba
  estar aberta (`setTimeout` + `Notification`). Para funcionar com o app
  fechado é preciso: fluxo de assinatura Web Push (salvar em
  `push_subscriptions`), gravar linhas em `scheduled_alerts` ao iniciar/
  replanejar uma execução, e um cron job (Supabase `pg_cron` ou Vercel Cron)
  que dispara o push a cada minuto — o `sw.js` já sabe *receber* um push,
  falta emitir.
- Importação de redes sociais (7.1), comunidade de receitas (7.2 — falta UI
  de publicar/navegar), busca por IA e geração de receitas (7.3).
- Histórico de execuções passadas e escalonamento de porções (v1.1 no PRD).
- Ícones PWA reais (hoje é um SVG único de placeholder em `public/icons`) e
  `apple-touch-icon` dedicado para iOS.

## Estrutura

```
src/
  app/                    rotas (App Router)
  components/             RecipeForm, CookMode, etc.
  lib/
    supabase/             clientes browser/server (@supabase/ssr)
    scheduling.ts         motor de cronograma (núcleo do produto)
    import/parseRecipe.ts parser de schema.org/Recipe
    types.ts              tipos espelhando o schema do Postgres
  proxy.ts                sessão do Supabase + redirecionamento de login
                           (substitui o antigo middleware.ts no Next 16)
supabase/migrations/       schema SQL + políticas de RLS
```
