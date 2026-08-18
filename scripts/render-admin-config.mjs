import { mkdir, readFile, writeFile } from 'node:fs/promises';

const templateUrl = new URL('../public/admin/config.yml', import.meta.url);
const outputUrl = new URL('../dist/admin/config.yml', import.meta.url);
const template = await readFile(templateUrl, 'utf8');
const rawBaseUrl = process.env.DECAP_AUTH_BASE_URL?.trim();

let injectedLine = '  # base_url is omitted because DECAP_AUTH_BASE_URL is not set for this build.';

if (rawBaseUrl) {
  let parsed;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error('DECAP_AUTH_BASE_URL must be a valid https:// URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('DECAP_AUTH_BASE_URL must use https://.');
  }
  if (parsed.hostname.endsWith('.pages.dev')) {
    throw new Error('DECAP_AUTH_BASE_URL must point to the OAuth Worker, not a Cloudflare Pages site (*.pages.dev).');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('DECAP_AUTH_BASE_URL must be the Worker origin without a path, query, or hash.');
  }
  injectedLine = `  base_url: ${JSON.stringify(parsed.origin)}`;
} else {
  console.warn('[admin-config] DECAP_AUTH_BASE_URL is not set; production GitHub OAuth will be incomplete.');
  if (process.env.CF_PAGES === '1') {
    throw new Error('DECAP_AUTH_BASE_URL is required for Cloudflare Pages builds.');
  }
}

if (!template.includes('  # __DECAP_AUTH_BASE_URL__')) {
  throw new Error('The admin config template is missing the DECAP_AUTH_BASE_URL placeholder.');
}

const rendered = template.replace('  # __DECAP_AUTH_BASE_URL__', injectedLine);
await mkdir(new URL('../dist/admin/', import.meta.url), { recursive: true });
await writeFile(outputUrl, rendered, 'utf8');

console.log(
  rawBaseUrl
    ? `[admin-config] Injected Decap OAuth base_url from DECAP_AUTH_BASE_URL into ${outputUrl.pathname}`
    : `[admin-config] Generated ${outputUrl.pathname} without a production OAuth base_url`
);
