const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^198\.18\./,
  /^198\.19\./
];

function isPrivateIpv4(hostname) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split('.').map(Number);
  if (octets.some((n) => n < 0 || n > 255)) return true;
  return PRIVATE_V4.some((re) => re.test(hostname));
}

function isPrivateIpv6(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes(':')) return false;
  return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/.test(host) || host.startsWith('::ffff:127.') || host.startsWith('::ffff:10.') || host.startsWith('::ffff:192.168.');
}

export function assertSafeRemoteUrl(input, { allowHttp = true, trustedHosts = [] } = {}) {
  let url;
  try { url = input instanceof URL ? new URL(input.toString()) : new URL(String(input)); }
  catch { throw new Error(`Invalid remote URL: ${input}`); }
  if (!['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol)) throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const trusted = new Set((trustedHosts || []).map((h) => String(h || '').toLowerCase().replace(/\.$/, '')).filter(Boolean));
  if (!host) throw new Error('Unsafe remote host blocked: (empty)');
  if (!trusted.has(host)) {
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal' || host === 'metadata' || host === '169.254.169.254') {
      throw new Error(`Unsafe remote host blocked: ${host}`);
    }
    if (isPrivateIpv4(host) || isPrivateIpv6(host)) throw new Error(`Private/link-local remote host blocked: ${host}`);
  }
  if (url.username || url.password) throw new Error('Remote URLs containing credentials are not allowed');
  return url;
}

export { isPrivateIpv4, isPrivateIpv6 };
