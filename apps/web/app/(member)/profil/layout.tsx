import type { ReactNode } from 'react';

import { ProfileLayout } from '../../../src/components/profile/ProfileLayout';

export default function ProfilLayoutRoute({ children }: { children: ReactNode }) {
  return <ProfileLayout>{children}</ProfileLayout>;
}
