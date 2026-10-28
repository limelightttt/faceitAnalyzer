import { Loader2 } from 'lucide-react'

import { cn } from '@/shared/lib/cn'

/** Activity indicator. Keeps spinning (slowly) under reduced motion: it means "still working". */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn('motion-essential size-4 animate-spin', className)} />
}
