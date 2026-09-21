import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { load } from 'cheerio';
import { renderTestimonials } from './testimonials.mjs';

// One-time import. Remote scripts and form endpoints are not retained.
const pages = ['home', 'about', 'services', 'order', 'contact', 'diplomatic'];
const assets = new Map();
await mkdir('app/content', { recursive: true });
await mkdir('public/reference', { recursive: true });
function localAsset(value) {
  if (!value || value.startsWith('data:')) return value;
  if (value.endsWith('customer-service.svg')) return '/reference/service-right-1.jpg';
  const url = new URL(value, 'https://jmlogistictrace.com/');
  const local = `/reference/${url.pathname.split('/').pop()}`;
  assets.set(url.href, local);
  return local;
}
for (const page of pages) {
  const source = await readFile(page === 'home' ? 'reference.html' : `reference/${page}.html`, 'utf8');
  const $ = load(source);
  $('script, #preloader, iframe, input[name="_token"], .gtranslate_wrapper').remove();
  $('*').each((_, el) => {
    for (const name of Object.keys(el.attribs || {})) if (/^on/i.test(name)) $(el).removeAttr(name);
  });
  $('img, source').each((_, el) => $(el).attr('src', localAsset($(el).attr('src'))));
  $('[style]').each((_, el) => $(el).attr('style', $(el).attr('style').replace(/url\(['"]?([^)'"\s]+)['"]?\)/g, (_, url) => `url('${localAsset(url)}')`)));
  $('video').attr('playsinline', '').attr('poster', '/reference/home-main.jpg');
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (/^(about|services|order|contact|diplomatic)(#.*)?$/.test(href)) $(el).attr('href', `/${href}`);
    if (href === '#') $(el).replaceWith(`<span class="${$(el).attr('class') || ''}">${$(el).html()}</span>`);
  });
  $('form').each((_, el) => {
    const tracking = $(el).find('[name="trackingnumber"]').length > 0;
    $(el).attr('data-form-kind', tracking ? 'tracking' : 'contact').attr('action', tracking ? '/order' : '/contact').attr('method', 'get');
    $(el).append('<p class="form-feedback mt-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-900" role="status" tabindex="-1" hidden></p>');
  });
  $('input:not([type="hidden"]), textarea, select').each((i, el) => {
    if (!$(el).attr('aria-label')) $(el).attr('aria-label', $(el).attr('placeholder') || $(el).attr('name') || `Field ${i + 1}`);
  });
  $('button').each((_, el) => {
    if (!$(el).attr('type')) $(el).attr('type', 'button');
    const action = $(el).attr('@click') || '';
    const activeMatch = action.match(/active === (\d+)/);
    if (activeMatch) $(el).attr(':aria-expanded', `active === ${activeMatch[1]}`);
    if (action.includes('mobileMenuOpen')) $(el).attr(':aria-expanded', 'mobileMenuOpen');
    if (!$(el).text().trim()) $(el).attr('aria-label', $(el).attr('@click')?.includes('mobileMenu') ? 'Toggle navigation' : $(el).attr('@click')?.includes('currentSlide') ? 'Change slide' : 'Toggle options');
  });
  $('[x-data="{ open: false }"]').first().find('button').first().attr('@click', 'open = !open').attr(':aria-expanded', 'open');
  $('.stat-number').removeClass('opacity-0 translate-y-4');
  $('#currentYear').text(String(new Date().getFullYear()));
  $('[x-init]').removeAttr('x-init');
  $('[x-collapse]').removeAttr('x-collapse');
  $('[x-data]').each((_, el) => {
    if ($(el).attr('x-data').includes('currentSlide')) $(el).attr('data-carousel', 'slides');
    if ($(el).attr('x-data').includes('currentImage')) $(el).attr('data-carousel', 'images');
  });
  if (page === 'home') $('h2').filter((_, el) => $(el).text().trim() === 'What Our Clients Say').closest('section').replaceWith(renderTestimonials());
  const brandedHtml = $('body').html()
    .replaceAll('JM Logistic Trace', 'Bluecrest Logistics')
    .replaceAll('Support@jmlogistictrace.com', 'support@bluecrestshipping.com');
  await writeFile(`app/content/${page}.html`, `<div x-data="{ mobileMenuOpen: false, searchOpen: false }">${brandedHtml}</div>`);
}
await writeFile('reference/assets.json', JSON.stringify([...assets].map(([url, local]) => ({url, path: `public${local}`})), null, 2));
console.log(`Imported ${pages.length} pages; ${assets.size} assets ready to download.`);
