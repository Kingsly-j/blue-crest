import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const password=(await readFile('.env','utf8')).match(/^BLUECREST_SUPER_ADMIN_PASSWORD=(.+)$/m)?.[1].trim();
const browser=await chromium.launch({channel:'msedge'});
try {
 const context=await browser.newContext();
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());
 const page=await context.newPage();
 await page.goto('http://localhost:3000/');
 await expect(page.locator('.review-rating').first()).toHaveText('\u2605'.repeat(5));
 for(const width of [360,390,768,1024]) {
  await page.setViewportSize({width,height:900});
  await page.goto('http://localhost:3000/admin?admin=1');
  if(await page.getByRole('button',{name:'Login',exact:true}).isVisible()) {
   await page.getByLabel('Email',{exact:true}).fill('support@bluecrestshipping.com');
   await page.getByLabel('Password',{exact:true}).fill(password);
   await page.getByRole('button',{name:'Login',exact:true}).click();
  }
  await expect(page.locator('.admin-dashboard')).toBeVisible();
  for(const section of ['overview','create','records','details','admins']) {
   if(await page.locator('#dashboard-section').isVisible())await page.locator('#dashboard-section').selectOption(section);
   if(section==='details' && width>=1024)continue;
   await expect(page.locator(`[data-dashboard-panel="${section}"]`)).toBeVisible();
   if(section==='create')await page.locator('[data-dashboard-panel="create"] details').evaluateAll(elements=>elements.forEach(element=>element.open=true));
   const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('main *, .admin-dashboard *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>e.tagName+'.'+e.className)}));
   if(overflow.scroll>width)throw Error(JSON.stringify({section,...overflow}));
  }
  console.log(`PASS admin sections at ${width}px`);
 }
 console.log('PASS actual star characters and direct admin login link');
}finally{await browser.close();}
