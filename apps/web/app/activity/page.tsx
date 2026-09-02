import { activityCenterFixture } from '../../src/activity-center';

import { ActivityCenter } from './activity-center';

export default function ActivityPage() {
  return <ActivityCenter initialSnapshot={activityCenterFixture} />;
}
