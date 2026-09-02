# Zeabur Web Preview

This runbook deploys only the validated DESTILED Web checkpoint. It is not the
production Discord, database or bot rollout.

## Deployment boundary

- Repository: `HOMZIKx/V2`
- Deployment branch: `preview/destiled-web`
- Suggested Zeabur project: `DESTILED Preview`
- Suggested service: `web-preview`
- Application: `@v2/web`
- Health check: `/health`

The preview branch must only move to a validated frontend checkpoint. Do not
point Zeabur at a feature branch that is still being edited.

## First deployment

1. In Zeabur create a project and select **Deploy your source code**.
2. Authorize the Zeabur GitHub App for `HOMZIKx/V2`.
3. Import the repository and select branch `preview/destiled-web`.
4. Keep the repository root as the build root. The Web application depends on
   the root pnpm workspace and shared packages outside `apps/web`.
5. Confirm that the detected application is the Next.js service in `apps/web`.
   If Zeabur asks for explicit commands, use:
   - Build: `pnpm --filter @v2/web build`
   - Start: `pnpm --filter @v2/web start`
6. Set the custom HTTP health-check path to `/health`.
7. Generate a temporary `*.zeabur.app` domain for the preview.

Zeabur injects `PORT`. The Web start command reads it and binds Next.js to
`0.0.0.0`. Do not hardcode a different production port in the dashboard.

## Watch paths

The safe initial setting is the default `*`. After the first successful deploy,
limit automatic Web rebuilds to changes in:

```text
/apps/web
/packages/typescript-config
/packages/eslint-config
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
```

Keep `*` if Zeabur's installed version does not accept multiple trigger paths.
An unnecessary preview rebuild is safer than silently missing a shared-package
change.

## Preview variables

Do not add production Discord, database, bot or AI secrets to this first
preview. `NODE_ENV` is set by the application runner and `PORT` is provided by
Zeabur.

Add real integration variables only in the later integration checkpoint, after
their names, ownership, rotation and preview/production separation are defined.

## Acceptance checks

- deployment is built from `preview/destiled-web`;
- `/health` returns HTTP `2xx` and `{ "status": "ok" }`;
- the public preview opens on desktop and mobile;
- create/edit character routes render;
- no production credentials are present;
- pushing an unrelated backend-only change does not need to rebuild the Web
  service after watch paths are narrowed.

## Rollback rule

If a new checkpoint fails its health check or visual review, keep the previous
preview deployment active and move the preview branch only after the regression
is fixed and revalidated.
