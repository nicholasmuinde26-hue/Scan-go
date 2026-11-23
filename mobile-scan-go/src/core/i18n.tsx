import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const en = {
  // Tabs
  tab_home: 'Home', tab_shop: 'Shop', tab_scan: 'Scan & Go', tab_orders: 'Orders', tab_account: 'Account',
  // Common
  loading: 'Loading…', retry: 'Retry', cancel: 'Cancel', confirm: 'Confirm', save: 'Save', done: 'Done',
  back: 'Back', search: 'Search', see_all: 'See all', add: 'Add', remove: 'Remove',
  error_generic: 'Something went wrong. Please try again.', offline_retry: "You're offline. Your saved basket is still available.",
  // Permissions
  perm_camera: 'Camera access lets you scan product barcodes and entrance posters.',
  perm_location: 'Location can help confirm which store entrance you are using.',
  perm_notifications: 'Notifications alert you when an order needs your attention.',
  // Account
  account_title: 'Account & Profile', sign_out: 'Sign out', sign_out_all: 'Sign out everywhere',
  help_support: 'Help & Customer Care', payment_mpesa: 'Payment & M-Pesa', preferences: 'Preferences & Support',
  language: 'Language', theme: 'Theme', dark_mode: 'Dark mode',
  // Shop
  add_to_basket: 'Add to basket', out_of_stock: 'Out of stock', only_left: 'Only {n} left',
  no_results: 'No products found', try_different: 'Try a different search or category.',
  // Orders
  orders_title: 'Your orders', orders_empty: 'Your orders will appear here.',
  // Checkout
  checkout: 'Checkout', place_order: 'Place order',
  // Feedback
  copied: 'Copied to clipboard',
} as const;

const sw: Record<keyof typeof en, string> = {
  tab_home: 'Nyumbani', tab_shop: 'Duka', tab_scan: 'Changanua', tab_orders: 'Oda', tab_account: 'Akaunti',
  loading: 'Inapakia…', retry: 'Jaribu tena', cancel: 'Ghairi', confirm: 'Thibitisha', save: 'Hifadhi', done: 'Imekamilika',
  back: 'Rudi', search: 'Tafuta', see_all: 'Ona zote', add: 'Ongeza', remove: 'Ondoa',
  error_generic: 'Hitilafu imetokea. Tafadhali jaribu tena.', offline_retry: 'Hauna mtandao. Kikapu chako kilichohifadhiwa bado kinapatikana.',
  perm_camera: 'Ruhusa ya kamera inakuwezesha kusoma misimbo ya bidhaa na mabango ya kuingia.',
  perm_location: 'Mahali husaidia kuthibitisha mlango wa duka unaotumia.',
  perm_notifications: 'Arifa zitakujulisha agizo lako linapohitaji umakini.',
  account_title: 'Akaunti na Wasifu', sign_out: 'Ondoka', sign_out_all: 'Ondoka kila mahali',
  help_support: 'Msaada na Huduma kwa Wateja', payment_mpesa: 'Malipo na M-Pesa', preferences: 'Mapendeleo na Msaada',
  language: 'Lugha', theme: 'Mandhari', dark_mode: 'Hali ya giza',
  add_to_basket: 'Ongeza kikapuni', out_of_stock: 'Hakuna stoo', only_left: 'Zimesalia {n} tu',
  no_results: 'Hakuna bidhaa zilizopatikana', try_different: 'Jaribu utafutaji au aina tofauti.',
  orders_title: 'Oda zako', orders_empty: 'Oda zako zitaonekana hapa.',
  checkout: 'Malipo', place_order: 'Weka oda',
  copied: 'Imenakiliwa',
};

export type Locale = 'en' | 'sw';
export type I18nKey = keyof typeof en;
export type TParams = Record<string, string | number>;

const LOCALE_KEY = 'app_locale';

const LocaleCtx = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: (k: I18nKey, p?: TParams) => string }>({
  locale: 'en', setLocale: () => {}, t: (k) => String(en[k]),
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((v) => { if (v === 'en' || v === 'sw') setLocaleState(v); }).catch(() => {});
  }, []);
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    AsyncStorage.setItem(LOCALE_KEY, l).catch(() => {});
  };
  const dict: Record<Locale, Record<string, any>> = { en, sw };
  const t = (k: I18nKey, p?: TParams) => {
    let v: any = dict[locale][k] ?? en[k];
    if (p) {
      Object.entries(p).forEach(([pk, pv]) => { v = v.replaceAll(`{${pk}}`, String(pv)); });
    }
    return String(v);
  };
  return <LocaleCtx.Provider value={{ locale, setLocale, t }}>{children}</LocaleCtx.Provider>;
}

export const useI18n = () => useContext(LocaleCtx);
// Backwards-compatible standalone helper (defaults to English when no provider).
export const t = (key: I18nKey, locale: Locale = 'en', p?: TParams) => {
  let v: any = (locale === 'sw' ? sw : en)[key];
  if (p) {
    Object.entries(p).forEach(([pk, pv]) => { v = String(v).replaceAll(`{${pk}}`, String(pv)); });
  }
  return String(v);
};
