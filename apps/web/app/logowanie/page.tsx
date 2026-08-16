import { Suspense } from 'react';

import { LoginPage } from '../../src/components/LoginPage';
import { LoadingState } from '../../src/components/StateViews';

export default function LogowanieRoute() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <LoadingState label="Ładowanie…" />
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
