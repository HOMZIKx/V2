import { teamWorkspaceFixture } from '../../../src/team-workspace';
import { TeamWorkspace } from './team-workspace';

export default function TeamWorkspacePage() {
  return <TeamWorkspace initialSnapshot={teamWorkspaceFixture} />;
}
