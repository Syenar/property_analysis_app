const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const form = $('#research-form');
const addressInput = $('#address');
const workspace = $('#workspace');
const loadingCard = $('#loading-card');
const errorCard = $('#error-card');
const resultsEl = $('#results');
const loadingTitle = $('#loading-title');
const loadingDetail = $('#loading-detail');
const stageEls = $$('#research-stages li');
let currentResult = null;

const stageCopy = [
  ['geocode', 'Resolving address…', 'Matching the address and identifying its state, county, and municipality.'],
  ['sources', 'Discovering authoritative GIS…', 'Checking the jurisdiction registry, ArcGIS Portal, and configured public search sources.'],
  ['parcel', 'Querying parcel geometry…', 'Inspecting candidate GIS layers and spatially locating the parcel at the geocoded point.'],
  ['zoning', 'Intersecting zoning layers…', 'Testing the parcel geometry against the strongest public zoning candidates.'],
  ['ordinance', 'Locating governing code…', 'Finding official zoning ordinances, municipal code pages, and amendment candidates.'],
  ['packet', 'Assembling evidence packet…', 'Preserving source URLs, timestamps, confidence evidence, warnings, and raw attributes.']
];

function setStage(index, status = 'active', detail = null) {
  stageEls.forEach((el, i) => {
    el.classList.toggle('done', i < index || (i === index && status === 'done'));
    el.classList.toggle('active', i === index && status === 'active');
    el.classList.toggle('failed', i === index && status === 'failed');
  });
  const [, title, defaultDetail] = stageCopy[Math.min(index, stageCopy.length - 1)];
  loadingTitle.textContent = status === 'failed' ? title.replace('…', ' needs review') : title;
  loadingDetail.textContent = detail || defaultDetail;
}

function applyProgress(event) {
  const index = stageCopy.findIndex(([stage]) => stage === event.stage);
  if (index < 0) return;
  setStage(index, event.status || 'active', event.detail || null);
}

function resetStages() {
  stageEls.forEach((el) => el.classList.remove('done','active','failed'));
  setStage(0, 'active');
}

function finishStages() {
  stageEls.forEach((el) => {
    el.classList.remove('active');
    if (!el.classList.contains('failed')) el.classList.add('done');
  });
}

