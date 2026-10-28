import { useEffect, useState } from 'react'

import { MOTION } from '@/shared/config/motion'

/** True only while `active` has lasted longer than `delay`: fast operations never flash loading UI. */
export function useDelayed(active: boolean, delay: number = MOTION.revealDelayMs) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const t = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(t)
  }, [active, delay])
  return active && shown
}
