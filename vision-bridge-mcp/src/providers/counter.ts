const counters = { mimo: 0, zhipu: 0 };

export function bumpProviderCall(id: 'mimo' | 'zhipu'): void {
  counters[id] += 1;
}

export function getProviderCallCounters(): Readonly<{ mimo: number; zhipu: number }> {
  return { ...counters };
}

export function resetProviderCallCounters(): void {
  counters.mimo = 0;
  counters.zhipu = 0;
}