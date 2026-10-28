import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useStartScout } from '@/entities/scout'
import { trackJob } from '@/features/job-tracking'
import { useSingleFlight } from '@/shared/lib/use-single-flight'

/** Start a Match Scout (or rebuild one with fresh data: `refresh`) and open its report; repeated triggers
 * while starting are ignored. `inline`: the caller shows failures next to its field instead of a toast. */
export function useLaunchScout({ inline = false } = {}) {
  const start = useStartScout({ inline })
  const navigate = useNavigate()
  const once = useSingleFlight()
  const { mutateAsync } = start
  const launch = useCallback(
    (matchRef: string, { refresh = false } = {}) =>
      once(() =>
        mutateAsync({ url: matchRef, refresh }).then((r) => {
          trackJob({ kind: 'scout', id: r.id, label: `Матч ${r.match_id.slice(0, 13)}…` })
          navigate(`/scout/${r.id}`)
        }),
      ),
    [once, mutateAsync, navigate],
  )
  return { launch, start }
}
