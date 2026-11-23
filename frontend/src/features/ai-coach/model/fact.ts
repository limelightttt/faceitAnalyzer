import type { AiFact, FactValue } from '@/entities/coach'

const KEY: Record<string, string> = {
  you: 'вы',
  lobby: 'лобби',
  first: 'было',
  peak: 'пик',
  low: 'минимум',
  last: 'сейчас',
  baseline: 'база',
  target: 'цель',
  now: 'сейчас',
  matches: 'матчей',
  win_rate: 'WR',
  rating: 'R',
  adr: 'ADR',
}
const WORD: Record<string, string> = {
  strength: 'сильная сторона',
  weakness: 'слабое место',
  neutral: 'как у лобби',
  high: 'доверие высокое',
  medium: 'доверие среднее',
  low: 'доверие низкое',
}
const isShare = (key: string) => /win_rate|traded_death_rate/.test(key)

function scalar(key: string, v: FactValue): string {
  if (v === null) return '—'
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  if (typeof v === 'string') return WORD[v] ?? v
  if (typeof v !== 'number') return ''
  if (isShare(key)) return `${Math.round(v * 100)}%`
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(/adr/.test(key) ? 1 : 2)
}

/** A dossier fact as the player reads it: "WR 42% · R 0.95", never raw JSON. */
export function factText(f: AiFact): string {
  const v = f.value
  const body =
    v !== null && typeof v === 'object'
      ? Object.entries(v)
          .filter(([k]) => k !== 'reached' || v[k] !== null)
          .map(([k, x]) => (k === 'verdict' || k === 'confidence' ? scalar(k, x) : `${KEY[k] ?? k} ${scalar(k === 'you' || k === 'lobby' ? f.id : k, x)}`))
          .join(' · ')
      : scalar(f.id, v)
  return f.n === undefined ? body : `${body} (n = ${f.n})`
}
