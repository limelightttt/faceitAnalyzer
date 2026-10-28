import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { type DemoMeta, useDeleteDemo, useDemos } from '@/entities/demo'
import { MapChip } from '@/entities/match'
import { bytes, dateTime } from '@/shared/lib/format'
import { AsyncView, Badge, Card, CardContent, CardHeader, CardTitle, ConfirmButton, EmptyState, LoadingSkeleton, SkeletonTable, Spinner, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

function Status({ d }: { d: DemoMeta }) {
  if (d.status === 'done') return <Badge variant="good">готово</Badge>
  if (d.status === 'error') return <Badge variant="bad">ошибка</Badge>
  return (
    <Badge variant="warn">
      <Spinner className="size-3" /> {d.status === 'queued' ? 'в очереди' : 'парсинг'}
    </Badge>
  )
}

export function DemoList({ limit }: { limit?: number }) {
  const demos = useDemos()
  const del = useDeleteDemo()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Загруженные демки</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <AsyncView
          query={demos}
          className="px-5 pb-3"
          skeleton={
            <LoadingSkeleton label="Загружаем список демок">
              <SkeletonTable rows={Math.min(limit ?? 4, 4)} cols={6} />
            </LoadingSkeleton>
          }
        >
          {(data) => <Rows rows={data.slice(0, limit)} del={del} />}
        </AsyncView>
      </CardContent>
    </Card>
  )
}

function Rows({ rows, del }: { rows: DemoMeta[]; del: ReturnType<typeof useDeleteDemo> }) {
  return (
    <>
        {rows.length === 0 ? (
          <div className="px-5 pb-3">
            <EmptyState title="Демок пока нет">Загрузите .dem файл матча — разбор появится здесь.</EmptyState>
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
                <TR key={d.id} className="hover:bg-card-2/60">
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
                    {d.source !== 'sample' && (
                      <ConfirmButton size="icon" aria-label="Удалить демо" onConfirm={() => del.mutate(d.id)} loading={del.isPending && del.variables === d.id}>
                        <Trash2 />
                      </ConfirmButton>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
    </>
  )
}
