export const FLOCI_ENDPOINT_COOKIE = 'floci_endpoint';
export const FLOCI_ENDPOINT_FALLBACK = 'http://floci:4566';

export function isValidEndpointUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
