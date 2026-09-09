import test from 'node:test';
import assert from 'node:assert/strict';
import { PropertyResearchEngine } from '../src/engine/property-research-engine.mjs';

function makeEngine() {
  const discovery = { discoverGis: async () => ({
    parcelCandidates:[
      {url:'https://wrong.example/FeatureServer', platform:'arcgis', extent:[[-86,34],[-84,36]], confidence:99},
      {url:'https://right.example/FeatureServer', platform:'arcgis', extent:[[-85,38],[-84,39]], confidence:90}
    ],
    zoningCandidates:[]
  })};
  const arcgis = {
    supports:()=>true,
    inspectService: async (url) => ({url,service:{},layers:[{id:0,name:'Parcels',geometryType:'esriGeometryPolygon',capabilities:'Query',fields:[{name:'PARCEL'}]}]}),
    rankLayers:()=>[{layer:{id:0,name:'Parcels'},score:90,reasons:[]}],
    queryPoint: async (url) => url.includes('right') ? {features:[{attributes:{PARCEL:'OK'},geometry:{rings:[[[-84.9,38.1],[-84.8,38.1],[-84.8,38.2],[-84.9,38.2],[-84.9,38.1]]]}}]} : {features:[]},
    queryGeometry: async ()=>({features:[]})
  };
  return new PropertyResearchEngine({
    geocoder:{geocode:async()=>({ok:true,matchedAddress:'x',coordinates:{longitude:-84.85,latitude:38.15},jurisdiction:{municipality:'Frankfort',county:'Franklin County',state:'Kentucky',candidates:[]}})},
    discovery,arcgis,wfs:null,genericRest:null,
    registry:{get:async()=>null,put:async()=>{},markFailure:async()=>{}},
    ordinanceDiscovery:{discover:async()=>[]},documentDownloader:{fetchDocument:async()=>({})},
    store:null,sourcePolicy:{decision:()=>({action:'fetch',limitations:[]})}
  });
}

test('engine rejects ArcGIS Portal candidates whose WGS84 extent misses the address', async () => {
  const {packet} = await makeEngine().run('x',{fetchOrdinanceDocuments:false});
  assert.equal(packet.parcel?.properties?.PARCEL,'OK');
  assert.ok(packet.warnings.some((w)=>String(w).includes('geographic extent')));
});
