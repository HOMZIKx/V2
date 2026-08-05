import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { ProofUiController } from './proof-ui.controller.js';

const baseConfig = {
  IDENTITY_AUTH_BASE_PATH: '/api/auth',
} as IdentityEnv;

describe('ProofUiController', () => {
  it('404s when the proof UI is disabled', () => {
    const controller = new ProofUiController({
      ...baseConfig,
      IDENTITY_PROOF_UI_ENABLED: false,
      NODE_ENV: 'development',
    });
    expect(() => controller.proof()).toThrow(NotFoundException);
  });

  it('404s in production even when enabled', () => {
    const controller = new ProofUiController({
      ...baseConfig,
      IDENTITY_PROOF_UI_ENABLED: true,
      NODE_ENV: 'production',
    });
    expect(() => controller.proof()).toThrow(NotFoundException);
  });

  it('renders HTML with the auth base path when enabled in dev', () => {
    const controller = new ProofUiController({
      ...baseConfig,
      IDENTITY_PROOF_UI_ENABLED: true,
      NODE_ENV: 'development',
    });
    const html = controller.proof();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('/api/auth');
    expect(html).toContain('data-social="discord"');
    expect(html).not.toContain('client_secret');
  });
});
