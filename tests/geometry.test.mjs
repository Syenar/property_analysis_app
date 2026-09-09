import test from 'node:test';
import assert from 'node:assert/strict';
import { geometryBounds, pointInGeometry, geometriesIntersect, geoJSONToEsriGeometry } from '../src/geometry/geojson.mjs';

const a={type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]};
const b={type:'Polygon',coordinates:[[[1,1],[3,1],[3,3],[1,3],[1,1]]]};
const c={type:'Polygon',coordinates:[[[4,4],[5,4],[5,5],[4,5],[4,4]]]};

test('GeoJSON geometry helpers support deterministic intersection checks', () => {
  assert.deepEqual(geometryBounds(a), {minX:0,minY:0,maxX:2,maxY:2});
  assert.equal(pointInGeometry([1,1], a), true);
  assert.equal(geometriesIntersect(a,b), true);
  assert.equal(geometriesIntersect(a,c), false);
  assert.equal(geoJSONToEsriGeometry(a).rings.length, 1);
});
