import { useState } from 'react';
import { getBrandLogoUrl, getInitialsColor } from '@/lib/brandLogos';

interface Props {
  name: string;
  domain?: string | null;
  size?: number;
  className?: string;
}

export function MerchantLogo({ name, domain, size = 40, className = '' }: Props) {
  const [imgError, setImgError] = useState(false);

  // Priority: explicit domain > auto-detected from name
  const logoUrl = domain
    ? `https://logo.clearbit.com/${domain}`
    : getBrandLogoUrl(name);

  const dim = { width: size, height: size };

  if (logoUrl && !imgError) {
    return (
      <div
        className={`rounded-full overflow-hidden flex items-center justify-center bg-white shrink-0 ${className}`}
        style={dim}
      >
        <img
          src={logoUrl}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  const initial = name?.[0]?.toUpperCase() || '?';
  const colors = getInitialsColor(name || '');
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${colors.bg} ${colors.text} ${className}`}
      style={{ ...dim, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </div>
  );
}
