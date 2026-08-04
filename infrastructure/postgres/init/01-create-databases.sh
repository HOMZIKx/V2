#!/bin/bash
set -euo pipefail

# Local development only. Official postgres image runs scripts in
# /docker-entrypoint-initdb.d on first volume initialization.

create_role_and_database() {
  local role_name="$1"
  local role_password="$2"
  local database_name="$3"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role_name}') THEN
        CREATE ROLE ${role_name} LOGIN PASSWORD '${role_password}';
      END IF;
    END
    \$\$;
EOSQL

  local exists
  exists="$(psql --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${database_name}'")"
  if [[ "${exists}" != "1" ]]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
      -c "CREATE DATABASE ${database_name} OWNER ${role_name}"
  fi

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    REVOKE ALL PRIVILEGES ON DATABASE ${database_name} FROM PUBLIC;
EOSQL
}

create_role_and_database identity identity_dev_password identity
create_role_and_database authorization authorization_dev_password authorization

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  REVOKE ALL PRIVILEGES ON DATABASE identity FROM authorization;
  REVOKE ALL PRIVILEGES ON DATABASE authorization FROM identity;
EOSQL
