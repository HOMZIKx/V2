-- Local development only. The official postgres image runs this script on the
-- first initialization of the pgdata volume.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity') THEN
    CREATE ROLE identity LOGIN PASSWORD 'identity_dev_password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authorization') THEN
    CREATE ROLE authorization LOGIN PASSWORD 'authorization_dev_password';
  END IF;
END
$$;

SELECT format('CREATE DATABASE %I OWNER %I', 'identity', 'identity')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'identity')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', 'authorization', 'authorization')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'authorization')
\gexec

-- Do not let PUBLIC or either service role connect to the other service's
-- database. The owning role retains its database-owner privileges.
REVOKE ALL PRIVILEGES ON DATABASE identity FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE authorization FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE identity FROM authorization;
REVOKE ALL PRIVILEGES ON DATABASE authorization FROM identity;
