#!/bin/sh
# Least-privilege application role (production compose). Runs once on first DB initialisation.
# The app can read/write rows but cannot change the schema; migrations use the owner role.
set -eu
if [ -z "${APP_DB_PASSWORD:-}" ]; then echo "APP_DB_PASSWORD not set; skipping app role"; exit 0; fi
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'frealgo_app') THEN
    CREATE ROLE frealgo_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
  END IF;
END \$\$;
GRANT CONNECT ON DATABASE frealgo TO frealgo_app;
GRANT USAGE ON SCHEMA public TO frealgo_app;
-- Tables created later by migrations (as owner 'frealgo') get DML rights automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE frealgo IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO frealgo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE frealgo IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO frealgo_app;
SQL
