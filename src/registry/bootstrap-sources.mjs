// Initial verified source catalog. This is data, not jurisdiction-specific engine logic.
// Entries were validated against official/public source infrastructure during the
// 2026-09-09 research pass. The registry can be superseded by healthier persisted
// sources discovered at runtime.
export const BOOTSTRAP_JURISDICTIONS = [
  {
    jurisdiction:{ state:'Alabama', municipality:'Montgomery' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'City of Montgomery Parcels', url:'https://gis.montgomeryal.gov/server/rest/services/Parcels/FeatureServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'City of Montgomery Zoning', url:'https://gis.montgomeryal.gov/server/rest/services/Zoning/FeatureServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'City of Montgomery Zoning Ordinance', url:'https://www.montgomeryal.gov/government/city-government/city-departments/community-development/land-use-division/zoning-ordinance-subdivision-regulations', official:true, confidence:95 }]
    }
  },
  {
    jurisdiction:{ state:'Arizona', municipality:'Phoenix' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'City of Phoenix Parcels', url:'https://maps.phoenix.gov/pub/rest/services/public/CityParcels/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'City of Phoenix Zoning', url:'https://maps.phoenix.gov/pub/rest/services/public/AllZoning/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'City of Phoenix Zoning Ordinance', url:'https://www.phoenix.gov/administration/departments/pdd/planning-zoning/publications-plans-studies.html', official:true, confidence:92 }]
    }
  },
  {
    jurisdiction:{ state:'Arkansas', municipality:'Little Rock' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'City of Little Rock Tax Parcel Boundary', url:'https://maps.littlerock.gov/server/rest/services/Tax_Parcel_Boundary/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'City of Little Rock Zoning', url:'https://maps.littlerock.gov/server/rest/services/Zoning_Only/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Little Rock Code of Ordinances - Zoning', url:'https://library.municode.com/ar/little_rock', official:false, confidence:90 }]
    }
  },
  {
    jurisdiction:{ state:'California', municipality:'Sacramento' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Sacramento County Parcels', url:'https://mapservices.gis.saccounty.gov/arcgis/rest/services/PARCELS/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'City of Sacramento GIS', url:'https://mapservices.gis.saccounty.gov/arcgis/rest/services/CITY_of_SACRAMENTO/MapServer', official:true, access:'public', confidence:92 }],
      ordinanceSources:[]
    }
  },
  {
    jurisdiction:{ state:'Colorado', municipality:'Denver' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Denver Parcels', url:'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_PROP_PARCELS_A/FeatureServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Denver Zoning', url:'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_ZONE_ZONING_A/FeatureServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Denver Zoning Code', url:'https://library.municode.com/co/denver/codes/code_of_ordinances?nodeId=TITIIREMUCO_CH59ZO_S59-2FOCH59', official:false, confidence:90 }]
    }
  },
  {
    jurisdiction:{ state:'Connecticut', municipality:'Hartford' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Hartford Accela GIS', url:'https://gis.hartford.gov/arcgis/rest/services/AccelaPROD/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Hartford Accela GIS', url:'https://gis.hartford.gov/arcgis/rest/services/AccelaPROD/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Hartford Zoning Regulations', url:'https://library.municode.com/ct/hartford/codes/zoning_regulations', official:false, confidence:92 }]
    }
  },
  {
    jurisdiction:{ state:'Delaware', municipality:'Dover' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Kent County Parcels', url:'https://gis.kentcountyde.gov/server/rest/services/Parcels/Parcels/FeatureServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'City of Dover Zoning', url:'https://gis.dover.de.us/arcgis/rest/services/Zoning/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Dover Code of Ordinances', url:'https://library.municode.com/de/dover', official:false, confidence:90 },{ title:'Dover adopted ordinances', url:'https://www.cityofdover.gov/ordinances-and-resolutions', official:true, confidence:95 }]
    }
  },
  {
    jurisdiction:{ state:'Florida', municipality:'Tallahassee' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Tallahassee-Leon County Parcels', url:'https://intervector.leoncountyfl.gov/intervector/rest/services/MapServices/TLC_OverlayParNALPublic_D_WM/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Tallahassee-Leon County Zoning', url:'https://intervector.leoncountyfl.gov/intervector/rest/services/MapServices/TLC_OverlayZoningLandUse_D_WM/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Tallahassee Land Development Code', url:'https://www.talgov.com/growth/growth-codes', official:true, confidence:95 }]
    }
  },
  {
    jurisdiction:{ state:'Georgia', municipality:'Atlanta' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Atlanta Lots with Zoning', url:'https://gis.atlantaga.gov/dpcd/rest/services/LandUsePlanning/LotsWithZoning/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Atlanta Land Use Planning', url:'https://gis.atlantaga.gov/dpcd/rest/services/LandUsePlanning/LandUsePlanning/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Atlanta Code of Ordinances', url:'https://library.municode.com/ga/atlanta/codes/code_of_ordinances', official:false, confidence:90 }]
    }
  },
  {
    jurisdiction:{ state:'Idaho', municipality:'Boise' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'City of Boise DBA Map', url:'https://gismap.cityofboise.org/arcgis/rest/services/BoiseMaps/DBA/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'City of Boise DBA Map', url:'https://gismap.cityofboise.org/arcgis/rest/services/BoiseMaps/DBA/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Boise Zoning Code', url:'https://codelibrary.amlegal.com/codes/boise_id/latest/overview', official:false, confidence:92 }]
    }
  },
  {
    jurisdiction:{ state:'Illinois', municipality:'Springfield' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Springfield Parcel Zones', url:'https://maps.springfield.il.us/server/rest/services/PW_Zoning/parcelZonesView/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Springfield Parcel Zones', url:'https://maps.springfield.il.us/server/rest/services/PW_Zoning/parcelZonesView/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Springfield Zoning Code', url:'https://library.municode.com/il/springfield/codes/code_of_ordinances?nodeId=TITXVLAUS_CH155ZO_ARTIGEPR', official:false, confidence:90 }]
    }
  },
  {
    jurisdiction:{ state:'Indiana', municipality:'Indianapolis' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Indianapolis Commonly Used Layers', url:'https://gis.indy.gov/server/rest/services/Common/CommonlyUsedLayers/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Indianapolis Zoning', url:'https://gis.indy.gov/server/rest/services/MapIndy/Zoning/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Indianapolis-Marion County Code', url:'https://library.municode.com/in/indianapolis_-_marion_county/codes/code_of_ordinances', official:false, confidence:90 }]
    }
  },
  {
    jurisdiction:{ state:'Kansas', municipality:'Topeka' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Topeka Parcels and Subdivisions', url:'https://maps.topeka.gov/arcgis/rest/services/ParcelPublishing/Parcels_and_Subdivisions/FeatureServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Topeka Zoning District', url:'https://maps.topeka.gov/arcgis/rest/services/LandUsePlanning/ZoningDistrict/FeatureServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[]
    }
  },
  {
    jurisdiction:{ state:'Kentucky', municipality:'Frankfort' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Franklin County Planning', url:'https://www.franklincountymaps.net/arcgis/rest/services/Hosted/Planning_WFL1/MapServer', official:true, access:'public', confidence:92 }],
      zoningCandidates:[{ platform:'arcgis', title:'Franklin County Planning', url:'https://www.franklincountymaps.net/arcgis/rest/services/Hosted/Planning_WFL1/MapServer', official:true, access:'public', confidence:92 }],
      ordinanceSources:[{ title:'Frankfort Zoning Regulations', url:'https://www.frankfort.ky.gov/507/Zoning-Land-Use', official:true, confidence:95 }]
    }
  },
  {
    jurisdiction:{ state:'Louisiana', municipality:'Baton Rouge' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Baton Rouge Tax Parcel', url:'https://maps.brla.gov/gis/rest/services/Cadastral/Tax_Parcel/MapServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Baton Rouge Zoning', url:'https://maps.brla.gov/gis/rest/services/Cadastral/Zoning/MapServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Baton Rouge Unified Development Code', url:'https://www.brla.gov/706/Unified-Development-Code', official:true, confidence:95 }]
    }
  },
  {
    jurisdiction:{ state:'Massachusetts', municipality:'Boston' },
    sources:{
      parcelCandidates:[{ platform:'arcgis', title:'Boston Current Parcels', url:'https://gis.boston.gov/arcgis/rest/services/Parcels/Parcels_current/FeatureServer', official:true, access:'public', confidence:95 }],
      zoningCandidates:[{ platform:'arcgis', title:'Boston Zoning Districts', url:'https://gis.bostonplans.org/hosting/rest/services/Zoning_Districts/FeatureServer', official:true, access:'public', confidence:95 }],
      ordinanceSources:[{ title:'Boston Zoning Code', url:'https://www.bostonplans.org/planning-zoning/zoning-code', official:true, confidence:95 }]
    }
  }
];
