import { useSyncExternalStore } from 'react'

/** Long server operations the user started in this tab (Match Scout, demo parsing). They keep running when
 * the user navigates away; the watcher reports their completion. Survives a page refresh (sessionStorage). */
export interface TrackedJob {
  kind: 'scout' | 'demo'
  id: string
  label: string
}

const KEY = 'fi-jobs'
const load = (): TrackedJob[] => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as TrackedJob[]
  } catch {
    return []
  }
}

let jobs = load()
const listeners = new Set<() => void>()
const save = (next: TrackedJob[]) => {
  jobs = next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(jobs))
  } catch {
    /* tracking is a convenience */
  }
  listeners.forEach((l) => l())
}

export const trackJob = (job: TrackedJob) => {
  if (!jobs.some((j) => j.id === job.id)) save([...jobs, job].slice(-10))
}
export const untrackJob = (id: string) => {
  if (jobs.some((j) => j.id === id)) save(jobs.filter((j) => j.id !== id))
}
export const useTrackedJobs = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => jobs,
  )
