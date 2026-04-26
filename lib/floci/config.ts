import type { ApiConfig } from '@/lib/floci/types';

const DEFAULT_SQS_POLL_MS = 5000;

export function createApiConfig(): ApiConfig {
  const pollValue = Number(process.env.NEXT_PUBLIC_FLOCI_SQS_POLL_MS || DEFAULT_SQS_POLL_MS);

  return {
    baseUrl: '/floci',
    sqsAccountId: process.env.NEXT_PUBLIC_FLOCI_SQS_ACCOUNT_ID || '000000000000',
    sqsVersion: '2012-11-05',
    sqsPollMs: Number.isFinite(pollValue) && pollValue > 0 ? pollValue : DEFAULT_SQS_POLL_MS,
  };
}
