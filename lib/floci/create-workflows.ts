export function getCreateErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : fallback;

  const rules: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /AlreadyExists|ResourceAlreadyExists|BucketAlreadyOwnedByYou|QueueAlreadyExists/i, message: 'Resource already exists.' },
    { pattern: /InvalidParameter|ValidationException|Invalid.*name|invalid/i, message: 'Invalid input. Check naming rules and required fields.' },
    { pattern: /AccessDenied|Unauthorized|not authorized/i, message: 'Access denied. Check IAM permissions for this action.' },
    { pattern: /Throttl/i, message: 'Request throttled. Retry in a moment.' },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(raw)) {
      return `${rule.message} (${raw})`;
    }
  }

  return raw || fallback;
}

export function isValidTopicName(name: string): boolean {
  return /^[A-Za-z0-9_-]{1,256}(\.fifo)?$/.test(name);
}

export function isValidCloudWatchLogGroupName(name: string): boolean {
  return /^[.\-_/#A-Za-z0-9]{1,512}$/.test(name);
}

export function isNonEmpty(value: string): boolean {
  return Boolean(value.trim());
}

export function logCreateAction(resource: string, stage: 'start' | 'success' | 'error', details: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV !== 'development') return;
  // Dev-only hook for troubleshooting create workflow behavior.
  console.debug(`[create:${resource}] ${stage}`, details);
}
