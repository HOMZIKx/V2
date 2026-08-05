import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { ProofUiController } from './proof-ui.controller.js';

const baseConfig = {
  IDENTITY_AUTH_BASE_PATH: '/api/auth',
  IDENTITY_AUTH_BASE_URL: 'http://127.0.0.1:4200',
  IDENTITY_AUTH_ENABLED: true,
} as IdentityEnv;

describe('ProofUiController', () => {
  it('404s when the proof UI is disabled', () => {
    const controller = new ProofUiController(
      {
        ...baseConfig,
        IDENTITY_PROOF_UI_ENABLED: false,
        NODE_ENV: 'development',
      },
      null,
    );
    expect(() => controller.proof()).toThrow(NotFoundException);
  });

  it('404s in production even when enabled', () => {
    const controller = new ProofUiController(
      {
        ...baseConfig,
        IDENTITY_PROOF_UI_ENABLED: true,
        NODE_ENV: 'production',
      },
      null,
    );
    expect(() => controller.proof()).toThrow(NotFoundException);
  });

  it('renders HTML with server-side OAuth start links when enabled in dev', () => {
    const controller = new ProofUiController(
      {
        ...baseConfig,
        IDENTITY_PROOF_UI_ENABLED: true,
        NODE_ENV: 'development',
      },
      null,
    );
    const html = controller.proof();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('/identity/proof/oauth/discord');
    expect(html).not.toContain('/identity/proof/oauth/google');
    expect(html).not.toContain('Google');
    expect(html).toContain('state_mismatch');
    expect(html).not.toContain('client_secret');
  });
});
