import { cn } from '@/shared/lib/cn'

/** Animated confirmation mark: the ring draws, the check follows, a soft burst marks completion.
 * Purely decorative (aria-hidden): the surrounding text carries the meaning. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-16 items-center justify-center', className)} aria-hidden>
      <span className="absolute inset-0 rounded-full bg-good/25" style={{ animation: 'fi-burst 700ms var(--ease-arrive) 260ms both' }} />
      <svg viewBox="0 0 52 52" className="relative size-full text-good" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="26" cy="26" r="23" className="opacity-25" />
        <circle cx="26" cy="26" r="23" strokeDasharray="145" strokeDashoffset="145" transform="rotate(-90 26 26)" style={{ animation: 'fi-draw 520ms var(--ease-morph) forwards' }} />
        <path d="M16 27l7 7 14-15" strokeDasharray="34" strokeDashoffset="34" style={{ animation: 'fi-draw 320ms var(--ease-confirm) 380ms forwards' }} />
      </svg>
    </span>
  )
}
