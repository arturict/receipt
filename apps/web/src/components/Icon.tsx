import type { ReactNode } from 'react'

type IconName =
  | 'arrow'
  | 'check'
  | 'clock'
  | 'copy'
  | 'link'
  | 'lock'
  | 'plus'
  | 'refresh'
  | 'spark'
  | 'x'

interface IconProps {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18 }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="m5 12 5-5 5 5M10 7v10" />,
    check: <path d="m4 10 4 4 8-9" />,
    clock: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>,
    copy: <><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7" /></>,
    link: <><path d="m8 12 4-4" /><path d="M6.5 14.5 5 16a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" transform="translate(2 -2)" /><path d="m13.5 5.5 1.5-1.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" transform="translate(-2 2)" /></>,
    lock: <><rect x="4" y="8" width="12" height="9" rx="1.5" /><path d="M7 8V6a3 3 0 0 1 6 0v2M10 12v2" /></>,
    plus: <path d="M10 4v12M4 10h12" />,
    refresh: <><path d="M16 7V3l-2 2a7 7 0 1 0 2.1 7" /><path d="M12 3h4v4" /></>,
    spark: <><path d="M10 1.8c.6 4.6 2.1 6.1 6.7 6.7-4.6.6-6.1 2.1-6.7 6.7-.6-4.6-2.1-6.1-6.7-6.7C7.9 7.9 9.4 6.4 10 1.8Z" /><path d="M16.5 13.5c.2 1.5.7 2 2.2 2.2-1.5.2-2 .7-2.2 2.2-.2-1.5-.7-2-2.2-2.2 1.5-.2 2-.7 2.2-2.2Z" /></>,
    x: <path d="m5 5 10 10M15 5 5 15" />,
  }

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 20 20"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {paths[name]}
      </g>
    </svg>
  )
}
