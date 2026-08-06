import type { ProviderId } from '../providers/types.ts';
import type { ErrorDecision } from './error-policy.ts';

interface ProviderState {
  open: boolean;
  openUntil: number;
  disableUntilRestart: boolean;
  consecutiveFailures: number;
}

const initial = (): ProviderState => ({ open: false, openUntil: 0, disableUntilRestart: false, consecutiveFailures: 0 });

export class CircuitBreaker {
  private states: Record<ProviderId, ProviderState> = { mimo: initial(), zhipu: initial() };

  allow(id: ProviderId): boolean {
    const s = this.states[id];
    if (s.disableUntilRestart) return false;
    if (!s.open) return true;
    if (Date.now() >= s.openUntil) {
      s.open = false;
      s.consecutiveFailures = 0;
      return true;
    }
    return false;
  }

  recordFailure(id: ProviderId, decision: ErrorDecision): void {
    const s = this.states[id];
    s.consecutiveFailures += 1;
    if (decision.disableProvider) {
      s.disableUntilRestart = true;
      s.open = true;
      return;
    }
    if (decision.cooldownMs > 0) {
      s.open = true;
      s.openUntil = Date.now() + decision.cooldownMs;
    }
  }

  recordSuccess(id: ProviderId): void {
    const s = this.states[id];
    s.open = false;
    s.openUntil = 0;
    s.consecutiveFailures = 0;
  }

  status(id: ProviderId): { allowed: boolean; disableUntilRestart: boolean; consecutiveFailures: number } {
    const s = this.states[id];
    return { allowed: this.allow(id), disableUntilRestart: s.disableUntilRestart, consecutiveFailures: s.consecutiveFailures };
  }
}