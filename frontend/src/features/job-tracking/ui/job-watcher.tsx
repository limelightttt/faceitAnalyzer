import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useDemo } from '@/entities/demo'
import { useScoutJob } from '@/entities/scout'
import { errorKind } from '@/shared/api/errors'
import { notify } from '@/shared/lib/notify'

import { type TrackedJob, untrackJob, useTrackedJobs } from '../model/store'

/** Reports completion of background jobs when the user is not looking at them (with a link back). Shares
 * the query cache with the job pages, so nothing is polled twice. */
export function JobWatcher() {
  const jobs = useTrackedJobs()
  return (
    <>
      {jobs.map((j) => (j.kind === 'scout' ? <ScoutWatch key={j.id} job={j} /> : <DemoWatch key={j.id} job={j} />))}
    </>
  )
}

function useReport(job: TrackedJob, path: string, state: 'running' | 'done' | 'error' | undefined, failure: string | null | undefined, lost: boolean) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const here = pathname === path
  useEffect(() => {
    if (lost) return untrackJob(job.id)
    if (!state || state === 'running') return
    untrackJob(job.id)
    if (here) return // the page itself shows the result
    const open = { label: 'Открыть', onClick: () => navigate(path) }
    const what = job.kind === 'scout' ? 'Разведка' : 'Разбор демки'
    if (state === 'done') notify.success(`${what} готов${job.kind === 'scout' ? 'а' : ''}`, { id: `job:${job.id}`, description: job.label, action: open, duration: 8000 })
    else notify.error(`${what}: ошибка`, { id: `job:${job.id}`, description: failure ?? job.label, action: open })
  }, [state, failure, lost, here, job, path, navigate])
}

function ScoutWatch({ job }: { job: TrackedJob }) {
  const q = useScoutJob(job.id)
  useReport(job, `/scout/${job.id}`, q.data?.status, q.data?.error, errorKind(q.error) === 'not_found')
  return null
}

function DemoWatch({ job }: { job: TrackedJob }) {
  const q = useDemo(job.id)
  const s = q.data?.meta.status
  useReport(job, `/demos/${job.id}`, s === 'done' ? 'done' : s === 'error' ? 'error' : s ? 'running' : undefined, q.data?.meta.error, errorKind(q.error) === 'not_found')
  return null
}
