# PROJECT_STATE

## Status

`READY_FOR_REVIEW_P4_1_TO_P4_4_CLOSURE`

## Explicit gates

- **NO MERGE**
- **NO P4.5** (RabbitMQ / multi-Discord transport not in active scope;
  prior P4.5 commit on this branch was reverted for closure)
- **NO P4.6**
- **OWNER LIVE TESTS REQUIRED** (Discord P4.2, Admin P4.3, OAuth WWW P4.4)

## Active phase

P4.1–P4.4 combined closure remediation (`P4-CLOSURE-REMEDIATION-001`) on
PR #19. Code exists for domain, Discord Centrum, Admin, and WWW member UI;
this pass hardens security, completes P4-D6 panel recovery, aligns SoT docs,
and requires owner live gates before any merge decision.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19

## Delivered in this closure pass

- Security: actor-header fail-closed + DEV-ONLY trust flag; allowedMentions
  zero-parse; signed modal custom_ids; assertion jti replay store; mandatory
  projection shared secret; no sensitive upstream bodies in logs
- P4-D6: channel scan adopt by panel opaque id, duplicate cleanup, nonce
  reuse after crash, reconcile recover (not “re-publish” instruction)
- Discord create UX: single-form → preview → publish (Owner Amendment)
- Docs SoT realigned; P4.5 marker removed from active status

## Owner decisions still open

- P4-D8 / Issue #12 visual branding (does **not** block functional closure)
- Manual Discord live (P4.2)
- Manual Admin → Activity → Discord (P4.3)
- Manual WWW with `IDENTITY_AUTH_ENABLED=true` (P4.4)

## Explicitly not done

- Merge to `main`
- Zeabur
- P4.5 RabbitMQ / multi-guild transport as product delivery
- P4.6+
- WWW activity creator

## Last updated

2026-08-16 — P4-CLOSURE-REMEDIATION-001
