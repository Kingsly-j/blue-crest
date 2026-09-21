import { chromium, expect as baseExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const expect = baseExpect.configure({ timeout: 30000 });
const id = `tracking-layout-test-${randomUUID()}`;
const code = `TEST-${randomUUID().slice(0,8).toUpperCase()}`;
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const endpoint = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/shipments/${id}?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`;
function encode(value) {
  if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
  if(typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))}};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return {doubleValue:value};
  return {stringValue:value};
}
function decode(value) {
  if(value.mapValue)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decode(item)]));
  if(value.arrayValue)return (value.arrayValue.values||[]).map(decode);
  return value.stringValue ?? value.booleanValue ?? value.doubleValue ?? Number(value.integerValue);
}
async function readRecord() {const response=await fetch(endpoint);if(!response.ok)throw Error(`Fixture read failed (${response.status})`);return decode({mapValue:await response.json()});}
const fixture={id,trackingCode:code,customerName:'Tracking layout test',customerEmail:'receiver@example.com',cargoDescription:'Test parcel',origin:'Dubai, United Arab Emirates',destination:'London, United Kingdom',location:'Rome, Italy',status:'Booked',eta:'2026-10-10',progress:18,createdBy:'support@bluecrestshipping.com',createdByRole:'Super admin',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
let browser;
try {
  const seed=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(encode(fixture).mapValue)});
  if(!seed.ok)throw Error(`Fixture creation failed (${seed.status})`);
  browser=await chromium.launch({channel:'msedge'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  // Keep map testing independent of third-party map availability.
  await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eef0"/></svg>'}));
  await context.route('https://maps.google.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'Map placeholder for browser test'}));
  const admin=await context.newPage();admin.setDefaultTimeout(25000);
  const errors=[];admin.on('pageerror',error=>errors.push(error.message));
  await admin.addInitScript(()=>localStorage.setItem('bluecrest-logistics-admin-session','support@bluecrestshipping.com'));
  await admin.goto(`${baseUrl}/admin?admin=1`);
  await admin.getByRole('button').filter({hasText:code}).first().click();
  const editor=admin.locator('form').filter({has:admin.getByRole('heading',{name:'Edit tracking information'})});
  await expect(editor).toBeVisible();
  const visitor=await context.newPage();visitor.setDefaultTimeout(25000);visitor.on('pageerror',error=>errors.push(error.message));
  await visitor.goto(`${baseUrl}/trackingresult?code=${code}`);
  await expect(visitor.getByRole('heading',{name:'Sender Information'})).toBeVisible();
  await expect(visitor.getByText('No shipment history has been recorded yet.')).toBeVisible();
  console.log('PASS legacy shipment renders with missing-field placeholders');
  for(const summary of ['Sender information','Receiver contact','Parcel details & fees','Progress milestone dates','Shipment history (0)','Complete shipment route (0 stops)'])await editor.locator('summary').filter({hasText:summary}).click();
  for(const [label,value] of Object.entries({'Receiver name':'Updated receiver','Receiver email':'updated@example.com','Sender name':'Test sender','Sender address':'Dubai warehouse','Sender phone':'+10000000000','Sender email':'sender@example.com','Receiver address':'London receiving address','Receiver phone':'+20000000000','Weight (kg)':'12.5','Shipment type':'Parcel','Delivery mode':'Air freight','Duty fees':'80','Fee name':'Storage Fee','Fee amount':'500','Currency (e.g. USD)':'USD','Estimated distance':'5,900 km','Tracking note':'Please call before delivery.'}))await editor.getByLabel(label,{exact:true}).fill(value);
  await editor.getByLabel('Current status',{exact:true}).selectOption('On The Way');
  await editor.getByLabel('Show verified badge').check();
  for(const label of ['Shipped date','Pickup date','Order Confirmed date','Picked by Courier date','On The Way date'])await editor.getByLabel(label,{exact:true}).fill('2026-09-15T10:00');
  await editor.getByLabel('Expected delivery',{exact:true}).fill('2026-10-10T14:00');
  await editor.getByLabel('Last updated',{exact:true}).fill('2026-09-15T12:30');
  await editor.getByRole('button',{name:'+ Add history event',exact:true}).click();
  await editor.getByLabel('Event description',{exact:true}).fill('Parcel reached the Rome transfer hub.');
  await editor.getByLabel('Event location',{exact:true}).fill('Rome, Italy');
  const route=[['Dubai',25.2048,55.2708,'origin'],['Rome',41.9028,12.4964,'current'],['London',51.5074,-0.1278,'destination']];
  for(const [label,latitude,longitude,kind] of route){await editor.getByRole('button',{name:'+ Add route stop',exact:true}).click();const field=editor.getByRole('group',{name:/^Route stop/}).last();await field.getByLabel('Stop name',{exact:true}).fill(label);await field.getByLabel('Latitude',{exact:true}).fill(String(latitude));await field.getByLabel('Longitude',{exact:true}).fill(String(longitude));await field.getByLabel('Marker type',{exact:true}).selectOption(kind);}
  await editor.getByRole('button',{name:'Save shipment details',exact:true}).click();
  await expect(editor.getByRole('status')).toContainText('Shipment details saved.');
  const record=await readRecord();
  for(const key of ['senderName','senderAddress','senderPhone','senderEmail','receiverAddress','receiverPhone','weight','shipmentType','deliveryMode','shippedAt','pickupAt','dutyFees','feeName','clearanceFee','currency','estimatedDistance','milestoneDates','history','routeStops'])if(!record[key])throw Error(`Missing persisted field: ${key}`);
  if(record.routeStops.length!==3||record.history.length!==2||record.verified!==true||record.status!=='On The Way')throw Error('Saved values differ from editor');
  await expect(visitor.getByText('Test sender',{exact:true})).toBeVisible();
  await expect(visitor.getByText('Parcel reached the Rome transfer hub.',{exact:true})).toBeVisible();
  await expect(visitor.getByRole('img',{name:'Shipment route: Dubai to Rome to London',exact:true})).toBeVisible();
  await expect(visitor.getByRole('link',{name:'Pay Storage Fee ($500.00)' })).toHaveAttribute('href',/https:\/\/wa.me\/19152019157/);
  await expect(visitor.getByRole('link',{name:'Pay Storage Fee ($500.00)',exact:true})).toBeVisible();
  if(!record.history.some(event=>event.source==='automatic' && event.description.includes('Status updated to On The Way.')))throw Error('Automatic status history missing');
  console.log('PASS automatic admin activity history');
  console.log('PASS all tracking fields persist in Firebase and update the visitor live');
  await editor.getByLabel('Tracking number',{exact:true}).fill(`${code}-EDIT`);
  await editor.getByRole('button',{name:'Save shipment details',exact:true}).click();
  await expect(editor.getByRole('status')).toContainText('Shipment details saved.');
  await visitor.goto(`${baseUrl}/track?code=${code}-EDIT`);
  await expect(visitor.locator('.tracking-number strong')).toHaveText(`${code}-EDIT`);
  console.log('PASS editable tracking number and trackingresult route');
  await mkdir('artifacts',{recursive:true});
  await visitor.screenshot({path:'artifacts/tracking-details-desktop.png',fullPage:true});
  await visitor.setViewportSize({width:390,height:844});
  if(await visitor.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile tracking overflow');
  await visitor.screenshot({path:'artifacts/tracking-details-mobile.png',fullPage:true});
  await visitor.evaluate(()=>{window.print=()=>{window.__printed=true;};});
  await visitor.getByRole('button',{name:'Print Receipt'}).click();
  if(!await visitor.evaluate(()=>window.__printed))throw Error('Print button did not invoke printing');
  await visitor.emulateMedia({media:'print'});
  await expect(visitor.locator('.tracking-search')).toBeHidden();
  await expect(visitor.getByRole('heading',{name:'Parcel Information'})).toBeVisible();
  await visitor.emulateMedia({media:'screen'});
  await admin.setViewportSize({width:390,height:844});
  await admin.getByLabel('Admin dashboard',{exact:true}).selectOption('details');
  await expect(editor).toBeVisible();
  if(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile admin overflow');
  await editor.getByRole('button',{name:'Remove event 1',exact:true}).click();
  await editor.getByRole('button',{name:'Remove stop 3',exact:true}).click();
  await editor.getByRole('button',{name:'Save shipment details',exact:true}).click();
  await expect(editor.getByRole('status')).toContainText('Shipment details saved.');
  await expect(visitor.getByText(/Shipment route, Shipment history updated/)).toBeVisible();
  const final=await readRecord();if(final.history.some(event=>event.description==='Parcel reached the Rome transfer hub.')||final.routeStops.length!==2)throw Error('History / route deletion did not persist');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS mobile layouts, print action, and history / route removal');
} finally {
  if(browser)await browser.close();
  const response=await fetch(endpoint,{method:'DELETE'});
  if(!response.ok&&response.status!==404)throw Error(`Fixture cleanup failed (${response.status})`);
  console.log('Temporary tracking fixture removed.');
}
