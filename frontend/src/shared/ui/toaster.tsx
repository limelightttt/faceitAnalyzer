import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'

/** App-wide toast outlet styled with the design tokens. Bottom-right on desktop (away from the header and
 * primary actions), bottom full-width on phones. At most three visible; older ones stack behind. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      visibleToasts={3}
      closeButton
      gap={8}
      offset={16}
      mobileOffset={12}
      containerAriaLabel="Уведомления"
      icons={{
        success: <CheckCircle2 className="size-4 text-good-text" />,
        error: <XCircle className="size-4 text-critical-text" />,
        warning: <AlertTriangle className="size-4 text-warning" />,
        info: <Info className="size-4 text-series-1" />,
        loading: <Loader2 className="motion-essential size-4 animate-spin text-primary" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-card p-3.5 pr-8 text-sm text-foreground shadow-[0_8px_30px_rgb(0_0_0/0.18)] sm:w-[360px]',
          icon: 'mt-0.5 flex size-4 shrink-0 items-center justify-center',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'font-medium leading-snug',
          description: 'text-xs leading-relaxed text-muted-foreground',
          actionButton: 'mt-0.5 shrink-0 self-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground pressable',
          cancelButton: 'mt-0.5 shrink-0 self-center rounded-md border px-2.5 py-1 text-xs pressable',
          closeButton:
            'absolute top-2.5 right-2.5 left-auto flex size-5 items-center justify-center rounded-md border-0 bg-transparent text-subtle-foreground transition-colors hover:bg-card-2 hover:text-foreground [&_svg]:size-3',
          error: 'border-critical/40',
          warning: 'border-warning/50',
          success: 'border-good/30',
        },
      }}
    />
  )
}
