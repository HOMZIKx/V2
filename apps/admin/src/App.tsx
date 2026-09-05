import { Route, Routes } from 'react-router';

import { AdminShell } from './admin-shell.js';
import { BotConfigPage } from './bot-config-page.js';
import { DiagnosticsPage } from './diagnostics-page.js';
import { AdminStatusPage } from './status-page.js';

export { AdminStatusPage } from './status-page.js';

export function App() {
  return (
    <AdminShell>
      <Routes>
        <Route path="/" element={<AdminStatusPage />} />
        <Route path="/bot" element={<BotConfigPage />} />
        <Route path="/diagnostics" element={<DiagnosticsPage />} />
      </Routes>
    </AdminShell>
  );
}
