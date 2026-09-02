import { teamMembershipFixture } from '../../../../src/team-membership';
import { TeamMembershipManagement } from './team-membership-management';

export default function TeamMembershipPage() {
  return <TeamMembershipManagement initialSnapshot={teamMembershipFixture} />;
}
