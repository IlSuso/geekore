import { forwardRef, type InputHTMLAttributes } from 'react'

interface PrimitiveInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helperText?: string
  error?: string
  containerClassName?: string
}

export const PrimitiveInput = forwardRef<HTMLInputElement, PrimitiveInputProps>(function PrimitiveInput(
  {
    label,
    helperText,
    error,
    className = '',
    containerClassName = '',
    id,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const fieldId = id || props.name
  const helperId = fieldId ? `${fieldId}-helper` : undefined
  const errorId = fieldId ? `${fieldId}-error` : undefined
  const describedBy = error ? errorId : (ariaDescribedBy || helperId)

  return (
    <div className={`gk-field ${containerClassName}`}>
      {label && fieldId && (
        <label htmlFor={fieldId} className="gk-label normal-case tracking-normal text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        className={`gk-input ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={errorId} className="gk-input-error-msg">{error}</p>
      ) : helperText ? (
        <p id={helperId} className="gk-input-helper">{helperText}</p>
      ) : null}
    </div>
  )
})
