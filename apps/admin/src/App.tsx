import { Route, Routes } from 'react-router';

import { AdminShell } from './layout/AdminShell.js';
import { AuditPage } from './pages/AuditPage.js';
import { ChannelsPage } from './pages/ChannelsPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { EventDetailPage } from './pages/EventDetailPage.js';
import { EventsPage } from './pages/EventsPage.js';
import { FieldsPage } from './pages/FieldsPage.js';
import { HubPage } from './pages/HubPage.js';
import { LimitsPage } from './pages/LimitsPage.js';
import { NotificationsPage } from './pages/NotificationsPage.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { PingsPage } from './pages/PingsPage.js';
import { ProjectionsPage } from './pages/ProjectionsPage.js';
import { ReportReasonsPage } from './pages/ReportReasonsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { StatusesPage } from './pages/StatusesPage.js';
import { TypesPage } from './pages/TypesPage.js';

export function App() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/activity" element={<OverviewPage />} />
        <Route path="/activity/types" element={<TypesPage />} />
        <Route path="/activity/statuses" element={<StatusesPage />} />
        <Route path="/activity/fields" element={<FieldsPage />} />
        <Route path="/activity/channels" element={<ChannelsPage />} />
        <Route path="/activity/pings" element={<PingsPage />} />
        <Route path="/activity/limits" element={<LimitsPage />} />
        <Route path="/activity/notifications" element={<NotificationsPage />} />
        <Route path="/activity/report-reasons" element={<ReportReasonsPage />} />
        <Route path="/activity/events" element={<EventsPage />} />
        <Route path="/activity/events/:id" element={<EventDetailPage />} />
        <Route path="/activity/projections" element={<ProjectionsPage />} />
        <Route path="/activity/reports" element={<ReportsPage />} />
        <Route path="/activity/audit" element={<AuditPage />} />
        <Route path="/activity/hub" element={<HubPage />} />
      </Route>
    </Routes>
  );
}
