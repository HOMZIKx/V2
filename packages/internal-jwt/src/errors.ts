export class InternalJwtVerificationError extends Error {
  public readonly code: string;

  public constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'InternalJwtVerificationError';
    this.code = code;
  }
}
