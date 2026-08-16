-- Seed Accepted Activity permission catalog (P4 / CENTRUM_AKTYWNOSCI.md §6).
-- Idempotent inserts; does not invent aliases.

INSERT INTO permission_definition (permission_id, description)
VALUES
  ('permission.activity.event.read', 'Read activity events in guild scope'),
  ('permission.activity.event.create', 'Create one-off activity events'),
  ('permission.activity.event.join', 'Join / RSVP to activity events'),
  ('permission.activity.event.manage.self', 'Manage own activity events'),
  ('permission.activity.event.manage.guild', 'Moderate activity events in guild'),
  ('permission.activity.event.create.recurring', 'Create recurring activity series'),
  ('permission.activity.event.publish.multi_guild', 'Publish activity across multiple guilds'),
  ('permission.activity.event.create.private', 'Create private activity events'),
  ('permission.activity.panel.manage', 'Manage Discord activity hub/event panels'),
  ('permission.activity.config.manage', 'Manage guild activity configuration'),
  ('permission.activity.attendance.record', 'Record activity attendance'),
  ('permission.activity.stats.read.self', 'Read own activity stats'),
  ('permission.activity.stats.read.guild', 'Read guild activity stats'),
  ('permission.activity.report.manage', 'Manage activity reports')
ON CONFLICT (permission_id) DO NOTHING;
