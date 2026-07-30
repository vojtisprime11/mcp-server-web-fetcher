import { describe, expect, it } from 'vitest';
import { isPrivateAddress, isSameSite, parseUrl, resolveUrl } from '../src/lib/net.js';

describe('parseUrl', () => {
  it('normalises and strips credentials and fragments', () => {
    const url = parseUrl('  https://user:secret@example.com/path?q=1#section  ');

    expect(url.toString()).toBe('https://example.com/path?q=1');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
  });

  it('rejects relative URLs and non-http schemes', () => {
    expect(() => parseUrl('/relative')).toThrowError(/valid absolute URL/);
    expect(() => parseUrl('ftp://example.com')).toThrowError(/Unsupported URL scheme/);
    expect(() => parseUrl('file:///etc/passwd')).toThrowError(/Unsupported URL scheme/);
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '192.168.0.1',
    '172.16.5.4',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:10.0.0.1',
  ])('flags %s as non-public', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])(
    'treats %s as public',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );

  it('returns false for values that are not IP addresses', () => {
    expect(isPrivateAddress('example.com')).toBe(false);
  });
});

describe('resolveUrl', () => {
  it('resolves relative, root-relative and protocol-relative hrefs', () => {
    expect(resolveUrl('page.html', 'https://example.com/docs/index.html')).toBe(
      'https://example.com/docs/page.html',
    );
    expect(resolveUrl('/about', 'https://example.com/docs/')).toBe('https://example.com/about');
    expect(resolveUrl('//cdn.example.com/x.js', 'https://example.com/')).toBe(
      'https://cdn.example.com/x.js',
    );
  });

  it('drops fragments, empty values and dangerous schemes', () => {
    expect(resolveUrl('#top', 'https://example.com/')).toBeNull();
    expect(resolveUrl('   ', 'https://example.com/')).toBeNull();
    expect(resolveUrl('javascript:alert(1)', 'https://example.com/')).toBeNull();
    expect(resolveUrl('data:text/html,<script>', 'https://example.com/')).toBeNull();
  });

  it('strips the fragment from otherwise valid URLs', () => {
    expect(resolveUrl('/a#b', 'https://example.com/')).toBe('https://example.com/a');
  });
});

describe('isSameSite', () => {
  it('ignores a leading www', () => {
    expect(isSameSite(new URL('https://example.com/a'), new URL('https://www.example.com/b'))).toBe(
      true,
    );
    expect(isSameSite(new URL('https://example.com/a'), new URL('https://other.com/b'))).toBe(
      false,
    );
    expect(
      isSameSite(new URL('https://example.com/a'), new URL('https://blog.example.com/b')),
    ).toBe(false);
  });
});
