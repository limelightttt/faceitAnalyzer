import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from './button'

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      aria-label={`Скопировать: ${text}`}
    >
      {done ? <Check /> : <Copy />}
      <span className="font-mono text-[11px]">{label ?? text}</span>
    </Button>
  )
}
