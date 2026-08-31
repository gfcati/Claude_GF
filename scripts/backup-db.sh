#!/usr/bin/env bash
# Backup do banco Postgres do Mise (Supabase) via pg_dump.
#
# Requer SUPABASE_DB_URL em .env.local — a "Connection string" (URI) do
# banco em Project Settings → Database → Connection string, com a senha do
# banco preenchida (é diferente da anon key usada pelo app).
#
# Uso: npm run backup
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Defina SUPABASE_DB_URL em .env.local (Project Settings → Database → Connection string, URI)." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump não encontrado no PATH." >&2
  echo "No macOS: brew install libpq && brew link --force libpq" >&2
  exit 1
fi

mkdir -p backups
out="backups/mise-$(date +%Y%m%d-%H%M%S).dump"

pg_dump "$SUPABASE_DB_URL" --no-owner --no-acl --format=custom --file="$out"

echo "Backup salvo em $out"
echo "Para restaurar num banco vazio:"
echo "  pg_restore --no-owner --dbname=\"\$SUPABASE_DB_URL\" $out"
