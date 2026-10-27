import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { type DemoMeta, useDemos } from '@/entities/demo'
import { MapChip } from '@/entities/match'
import { apiDelete } from '@/shared/api/client'
import { bytes, dateTime } from '@/shared/lib/format'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, Skeleton, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

function Status({ d }: { d: DemoMeta }) {
  if (d.status === 'done') return <Badge variant="good">готово</Badge>
  if (d.status === 'error') return <Badge variant="bad">ошибка</Badge>
  return (
    <Badge variant="warn">
      <Loader2 className="animate-spin" /> {d.status === 'queued' ? 'в очереди' : 'парсинг'}
    </Badge>
  )
}

export function DemoList({ limit }: { limit?: number }) {
  const { data, isLoading, error } = useDemos()
  const qc = useQueryClient()
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/demos/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['demos'] }) })
  if (isLoading) return <Skeleton className="h-40" />
  if (error) return <ErrorState error={error} />
  const rows = (data ?? []).slice(0, limit)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Загруженные демки</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {rows.length === 0 ? (
          <div className="px-5 pb-3">
            <EmptyState title="Демок пока нет">Загрузите .dem файл матча.</EmptyState>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Файл</TH>
                <TH>Карта</TH>
                <TH>Счёт</TH>
                <TH>Хайлайты</TH>
                <TH>Статус</TH>
                <TH>Добавлено</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {rows.map((d) => (
                <TR key={d.id} className="hover:bg-card-2">
                  <TD className="max-w-64 truncate pl-5">
                    <Link to={`/demos/${d.id}`} className="font-medium hover:underline">
                      {d.file_name}
                    </Link>
                    <div className="text-xs text-subtle-foreground">
                      {d.source === 'sample' ? 'пример: реальная демка' : bytes(d.size)}
                      {d.error && <span className="text-critical-text"> · {d.error}</span>}
                    </div>
                  </TD>
                  <TD>{d.map ? <MapChip map={d.map} /> : '—'}</TD>
                  <TD>{d.score ?? '—'}</TD>
                  <TD>{d.highlights ?? '—'}</TD>
                  <TD>
                    <Status d={d} />
                  </TD>
                  <TD className="text-xs text-muted-foreground">{dateTime(d.created_at)}</TD>
                  <TD className="pr-5 text-right">
                    <Button variant="destructive" size="icon" aria-label="Удалить демо" onClick={() => del.mutate(d.id)} disabled={del.isPending}>
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
