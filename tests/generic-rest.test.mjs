import test from 'node:test';
import assert from 'node:assert/strict';
import { GenericRestAdapter } from '../src/adapters/generic-rest.mjs';

const polygon = { type:'Polygon', coordinates:[[[-75,40],[-74.9,40],[-74.9,40.1],[-75,40.1],[-75,40]]] };

test('generic REST adapter supports declarative sanctioned public APIs', async () => {
  const calls=[];
  const http={ async getJson(url){ calls.push(url); return { features:[{ type:'Feature', properties:{zone:'R1'}, geometry:polygon }] }; } };
  const adapter=new GenericRestAdapter({ http, config:{
    baseUrl:'https://data.example.gov/api/',
    layers:[{id:'parcel',name:'Tax parcels',purpose:'parcel',geometryType:'esriGeometryPolygon'},{id:'zoning',name:'Zoning',purpose:'zoning',geometryType:'esriGeometryPolygon'}],
    pointLookup:{ parcel:{path:'parcels',query:{lon:'{lon}',lat:'{lat}'}} },
    geometryLookup:{ zoning:{path:'zoning',query:{bbox:'{minX},{minY},{maxX},{maxY}'}} }
  }});
  assert.equal(adapter.supports('https://data.example.gov/api/'), true);
  const inspection=await adapter.inspectService('https://data.example.gov/api/');
  assert.equal(adapter.rankLayers(inspection,'parcel')[0].layer.id,'parcel');
  const parcel=await adapter.queryPoint('https://data.example.gov/api/','parcel',{longitude:-74.95,latitude:40.05});
  assert.equal(parcel.features.length,1);
  const zoning=await adapter.queryGeometry('https://data.example.gov/api/','zoning',polygon);
  assert.equal(zoning.features.length,1);
  assert.match(calls[0],/lon=-74.95/);
  assert.match(calls[1],/bbox=/);
});
