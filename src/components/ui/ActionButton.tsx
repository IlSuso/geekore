import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'

type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ActionButtonSize = 'sm' | 'md' | 'lg'

interface BaseProps {
  children: ReactNode
  variant?: ActionButtonVariant
  size?: ActionButtonSize
  icon?: ReactNode
  className?: string
}

interface LinkActionButtonProps extends BaseProps {
  href: string
  onClick?: never
  type?: never
  disabled?: never
}

interface NativeActionButtonProps extends BaseProps, ButtonHTMLAttributes<HTMLButtonElement> {
  href?: never
}

type ActionButtonProps = LinkActionButtonProps | NativeActionButtonProps

const variantClasses: Record<ActionButtonVariant, string> = {
  primary: 'border-transparent bg-[var(--accent)] text-[#0B0B0F] hover:opacity-90',
  secondary: 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]',
  ghost: 'border-transparent bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]',
  danger: 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15',
}

const sizeClasses: Record<ActionButtonSize, string> = {
  sm: 'h-9 px-3 text-[12px] rounded-xl gap-1.5',
  md: 'h-10 px-4 text-[13px] rounded-xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-2xl gap-2.5',
}

const baseClass = 'inline-flex items-center justify-center border font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export function ActionButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  ...props
}: ActionButtonProps) {
  const classes = `${baseClass} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
  const content = (
    <>
      {icon && <span className="flex items-center [&_svg]:h-[1em] [&_svg]:w-[1em]">{icon}</span>}
      {children}
    </>
  )

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <button className={classes} {...props}>
      {content}
    </button>
  )
}
