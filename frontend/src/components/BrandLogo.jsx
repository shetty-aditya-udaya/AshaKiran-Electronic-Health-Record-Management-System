import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * BrandLogo - Unified AshaKiran Branding Component
 *
 * Supports:
 * - Size variants: 'sm' | 'md' | 'lg'
 * - Mode: 'light' (dark text for light bg) | 'dark' (light text for dark bg)
 * - Compact mode (icon only)
 * - Custom Tagline display
 * - Responsive sizing and clean typography
 */
export default function BrandLogo({
  size = 'md',
  mode = 'light',
  showTagline = false,
  compact = false,
  className = ''
}) {
  const { t } = useTranslation();
  // Determine sizing for logo image and typography
  let imageClass = 'h-10 w-10'; // default md (40px)
  let titleClass = 'text-xl';
  let tagClass = 'text-[10px]';

  if (size === 'sm') {
    imageClass = 'h-[34px] w-[34px] md:h-[40px] md:w-[40px]'; // 34px mobile, 40px desktop
    titleClass = 'text-base md:text-lg';
    tagClass = 'text-[9px] md:text-[10px]';
  } else if (size === 'md') {
    imageClass = 'h-[38px] w-[38px] md:h-[45px] md:w-[45px]'; // 38px mobile, 45px desktop
    titleClass = 'text-lg md:text-xl';
    tagClass = 'text-[10px] md:text-[11px]';
  } else if (size === 'lg') {
    imageClass = 'h-16 w-16 md:h-20 md:w-20'; // 64px to 80px
    titleClass = 'text-2xl md:text-3xl';
    tagClass = 'text-xs md:text-sm';
  }

  // Determine colors based on mode
  const isDarkBg = mode === 'dark';
  const textColClass = isDarkBg ? 'text-white' : 'text-[#0F766E]';
  const spanColClass = isDarkBg ? 'text-[#F59E0B]' : 'text-[#F59E0B]'; // orange stays same
  const tagColClass = isDarkBg ? 'text-emerald-200/80' : 'text-slate-500';

  return (
    <div 
      className={`flex items-center gap-3 select-none py-1 px-3 md:px-5 ${className}`}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
    >
      {/* ── Logo Image ── */}
      <img
        src="/ashakiran-logo.png"
        alt="AshaKiran Logo"
        className={`${imageClass} object-contain rounded-xl transition-all duration-300 shadow-sm`}
        style={{ 
          flexShrink: 0, 
          imageRendering: 'auto' 
        }}
      />

      {/* ── Brand text branding ── */}
      {!compact && (
        <div className="flex flex-col justify-center text-left leading-none">
          <span 
            className={`${titleClass} font-extrabold tracking-tight ${textColClass}`}
            style={{ letterSpacing: '-0.02em' }}
          >
            Asha<span className={spanColClass}>Kiran</span>
          </span>
          {showTagline && (
            <span 
              className={`hidden md:inline-block ${tagClass} font-semibold tracking-wide ${tagColClass} mt-1`}
              style={{ letterSpacing: '0.01em' }}
            >
              {t('logoTagline', 'Care. Empower. Uplift.')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
