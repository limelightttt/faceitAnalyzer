import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp, RotateCcw, X } from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { DemoMeta } from '@/entities/demo'
import { trackJob } from '@/features/job-tracking'
import { apiUpload } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { bytes } from '@/shared/lib/format'
import { notify } from '@/shared/lib/notify'
import { Button, InlineError, Progress } from '@/shared/ui'

const ACCEPT = ['.dem', '.dem.gz', '.dem.bz2', '.dem.zst']

/** Drop zone with an honest lifecycle: choose → upload (real bytes %) → hand-over to the server, which
 * then parses in the background (the demo page shows that stage). Failed uploads can be retried with the
 * same file; an upload in progress can be cancelled. */
export function DemoUpload({ className }: { className?: string }) {
  const [progress, setProgress] = useState(0)
  const [drag, setDrag] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const upload = useMutation({
    mutationFn: (f: File) => {
      abort.current = new AbortController()
      return apiUpload<DemoMeta & { duplicate?: boolean }>('/demos', f, setProgress, abort.current.signal)
    },
    meta: { inlineError: true },
    onSuccess: (meta) => {
      qc.invalidateQueries({ queryKey: ['demos'] })
      if (meta.duplicate) notify.info('Эта демка уже загружена', { description: 'Открываем существующий разбор — дубликат не создан.' })
      else trackJob({ kind: 'demo', id: meta.id, label: meta.file_name })
      navigate(`/demos/${meta.id}`)
    },
  })
  const uploading = upload.isPending
  const cancelled = upload.error instanceof DOMException && upload.error.name === 'AbortError'

  const pick = (f: File | undefined) => {
    if (!f || uploading) return
    if (!ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setLocalError('Нужен файл .dem (или архив .dem.gz / .dem.bz2 / .dem.zst)')
      return
    }
    setLocalError(null)
    setFile(f)
    setProgress(0)
    upload.mutate(f)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    pick(e.dataTransfer.files[0])
  }
  const pct = Math.round(progress * 100)
  // all bytes sent: the server is now storing and queueing the file
  const handingOver = uploading && progress >= 0.999

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!uploading) setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card p-8 text-center transition-[border-color,background-color,transform] duration-[var(--dur-fast)]',
        drag && 'scale-[1.01] border-primary bg-primary/5',
        className,
      )}
    >
      <div className={cn('flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-[var(--dur-base)]', drag && '-translate-y-1')}>
        <FileUp className="size-5" />
      </div>
      <div>
        <div className="text-sm font-medium">{drag ? 'Отпустите, чтобы загрузить' : 'Перетащите CS2-демку сюда'}</div>
        <div className="mt-1 text-xs text-muted-foreground">.dem, .dem.gz, .dem.bz2, .dem.zst — скачайте демо на странице матча FACEIT и загрузите вручную</div>
      </div>
      {uploading ? (
        <div className="animate-enter w-full max-w-sm space-y-1.5" role="status" aria-live="polite">
          <Progress value={handingOver ? null : pct} tone="primary" label="Загрузка демки" />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular">
            <span className="truncate">
              {handingOver ? 'Сервер принимает файл…' : `Загрузка ${pct}%`} {file && `· ${bytes(file.size)}`}
            </span>
            {!handingOver && (
              <button type="button" onClick={() => abort.current?.abort()} className="pressable inline-flex items-center gap-1 rounded px-1 hover:text-foreground">
                <X className="size-3" /> Отменить
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => input.current?.click()}>Выбрать файл</Button>
          {upload.isError && !cancelled && file && (
            <Button variant="secondary" onClick={() => pick(file)}>
              <RotateCcw /> Повторить загрузку
            </Button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        className="hidden"
        accept=".dem,.gz,.bz2,.zst"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = '' // choosing the same file again must trigger a new upload
        }}
      />
      {cancelled && !uploading && <div className="text-xs text-muted-foreground">Загрузка отменена.</div>}
      {!uploading && <InlineError error={localError ?? (cancelled ? null : upload.error)} />}
    </div>
  )
}
