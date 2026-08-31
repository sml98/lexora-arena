#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL é obrigatória." >&2
  exit 1
fi
if [ -z "${BACKUP_DIR:-}" ]; then
  echo "Defina BACKUP_DIR com um diretório explícito e protegido." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/lexora-$stamp.dump"
pg_dump --format=custom --no-owner --no-acl --file="$target" "$DATABASE_URL"
sha256sum "$target" > "$target.sha256"
echo "Backup criado em $target. Teste a restauração periodicamente com pg_restore --list."
