import { Navigate, Route, Routes } from 'react-router';

import { ActivitySettingsLayout } from './layout/ActivitySettingsLayout.js';
import { AdminShell } from './layout/AdminShell.js';
import { LEGACY_ACTIVITY_REDIRECTS } from './navigation.js';
import { AuditPage } from './pages/AuditPage.js';
import { CentrumV2Page } from './pages/CentrumV2Page.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { DiagnosticsPage } from './pages/DiagnosticsPage.js';
import { EventCreatePage } from './pages/EventCreatePage.js';
import { EventDetailPage } from './pages/EventDetailPage.js';
import { EventsPage } from './pages/EventsPage.js';
import { FieldsPage } from './pages/FieldsPage.js';
import { LfgCompositionPage } from './pages/LfgCompositionPage.js';
import { LimitsPage } from './pages/LimitsPage.js';
import { NotificationsPage } from './pages/NotificationsPage.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { PingsPage } from './pages/PingsPage.js';
import { ProjectionsPage } from './pages/ProjectionsPage.js';
import { ReportReasonsPage } from './pages/ReportReasonsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { StatusesPage } from './pages/StatusesPage.js';
import { TypesPage } from './pages/TypesPage.js';

function LegacyRedirect({ to }: { to: string }) {
  return <Navigate to={to} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route path="/" element={<DashboardPage />} />

        <Route path="/discord/centrum" element={<CentrumV2Page />} />
        <Route path="/discord/notifications" element={<NotificationsPage />} />

        <Route path="/activities/overview" element={<OverviewPage />} />
        <Route path="/activities/events" element={<EventsPage />} />
        <Route path="/activities/events/new" element={<EventCreatePage />} />
        <Route path="/activities/events/:id" element={<EventDetailPage />} />
        <Route path="/activities/types" element={<TypesPage />} />
        <Route path="/activities/lfg" element={<LfgCompositionPage />} />

        <Route path="/activities/settings" element={<ActivitySettingsLayout />}>
          <Route index element={<Navigate to="statuses" replace />} />
          <Route path="statuses" element={<StatusesPage />} />
          <Route path="fields" element={<FieldsPage />} />
          <Route path="pings" element={<PingsPage />} />
          <Route path="limits" element={<LimitsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="report-reasons" element={<ReportReasonsPage />} />
        </Route>

        <Route path="/system/projections" element={<ProjectionsPage />} />
        <Route path="/system/audit" element={<AuditPage />} />
        <Route path="/system/diagnostics" element={<DiagnosticsPage />} />

        {LEGACY_ACTIVITY_REDIRECTS.map((entry) => (
          <Route key={entry.from} path={entry.from} element={<LegacyRedirect to={entry.to} />} />
        ))}
        <Route path="/activity/events/:id" element={<EventDetailPage />} />
      </Route>
    </Routes>
  );
}
