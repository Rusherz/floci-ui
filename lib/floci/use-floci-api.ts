'use client';

import { useMemo } from 'react';

import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';

export function useFlociApi() {
  return useMemo(() => createApiClient(createApiConfig()), []);
}
