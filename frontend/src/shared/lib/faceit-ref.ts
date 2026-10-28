/** What the user typed or pasted: a FACEIT match room, a player nickname, or nothing usable. Mirrors the
 * server's matchroom parser (backend/app/scout/url.py): ids anywhere in faceit.com URLs or bare. */
export type FaceitRef = { kind: 'room'; matchId: string } | { kind: 'player'; nickname: string }

const MATCH_ID = /1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const NICKNAME = /^[\w.-]{2,32}$/

function faceitHost(value: string): boolean {
  try {
    const host = new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase()
    return host === 'faceit.com' || host.endsWith('.faceit.com')
  } catch {
    return false
  }
}

export function parseFaceitRef(input: string): FaceitRef | null {
  const value = input.trim()
  if (!value || value.length > 300) return null
  const id = value.match(MATCH_ID)?.[0]
  if (id && (!value.includes('/') || faceitHost(value))) return { kind: 'room', matchId: id.toLowerCase() }
  if (value.includes('/') && faceitHost(value)) {
    const nick = value.match(/\/players\/([^/?#]+)/)?.[1] // a FACEIT profile link
    if (nick && NICKNAME.test(decodeURIComponent(nick))) return { kind: 'player', nickname: decodeURIComponent(nick) }
    return null
  }
  return NICKNAME.test(value) ? { kind: 'player', nickname: value } : null
}
