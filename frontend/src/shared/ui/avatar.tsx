import { useState } from 'react'

import { cn } from '@/shared/lib/cn'

/** Remote avatar (FACEIT CDN) with an initial-letter fallback when the image is missing or broken. */
export function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden', className)}>
      {src && !failed ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} referrerPolicy="no-referrer" />
      ) : (
        name[0]?.toUpperCase()
      )}
    </div>
  )
}
