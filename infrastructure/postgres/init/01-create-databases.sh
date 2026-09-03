#!/bin/bash
set -euo pipefail

# Local development only. Official postgres image runs scripts in
# /docker-entrypoint-initdb.d on first volume initialization.
# NOTE: "authorization" must be quoted — it is a SQL keyword.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'EOSQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity') THEN
    CREATE ROLE identity LOGIN PASSWORD 'identity_dev_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authorization') THEN
    CREATE ROLE "authorization" LOGIN PASSWORD 'authorization_dev_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'player_team') THEN
    CREATE ROLE player_team LOGIN PASSWORD 'player_team_dev_password';
  END IF;
END
$$;
EOSQL

if [[ "$(psql --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname='identity'")" != "1" ]]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c 'CREATE DATABASE identity OWNER identity'
fi

if [[ "$(psql --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname='authorization'")" != "1" ]]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c 'CREATE DATABASE "authorization" OWNER "authorization"'
fi

if [[ "$(psql --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname='player_team'")" != "1" ]]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c 'CREATE DATABASE player_team OWNER player_team'
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'EOSQL'
REVOKE ALL PRIVILEGES ON DATABASE identity FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE "authorization" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE player_team FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE identity FROM "authorization";
REVOKE ALL PRIVILEGES ON DATABASE "authorization" FROM identity;
REVOKE ALL PRIVILEGES ON DATABASE player_team FROM identity;
REVOKE ALL PRIVILEGES ON DATABASE player_team FROM "authorization";
REVOKE ALL PRIVILEGES ON DATABASE identity FROM player_team;
REVOKE ALL PRIVILEGES ON DATABASE "authorization" FROM player_team;
EOSQL
