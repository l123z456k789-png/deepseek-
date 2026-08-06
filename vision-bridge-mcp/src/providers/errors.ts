export type ProviderErrorKind = 'http' | 'timeout' | 'parse' | 'capability' | 'config';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ProviderErrorKind = 'http', status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
  }
}