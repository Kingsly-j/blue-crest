import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const id = `bluecrest-verification-${randomUUID()}`;
const env = process.env;
const docUrl = `https://firestore.googleapis.com/v1/projects/${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/shipments/${id}?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`;
const bucket = env.NEXT_PUBLIC_SUPABASE_SHIPMENT_PHOTOS_BUCKET || 'blue';
const photoPath = `shipments/BC-VERIFY-${id.slice(-8)}/${id}.jpg`;
const storageUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;
const headers = {apikey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
let photoCreated = false;
let shipmentCreated = false;
let failures = 0;
async function request(url, options = {}) {
  const result = await fetch(url, {...options, signal:AbortSignal.timeout(20000)});
  const body = await result.text();
  if (!result.ok) throw Error(`HTTP ${result.status}: ${body.slice(0,600)}`);
  return body;
}
try {
  try {
    const photo = await readFile('public/testimonials/portrait-1.jpg');
    await request(`${storageUrl}/object/${bucket}/${photoPath}`, {method:'POST', headers:{...headers,'Content-Type':'image/jpeg'}, body:photo});
    photoCreated = true;
    const result = await fetch(`${storageUrl}/object/public/${bucket}/${photoPath}`, {signal:AbortSignal.timeout(20000)});
    if (!result.ok || Buffer.compare(Buffer.from(await result.arrayBuffer()),photo)!==0) throw Error('Public photo read-back did not match uploaded bytes.');
    console.log('PASS Supabase: uploaded to blue and verified public photo bytes.');
  } catch(error) {failures++;console.log(`FAIL Supabase: ${error.message}`);}
  if (!process.argv.includes('--supabase-only')) try {
    const now = new Date().toISOString();
    const record = {id,trackingCode:`BC-VERIFY-${id.slice(-8)}`,customerName:'Integration verification — delete after test',customerEmail:'',cargoDescription:'Temporary integration test',origin:'Test origin',destination:'Test destination',location:'Test location',status:'Booked',eta:now,createdBy:'support@bluecrestshipping.com',createdByRole:'Super admin',createdAt:now,updatedAt:now};
    if(photoCreated) {record.photoPath=photoPath;record.photoUrl=`${storageUrl}/object/public/${bucket}/${photoPath}`;}
    const fields = Object.fromEntries(Object.entries(record).map(([key,value])=>[key,{stringValue:value}]));
    fields.progress = {integerValue:'18'};
    await request(docUrl,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
    shipmentCreated=true;
    const saved=JSON.parse(await request(docUrl));
    if(saved.fields.trackingCode.stringValue!==record.trackingCode) throw Error('Firestore read-back mismatch.');
    console.log('PASS Firebase: shipment saved and independently read back from Firestore.');
  } catch(error) {failures++;console.log(`FAIL Firebase: ${error.message}`);}
} finally {
  if(shipmentCreated) {
    try {await request(docUrl,{method:'DELETE'});console.log('Removed test shipment.');}
    catch(error){failures++;console.log(`Cleanup required for shipment ${id}: ${error.message}`);}
  }
  if(photoCreated) {
    try {await request(`${storageUrl}/object/${bucket}`,{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[photoPath]})});console.log('Removed test photo.');}
    catch(error){failures++;console.log(`Cleanup required for photo ${photoPath}: ${error.message}`);}
  }
}
process.exitCode = failures ? 1 : 0;
