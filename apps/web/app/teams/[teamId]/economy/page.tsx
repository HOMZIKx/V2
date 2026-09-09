import { EconomySubnav } from './economy-subnav';
import { TeamEconomy } from './team-economy';
import { TeamEconomyAiDisclosure } from './team-economy-ai-disclosure';

export default function TeamEconomyPage() {
  return (
    <>
      <TeamEconomy />
      <TeamEconomyAiDisclosure />
      <EconomySubnav />
    </>
  );
}
