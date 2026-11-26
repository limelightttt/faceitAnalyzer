import { Link } from 'react-router-dom'

import { useHistory, useSession } from '@/entities/session'
import { OmniSearch } from '@/features/omni-search'
import { dateTime } from '@/shared/lib/format'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, LoadingSkeleton, OfflineState, PageHeader, SkeletonText } from '@/shared/ui'

export function ScoutPage() {
  const { data: session } = useSession()
  const hist = useHistory(Boolean(session?.authenticated))
  const scouts = (hist.data ?? []).filter((h) => h.kind === 'scout')
  return (
    <div className="space-y-4">
      <PageHeader title="Разведка">Ссылка на комнату FACEIT — отчёт по всем десяти игрокам.</PageHeader>
      <Card>
        <CardContent className="pt-5">
          <OmniSearch size="lg" withDetect />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Мои разведки</CardTitle>
          {!session?.authenticated && <CardDescription>Войдите, чтобы сохранять историю разведок</CardDescription>}
        </CardHeader>
        <CardContent>
          {hist.isPending && hist.fetchStatus === 'paused' ? (
            <OfflineState className="p-6" />
          ) : hist.isPending && session?.authenticated ? (
            <LoadingSkeleton label="Загружаем историю разведок">
              <SkeletonText lines={4} />
            </LoadingSkeleton>
          ) : scouts.length === 0 ? (
            <EmptyState title="Разведок пока нет" className="p-6" />
          ) : (
            <div className="divide-y">
              {scouts.map((s) => (
                <Link key={s.ref + s.at} to={`/scout/${s.ref}`} className="-mx-2 flex items-center justify-between rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-card-2/60 hover:text-primary">
                  <span>{s.label}</span>
                  <span className="text-xs text-muted-foreground">{dateTime(s.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
