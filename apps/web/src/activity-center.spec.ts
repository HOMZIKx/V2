import { describe, expect, it } from 'vitest';

import {
  activityCenterFixture,
  filterActivities,
  getActivityCenterSummary,
  getConfirmedParticipantCount,
  getViewerRsvp,
  updateViewerRsvp,
} from './activity-center.js';

describe('activity center view model', () => {
  it('summarizes activities and notifications without using a single opaque score', () => {
    expect(getActivityCenterSummary(activityCenterFixture)).toEqual({
      upcomingCount: 3,
      joinedCount: 2,
      organizedCount: 1,
      unreadNotificationCount: 1,
    });
  });

  it('keeps RSVP behavior explicit and updates only the viewer response', () => {
    const activity = activityCenterFixture.activities[2]!;
    const updated = updateViewerRsvp(activity, 'tentative', activityCenterFixture.viewerName);

    expect(getViewerRsvp(updated)).toBe('tentative');
    expect(updated.participants).toHaveLength(2);
    expect(getConfirmedParticipantCount(updated)).toBe(1);
  });

  it('separates saved and organized activity views', () => {
    expect(filterActivities(activityCenterFixture.activities, 'joined')).toHaveLength(2);
    expect(filterActivities(activityCenterFixture.activities, 'organized')).toHaveLength(1);
  });
});
