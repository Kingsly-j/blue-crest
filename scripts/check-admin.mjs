import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const password = (await readFile('.env','utf8')).match(/^BLUECREST_SUPER_ADMIN_PASSWORD=(.+)$/m)?.[1].trim();
const browser = await chromium.launch({channel:'msedge'});
try {
  const context = await browser.newContext();
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if(host === 'localhost') return route.continue();
    if(host.endsWith('.supabase.co')) return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'})});
    return route.abort();
  });
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:3000/admin?admin=1');
  await page.getByLabel('Email',{exact:true}).fill('support@bluecrestshipping.com');
  await page.getByLabel('Password',{exact:true}).fill('wrong-password');
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await expect(page.getByText('Invalid admin email or password.')).toBeVisible();
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await expect(page.getByRole('heading',{name:'New cargo file'})).toBeVisible();
  await expect(page.getByText(/Firebase (did not confirm|is unavailable)/).filter({visible:true})).toBeVisible({timeout:20000});
  console.log('PASS browser login and visible Firebase load error');
  await page.getByLabel('Admin email',{exact:true}).fill('test-operator@example.com');
  await page.getByLabel('Temporary password',{exact:true}).fill('Operator-Test-123!');
  await page.getByRole('button',{name:'Add admin account'}).click();
  await expect(page.getByText('Admin added: test-operator@example.com').filter({visible:true})).toBeVisible();
  const form = page.locator('form').filter({has:page.getByRole('heading',{name:'New cargo file'})});
  await form.getByLabel('Receiver name',{exact:true}).fill('Verification customer');
  await form.locator('input[type=file]').setInputFiles('public/testimonials/portrait-1.jpg');
  await form.getByRole('button',{name:'Create and generate code'}).click();
  await expect(page.getByText(/new row violates row-level security policy/).filter({visible:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Copy code'})).toHaveCount(0);
  console.log('PASS denied photo upload shows error and does not create a shipment');
  await form.locator('input[type=file]').setInputFiles([]);
  await form.getByRole('button',{name:'Create and generate code'}).click();
  await expect(page.getByText(/Firebase (did not confirm|is unavailable)/).filter({visible:true})).toBeVisible({timeout:20000});
  await expect(page.getByRole('button',{name:'Copy code'})).toHaveCount(0);
  await expect(form.getByLabel('Receiver name',{exact:true})).toHaveValue('Verification customer');
  if(await page.evaluate(()=>localStorage.getItem('bluecrest-logistics-shipments'))) throw Error('Failed save was persisted as a local shipment');
  if(errors.length) throw Error(errors.join('\n'));
  console.log('PASS failed Firebase writes preserve form data and never report a local shipment as saved');
} finally {await browser.close();}
