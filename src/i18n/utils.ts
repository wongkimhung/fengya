import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ui, type Locale } from './ui';

type JsonRecord = Record<string, any>;

function readSiteTranslations(): JsonRecord {
  try {
    const file = resolve(process.cwd(), 'public/data/site.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed?.translations ?? {};
  } catch {
    return {};
  }
}

function flatten(value: JsonRecord, prefix = '', out: Record<string, string> = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[path] = child;
    else if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
  }
  return out;
}

const siteTranslations = readSiteTranslations();

export function isLocale(value: string): value is Locale {
  return value === 'en' || value === 'zh' || value === 'es';
}

/** 返回当前语言下的翻译函数 t(key) */
export function useTranslations(locale: Locale) {
  const dict = {
    ...(ui[locale] ?? ui.en),
    ...flatten(siteTranslations[locale] ?? {}),
  } as Record<string, string>;
  return function t(key: keyof (typeof ui)['en'] | string): string {
    return dict[key] ?? (ui.en as Record<string, string>)[key] ?? key;
  };
}

/** Prefix a site-relative path for the requested locale (English is the default root locale). */
export function localePath(locale: Locale, path: string): string {
  const clean = `/${path.replace(/^\/+/, '')}`;
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return `${prefix}${clean === '/' ? '/' : clean}`;
}

/** 根据当前路径生成对应语言版本的链接（用于语言切换器） */
export function getAlternatePath(pathname: string, target: Locale): string {
  const segments = pathname.split('/').filter(Boolean);
  if (['zh', 'es'].includes(segments[0] ?? '')) segments.shift();
  if (target !== 'en') {
    segments.unshift(target);
  }
  if (!segments.length) {
    return target === 'en' ? '/' : `/${target}/`;
  }
  if (target === 'en' && segments[0] === 'en') {
    segments.shift();
  }
  return segments.length ? `/${segments.join('/')}/` : '/';
}
