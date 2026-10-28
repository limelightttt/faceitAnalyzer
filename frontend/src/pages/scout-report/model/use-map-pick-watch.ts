import { useEffect, useRef } from 'react'

import { type ScoutJob, useScoutLive } from '@/entities/scout'

/** While the report was made during the veto (no map yet), watch the room; once a map is picked call
 * `onPicked(map)` exactly once so the report can be rebuilt with map-specific numbers.
 * Returns whether it is currently waiting. */
export function useMapPickWatch(job: ScoutJob | undefined, onPicked: (map: string) => void): boolean {
  const r = job?.report
  const waiting = Boolean(job?.status === 'done' && r && r.phase === 'pre' && !r.map)
  const live = useScoutLive(job?.id ?? '', waiting)
  const fired = useRef(false)
  const picked = live.data?.map
  useEffect(() => {
    if (waiting && picked && !fired.current) {
      fired.current = true
      onPicked(picked)
    }
  }, [waiting, picked, onPicked])
  return waiting && !picked
}
