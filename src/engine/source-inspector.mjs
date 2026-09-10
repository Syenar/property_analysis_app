import { sourceLifecycle } from '../confidence/scoring.mjs';
import { mergeLimitations } from './research-helpers.mjs';

export function createSourceInspector(engine, warnings) {
  const inspected = new Map();

  const adapterFor = (candidate) => {
    if (!candidate?.url) return null;
    if ((candidate.platform === 'static-geojson' || candidate.platform === 'static-shapefile') && engine.staticGis?.supports(candidate.url)) return engine.staticGis;
    if (candidate.platform === 'wfs' && engine.wfs?.supports(candidate.url)) return engine.wfs;
    if (engine.arcgis?.supports(candidate.url)) return engine.arcgis;
    if (engine.wfs?.supports(candidate.url)) return engine.wfs;
    if (engine.staticGis?.supports(candidate.url)) return engine.staticGis;
    if (engine.genericRest?.supports(candidate.url)) return engine.genericRest;
    return null;
  };

  return async function inspect(candidate) {
    const adapter = adapterFor(candidate);
    if (!adapter) return null;
    if (['superseded','historical'].includes(candidate.lifecycle?.status)) {
      warnings.push(`GIS source skipped (${candidate.lifecycle.status}): ${candidate.url}`);
      return null;
    }
    const policy = engine.sourcePolicy?.decision(candidate.url, {
      official:candidate.official,
      kind:'gis',
      title:candidate.title,
      description:candidate.description,
      licenseInfo:candidate.licenseInfo,
      copyrightText:candidate.copyrightText,
      terms:candidate.terms
    });
    if (policy && policy.action !== 'fetch') {
      warnings.push(`GIS source skipped (${policy.reason}): ${candidate.url}`);
      return null;
    }
    if (!inspected.has(candidate.url)) {
      const inspection = await adapter.inspectService(candidate.url);
      const servicePolicy = engine.sourcePolicy?.decision(candidate.url, {
        official:candidate.official,
        kind:'gis',
        title:candidate.title,
        description:inspection?.service?.description || candidate.description,
        licenseInfo:inspection?.service?.licenseInfo,
        copyrightText:inspection?.service?.copyrightText,
        terms:inspection?.service?.termsOfUse
      });
      const lifecycle = sourceLifecycle({
        title:candidate.title,
        description:`${candidate.description || ''} ${inspection?.service?.description || ''} ${inspection?.service?.documentInfo?.Title || ''} ${inspection?.service?.documentInfo?.Comments || ''}`
      });
      if (['superseded','historical'].includes(lifecycle.status)) {
        warnings.push(`GIS service metadata indicates ${lifecycle.status} data; source skipped: ${candidate.url}`);
        inspected.set(candidate.url, null);
      } else if (servicePolicy && servicePolicy.action !== 'fetch') {
        warnings.push(`GIS service metadata requires review (${servicePolicy.reason}): ${candidate.url}`);
        inspected.set(candidate.url, null);
      } else {
        inspected.set(candidate.url, {
          ...inspection,
          sourcePolicy:servicePolicy || policy || null,
          sourceLimitations:mergeLimitations(policy?.limitations, servicePolicy?.limitations)
        });
      }
    }
    const value = inspected.get(candidate.url);
    return value ? { ...value, adapter } : null;
  };
}
