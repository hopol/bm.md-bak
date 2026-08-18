import type { ElementType } from 'react'

import { Link } from '@tanstack/react-router'

interface LogoProps {
  as?: ElementType | null
}

export function Logo({ as: Component = null }: LogoProps) {
  const link = (
    <Link
      to="/about"
      aria-label="关于 bm.md"
      translate="no"
      className={`
        doto-font inline-flex items-baseline text-2xl leading-none font-bold
        tracking-tight text-foreground transition-colors select-none
        hover:text-primary
      `}
    >
      bm
      <span className="-translate-y-0.5 text-primary">.</span>
      md
    </Link>
  )

  if (Component === null) {
    return link
  }

  return <Component>{link}</Component>
}
