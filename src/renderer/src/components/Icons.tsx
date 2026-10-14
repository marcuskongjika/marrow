import type { JSX, ReactNode } from 'react'

/**
 * A small set of 16px stroke icons. Inline SVG keeps them theme-aware
 * (`currentColor`) and avoids a font or sprite request.
 */

interface IconProps {
  size?: number
  className?: string
}

function Svg({
  children,
  size = 16,
  className,
  fill = false
}: IconProps & { children: ReactNode; fill?: boolean }): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function SidebarIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M6.25 2.75v10.5" />
    </Svg>
  )
}

export function SearchIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 13.5 13.5" />
    </Svg>
  )
}

export function SunIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M13.3 9.6A5.6 5.6 0 0 1 6.4 2.7a5.8 5.8 0 1 0 6.9 6.9Z" />
    </Svg>
  )
}

export function AutoThemeIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v11" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function CodeIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5.8 4.2 2.2 8l3.6 3.8M10.2 4.2 13.8 8l-3.6 3.8" />
    </Svg>
  )
}

export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4" />
    </Svg>
  )
}

export function ChevronUpIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 10 8 6l4 4" />
    </Svg>
  )
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 6l4 4 4-4" />
    </Svg>
  )
}

export function DocumentIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9 1.9H4.5a1.6 1.6 0 0 0-1.6 1.6v9a1.6 1.6 0 0 0 1.6 1.6h7a1.6 1.6 0 0 0 1.6-1.6V6Z" />
      <path d="M9 1.9V6h4.1" />
    </Svg>
  )
}

export function FolderIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M1.9 4.4A1.5 1.5 0 0 1 3.4 2.9h2.4l1.3 1.6h5.5a1.5 1.5 0 0 1 1.5 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5H3.4a1.5 1.5 0 0 1-1.5-1.5Z" />
    </Svg>
  )
}

export function CopyIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="5.6" y="5.6" width="8.4" height="8.4" rx="1.6" />
      <path d="M10.4 5.6V3.6A1.6 1.6 0 0 0 8.8 2H3.6A1.6 1.6 0 0 0 2 3.6v5.2a1.6 1.6 0 0 0 1.6 1.6h2" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 8.6 6.2 11.8 13 5" />
    </Svg>
  )
}

export function AlertIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 2.4 14.4 13.6H1.6Z" />
      <path d="M8 6.4v3.1M8 11.6v.1" />
    </Svg>
  )
}

export function PulseIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M1.4 8h3l1.6-4 2.4 8 1.6-4h3.6" />
    </Svg>
  )
}

/**
 * The app mark: a cross-sectioned bone - an outer cortical ring around a
 * quatrefoil marrow cavity. Same geometry as `build/icon.svg`, scaled down, so
 * the empty state and the application icon read as the same thing.
 */
export function MarrowMark(props: IconProps & { size?: number }): JSX.Element {
  return (
    <svg
      className={props.className}
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <circle cx="12" cy="12" r="6.7" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.1" />
      <path
        fill="currentColor"
        d="M12 6.94c1.45 0 2.63 1.03 2.63 2.34 1.31 0 2.34 1.17 2.34 2.63s-1.03 2.63-2.34 2.63c0 1.31-1.17 2.34-2.63 2.34s-2.63-1.03-2.63-2.34c-1.31 0-2.34-1.17-2.34-2.63s1.03-2.63 2.34-2.63c0-1.31 1.17-2.34 2.63-2.34Z"
      />
    </svg>
  )
}
