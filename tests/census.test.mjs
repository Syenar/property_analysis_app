import test from 'node:test';
import assert from 'node:assert/strict';
import { CensusGeocoder } from '../src/geocoding/census.mjs';

test('CensusGeocoder parses coordinates and jurisdiction with jurisdiction candidates', async () => {
  const http={async getJson(){return {result:{addressMatches:[{matchedAddress:'123 MAIN ST, TESTVILLE, PA, 19000',coordinates:{x:-75,y:40},addressComponents:{city:'TESTVILLE',state:'PA'},geographies:{States:[{NAME:'Pennsylvania',GEOID:'42'}],Counties:[{NAME:'Test County',GEOID:'42001'}],'Incorporated Places':[{NAME:'Testville borough',GEOID:'4212345',LSADC:'21'}],'County Subdivisions':[{NAME:'Test Township',GEOID:'4299999',LSADC:'44'}]}}]}};}};
  const g=await new CensusGeocoder({http}).geocode('123 Main St');
  assert.equal(g.ok,true);assert.equal(g.jurisdiction.state,'Pennsylvania');assert.equal(g.jurisdiction.county,'Test County');assert.equal(g.jurisdiction.municipality,'Testville borough');
  assert.equal(g.jurisdiction.municipalityType,'incorporated-place');
  assert.ok(g.jurisdiction.candidates.some((x)=>x.name==='Test Township' && x.type==='county-subdivision'));
});
