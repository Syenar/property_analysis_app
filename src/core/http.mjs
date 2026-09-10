import { assertSafeRemoteUrl } from './url-safety.mjs';

export class HttpError extends Error {
  constructor(message, { status = 0, url = '', body = '' } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export class HttpClient {
  constructor({ fetchFn = globalThis.fetch, timeoutMs = 20000, retries = 2, userAgent = 'PropertyZoningResearchEngine/0.2 (+source-first research)', maxRedirects = 5, urlValidator = null, trustedHosts = [] } = {}) {
    if (!fetchFn) throw new Error('A fetch implementation is required');
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.userAgent = userAgent;
    this.maxRedirects = maxRedirects;
    this.urlValidator = urlValidator || ((url) => assertSafeRemoteUrl(url, { trustedHosts }));
  }

  async fetchFollowingSafeRedirects(url, options, controller) {
    let current = this.urlValidator(url).toString();
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const headers = new Headers(options.headers || {});
      if (!headers.has('User-Agent')) headers.set('User-Agent', this.userAgent);
      if (!headers.has('Accept')) headers.set('Accept', '*/*');
      const response = await this.fetchFn(current, { ...options, headers, signal: options.signal || controller.signal, redirect: 'manual' });
      if (!REDIRECT_CODES.has(response.status)) return { response, finalUrl: current };
      if (hop === this.maxRedirects) throw new HttpError(`Too many redirects for ${url}`, { status: response.status, url: current });
      const location = response.headers.get('location');
      if (!location) throw new HttpError(`Redirect without Location for ${current}`, { status: response.status, url: current });
      current = this.urlValidator(new URL(location, current)).toString();
    }
    throw new HttpError(`Too many redirects for ${url}`, { url:String(url) });
  }

  async request(url, options = {}) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const { response, finalUrl } = await this.fetchFollowingSafeRedirects(url, options, controller);
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          const err = new HttpError(`HTTP ${response.status} for ${finalUrl}`, { status: response.status, url: finalUrl, body: body.slice(0, 2000) });
          if (response.status < 500 && response.status !== 429) throw err;
          lastError = err;
        } else {
          return response;
        }
      } catch (err) {
        lastError = err;
        if (err instanceof HttpError && err.status > 0 && err.status < 500 && err.status !== 429) throw err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < this.retries) await sleep(250 * 2 ** attempt);
    }
    throw lastError;
  }

  async getJson(url, options = {}) {
    const response = await this.request(url, options);
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw new HttpError(`Invalid JSON from ${url}`, { status: response.status, url:String(url), body: text.slice(0, 2000) }); }
  }

  async getText(url, options = {}) {
    const response = await this.request(url, options);
    return { text: await response.text(), response };
  }

  async getBytes(url, options = {}) {
    const response = await this.request(url, options);
    return { bytes: new Uint8Array(await response.arrayBuffer()), response };
  }
}
