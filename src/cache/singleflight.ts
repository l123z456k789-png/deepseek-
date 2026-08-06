export class SingleFlight {
  private inflight = new Map<string, Promise<unknown>>();
  private deduped = 0;

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      this.deduped += 1;
      return existing as Promise<T>;
    }
    const p = fn().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, p);
    return p;
  }

  stats(): { inflight: number; deduped: number } {
    return { inflight: this.inflight.size, deduped: this.deduped };
  }

  reset(): void {
    this.inflight.clear();
    this.deduped = 0;
  }
}