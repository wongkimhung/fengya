import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locale } from './i18n/ui';

function loadSiteData() {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/site.json'), 'utf8')) as any;
  } catch {
    return {};
  }
}

export const SITE_CONFIG = loadSiteData();

function loadContactData() {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/contact.json'), 'utf8')) as any;
  } catch {
    return {};
  }
}

const CONTACT_CONFIG = loadContactData();

/** Site-level constants (based on reference site karfanjara.ge contact info + our brand settings) */
export const SITE = {
  name: SITE_CONFIG.brand?.name || 'Karfanjara Hilux',
  nameZh: SITE_CONFIG.brand?.nameZh || '卡凡贾拉 · 高端门窗',
  nameEs: SITE_CONFIG.brand?.nameEs || 'Karfanjara Hilux · Ventanas premium',
  logo: SITE_CONFIG.brand?.logo || '/images/karfanjara/hilux-logo.png',
  // Static asset domain (Cloudflare R2 bound CDN domain). Local dev falls back to /uploads.
  // After deploying to Cloudflare Pages, sync public/uploads to R2 and bind assets.karfanjara.ge.
  mediaBase: process.env.MEDIA_BASE || '',
  phone: CONTACT_CONFIG.phone || '+995599181879',
  whatsapp: CONTACT_CONFIG.whatsapp || '995599181879',
  email: CONTACT_CONFIG.email || 'hiluxpvc@yahoo.com',
  address: {
    en: CONTACT_CONFIG.addressEn || 'Tbilisi and surrounding area, Georgia',
    zh: CONTACT_CONFIG.addressZh || '第比利斯及周边地区，格鲁吉亚',
    es: CONTACT_CONFIG.addressEs || 'Tiflis y alrededores, Georgia',
  },
  social: {
    facebook: CONTACT_CONFIG.facebook || 'https://www.facebook.com/KarfanjaraHilux',
    instagram: CONTACT_CONFIG.instagram || 'https://www.instagram.com/karfanjara_hilux/',
    tiktok: CONTACT_CONFIG.tiktok || 'https://www.tiktok.com/@karfanjara_hilux',
    youtube: CONTACT_CONFIG.youtube || 'https://www.youtube.com/@KarfanjaraHilux',
  },
  // Cloudflare Turnstile site key (public, safe for frontend). Key configured in Pages environment variables.
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '0x4AAAAAAA_example_public_sitekey',
  // 通用表单接口：独立 Cloudflare Worker，Cloudflare Pages 与 EdgeOne Pages 两个站点共用。
  // 构建时可用 FORM_ENDPOINT 覆盖（不含路径），默认指向 Worker 域名。
  formEndpoint: (process.env.FORM_ENDPOINT || 'https://form.karfanjara.workers.dev').replace(/\/+$/, ''),
};

export type NavItem = { key: string; href: (locale?: Locale) => string };

/** Main navigation — single-page anchors matching reference site karfanjara.ge/en/
 *  Structure: Logo(Home→#top) | Why Us(#why) | Products(#products) | Projects(#projects) | FAQ(#faq)
 *  Free Quote button links to #contact separately in Header.
 */
export const NAV: NavItem[] = [
  { key: 'nav.whyUs', href: () => '#why' },
  { key: 'nav.products', href: () => '#products' },
  { key: 'nav.projects', href: () => '#projects' },
  { key: 'nav.news', href: (locale = 'en') => locale === 'en' ? '/articles/' : `/${locale}/articles/` },
  { key: 'nav.faq', href: () => '#faq' },
];

/** 结合 mediaBase 生成资源 URL（本地回退到 /uploads 相对路径） */
export function asset(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  const base = SITE.mediaBase.replace(/\/+$/, '');
  if (base) return base + (path.startsWith('/') ? path : '/' + path);
  return path;
}
