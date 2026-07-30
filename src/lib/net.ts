/**
 * URL validation and SSRF hardening.
 *
 * An MCP server fetches URLs chosen by a model, which means it is effectively a
 * confused deputy sitting inside the user's network. Every hop of every request
 * is therefore validated against a deny-list of non-public address ranges.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { WebFetcherError } from './errors.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Parses and normalises a URL, rejecting anything that is not http(s). */
export function parseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new WebFetcherError('INVALID_URL', `Not a valid absolute URL: ${input}`, { url: input });
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new WebFetcherError(
      'BLOCKED_SCHEME',
      `Unsupported URL scheme "${url.protocol}". Only http and https are allowed.`,
      { url: input },
    );
  }

  // Credentials in URLs are a common exfiltration vector and never needed here.
  url.username = '';
  url.password = '';
  url.hash = '';
  return url;
}

/** True for loopback, private, link-local, CGNAT and other non-public IPv4/IPv6 space. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return false;
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // Malformed input is treated as unsafe.
  }
  const [a = 0, b = 0] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalised =
    address
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .split('%')[0] ?? '';
  if (normalised === '::' || normalised === '::1') return true; // unspecified / loopback
  if (normalised.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(normalised)) return true; // unique local
  if (normalised.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible addresses.
  const mapped = normalised.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}

/** Hostnames that must never be resolved, regardless of DNS answers. */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost']);

/**
 * Resolves `hostname` and throws when it points at non-public address space.
 *
 * Called for the initial URL and again for every redirect target, which closes
 * the "public host redirects to 169.254.169.254" hole.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new WebFetcherError('BLOCKED_HOST', `Refusing to fetch internal host "${hostname}".`, {
      hostname,
    });
  }

  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) {
      throw new WebFetcherError(
        'BLOCKED_HOST',
        `Refusing to fetch non-public address "${hostname}".`,
        { hostname },
      );
    }
    return;
  }

  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch (cause) {
    throw new WebFetcherError(
      'DNS_FAILURE',
      `Could not resolve host "${hostname}".`,
      { hostname },
      { cause },
    );
  }

  if (records.length === 0) {
    throw new WebFetcherError('DNS_FAILURE', `Host "${hostname}" resolved to no addresses.`, {
      hostname,
    });
  }

  const offending = records.find((record) => isPrivateAddress(record.address));
  if (offending) {
    throw new WebFetcherError(
      'BLOCKED_HOST',
      `Host "${hostname}" resolves to non-public address ${offending.address}.`,
      { hostname, address: offending.address },
    );
  }
}

/** Resolves a possibly-relative href against a base URL. Returns null when unusable. */
export function resolveUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  if (/^(javascript|data|about|vbscript):/i.test(trimmed)) return null;
  try {
    const resolved = new URL(trimmed, base);
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

/** Registrable-ish host comparison used to split internal from external links. */
export function isSameSite(a: URL, b: URL): boolean {
  const hostA = a.hostname.toLowerCase().replace(/^www\./, '');
  const hostB = b.hostname.toLowerCase().replace(/^www\./, '');
  return hostA === hostB;
}
