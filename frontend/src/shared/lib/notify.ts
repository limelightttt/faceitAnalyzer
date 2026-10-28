import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { type ApiErrorKind, describeError, errorKind, isConnectivityError } from '@/shared/api/errors'

/** The only way the app raises toasts. Policy:
 *  - toasts confirm user actions or report their failure; loading/empty/error of a screen is shown in place;
 *  - connectivity problems belong to the connection banner, not to toasts;
 *  - identical problems collapse into one toast (stable ids), so ten failing requests show one message;
 *  - successes are short (3 s), problems stay longer (6 s), everything can be dismissed. */
type Opts = { id?: string; description?: ReactNode; action?: { label: string; onClick: () => void }; duration?: number }

const SHORT = 3000
const LONG = 6000

export const notify = {
  success: (title: string, o: Opts = {}) => toast.success(title, { duration: SHORT, ...o }),
  info: (title: string, o: Opts = {}) => toast.info(title, { duration: 4000, ...o }),
  warning: (title: string, o: Opts = {}) => toast.warning(title, { duration: LONG, ...o }),
  error: (title: string, o: Opts = {}) => toast.error(title, { duration: LONG, ...o }),
  /** a long operation: returns its id; finish it with notify.success/error({ id }) */
  loading: (title: string, o: Opts = {}) => toast.loading(title, { duration: Infinity, ...o }),
  dismiss: (id?: string | number) => toast.dismiss(id),

  /** Failure of a user action. Silently skips cancellations, connectivity (banner) and 401 (sign-in flow). */
  apiError(error: unknown, context?: string, o: Opts = {}) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    const kind = errorKind(error)
    if (isConnectivityError(error) || kind === 'unauthorized') return
    const copy = describeError(error)
    const id = o.id ?? dedupeId(kind, copy.message)
    const show = kind === 'rate_limited' ? toast.warning : toast.error
    return show(context ? `${context}: ${copy.title.toLowerCase()}` : copy.title, {
      id,
      description: copy.message,
      duration: LONG,
      ...o,
    })
  },
}

// rate limits and outages are one condition however many requests hit them; other errors dedupe by text
const dedupeId = (kind: ApiErrorKind | null, message: string) =>
  kind === 'rate_limited' || kind === 'faceit_unavailable' || kind === 'server' || kind === 'timeout' ? `err:${kind}` : `err:${message}`
