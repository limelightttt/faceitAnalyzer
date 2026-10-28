import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button, type ButtonProps } from './button'

/** Two-step destructive action without a modal: the first press arms the button ("Удалить?"), the second
 * confirms. Disarms after a few seconds, on Escape or when focus leaves. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Удалить?',
  loading,
  'aria-label': ariaLabel,
  ...props
}: Omit<ButtonProps, 'onClick'> & { onConfirm: () => void; confirmLabel?: string; children: ReactNode }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const disarm = () => {
    clearTimeout(timer.current)
    setArmed(false)
  }
  return (
    <Button
      {...props}
      variant={armed ? 'danger' : props.variant ?? 'destructive'}
      size={armed && props.size === 'icon' ? 'sm' : props.size}
      loading={loading}
      aria-label={armed ? `${confirmLabel} Нажмите ещё раз для подтверждения` : ariaLabel}
      onBlur={disarm}
      onKeyDown={(e) => e.key === 'Escape' && disarm()}
      onClick={(e) => {
        e.stopPropagation()
        if (!armed) {
          setArmed(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setArmed(false), 3500)
          return
        }
        disarm()
        onConfirm()
      }}
    >
      {armed ? <span className="animate-pop-in">{confirmLabel}</span> : children}
    </Button>
  )
}
