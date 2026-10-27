import { useSearchParams } from 'react-router-dom'

import { Select } from '@/shared/ui'

// Each match costs ~2 FACEIT requests on first load (details + stats); afterwards it is cached forever.
const OPTIONS = [20, 50, 100, 200].map((n) => ({ value: String(n), label: `${n} матчей${n >= 100 ? ' (дольше)' : ''}` }))

export function useSampleSize(): number {
  const [params] = useSearchParams()
  const n = Number(params.get('limit') ?? 50)
  return [20, 50, 100, 200].includes(n) ? n : 50
}

export function SampleSizeSelect() {
  const [params, setParams] = useSearchParams()
  const value = String(useSampleSize())
  return (
    <Select
      label="Размер выборки"
      value={value}
      options={OPTIONS}
      onChange={(v) => {
        const next = new URLSearchParams(params)
        next.set('limit', v)
        setParams(next, { replace: true })
      }}
    />
  )
}