function safeText(v, fallback = 'Not found') {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function likelyFieldEntries(properties = {}, max = 12) {
  const priorities = [/parcel|apn|pin|folio|account|tax.?id/i, /address|situs|location/i, /acre|area|sqft|square/i, /owner/i, /land.?use|use.?code/i, /assess|value/i, /year.?built/i];
  const entries = Object.entries(properties).filter(([,v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object');
  return entries.sort(([a],[b]) => {
    const pa = priorities.findIndex((r) => r.test(a));
    const pb = priorities.findIndex((r) => r.test(b));
    const aa = pa < 0 ? 99 : pa; const bb = pb < 0 ? 99 : pb;
    return aa - bb;
  }).slice(0, max);
}

function zoningLabel(properties = {}) {
  const keys = Object.keys(properties);
  const preferred = keys.find((k) => /^(zone|zoning|zoneclass|district|zonedesc|zone_desc|base_zone)$/i.test(k))
    || keys.find((k) => /zone|district/i.test(k));
  return preferred ? safeText(properties[preferred]) : 'Intersecting zoning feature';
}

function parcelGeometryRings(geometry) {
  if (geometry?.type === 'Polygon') return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  if (geometry?.type === 'MultiPolygon') return Array.isArray(geometry.coordinates) ? geometry.coordinates.flat() : [];
  return [];
}

function closestPointOnSegment(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const denom = dx * dx + dy * dy;
  const t = denom ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / denom)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

function buildParcelView(geometry, geocodeCoordinates) {
  const rings = parcelGeometryRings(geometry)
    .map((ring) => (Array.isArray(ring) ? ring.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) : []))
    .filter((ring) => ring.length >= 3);
  if (!rings.length) return { path:'', point:null, nearest:null, vertexCount:0, partCount:0, ringCount:0, simplified:false };

  let minLon=Infinity, maxLon=-Infinity, minLat=Infinity, maxLat=-Infinity, vertexCount=0;
  for (const ring of rings) for (const [lon,lat] of ring) {
    vertexCount += 1;
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  const geocode = Number.isFinite(geocodeCoordinates?.longitude) && Number.isFinite(geocodeCoordinates?.latitude)
    ? [geocodeCoordinates.longitude, geocodeCoordinates.latitude] : null;
  if (geocode) {
    minLon=Math.min(minLon,geocode[0]); maxLon=Math.max(maxLon,geocode[0]);
    minLat=Math.min(minLat,geocode[1]); maxLat=Math.max(maxLat,geocode[1]);
  }

  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.max(Math.cos(midLat * Math.PI / 180), 0.01);
  const project = ([lon,lat]) => [lon * lonScale, lat];
  const projectedRings = rings.map((ring) => ring.map(project));
  const projectedPoint = geocode ? project(geocode) : null;

  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const ring of projectedRings) for (const [x,y] of ring) {
    if (x < minX) minX=x; if (x > maxX) maxX=x; if (y < minY) minY=y; if (y > maxY) maxY=y;
  }
  if (projectedPoint) {
    minX=Math.min(minX,projectedPoint[0]); maxX=Math.max(maxX,projectedPoint[0]);
    minY=Math.min(minY,projectedPoint[1]); maxY=Math.max(maxY,projectedPoint[1]);
  }

  const vw=760, vh=320, pad=34;
  const spanX=Math.max(maxX-minX,1e-10), spanY=Math.max(maxY-minY,1e-10);
  const scale=Math.min((vw-pad*2)/spanX,(vh-pad*2)/spanY);
  const usedW=spanX*scale, usedH=spanY*scale;
  const offsetX=(vw-usedW)/2, offsetY=(vh-usedH)/2;
  const toSvg=([x,y]) => [offsetX+(x-minX)*scale, vh-(offsetY+(y-minY)*scale)];

  const totalBudget=6000;
  const perRing=Math.max(80,Math.floor(totalBudget/Math.max(rings.length,1)));
  let simplified=false;
  const path=projectedRings.map((ring) => {
    const step=Math.max(1,Math.ceil(ring.length/perRing));
    if (step > 1) simplified=true;
    const sampled=[];
    for (let i=0;i<ring.length;i+=step) sampled.push(ring[i]);
    if (sampled[sampled.length-1] !== ring[ring.length-1]) sampled.push(ring[ring.length-1]);
    return sampled.map((p,i) => {
      const [x,y]=toSvg(p);
      return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ')+' Z';
  }).join(' ');

  let nearestProjected=null, nearestSq=Infinity;
  if (projectedPoint) {
    for (const ring of projectedRings) {
      for (let i=1;i<ring.length;i++) {
        const candidate=closestPointOnSegment(projectedPoint,ring[i-1],ring[i]);
        const dx=projectedPoint[0]-candidate[0], dy=projectedPoint[1]-candidate[1];
        const d=dx*dx+dy*dy;
        if (d < nearestSq) { nearestSq=d; nearestProjected=candidate; }
      }
    }
  }

  const partCount = geometry?.type === 'MultiPolygon' ? geometry.coordinates.length : 1;
  return {
    path,
    point:projectedPoint ? toSvg(projectedPoint) : null,
    nearest:nearestProjected ? toSvg(nearestProjected) : null,
    vertexCount,
    partCount,
    ringCount:rings.length,
    simplified
  };
}

function parcelMatchLabel(parcel) {
  switch (parcel?.resolutionMethod) {
    case 'exact-point': return 'Address point inside parcel';
    case 'exact-point-address-match': return 'Overlapping parcels resolved by address';
    case 'address-match': return 'Nearby parcel resolved by address';
    case 'nearest-geometry': return 'Nearest parcel geometry';
    case 'single-nearby': return 'Only nearby parcel candidate';
    default: return parcel ? 'Parcel located' : 'Parcel not found';
  }
}

function exportBaseName(packet) {
  const raw = packet?.geocode?.matchedAddress || packet?.inputAddress || 'property-research';
  const slug = String(raw).normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 72);
  return slug || 'property-research';
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', ''); area.style.position='fixed'; area.style.opacity='0';
  document.body.appendChild(area); area.select();
  try { document.execCommand('copy'); } finally { area.remove(); }
}


function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function render(packet, markdown = '', runId = null) {
  currentResult = { packet, markdown, runId };
  const jurisdiction = packet.jurisdiction || {};
  $('#matched-address').textContent = packet.geocode?.matchedAddress || packet.inputAddress || 'Property research';
  $('#jurisdiction-line').textContent = [jurisdiction.municipality, jurisdiction.county, jurisdiction.state].filter(Boolean).join(' · ') || 'Jurisdiction not resolved';
  const assessment = packet.assessment || {};
  const status = $('#packet-status');
  status.textContent = assessment.status === 'complete' ? 'Core sources found' : assessment.status === 'failed' ? 'Address unresolved' : 'Review missing sources';
  status.className = `status-chip${assessment.status === 'complete' ? '' : assessment.status === 'failed' ? ' missing' : ' warning'}`;
  $('#metric-coverage').textContent = Number.isFinite(assessment.completenessScore) ? `${assessment.completenessScore}%` : '—';
  $('#metric-missing').textContent = assessment.missing?.length ? `Missing: ${assessment.missing.join(', ')}` : 'Core source categories located';

  const parcel = packet.parcel;
  const match = parcel?.matchEvidence || null;
  const needsParcelReview = Boolean(parcel && (match?.status === 'review' || parcel.resolutionMethod !== 'exact-point'));
  $('#metric-parcel').textContent = parcel ? (needsParcelReview ? 'Review match' : 'Located') : 'Not found';
  $('#metric-parcel-source').textContent = parcel ? (parcel.layerName || hostOf(parcel.sourceUrl)) : 'No intersecting parcel returned';
  const zoneCount = (packet.zoning || []).reduce((n,z) => n + (z.features?.length || 0), 0);
  $('#metric-zoning').textContent = zoneCount ? `${zoneCount} feature${zoneCount === 1 ? '' : 's'}` : 'Not found';
  $('#metric-zoning-source').textContent = packet.zoning?.[0]?.layerName || 'No zoning intersection returned';
  $('#metric-code').textContent = String(packet.ordinanceSources?.length || 0);
  $('#metric-warnings').textContent = String(packet.warnings?.length || 0);

  const parcelStatus = $('#parcel-status');
  parcelStatus.textContent = parcel ? (needsParcelReview ? 'Review match' : 'Located') : 'Not found';
  parcelStatus.className = `status-chip${parcel ? (needsParcelReview ? ' warning' : '') : ' missing'}`;
  const preview = $('#parcel-preview');
  const view = buildParcelView(parcel?.geometry, packet.geocode?.coordinates);
  $('#parcel-shape').setAttribute('d', view.path);
  preview.classList.toggle('empty', !view.path);
  const pointEl=$('#parcel-geocode-point');
  const haloEl=$('#parcel-geocode-halo');
  const lineEl=$('#parcel-distance-line');
  const nearestEl=$('#parcel-nearest-point');
  const showPoint=Boolean(view.point);
  for (const el of [pointEl,haloEl]) el.classList.toggle('hidden',!showPoint);
  if (showPoint) {
    for (const el of [pointEl,haloEl]) { el.setAttribute('cx',view.point[0].toFixed(1)); el.setAttribute('cy',view.point[1].toFixed(1)); }
  }
  const showDistance=Boolean(view.point && view.nearest && match?.insideParcel === false);
  lineEl.classList.toggle('hidden',!showDistance); nearestEl.classList.toggle('hidden',!showDistance);
  if (showDistance) {
    lineEl.setAttribute('x1',view.point[0].toFixed(1)); lineEl.setAttribute('y1',view.point[1].toFixed(1));
    lineEl.setAttribute('x2',view.nearest[0].toFixed(1)); lineEl.setAttribute('y2',view.nearest[1].toFixed(1));
    nearestEl.setAttribute('cx',view.nearest[0].toFixed(1)); nearestEl.setAttribute('cy',view.nearest[1].toFixed(1));
  }
  $('#parcel-preview-label').textContent = view.path
    ? `GIS parcel geometry · World Geodetic System 1984 (WGS 84)${view.simplified ? ' · visually simplified' : ''}`
    : 'No parcel geometry returned';

  const matchPanel=$('#parcel-match-panel');
  matchPanel.classList.toggle('hidden',!parcel);
  matchPanel.classList.toggle('review',needsParcelReview);
  if (parcel) {
    $('#parcel-match-title').textContent = needsParcelReview ? 'Parcel match requires review' : 'Parcel matched directly';
    const methodLabel=parcelMatchLabel(parcel);
    const methodDetail = parcel.resolutionMethod === 'address-match'
      ? 'The Census address point was outside parcel polygons, so source address fields were used to select the best nearby parcel.'
      : parcel.resolutionMethod === 'nearest-geometry'
        ? 'The Census address point was outside parcel polygons, so the nearest clearly separated parcel geometry was selected.'
        : parcel.resolutionMethod === 'single-nearby'
          ? 'The Census address point was outside parcel polygons, and only one parcel was returned within the nearby search radius.'
          : parcel.resolutionMethod === 'exact-point-address-match'
            ? 'More than one parcel polygon intersected the Census point; source address fields were used to choose between them.'
            : 'The Census address point falls inside a single parcel polygon returned by the parcel source.';
    $('#parcel-match-detail').textContent = `${methodLabel}. ${methodDetail}${needsParcelReview ? ' Verify the parcel identifier/address and source record before relying on downstream zoning.' : ''}`;
    $('#parcel-match-quality').textContent = needsParcelReview ? 'Review' : 'High';
    $('#parcel-match-distance').textContent = match?.insideParcel === true
      ? 'Inside parcel polygon'
      : Number.isFinite(match?.distanceMeters) ? `Approx. ${match.distanceMeters.toFixed(1)} m to boundary` : 'Not measured';
    $('#parcel-match-candidates').textContent = Number.isFinite(match?.candidateCount) ? String(match.candidateCount) : 'Not reported';
    const c=packet.geocode?.coordinates;
    $('#parcel-geocode-coordinates').textContent = Number.isFinite(c?.latitude) && Number.isFinite(c?.longitude)
      ? `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}` : 'Not available';
    const polygons=view.partCount || 0;
    $('#parcel-geometry-summary').textContent = view.path
      ? `${polygons} polygon${polygons===1?'':'s'} · ${view.ringCount} ring${view.ringCount===1?'':'s'} · ${view.vertexCount.toLocaleString()} vertices`
      : 'No geometry';
    $('#parcel-layer-summary').textContent = parcel.layerName ? `${parcel.layerName} (layer ${safeText(parcel.layerId,'?')})` : safeText(parcel.layerId,'Not reported');
  }

  const fields = $('#parcel-fields'); fields.innerHTML = '';
  if (parcel) {
    for (const [key,value] of likelyFieldEntries(parcel.properties)) {
      const div = document.createElement('div');
      const dt = document.createElement('dt'); const dd = document.createElement('dd');
      dt.textContent = key; dt.title=`Source field: ${key}`; dd.textContent = safeText(value); div.append(dt,dd); fields.append(div);
    }
  }
  const parcelSourceLink = $('#parcel-source-link');
  if (parcel?.sourceUrl) { parcelSourceLink.href = parcel.sourceUrl; parcelSourceLink.classList.remove('hidden'); }
  else parcelSourceLink.classList.add('hidden');

  const zoningStatus = $('#zoning-status');
  zoningStatus.textContent = zoneCount ? 'Intersected' : 'Not found';
  zoningStatus.className = `status-chip${zoneCount ? '' : ' missing'}`;
  const zoningList = $('#zoning-list'); zoningList.innerHTML = '';
  if (!zoneCount) zoningList.innerHTML = '<div class="empty-state">No zoning feature was returned from the discovered public GIS candidates. Review the source list or add a jurisdiction adapter.</div>';
  for (const z of packet.zoning || []) {
    for (const feature of z.features || []) {
      const props = feature.properties || feature.attributes || {};
      const item = document.createElement('article'); item.className = 'zoning-item';
      const head = document.createElement('div'); head.className = 'zoning-item-header';
      const h4 = document.createElement('h4'); h4.textContent = zoningLabel(props);
      const small = document.createElement('small'); small.textContent = z.layerName || 'Zoning layer'; head.append(h4,small); item.append(head);
      const dl = document.createElement('dl'); dl.className = 'zoning-props';
      for (const [key,value] of Object.entries(props).filter(([,v]) => v !== null && v !== '' && typeof v !== 'object').slice(0,8)) {
        const div = document.createElement('div'); const dt=document.createElement('dt'); const dd=document.createElement('dd'); dt.textContent=key;dd.textContent=safeText(value);div.append(dt,dd);dl.append(div);
      }
      item.append(dl);
      if (z.sourceUrl) { const a=document.createElement('a');a.href=z.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';a.className='source-link';a.textContent='Open zoning source ↗';item.append(a); }
      zoningList.append(item);
    }
  }

  const ordinanceList = $('#ordinance-list'); ordinanceList.innerHTML = '';
  if (!packet.ordinanceSources?.length) ordinanceList.innerHTML = '<div class="empty-state">No ordinance source was discovered by the configured conventional search provider.</div>';
  for (const s of (packet.ordinanceSources || []).slice(0,12)) {
    const row = document.createElement('div'); row.className='source-row';
    const main=document.createElement('div');main.className='source-main';const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=s.title||hostOf(s.url)||s.url;const small=document.createElement('small');small.textContent=`${hostOf(s.url)}${s.official?' · official government source':s.codeProvider?' · code provider':''}`;main.append(a,small);
    const meta=document.createElement('div');meta.className='source-meta';const conf=document.createElement('span');conf.className='confidence';conf.textContent=Number.isFinite(s.confidence)?`${s.confidence}%`:'—';const policy=document.createElement('span');policy.className='policy';policy.textContent=s.automation?.action||'unknown';meta.append(conf,policy);row.append(main,meta);ordinanceList.append(row);
  }

  const provenance = $('#provenance-list'); provenance.innerHTML = '';
  if (!packet.provenance?.length) provenance.innerHTML = '<div class="empty-state">No fetched source provenance was recorded in this run.</div>';
  for (const p of packet.provenance || []) {
    const row=document.createElement('div');row.className='timeline-item';const dot=document.createElement('span');dot.className='timeline-dot';const main=document.createElement('div');const strong=document.createElement('strong');strong.textContent=p.kind||'source';const a=document.createElement('a');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=p.url;main.append(strong,a);const time=document.createElement('time');time.textContent=p.retrievedAt?new Date(p.retrievedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'';row.append(dot,main,time);provenance.append(row);
  }

  const sourceLimitations = packet.sourceLimitations || [];
  $('#limitations-card').classList.toggle('hidden', !sourceLimitations.length);
  const limitationsList = $('#limitations-list'); limitationsList.innerHTML='';
  for (const source of sourceLimitations) {
    const item=document.createElement('article'); item.className='limitation-item';
    const heading=document.createElement('div'); heading.className='limitation-source';
    const strong=document.createElement('strong'); strong.textContent=source.kind || 'Source';
    const a=document.createElement('a'); a.href=source.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=hostOf(source.url) || source.url;
    heading.append(strong,a); item.append(heading);
    const ul=document.createElement('ul');
    for (const row of source.limitations || []) { const li=document.createElement('li'); li.textContent=`${String(row.code || 'limitation').replaceAll('-', ' ')} — ${row.excerpt || ''}`; ul.append(li); }
    item.append(ul); limitationsList.append(item);
  }

  const codeSearchCard = $('#code-search-card');
  codeSearchCard.classList.toggle('hidden', !runId);
  $('#code-search-results').innerHTML = '';
  $('#code-search-input').value = '';

  const warnings = packet.warnings || [];
  $('#warnings-card').classList.toggle('hidden', !warnings.length);
  const warningsList = $('#warnings-list'); warningsList.innerHTML=''; warnings.forEach((w)=>{const li=document.createElement('li');li.textContent=typeof w==='string'?w:JSON.stringify(w);warningsList.append(li);});

  loadingCard.classList.add('hidden'); errorCard.classList.add('hidden'); resultsEl.classList.remove('hidden'); finishStages();
}

async function runResearch(address) {
  workspace.classList.remove('hidden'); resultsEl.classList.add('hidden'); errorCard.classList.add('hidden'); loadingCard.classList.remove('hidden');
  workspace.scrollIntoView({ behavior:'smooth', block:'start' }); resetStages();
  try {
    const res = await fetch('/api/research/stream', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({ address, fetchOrdinanceDocuments:true })
    });
    if (!res.ok) {
      const body = await res.json().catch(()=>({}));
      throw new Error(body.error || `Research request failed (${res.status})`);
    }
    if (!res.body) throw new Error('Research stream was unavailable.');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream:true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress') applyProgress(event);
        else if (event.type === 'result') { completed = true; render(event.packet || event, event.markdown || '', event.runId || null); }
        else if (event.type === 'error') throw new Error(event.error || 'Research failed');
      }
    }
    if (!completed && buffer.trim()) {
      const event = JSON.parse(buffer);
      if (event.type === 'result') { completed = true; render(event.packet || event, event.markdown || '', event.runId || null); }
      else if (event.type === 'error') throw new Error(event.error || 'Research failed');
    }
    if (!completed) throw new Error('Research ended before a result packet was returned.');
  } catch (error) {
    loadingCard.classList.add('hidden'); resultsEl.classList.add('hidden'); errorCard.classList.remove('hidden'); $('#error-message').textContent=error.message || String(error);
  }
}

form.addEventListener('submit', (event) => { event.preventDefault(); const address=addressInput.value.trim(); if(address) runResearch(address); });
$$('[data-example]').forEach((b)=>b.addEventListener('click',()=>{addressInput.value=b.dataset.example;addressInput.focus();}));
$('#copy-markdown').addEventListener('click', async () => { if(!currentResult)return; const content=currentResult.markdown||JSON.stringify(currentResult.packet,null,2); await navigator.clipboard.writeText(content); const b=$('#copy-markdown'); const old=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=old,1200); });
$('#download-json').addEventListener('click',()=>{if(currentResult)download('property-research.json',JSON.stringify(currentResult.packet,null,2),'application/json');});
$('#download-markdown').addEventListener('click',()=>{if(currentResult)download('property-research.md',currentResult.markdown||'# Property Research\n\n```json\n'+JSON.stringify(currentResult.packet,null,2)+'\n```','text/markdown');});

$('#code-search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const runId = currentResult?.runId;
  const q = $('#code-search-input').value.trim();
  if (!runId || !q) return;
  const results = $('#code-search-results');
  results.innerHTML = '<div class="code-search-loading">Searching indexed ordinance text…</div>';
  try {
    const res = await fetch(`/api/code-search?runId=${encodeURIComponent(runId)}&q=${encodeURIComponent(q)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Code search failed (${res.status})`);
    results.innerHTML = '';
    if (!body.results?.length) {
      results.innerHTML = '<div class="empty-state">No indexed ordinance section matched that search.</div>';
      return;
    }
    for (const row of body.results) {
      const article = document.createElement('article'); article.className = 'code-result';
      const top = document.createElement('div'); top.className = 'code-result-top';
      const heading = document.createElement('strong'); heading.textContent = row.heading || row.title || 'Indexed ordinance section';
      const score = document.createElement('span'); score.textContent = Number.isFinite(row.rank) ? `match ${Math.round(row.rank * 100)}` : 'match';
      top.append(heading, score);
      const bodyText = document.createElement('p'); bodyText.textContent = String(row.body || '').slice(0, 1200);
      article.append(top, bodyText);
      if (row.source_url) { const a=document.createElement('a');a.href=row.source_url;a.target='_blank';a.rel='noopener noreferrer';a.className='source-link';a.textContent='Open source ↗';article.append(a); }
      results.append(article);
    }
  } catch (error) {
    results.innerHTML = '';
    const div = document.createElement('div'); div.className = 'empty-state'; div.textContent = error.message || String(error); results.append(div);
  }
});
