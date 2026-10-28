import { errorKind } from './errors'

/** Query/mutation metadata read by the global policies in app/providers. */
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** never report background failures of this query with a toast (health, session polling) */
      silent?: boolean
    }
    mutationMeta: {
      /** toast shown when the action succeeds */
      success?: string
      /** prefix for the failure toast, e.g. "Сохранение" */
      errorContext?: string
      /** the screen shows the error inline next to the form: no toast */
      inlineError?: boolean
    }
  }
}

/** Retry only what can plausibly succeed on its own and never hammer FACEIT: one quiet retry for an
 * unexpected server error; rate limits, client errors, timeouts and outages are handled by the UI/banner. */
export function shouldRetry(failureCount: number, error: unknown) {
  return failureCount < 1 && errorKind(error) === 'server'
}
