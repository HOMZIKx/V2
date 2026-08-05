const SECRET_PATTERNS = [
  /Bot\s+[A-Za-z0-9._-]{20,}/g,
  /mfa\.[A-Za-z0-9_-]{20,}/g,
  /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g,
];

export function redactSecrets(value: string, secrets: string[] = []): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

export function safeErrorMessage(error: unknown, secrets: string[] = []): string {
  if (error instanceof Error) {
    return redactSecrets(error.message, secrets);
  }
  return redactSecrets(String(error), secrets);
}
