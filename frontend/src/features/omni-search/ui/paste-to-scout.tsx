import { useEffect } from 'react'

import { parseFaceitRef } from '@/shared/lib/faceit-ref'
import { notify } from '@/shared/lib/notify'

import { useLaunchScout } from '../model/use-launch-scout'

/** Ctrl+V of a match room link anywhere in the app (outside text fields) starts Match Scout right away:
 * copy the room link on FACEIT, switch tabs, paste. */
export function PasteToScout() {
  const { launch } = useLaunchScout()
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
      const ref = parseFaceitRef(e.clipboardData?.getData('text') ?? '')
      if (ref?.kind !== 'room') return
      e.preventDefault()
      notify.info('Ссылка на комнату — запускаем разведку', { id: 'paste-scout' })
      launch(ref.matchId)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [launch])
  return null
}
