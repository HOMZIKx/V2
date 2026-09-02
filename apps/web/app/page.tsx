import { memberDashboardFixture } from '../src/member-dashboard';
import { MemberDashboard } from './member-dashboard';

export default function HomePage() {
  return <MemberDashboard initialSnapshot={memberDashboardFixture} />;
}
