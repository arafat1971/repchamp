/**
 * HTTPS-only outbound URLs — refuse cleartext so a misconfigured host cannot
 * silently downgrade analytics / push / billing traffic.
 */

export function assertHttps(url: string): string {
  if (!url.startsWith('https://')) {
    throw new Error(`Refusing non-HTTPS URL: ${url.slice(0, 32)}`);
  }
  return url;
}

export function isHttpsUrl(url: string): boolean {
  return url.startsWith('https://');
}
