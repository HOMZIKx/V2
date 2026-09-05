/** Injected clock — domain and use-cases must never call Date.now() / new Date(). */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  public constructor(private readonly instant: Date) {}

  public now(): Date {
    return new Date(this.instant.getTime());
  }

  public advance(ms: number): FixedClock {
    return new FixedClock(new Date(this.instant.getTime() + ms));
  }
}
