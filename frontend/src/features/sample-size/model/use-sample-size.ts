import { useSearchParams } from 'react-router-dom'

/** Number of recent matches analysed, from ?limit= (20/50/100/200, default 50). */
export function useSampleSize(): number {
  const [params] = useSearchParams()
  const n = Number(params.get('limit') ?? 50)
  return [20, 50, 100, 200].includes(n) ? n : 50
}
