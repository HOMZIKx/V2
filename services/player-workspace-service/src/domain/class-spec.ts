import { DEFAULT_CLASS_SPEC_CATALOG } from '@v2/hub-core';

import { PlayerWorkspaceError } from './errors.js';

export function assertValidClassSpecKey(classSpecKey: string): void {
  const found = DEFAULT_CLASS_SPEC_CATALOG.find(
    (entry) => entry.key === classSpecKey && entry.enabled,
  );
  if (found === undefined) {
    throw new PlayerWorkspaceError(
      'VALIDATION_FAILED',
      `Unknown or disabled class/spec: ${classSpecKey}`,
    );
  }
}

export function resolveClassSpecLabel(classSpecKey: string): string {
  return (
    DEFAULT_CLASS_SPEC_CATALOG.find((entry) => entry.key === classSpecKey)?.label ?? classSpecKey
  );
}
