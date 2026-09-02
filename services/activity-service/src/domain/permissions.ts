/**
 * Canonical activity permission IDs (P4-D7 / ADR-0014). Do not invent aliases.
 */
export const ACTIVITY_PERMISSIONS = {
  READ: 'permission.activity.event.read',
  CREATE: 'permission.activity.event.create',
  JOIN: 'permission.activity.event.join',
  MANAGE_SELF: 'permission.activity.event.manage.self',
  MANAGE_GUILD: 'permission.activity.event.manage.guild',
  CREATE_RECURRING: 'permission.activity.event.create.recurring',
  PUBLISH_MULTI_GUILD: 'permission.activity.event.publish.multi_guild',
  CREATE_PRIVATE: 'permission.activity.event.create.private',
  PANEL_MANAGE: 'permission.activity.panel.manage',
  CONFIG_MANAGE: 'permission.activity.config.manage',
  ATTENDANCE_RECORD: 'permission.activity.attendance.record',
  STATS_READ_SELF: 'permission.activity.stats.read.self',
  STATS_READ_GUILD: 'permission.activity.stats.read.guild',
  REPORT_MANAGE: 'permission.activity.report.manage',
} as const;

export type ActivityPermissionId = (typeof ACTIVITY_PERMISSIONS)[keyof typeof ACTIVITY_PERMISSIONS];

/** Permissions that unlock the extended create horizon beyond 14 days. */
export const EXTENDED_HORIZON_PERMISSIONS: readonly ActivityPermissionId[] = [
  ACTIVITY_PERMISSIONS.MANAGE_GUILD,
  ACTIVITY_PERMISSIONS.CREATE_RECURRING,
];
