import { HttpClient } from './core/http.mjs';
import { CensusGeocoder } from './geocoding/census.mjs';
import { ArcGISPortalDiscovery } from './discovery/arcgis-portal.mjs';
import { ArcGISDirectoryDiscovery } from './discovery/arcgis-directory.mjs';
import { ArcGISHubResolver } from './discovery/arcgis-hub.mjs';
import { NoopSearchProvider, BraveSearchProvider } from './discovery/web-search.mjs';
import { SourceDiscoveryEngine } from './discovery/source-discovery.mjs';
import { ArcGISAdapter } from './adapters/arcgis.mjs';
import { WFSAdapter } from './adapters/wfs.mjs';
import { GenericRestAdapter } from './adapters/generic-rest.mjs';
import { StaticGisAdapter } from './adapters/static-gis.mjs';
import { MemoryJurisdictionRegistry } from './registry/jurisdiction-registry.mjs';
import { SupabaseJurisdictionRegistry } from './registry/supabase-registry.mjs';
import { SourcePolicy } from './policy/source-policy.mjs';
import { RobotsPolicy } from './policy/robots.mjs';
import { OrdinanceDiscovery } from './ordinances/ordinance-discovery.mjs';
import { DocumentDownloader } from './documents/downloader.mjs';
import { SupabaseRestStore } from './storage/supabase-rest.mjs';
import { PropertyResearchEngine } from './engine/property-research-engine.mjs';

function parseGenericRestConfigs(env, overrides) {
  if (Array.isArray(overrides.genericRestConfigs)) return overrides.genericRestConfigs;
  const raw = env.GENERIC_REST_CONFIGS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(`GENERIC_REST_CONFIGS_JSON must be a JSON array: ${error.message}`);
  }
}

export function createEngine(env = process.env, overrides = {}) {
  const trustedHosts = [];
  if (env.SUPABASE_URL) { try { trustedHosts.push(new URL(env.SUPABASE_URL).hostname); } catch {} }
  const http = overrides.http || new HttpClient({ trustedHosts });
  const geocoder = overrides.geocoder || new CensusGeocoder({ http });
  const arcgisPortal = overrides.arcgisPortal || new ArcGISPortalDiscovery({ http });
  const webSearch = overrides.webSearch || (env.BRAVE_SEARCH_API_KEY ? new BraveSearchProvider({ http, apiKey: env.BRAVE_SEARCH_API_KEY }) : new NoopSearchProvider());
  const arcgisDirectory = overrides.arcgisDirectory || new ArcGISDirectoryDiscovery({ http });
  const arcgisHub = overrides.arcgisHub || new ArcGISHubResolver({ http });
  const discovery = overrides.discovery || new SourceDiscoveryEngine({ arcgis: arcgisPortal, webSearch, arcgisDirectory, arcgisHub });
  const arcgis = overrides.arcgis || new ArcGISAdapter({ http });
  const wfs = overrides.wfs || new WFSAdapter({ http });
  const genericRest = overrides.genericRest || new GenericRestAdapter({ http, configs: parseGenericRestConfigs(env, overrides) });
  const staticGis = overrides.staticGis || new StaticGisAdapter({ http, shapefileDecoder: overrides.shapefileDecoder });
  const policy = overrides.policy || new SourcePolicy();
  const store = overrides.store || new SupabaseRestStore({
    http, url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    persistEnabled: String(env.ENABLE_SUPABASE_PERSISTENCE || '0') === '1'
  });
  const memoryRegistry = new MemoryJurisdictionRegistry();
  const registry = overrides.registry || (store.enabled()
    ? new SupabaseJurisdictionRegistry({ store, fallback: memoryRegistry })
    : memoryRegistry);
  const ordinanceDiscovery = overrides.ordinanceDiscovery || new OrdinanceDiscovery({ sourceDiscovery: discovery, policy });
  const robots = overrides.robots || new RobotsPolicy({ http });
  const documentDownloader = overrides.documentDownloader || new DocumentDownloader({ http, policy, robots });
  return new PropertyResearchEngine({ geocoder, discovery, arcgis, wfs, genericRest, staticGis, registry, ordinanceDiscovery, documentDownloader, store, sourcePolicy: policy });
}

export * from './adapters/arcgis.mjs';
export * from './discovery/arcgis-directory.mjs';
export * from './discovery/arcgis-hub.mjs';
export * from './adapters/generic-rest.mjs';
export * from './adapters/wfs.mjs';
export * from './adapters/static-gis.mjs';
export * from './geometry/geojson.mjs';
export * from './confidence/scoring.mjs';
export * from './policy/source-policy.mjs';
export * from './policy/robots.mjs';
export * from './core/hash.mjs';
export * from './packets/research-packet.mjs';
export * from './registry/jurisdiction-registry.mjs';
export * from './registry/supabase-registry.mjs';
export * from './storage/supabase-rest.mjs';
export * from './core/api-input.mjs';
export * from './core/url-safety.mjs';
