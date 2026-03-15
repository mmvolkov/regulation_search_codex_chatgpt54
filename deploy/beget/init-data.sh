#!/bin/bash
set -e

if [ -z "${POSTGRES_NON_ROOT_USER:-}" ] || [ -z "${POSTGRES_NON_ROOT_PASSWORD:-}" ] || [ -z "${POSTGRES_NON_ROOT_DB:-}" ]; then
  echo "Skipping additional postgres bootstrap: POSTGRES_NON_ROOT_* variables are not set."
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
DO
\$\$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = '${POSTGRES_NON_ROOT_USER}'
  ) THEN
    CREATE ROLE ${POSTGRES_NON_ROOT_USER} LOGIN PASSWORD '${POSTGRES_NON_ROOT_PASSWORD}';
  END IF;
END
\$\$;
EOSQL

if ! psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_NON_ROOT_DB}'" | grep -q 1; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE ${POSTGRES_NON_ROOT_DB} OWNER ${POSTGRES_NON_ROOT_USER};"
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_NON_ROOT_DB} TO ${POSTGRES_NON_ROOT_USER};"
