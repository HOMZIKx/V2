import type { ReactNode } from 'react';

import { ProtectedApp } from '../../src/components/ProtectedApp';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <ProtectedApp>{children}</ProtectedApp>;
}
