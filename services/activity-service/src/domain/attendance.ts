const ATTENDANCE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AttendanceMark = 'present' | 'absent';

export function assertAttendanceWindowOpen(input: {
  readonly activityFinishedAt: Date;
  readonly now: Date;
}): void {
  const deadline = input.activityFinishedAt.getTime() + ATTENDANCE_WINDOW_MS;
  if (input.now.getTime() > deadline) {
    throw Object.assign(new Error('Attendance marking window (24h) has closed'), {
      code: 'GONE',
    });
  }
  if (input.now.getTime() < input.activityFinishedAt.getTime()) {
    throw Object.assign(new Error('Attendance can be marked only after the activity finishes'), {
      code: 'PRECONDITION_FAILED',
    });
  }
}
