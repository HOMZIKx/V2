import type { ReactNode } from 'react';

import { TechnikRouteAccessGuard } from '../../src/technik/technik-route-access-guard';

export default function TechnikLayout({ children }: { readonly children: ReactNode }) {
  return <TechnikRouteAccessGuard>{children}</TechnikRouteAccessGuard>;
}
