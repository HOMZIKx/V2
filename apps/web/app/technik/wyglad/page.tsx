'use client';

import { TechnikWygladPage } from '../../../src/technik/wyglad-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="wyglad">
      <TechnikWygladPage />
    </TechnikPageFrame>
  );
}
