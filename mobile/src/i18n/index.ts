import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { en, type Dictionary } from './en';
import { hi } from './hi';

export const dictionaries = { en, hi } as Record<string, Dictionary>;
export const LANGUAGES = [{ code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' }] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];
export type Key = keyof Dictionary;

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: 'en',
  setLang: (lang) => { set({ lang }); AsyncStorage.setItem('lang', lang).catch(() => {}); },
}));

export async function loadLang() {
  const saved = await AsyncStorage.getItem('lang').catch(() => null);
  if (saved && saved in dictionaries) useLang.setState({ lang: saved as Lang });
}

type Params = Record<string, string | number>;

/** Pure translate function (usable outside components). `{name}` placeholders are replaced from params. */
export function translate(lang: string, key: Key, params?: Params): string {
  const raw = dictionaries[lang]?.[key] ?? en[key] ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : raw;
}

export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: Key, params?: Params) => translate(lang, key, params);
}
