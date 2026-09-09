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

function svgParcelPath(geometry) {
  const rings = geometry?.type === 'Polygon' ? geometry.coordinates : geometry?.type === 'MultiPolygon' ? geometry.coordinates?.[0] : null;
  const ring = rings?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return '';
  const xs = ring.map((p) => p[0]); const ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1e-9), h = Math.max(maxY - minY, 1e-9);
  const pad = 12, vw = 396, vh = 166;
  return ring.map(([x,y],i) => {
    const px = pad + ((x - minX) / w) * (vw - pad * 2);
    const py = pad + (1 - ((y - minY) / h)) * (vh - pad * 2);
    return `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ') + ' Z';
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
  $('#metric-parcel').textContent = parcel ? 'Located' : 'Not found';
  $('#metric-parcel-source').textContent = parcel ? (parcel.layerName || hostOf(parcel.sourceUrl)) : 'No intersecting parcel returned';
  const zoneCount = (packet.zoning || []).reduce((n,z) => n + (z.features?.length || 0), 0);
  $('#metric-zoning').textContent = zoneCount ? `${zoneCount} feature${zoneCount === 1 ? '' : 's'}` : 'Not found';
  $('#metric-zoning-source').textContent = packet.zoning?.[0]?.layerName || 'No zoning intersection returned';
  $('#metric-code').textContent = String(packet.ordinanceSources?.length || 0);
  $('#metric-warnings').textContent = String(packet.warnings?.length || 0);

  const parcelStatus = $('#parcel-status');
  parcelStatus.textContent = parcel ? 'Located' : 'Not found';
  parcelStatus.className = `status-chip${parcel ? '' : ' missing'}`;
  const preview = $('#parcel-preview');
  const path = svgParcelPath(parcel?.geometry);
  $('#parcel-shape').setAttribute('d', path);
  preview.classList.toggle('empty', !path);
  $('#parcel-preview-label').textContent = path ? 'Reference parcel geometry · WGS 84' : 'No parcel geometry returned';

  const fields = $('#parcel-fields'); fields.innerHTML = '';
  if (parcel) {
    for (const [key,value] of likelyFieldEntries(parcel.properties)) {
      const div = document.createElement('div');
      const dt = document.createElement('dt'); const dd = document.createElement('dd');
      dt.textContent = key; dd.textContent = safeText(value); div.append(dt,dd); fields.append(div);
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
