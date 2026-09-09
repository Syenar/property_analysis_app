function pathFor(url) {
  const u = new URL(url);
  return `${u.pathname}${u.search}` || '/';
}

function parseRobots(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  const flush = () => {
    if (agents.length || rules.length) groups.push({ agents, rules });
    agents = []; rules = [];
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line || !line.includes(':')) continue;
    const [nameRaw, ...rest] = line.split(':');
    const name = nameRaw.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (name === 'user-agent') {
      if (rules.length) flush();
      agents.push(value.toLowerCase());
    } else if ((name === 'allow' || name === 'disallow') && agents.length) {
      rules.push({ type: name, path: value });
    }
  }
  flush();
  return groups;
}

function matchesRule(requestPath, rulePath) {
  if (!rulePath) return false;
  const escaped = rulePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
  try { return new RegExp(`^${escaped}`).test(requestPath); } catch { return requestPath.startsWith(rulePath); }
}

export class RobotsPolicy {
  constructor({ http, userAgent = 'PropertyZoningResearchEngine', cacheTtlMs = 6 * 60 * 60 * 1000 } = {}) {
    this.http = http;
    this.userAgent = userAgent.toLowerCase();
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
  }

  async rulesFor(url) {
    const origin = new URL(url).origin;
    const cached = this.cache.get(origin);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) return cached.value;
    let value = { available: false, groups: [], url: `${origin}/robots.txt` };
    try {
      const { text, response } = await this.http.getText(`${origin}/robots.txt`, { headers: { Accept: 'text/plain,*/*;q=.1' } });
      value = { available: true, groups: parseRobots(text), url: response.url || `${origin}/robots.txt` };
    } catch {}
    this.cache.set(origin, { at: Date.now(), value });
    return value;
  }

  async decision(url) {
    const path = pathFor(url);
    const { available, groups, url: robotsUrl } = await this.rulesFor(url);
    if (!available) return { allowed: true, reason: 'robots-unavailable', robotsUrl };
    const candidates = groups.filter((g) => g.agents.some((a) => a === '*' || this.userAgent.includes(a)));
    const rules = candidates.flatMap((g) => g.rules).filter((r) => matchesRule(path, r.path));
    if (!rules.length) return { allowed: true, reason: 'robots-no-matching-rule', robotsUrl };
    rules.sort((a, b) => b.path.length - a.path.length);
    return { allowed: rules[0].type !== 'disallow', reason: `robots-${rules[0].type}`, rule: rules[0].path, robotsUrl };
  }
}

export { parseRobots };
