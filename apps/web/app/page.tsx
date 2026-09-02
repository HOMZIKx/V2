import { MemberDashboard } from './member-dashboard';
import { memberDashboardFixture } from '../src/member-dashboard';

export default function HomePage() {
  return <MemberDashboard initialSnapshot={memberDashboardFixture} />;
}
