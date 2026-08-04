import { StatusBadge } from '@v2/design-system';

export function AdminStatusPage() {
  return (
    <main>
      <h1>V2 Admin is running</h1>
      <StatusBadge label="Technical bootstrap" tone="ok" />
    </main>
  );
}

export function App() {
  return <AdminStatusPage />;
}
