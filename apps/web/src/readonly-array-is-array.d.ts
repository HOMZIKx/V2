export {};

declare global {
  interface ArrayConstructor {
    /** Preserve readonly element types when Array.isArray validates typed snapshot arrays. */
    isArray<T>(arg: readonly T[]): arg is readonly T[];
  }
}
