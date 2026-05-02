import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'compact'

interface BaseProps {
  variant?: ButtonVariant
  className?: string
  children: ReactNode
}

type PrimitiveButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>

type PrimitiveButtonLinkProps = BaseProps & {
  href: string
  ariaLabel?: string
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'gk-btn-primary',
  secondary: 'gk-btn-secondary',
  ghost: 'gk-btn-ghost',
  compact: 'gk-btn-compact',
}

export function PrimitiveButton({
  variant = 'primary',
  className = '',
  type = 'button',
  children,
  ...props
}: PrimitiveButtonProps) {
  return (
    <button
      type={type}
      className={`gk-btn ${variantClass[variant]} gk-focus-ring ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function PrimitiveButtonLink({
  variant = 'primary',
  className = '',
  href,
  ariaLabel,
  children,
}: PrimitiveButtonLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`gk-btn ${variantClass[variant]} gk-focus-ring ${className}`}
    >
      {children}
    </Link>
  )
}
