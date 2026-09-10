# Security

## Reporting

Please report vulnerabilities privately to the repository owner rather than opening a public issue containing exploit details or credentials.

## Data-access model

- The deterministic research engine only makes outbound HTTP(S) requests.
- Localhost, link-local, private literal IP ranges, credential-bearing URLs, and unsafe redirect targets are blocked by the shared HTTP client.
- A configured Supabase backend hostname may be explicitly trusted so local Supabase development remains possible without opening other private hosts.
- Source-specific automation/license restrictions are evaluated separately from technical reachability.
- Non-GIS pages are checked against `robots.txt` before document retrieval.
- The Supabase service-role key is server-only and must never be exposed to browser code.
- Security-definer PostgreSQL functions are revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.
- API request sizes and user-controlled search/address lengths are bounded.
- The Cloudflare and local HTTP surfaces set restrictive browser security headers.

## Remaining production controls

Before a public multi-user launch, configure Cloudflare rate limiting/WAF rules, production logging/alerting, Supabase backups, and authentication/authorization appropriate to the deployment. Do not put service-role credentials in Cloudflare static assets or frontend environment variables.
