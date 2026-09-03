import { teamHistoryFixture } from '../../../../src/team-history';
import { TeamHistory } from './team-history';

export default function TeamHistoryPage() {
  return <TeamHistory initialSnapshot={teamHistoryFixture} />;
}
