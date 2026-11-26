import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import {
  APK_DOWNLOAD_URL,
  APP_STORE_URL,
  PLAY_STORE_URL,
  isAndroidDevice,
  isIosDevice,
  isMobileDevice,
  openPlayStore,
} from '../lib/appLinks';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferredPrompt: BeforeInstallPromptEvent | null = null;

// Capture the browser's PWA install prompt once, app-wide.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export const triggerPwaInstall = async (): Promise<boolean> => {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
};

interface Props {
  className?: string;
  showLabel?: boolean;
}

/**
 * "Get the app" button. On phones it points at the real Scan & Go mobile
 * app (Play Store / App Store / direct APK). On laptops it installs the
 * website as a PWA via the browser's own install prompt.
 */
export const GetTheAppButton: React.FC<Props> = ({ className = '', showLabel = true }) => {
  const [open, setOpen] = useState(false);
  const [pwaAvailable, setPwaAvailable] = useState(false);
  const mobile = isMobileDevice();
  const android = isAndroidDevice();
  const ios = isIosDevice();

  useEffect(() => {
    const t = setInterval(() => setPwaAvailable(!!deferredPrompt), 1000);
    return () => clearInterval(t);
  }, []);

  const handleDesktopInstall = async () => {
    const ok = await triggerPwaInstall();
    if (!ok) {
      // No prompt available (already installed or unsupported browser) —
      // fall back to browser menu instructions.
      window.alert('To install: use your browser menu → "Install app" / "Add to Home screen".');
    }
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition whitespace-nowrap"
        aria-label="Get the mobile app"
      >
        <Smartphone className="w-4 h-4 text-brand-600" />
        {showLabel && <span className="hidden sm:inline">Get the app</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-black text-navy-800">Scan &amp; Go mobile app</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {mobile ? 'Get the real app on your phone' : 'Install the web app on this device'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {android && (
              <div className="space-y-2">
                <a
                  href={PLAY_STORE_URL}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-navy-800 text-white text-xs font-bold py-2.5 hover:bg-navy-700 transition"
                >
                  <Download className="w-4 h-4" /> Get it on Google Play
                </a>
                <a
                  href={APK_DOWNLOAD_URL}
                  className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 text-slate-700 text-xs font-bold py-2.5 hover:bg-slate-50 transition"
                >
                  <Download className="w-4 h-4" /> Download APK directly
                </a>
                <p className="text-[10px] text-slate-400 leading-snug">
                  APK install may ask you to allow "install unknown apps" once.
                </p>
              </div>
            )}

            {ios && (
              <a
                href={APP_STORE_URL}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-navy-800 text-white text-xs font-bold py-2.5 hover:bg-navy-700 transition"
              >
                <Download className="w-4 h-4" /> Download on the App Store
              </a>
            )}

            {!mobile && (
              <button
                onClick={handleDesktopInstall}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-600 text-white text-xs font-bold py-2.5 hover:bg-brand-700 transition"
              >
                <Download className="w-4 h-4" />
                {pwaAvailable ? 'Install web app' : 'How to install'}
              </button>
            )}

            {!mobile && !pwaAvailable && (
              <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                Use your browser menu (⋮ / ⋯) → "Install app" or "Add to Home screen".
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
