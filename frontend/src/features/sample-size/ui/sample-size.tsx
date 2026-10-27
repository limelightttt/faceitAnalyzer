import { useSearchParams } from 'react-router-dom'

import { Select } from '@/shared/ui'

const OPTIONS = [20, 50, 100, 200].map((n) => ({ value: String(n), label: `${n} матчей` }))

export function useSampleSize(): number {
  const [params] = useSearchParams()
  const n = Number(params.get('limit') ?? 100)
  return [20, 50, 100, 200].includes(n) ? n : 100
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
