/**
 * Simple in-process circuit breaker.
 */

export interface CircuitBreakerOptions {
  readonly name: string;
  readonly threshold: number;
  readonly timeoutMs: number;
}

export type BreakerState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private readonly opts: CircuitBreakerOptions;
  private failures = 0;
  private lastFailureTime = 0;
  private state: BreakerState = "closed";

  constructor(opts: CircuitBreakerOptions) {
    if (opts.threshold <= 0) {
      throw new Error("CircuitBreaker: threshold must be > 0");
    }
    if (opts.timeoutMs <= 0) {
      throw new Error("CircuitBreaker: timeoutMs must be > 0");
    }
    this.opts = { ...opts };
  }

  getState(): BreakerState {
    return this.state;
  }

  private recordFailure(): void {
    this.failures += 1;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.opts.threshold) {
      this.state = "open";
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = "closed";
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === "open" && now - this.lastFailureTime >= this.opts.timeoutMs) {
      this.state = "half_open";
    }

    if (this.state === "open") {
      throw new Error("circuit breaker open: " + this.opts.name);
    }

    if (this.state === "half_open") {
      try {
        const result = await fn();
        this.reset();
        return result;
      } catch (err) {
        this.failures = this.opts.threshold;
        this.lastFailureTime = Date.now();
        this.state = "open";
        throw err;
      }
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }
}

