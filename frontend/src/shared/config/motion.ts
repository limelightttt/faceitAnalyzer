/** JS-side motion constants. CSS durations/curves live in app/styles/index.css (--dur-*, --ease-*). */
export const MOTION = {
  /** loading UI appears only if a request is slower than this: fast responses never flash a skeleton */
  revealDelayMs: 160,
  /** how long the sign-in confirmation is visible before the app opens */
  successHoldMs: 950,
} as const

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
