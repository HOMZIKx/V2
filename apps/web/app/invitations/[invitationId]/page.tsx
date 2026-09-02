import { incomingInvitationFixture } from '../../../src/team-membership';
import { InvitationResponse } from './invitation-response';

export default function InvitationPage() {
  return <InvitationResponse initialInvitation={incomingInvitationFixture} />;
}
