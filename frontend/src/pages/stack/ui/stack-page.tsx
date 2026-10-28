import { Save } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { useSaveSettings, useSession, useSettings } from '@/entities/session'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, InlineError, TagInput } from '@/shared/ui'
import { StackMapPool } from '@/widgets/stack-map-pool'

const MAX = 5
const sameGroup = (a: string[], b: string[]) => a.map((x) => x.toLowerCase()).sort().join() === b.map((x) => x.toLowerCase()).sort().join()

/** Map pool of a duo or party. The group lives in the URL (?players=a,b — shareable); without it you and
 * your saved teammates are used, and the current group can be saved as "мой стак". */
export function StackPage() {
  const { data: session } = useSession()
  const settings = useSettings(Boolean(session?.authenticated))
  const save = useSaveSettings()
  const [params, setParams] = useSearchParams()
  const me = session?.game_profile?.nickname
  const saved = settings.data?.teammates ?? []
  const fromUrl = params.get('players')?.split(',').filter(Boolean)
  const group = fromUrl ?? [...(me ? [me] : []), ...saved].slice(0, MAX)
  const setGroup = (next: string[]) => setParams(next.length ? { players: next.join(',') } : {}, { replace: true })
  const teammates = group.filter((n) => n.toLowerCase() !== me?.toLowerCase())
  const savable = settings.data && !sameGroup(teammates, saved)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Пул карт стака</h1>
        <p className="text-sm text-muted-foreground">
          Выберите, с кем играете — дуо или пати до 5 человек. Оценка складывается из опыта каждого на карте и матчей, сыгранных вместе, и подсказывает, что брать и что банить.
        </p>
      </div>
      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Группа</CardTitle>
          <CardDescription>Ники FACEIT. Ссылку на эту страницу можно отправить другу — группа сохранится в ней.</CardDescription>
          <div className="flex flex-wrap items-center gap-3">
            <TagInput label="Добавить игрока в стак" values={group} onChange={setGroup} max={MAX} />
            {savable && (
              <Button
                size="sm"
                variant="ghost"
                loading={save.isPending}
                onClick={() => settings.data && save.mutate({ ...settings.data, teammates: teammates.slice(0, MAX - 1) })}
              >
                <Save /> Сохранить как мой стак
              </Button>
            )}
          </div>
          <InlineError error={save.error} />
        </CardHeader>
        <CardContent className="px-0 pb-3">
          {group.length ? (
            <StackMapPool players={group} />
          ) : (
            <div className="px-5">
              <EmptyState title="Добавьте игроков">Например, себя и друга, с которым чаще всего играете.</EmptyState>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
