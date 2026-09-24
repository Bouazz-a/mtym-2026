import type { CSSProperties, ReactNode } from "react";

// Inline SVG icons — the app ships no icon library. Stroked in the current
// text color and decorative (aria-hidden): the control around them carries
// the accessible name.

export interface IconProps {
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

// Empty states: what the page would list

export type IconComponent = (p: IconProps) => ReactNode;

export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
);

export const DocumentIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <polyline points="14 3 14 8 19 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="13" y2="17" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="16" y1="3" x2="16" y2="7" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="3" y1="11" x2="21" y2="11" />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><line x1="20.5" y1="20.5" x2="16" y2="16" /></Icon>
);
