import { HubPreview } from '../components/HubPreview.js';
import { PageHeader } from '../components/ui.js';
import { ChannelsPage } from './ChannelsPage.js';
import { HubModulesPage } from './HubModulesPage.js';

export function CentrumV2Page() {
  return (
    <section className="stack centrum-page">
      <PageHeader
        title="Centrum V2"
        description="Kanał panelu, publikacja i widoczne akcje bota na Discordzie."
      />
      <div className="centrum-layout">
        <div className="centrum-config">
          <ChannelsPage embedded />
          <HubModulesPage embedded />
        </div>
        <aside className="centrum-aside">
          <HubPreview />
        </aside>
      </div>
    </section>
  );
}
