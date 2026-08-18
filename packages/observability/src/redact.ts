const SENSITIVE_KEY =
  /(?:secret|token|password|passwd|cookie|authorization|private.?key|connection.?string|database_url|redis_url|pem|assertion|jti)/i;

export function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function redactLogContext(
  context: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (context === undefined) {
    return undefined;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    redacted[key] = isSensitiveLogKey(key) ? '[redacted]' : value;
  }
  return redacted;
}
