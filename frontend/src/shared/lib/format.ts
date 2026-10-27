export const fmt = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits)

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`

export const signed = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}`

export const mapName = (m: string | null | undefined) =>
  m ? m.replace(/^de_/, '').replace(/^\w/, (c) => c.toUpperCase()) : '—'

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) : '—'

export const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const bytes = (n: number | undefined) =>
  n === undefined ? '' : n > 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} МБ` : `${Math.round(n / 1024)} КБ`
