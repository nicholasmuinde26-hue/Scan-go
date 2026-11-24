import React from 'react';

/**
 * Scan & Go brand mark: green shopping cart with motion lines + italic wordmark.
 * Brand colors: navy #0E2A5C, green #4BA82E, blue #1E6FD9 (see tailwind brand palette).
 * Use tone="onDark" on navy / dark backgrounds.
 */
export const ScanGoMark: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg viewBox="-130 0 642 512" className={className} role="img" aria-label="Scan & Go cart" fill="none">
    <g className="text-brand-500" style={{ color: '#4BA82E' }}>
      <path d="M-105 150H-30M-85 215H-20M-105 280H-45" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
<path d="M92 58H476Q510 58 503 92L468 240Q456 284 410 284H136Z" fill="currentColor"/>
      <path d="M28 50H62Q82 50 90 72L132 300Q142 346 182 346H438" fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="155" cy="440" r="44" fill="currentColor"/><circle cx="413" cy="440" r="44" fill="currentColor"/>
    </g>
  </svg>
);

export const ScanGoLogo: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  subtitle?: boolean;
  tone?: 'default' | 'onDark';
}> = ({ size = 'md', subtitle = true, tone = 'default' }) => {
  const iconSizes = { sm: 'h-6 w-8', md: 'h-8 w-10', lg: 'h-12 w-14' };
  const textSizes = { sm: 'text-base', md: 'text-xl', lg: 'text-2xl' };
  const onDark = tone === 'onDark';

  return (
    <div className="flex items-center space-x-2">
      <div className={`${iconSizes[size]} flex-shrink-0`}>
        <ScanGoMark />
      </div>

      <div className="flex flex-col">
        <span className={`${textSizes[size]} font-extrabold italic tracking-tight leading-none ${onDark ? 'text-white' : 'text-navy-700'}`}>
          Scan <span className="text-brand-500">&amp; Go</span>
        </span>
        {subtitle && (
          <span className={`text-[10px] tracking-wide font-semibold mt-0.5 ${onDark ? 'text-navy-200' : 'text-navy-500'}`}>
            Scan. Pay. Verify. Go.
          </span>
        )}
      </div>
    </div>
  );
};
