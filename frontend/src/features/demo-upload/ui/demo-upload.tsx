import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp, Loader2 } from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { DemoMeta } from '@/entities/demo'
import { apiUpload } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { Button, Progress } from '@/shared/ui'

const ACCEPT = ['.dem', '.dem.gz', '.dem.bz2', '.dem.zst']

export function DemoUpload({ className }: { className?: string }) {
  const [progress, setProgress] = useState(0)
  const [drag, setDrag] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const upload = useMutation({
    mutationFn: (file: File) => apiUpload<DemoMeta>('/demos', file, setProgress),
    onSuccess: (meta) => {
      qc.invalidateQueries({ queryKey: ['demos'] })
      navigate(`/demos/${meta.id}`)
    },
  })

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!ACCEPT.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setLocalError('Нужен файл .dem (или архив .dem.gz / .dem.bz2 / .dem.zst)')
      return
    }
    setLocalError(null)
    setProgress(0)
    upload.mutate(file)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    pick(e.dataTransfer.files[0])
  }
  const error = localError ?? (upload.error instanceof Error ? upload.error.message : null)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card p-8 text-center transition-colors',
        drag && 'border-primary bg-primary/5',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        {upload.isPending ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
      </div>
      <div>
        <div className="text-sm font-medium">Перетащите CS2-демку сюда</div>
        <div className="mt-1 text-xs text-muted-foreground">
          .dem, .dem.gz, .dem.bz2, .dem.zst — скачайте демо на странице матча FACEIT и загрузите вручную
        </div>
      </div>
      {upload.isPending ? (
        <div className="w-full max-w-sm space-y-1">
          <Progress value={Math.round(progress * 100)} />
          <div className="text-xs text-muted-foreground tabular">Загрузка {Math.round(progress * 100)}%</div>
        </div>
      ) : (
        <Button onClick={() => input.current?.click()}>Выбрать файл</Button>
      )}
      <input
        ref={input}
        type="file"
        className="hidden"
        accept=".dem,.gz,.bz2,.zst"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {error && <div className="text-xs text-critical-text">{error}</div>}
    </div>
  )
}
