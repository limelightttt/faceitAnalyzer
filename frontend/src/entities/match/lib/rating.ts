/** Text tone for a Rating 1.0 value: strong games stand out, weak ones are flagged. */
export function ratingTone(r: number | undefined | null) {
  if (r === undefined || r === null) return ''
  if (r >= 1.15) return 'text-good-text font-semibold'
  if (r < 0.85) return 'text-critical-text'
  return ''
}
