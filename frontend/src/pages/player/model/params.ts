import { useLocation, useParams } from 'react-router-dom'

import { useSampleSize } from '@/features/sample-size'

/** Route params shared by the player layout and its tabs. */
export function usePlayerParams() {
  const { nickname = '' } = useParams()
  const limit = useSampleSize()
  const { search } = useLocation()
  return { nickname, limit, search }
}
