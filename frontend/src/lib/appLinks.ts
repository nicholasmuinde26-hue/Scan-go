// Smart "Get the app" links for the Scan & Go mobile app.
//
// Platform behaviour:
//  - Android phone  → Google Play listing (market:// intent) with a direct
//                     APK download fallback hosted by our backend.
//  - iPhone         → App Store / TestFlight link.
//  - Desktop/laptop → the website itself is installable as a PWA; the
//                     component triggers the browser's install prompt.
//
// Update the constants below once the app is published / the APK is hosted.

export const APP_STORE_URL =
  import.meta.env.VITE_APP_IOS_URL || 'https://apps.apple.com/app/scan-and-go';

// Direct APK download served by the backend at GET /api/v1/app/download
// (place the built APK in backend/downloads/scan-go.apk).
export const APK_DOWNLOAD_URL =
  import.meta.env.VITE_APP_APK_URL || '/api/v1/app/download';

export const PLAY_STORE_URL =
  import.meta.env.VITE_APP_ANDROID_URL ||
  'https://play.google.com/store/apps/details?id=com.nickiied.mobilescanandgo';

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

// Try the Play Store app first; if the listing doesn't exist the browser
// stays put and we can fall back to the APK download.
export function openPlayStore() {
  const market = `market://details?id=com.nickiied.mobilescanandgo`;
  // intent:// URL opens Play Store app when installed, else falls back.
  window.location.href =
    `intent://details?id=com.nickiied.mobilescanandgo#Intent;scheme=market;package=com.android.vending;end`;
  // If the intent fails (no Play Store), the page won't navigate — the
  // caller can then offer the APK link. We can't reliably detect failure,
  // so the UI shows both options on Android.
  void market;
}
