import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
  showSubtitle?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Text-based Monogram / Icon for DialPulse.
 * Combines letterform 'D' with the Forest Green & Tomato Red pulse signal.
 */
export function LogoIcon({
  size = 'md',
  variant = 'light',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const isDark = variant === 'dark';
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${sizeClasses[size]} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full transition-transform duration-200"
      >
        <rect
          x="1"
          y="1"
          width="34"
          height="34"
          rx="10"
          fill={isDark ? '#114711' : '#FAF3ED'}
          stroke={isDark ? '#2E9E2E' : '#CBB5A4'}
          strokeWidth="1.5"
        />
        <path
          d="M10 10V26H16.5C21 26 24 23 24 18C24 13 21 10 16.5 10H10Z"
          stroke={isDark ? '#FAF3ED' : '#282820'}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 18H14.5L16 13.5L18.5 22.5L20.5 16.5L22 18H25"
          stroke={isDark ? '#FF6347' : '#228B22'}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * DialPulse Central CRM Brand Logo & Wordmark.
 */
export function Logo({
  size = 'md',
  variant = 'light',
  showSubtitle = true,
  className = '',
  onClick,
}: LogoProps) {
  const isDark = variant === 'dark';

  const typographySizes = {
    sm: {
      text: 'text-[17px]',
      bars: 'h-3.5',
    },
    md: {
      text: 'text-[20px]',
      bars: 'h-4',
    },
    lg: {
      text: 'text-[24px]',
      bars: 'h-5',
    },
  };

  const currentSize = typographySizes[size];

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center select-none group focus:outline-none ${className} ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-2.5">
        <LogoIcon size={size} variant={variant} />

        <div>
          <div className="flex items-center leading-none tracking-tight font-display">
            <span
              className={`font-extrabold ${currentSize.text} tracking-[-0.035em] transition-colors duration-150 ${
                isDark ? 'text-white' : 'text-[#282820]'
              }`}
            >
              Dial
            </span>
            <span
              className={`font-black ${currentSize.text} tracking-[-0.035em] ml-[1px] transition-colors duration-150 ${
                isDark ? 'text-[#E5C8B2]' : 'text-[#175E17]'
              }`}
            >
              Pulse
            </span>

            {/* Harmonic Waveform */}
            <div
              className={`inline-flex items-center gap-[2.5px] ml-2 self-center ${currentSize.bars}`}
              aria-hidden="true"
            >
              <span
                className={`w-[2.5px] h-[38%] rounded-full transition-all duration-200 ${
                  isDark ? 'bg-[#E5C8B2]/55' : 'bg-[#228B22]/45'
                }`}
              />
              <span
                className={`w-[2.5px] h-[75%] rounded-full transition-all duration-200 ${
                  isDark ? 'bg-[#E5C8B2]/85' : 'bg-[#228B22]/80'
                }`}
              />
              <span className="w-[2.5px] h-[100%] rounded-full bg-[#FF6347] transition-all duration-200" />
              <span
                className={`w-[2.5px] h-[55%] rounded-full transition-all duration-200 ${
                  isDark ? 'bg-[#E5C8B2]/70' : 'bg-[#228B22]/65'
                }`}
              />
            </div>

            <span
              className={`ml-2.5 text-[9px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-[6px] border ${
                isDark
                  ? 'bg-[#FF6347] text-[#282820] border-[#E65137]'
                  : 'bg-[#E6F2E6] text-[#175E17] border-[#228B22]/30'
              }`}
            >
              CENTRAL
            </span>
          </div>

          {showSubtitle && (
            <p
              className={`text-[10px] font-mono tracking-tight mt-0.5 ${
                isDark ? 'text-[#E5C8B2]/85' : 'text-[#5C554D]'
              }`}
            >
              Internal Platform Control Center
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
