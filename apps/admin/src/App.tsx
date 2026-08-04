import { StatusBadge } from '@v2/design-system';
import { Route, Routes } from 'react-router-dom';

export function AdminStatusPage() {
  return (
    <main>
      <h1>V2 Admin is running</h1>
      <StatusBadge label="Technical bootstrap" tone="ok" />
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminStatusPage />} />
    </Routes>
  );
}
