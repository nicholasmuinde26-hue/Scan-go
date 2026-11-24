import React, { useEffect, useState } from 'react';
import { ScanGoMark } from './ScanGoLogo.js';
import { ShieldCheck, Cloud, RefreshCw, ArrowRight } from 'lucide-react';

interface AppSplashScreenProps {
  statusText?: string;
  onRetry?: () => void;
  onBypass?: () => void;
}

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({
  statusText = 'Connecting to store services...',
  onRetry,
  onBypass,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isColdStart = elapsed >= 4;
  const isTakingLong = elapsed >= 12;

  // Calculate dynamic progress indication (interpolates smoothly towards 95%)
  const progressPercent = Math.min(15 + elapsed * 8, 92);

  return (
    <div className="relative min-h-screen w-full bg-[#071739] text-white flex flex-col items-center justify-between p-6 overflow-hidden select-none font-sans">
      {/* Background ambient lighting effects */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-azure-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top spacer */}
      <div className="w-full flex justify-between items-center max-w-sm pt-4 opacity-70">
        <span className="text-[11px] font-mono tracking-wider text-slate-400">SMART RETAIL v1.0</span>
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>SECURE SYSTEM</span>
        </div>
      </div>

      {/* Center Branding & Progress */}
      <div className="w-full max-w-sm flex flex-col items-center text-center my-auto space-y-7 z-10">
        {/* Animated Cart Emblem */}
        <div className="relative">
          {/* Pulsing glow aura */}
          <div className="absolute -inset-4 bg-gradient-to-tr from-brand-500/30 to-azure-500/30 rounded-3xl blur-xl animate-pulse" />
          
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-b from-[#142952] to-[#0A1A3A] p-5 shadow-2xl border border-slate-700/60 flex items-center justify-center">
            <ScanGoMark className="w-full h-full text-brand-400 filter drop-shadow-[0_4px_12px_rgba(75,168,46,0.35)]" />
          </div>

          {/* Smooth spinning ring around emblem */}
          <div className="absolute -inset-2.5 rounded-[2rem] border-2 border-transparent border-t-brand-400/80 border-r-azure-400/40 animate-spin [animation-duration:2.5s] pointer-events-none" />
        </div>

        {/* Wordmark & Tagline */}
        <div className="space-y-1.5">
          <h1 className="text-3xl sm:text-4xl font-black italic tracking-tight text-white drop-shadow-md">
            Scan <span className="text-brand-400 not-italic font-black">&amp; Go</span>
          </h1>
          <p className="text-xs sm:text-sm font-semibold tracking-wide text-slate-300">
            Scan. Pay. Verify. Go.
          </p>
        </div>

        {/* Progress & Live Status Box */}
        <div className="w-full bg-[#0D1F45]/90 border border-slate-700/70 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl space-y-3.5">
          {/* Progress Bar */}
          <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
            <div
              className="h-full bg-gradient-to-r from-brand-500 via-emerald-400 to-azure-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(75,168,46,0.6)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Status text */}
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 min-h-[20px]">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
            <span>{statusText}</span>
          </div>

          {/* Render cold-start explanation if server is waking up */}
          {isColdStart && (
            <div className="pt-2 border-t border-slate-800/80 flex items-start gap-2 text-left text-[11px] text-amber-300/90 animate-fadeIn">
              <Cloud className="w-4 h-4 shrink-0 text-amber-400 animate-pulse mt-0.5" />
              <span>
                Waking up cloud store services from sleep. Free-tier servers may take up to 30 seconds on initial boot.
              </span>
            </div>
          )}
        </div>

        {/* Action fallback buttons if taking exceptionally long */}
        {isTakingLong && (
          <div className="flex flex-col sm:flex-row gap-2 w-full pt-1 animate-fadeIn">
            {onBypass && (
              <button
                onClick={onBypass}
                className="flex-1 flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg shadow-brand-600/30"
              >
                <span>Continue to Shop</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs border border-slate-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer reassurance badges */}
      <div className="w-full max-w-sm flex items-center justify-center gap-3 text-[11px] text-slate-400/90 pb-2">
        <div className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Anti-Fraud Protected</span>
        </div>
        <span className="text-slate-600">•</span>
        <span>TLS 1.3 Encrypted</span>
        <span className="text-slate-600">•</span>
        <span>Kenya DPA Compliant</span>
      </div>
    </div>
  );
};
