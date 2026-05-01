import type { AppState, View } from '@/lib/floci/types';

export function joinUrl(base: string, path = ''): string {
  const cleanBase = base.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${path ? cleanPath : ''}`;
}

export function encodeS3KeyForPath(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function parseXml(xmlText: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Failed to parse XML response');
  }
  return doc;
}

export function textContent(element: ParentNode, selector: string): string {
  const node = element.querySelector(selector);
  return node ? node.textContent || '' : '';
}

export function toIsoFromEpochMs(value: string): string {
  const ms = Number(value);
  if (Number.isNaN(ms) || !ms) return '';
  return new Date(ms).toISOString();
}

export function parseMaybeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function locationKey(bucketName: string, prefix: string): string {
  return `${bucketName}|${prefix}`;
}

export function parentPrefix(prefix: string): string {
  if (!prefix) return '';
  const parts = prefix.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return `${parts.slice(0, -1).join('/')}/`;
}

export function applyLoadedUiState(state: AppState, saved: Record<string, unknown> | null): void {
  if (!saved || typeof saved !== 'object') return;

  if (saved.view === 'sqs' || saved.view === 's3') {
    state.view = saved.view as View;
  }

  if (typeof saved.search === 'string') state.search = saved.search;
  if (Number.isInteger(saved.selectedQueue) && Number(saved.selectedQueue) >= 0) state.selectedQueue = Number(saved.selectedQueue);
  if (Number.isInteger(saved.selectedMessage) && Number(saved.selectedMessage) >= 0) state.selectedMessage = Number(saved.selectedMessage);
  if (Number.isInteger(saved.selectedBucket) && Number(saved.selectedBucket) >= 0) state.selectedBucket = Number(saved.selectedBucket);

  if (saved.s3PrefixByBucket && typeof saved.s3PrefixByBucket === 'object') {
    state.s3.prefixByBucket = saved.s3PrefixByBucket as Record<string, string>;
  }

  if (saved.s3SelectedObject && typeof saved.s3SelectedObject === 'object') {
    state.s3.selectedObject = saved.s3SelectedObject as AppState['s3']['selectedObject'];
  }

  if (typeof saved.pollingEnabled === 'boolean') {
    state.polling.enabled = saved.pollingEnabled;
  }
}

export function loadUiState(storageKey: string): Record<string, unknown> | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function persistUiState(state: AppState, storageKey: string): void {
  try {
    const payload = {
      view: state.view,
      search: state.search,
      selectedQueue: state.selectedQueue,
      selectedMessage: state.selectedMessage,
      selectedBucket: state.selectedBucket,
      s3PrefixByBucket: state.s3.prefixByBucket,
      s3SelectedObject: state.s3.selectedObject,
      pollingEnabled: state.polling.enabled,
    };

    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // noop
  }
}
