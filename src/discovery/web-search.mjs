export class NoopSearchProvider {
  async search() { return []; }
}

export class BraveSearchProvider {
  constructor({ http, apiKey }) {
    this.http = http;
    this.apiKey = apiKey;
  }

  async search(query, { count = 10 } = {}) {
    if (!this.apiKey) return [];
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(20, count)));
    const raw = await this.http.getJson(url.toString(), {
      headers: { 'X-Subscription-Token': this.apiKey, Accept: 'application/json' }
    });
    return (raw.web?.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description || '',
      source: 'brave-search'
    }));
  }
}
