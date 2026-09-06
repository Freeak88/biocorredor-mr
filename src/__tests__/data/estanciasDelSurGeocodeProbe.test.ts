import fs from 'node:fs';
import path from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { describe, expect, it } from 'vitest';

type Feature = { type: 'Feature'; properties?: Record<string, unknown> | null; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon };
type FC = { type: 'FeatureCollection'; features: Feature[] };
type NominatimRow = { lat: string; lon: string; display_name?: string; type?: string; class?: string; importance?: number };

const TMP_DIR = path.resolve(process.cwd(), 'tmp/territorial-audit');
const QUADRANTS = ['noroeste', 'noreste', 'suroeste', 'sureste'] as const;
const QUERIES = [
  'Calderón esquina Chivilcoy, Glew, Buenos Aires, Argentina',
  'Avenida Chivilcoy y General Brigadier Manuel Calderón, Ministro Rivadavia, Buenos Aires, Argentina',
  'General Brigadier Manuel Calderón y Avenida Chivilcoy, Glew, Buenos Aires, Argentina',
  'Calderón e/ Chivilcoy e Iturralde, Ministro Rivadavia, Buenos Aires, Argentina',
];

function featureKey(feature: Feature) {
  const p = feature.properties ?? {};
  return `${String(p.partida ?? '')}|${String(p.nomenclatura ?? '')}`;
}
function loadMosaic(): FC {
  const byKey = new Map<string, Feature>();
  for (const q of QUADRANTS) {
    const p = path.resolve(process.cwd(), `public/data/geoarba/ministro-rivadavia-parcels-${q}.geojson`);
    const fc = JSON.parse(fs.readFileSync(p, 'utf8')) as FC;
    for (const feature of fc.features) byKey.set(featureKey(feature), feature);
  }
  return { type: 'FeatureCollection', features: [...byKey.values()] };
}
function flattenCoords(g: Feature['geometry']): number[][] {
  if (g.type === 'Polygon') return g.coordinates.flat();
  return g.coordinates.flat(2);
}
function center(feature: Feature): [number, number] {
  const c = flattenCoords(feature.geometry); const xs=c.map(x=>x[0]), ys=c.map(x=>x[1]);
  return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
}
function distanceM(a:[number,number], b:[number,number]) {
  const lat=(a[1]+b[1])/2*Math.PI/180; const dx=(a[0]-b[0])*111320*Math.cos(lat); const dy=(a[1]-b[1])*111320;
  return Math.hypot(dx,dy);
}
function hits(fc: FC, lon:number, lat:number) {
  const p=point([lon,lat]);
  return fc.features.filter(f=>booleanPointInPolygon(p,f as never)).map(f=>f.properties??{});
}
function nearby(fc: FC, p:[number,number], radius=800) {
  return fc.features.map(f=>({properties:f.properties??{},bboxCenter:center(f),distanceM:distanceM(center(f),p)}))
    .filter(r=>r.distanceM<=radius).sort((a,b)=>a.distanceM-b.distanceM).slice(0,150);
}

async function geocode(q:string) {
  const params=new URLSearchParams({q,format:'jsonv2',limit:'10',countrycodes:'ar'});
  const r=await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`,{headers:{'User-Agent':'biocorredor-mr-territorial-audit/1.0 (research probe)'}});
  if(!r.ok) return {query:q,status:r.status,rows:[] as NominatimRow[]};
  return {query:q,status:r.status,rows:await r.json() as NominatimRow[]};
}

describe('Estancias del Sur Nominatim -> complete GeoARBA mosaic probe',()=>{
  it('uses public geocoding only as a navigation anchor and records nearby cadastral candidates',async()=>{
    fs.mkdirSync(TMP_DIR,{recursive:true});
    const fc=loadMosaic();
    const geocodes=[];
    for(const q of QUERIES){
      try{ geocodes.push(await geocode(q)); }
      catch(error){ geocodes.push({query:q,error:error instanceof Error?error.message:String(error),rows:[] as NominatimRow[]}); }
    }
    const candidates=[];
    for(const g of geocodes){
      for(const row of g.rows){
        const p:[number,number]=[Number(row.lon),Number(row.lat)];
        const near=nearby(fc,p);
        candidates.push({query:g.query,geocoder:row,point:{lon:p[0],lat:p[1]},containingParcels:hits(fc,p[0],p[1]),nearbyParcels:near,areaMatches16122:near.filter(n=>{const a=Number(n.properties.superficie_m2??n.properties.superficie??NaN); return Number.isFinite(a)&&Math.abs(a-16122)<=3500;})});
      }
    }
    const report={source:'Nominatim navigation anchors + complete deduplicated four-quadrant GeoARBA snapshot',queries:QUERIES,geocodes,candidates,caution:'Geocoded intersections and the independent 16,122 m² listing are search anchors only. They do not establish the Estancias del Sur legal polygon, ownership, approval, zoning or legality.'};
    fs.writeFileSync(path.join(TMP_DIR,'estancias-del-sur-geocode.json'),JSON.stringify(report,null,2));
    console.log('ESTANCIAS_DEL_SUR_GEOCODE_PROBE_BEGIN'); console.log(JSON.stringify(report,null,2)); console.log('ESTANCIAS_DEL_SUR_GEOCODE_PROBE_END');
    expect(fc.features.length).toBeGreaterThan(50000);
  },120000);
});
