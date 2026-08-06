export class SerialRateLimiter {
  private lastCallAt = 0;
  private tail: Promise<void> = Promise.resolve();
  private readonly minIntervalMs: number;

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const prev = this.tail;
    this.tail = gate;
    await prev;
    try {
      const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastCallAt = Date.now();
      return await fn();
    } finally {
      release();
    }
  }
}