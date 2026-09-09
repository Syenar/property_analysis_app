export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (!(bytes instanceof Uint8Array)) throw new TypeError('sha256Hex expects a string or Uint8Array');
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API is required for SHA-256 hashing');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
