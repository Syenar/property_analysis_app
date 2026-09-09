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

export class HttpClient {
  constructor({ fetchFn = globalThis.fetch, timeoutMs = 20000, retries = 2, userAgent = 'PropertyZoningResearchEngine/0.1 (+source-first research)' } = {}) {
    if (!fetchFn) throw new Error('A fetch implementation is required');
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.userAgent = userAgent;
  }

  async request(url, options = {}) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers = new Headers(options.headers || {});
        if (!headers.has('User-Agent')) headers.set('User-Agent', this.userAgent);
        if (!headers.has('Accept')) headers.set('Accept', '*/*');
        const response = await this.fetchFn(url, { ...options, headers, signal: options.signal || controller.signal, redirect: 'follow' });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          const err = new HttpError(`HTTP ${response.status} for ${url}`, { status: response.status, url, body: body.slice(0, 2000) });
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
    try { return JSON.parse(text); } catch { throw new HttpError(`Invalid JSON from ${url}`, { status: response.status, url, body: text.slice(0, 2000) }); }
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
