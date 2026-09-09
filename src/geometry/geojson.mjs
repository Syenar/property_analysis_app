export function geometryBounds(geometry) {
  if (!geometry?.coordinates) return null;
  const xs = [], ys = [];
  const walk = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      xs.push(value[0]); ys.push(value[1]); return;
    }
    for (const child of value) walk(child);
  };
  walk(geometry.coordinates);
  if (!xs.length) return null;
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point, polygon) {
  const rings = polygon?.type === 'Polygon' ? polygon.coordinates : null;
  if (!rings?.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

export function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((coords) => pointInPolygon(point, { type: 'Polygon', coordinates: coords }));
  return false;
}

function orientation(a, b, c) {
  const v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(v) < 1e-12) return 0;
  return v > 0 ? 1 : 2;
}
function onSegment(a, b, c) {
  return b[0] <= Math.max(a[0], c[0]) && b[0] >= Math.min(a[0], c[0]) && b[1] <= Math.max(a[1], c[1]) && b[1] >= Math.min(a[1], c[1]);
}
function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2), o2 = orientation(p1, q1, q2), o3 = orientation(p2, q2, p1), o4 = orientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function shells(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map((p) => p?.[0]).filter(Boolean);
  return [];
}

export function geometriesIntersect(a, b) {
  const ab = geometryBounds(a), bb = geometryBounds(b);
  if (!ab || !bb || ab.maxX < bb.minX || bb.maxX < ab.minX || ab.maxY < bb.minY || bb.maxY < ab.minY) return false;
  const as = shells(a), bs = shells(b);
  for (const ar of as) {
    if (ar.some((p) => pointInGeometry(p, b))) return true;
    for (const br of bs) {
      if (br.some((p) => pointInGeometry(p, a))) return true;
      for (let i = 1; i < ar.length; i++) for (let j = 1; j < br.length; j++) {
        if (segmentsIntersect(ar[i - 1], ar[i], br[j - 1], br[j])) return true;
      }
    }
  }
  return false;
}

export function geoJSONToEsriGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return { x: geometry.coordinates[0], y: geometry.coordinates[1], spatialReference: { wkid: 4326 } };
  if (geometry.type === 'Polygon') return { rings: geometry.coordinates, spatialReference: { wkid: 4326 } };
  if (geometry.type === 'MultiPolygon') return { rings: geometry.coordinates.flat(), spatialReference: { wkid: 4326 } };
  if (geometry.type === 'LineString') return { paths: [geometry.coordinates], spatialReference: { wkid: 4326 } };
  if (geometry.type === 'MultiLineString') return { paths: geometry.coordinates, spatialReference: { wkid: 4326 } };
  if (geometry.type === 'MultiPoint') return { points: geometry.coordinates, spatialReference: { wkid: 4326 } };
  return null;
}
