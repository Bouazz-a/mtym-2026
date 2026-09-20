import type { CSSProperties, ReactNode } from "react";

// Inline SVG icons — the app ships no icon library. Stroked in the current
// text color and decorative (aria-hidden): the control around them carries
// the accessible name.

interface IconProps {
  /** CSS length, in rem so the icon follows the page scale */
  size?: string;
  style?: CSSProperties;
}

function Icon({ size = "0.875rem", style, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ width: size, height: size, flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  );
}

export const ChevronDownIcon = (p: IconProps) => <Icon {...p}><polyline points="6 9 12 15 18 9" /></Icon>;

export const ChevronLeftIcon = (p: IconProps) => <Icon {...p}><polyline points="15 18 9 12 15 6" /></Icon>;

export const FunnelIcon = (p: IconProps) => <Icon {...p}><polygon points="3 4 21 4 14 12.5 14 19 10 21 10 12.5 3 4" /></Icon>;

export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" /></Icon>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="6 13 12 19 18 13" /></Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 4v11" /><polyline points="7 10 12 15 17 10" /><path d="M5 20h14" /></Icon>
);

export const SwapIcon = (p: IconProps) => (
  <Icon {...p}><polyline points="16 3 20 7 16 11" /><path d="M20 7H4" /><polyline points="8 21 4 17 8 13" /><path d="M4 17h16" /></Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></Icon>
);
