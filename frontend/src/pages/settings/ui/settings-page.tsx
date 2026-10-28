import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { type UserSettings, useSaveSettings, useSession, useSettings, useUnlinkIdentity } from '@/entities/session'
import { LoginButtons, LogoutButton } from '@/features/auth'
import { cn } from '@/shared/lib/cn'
import { dateTime, mapName } from '@/shared/lib/format'
import { AsyncView, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmButton, EmptyState, InlineError, Input, LoadingSkeleton, Select, Skeleton } from '@/shared/ui'

const MAPS = ['de_mirage', 'de_inferno', 'de_dust2', 'de_nuke', 'de_ancient', 'de_anubis', 'de_train']
const SOURCE: Record<string, string> = {
  faceit_oauth: 'подтверждён входом через FACEIT',
  steam_lookup: 'найден по SteamID подтверждённого Steam-аккаунта',
  dev: 'тестовый вход',
}

export function SettingsPage() {
  const { data: session } = useSession()
  const settings = useSettings(Boolean(session?.authenticated))
  const unlink = useUnlinkIdentity()
  if (!session?.authenticated)
    return (
      <EmptyState title="Войдите, чтобы управлять аккаунтом">
        <LoginButtons returnTo="/settings" className="mt-3 justify-center" />
      </EmptyState>
    )
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Аккаунт и настройки</h1>
        <LogoutButton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Привязанные аккаунты</CardTitle>
            <CardDescription>Вход подтверждается самими Steam/FACEIT. Аккаунт, привязанный к другой учётной записи, перепривязать нельзя — это защита от захвата.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {session.identities?.map((i) => (
              <div key={i.provider} className="animate-enter flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <div className="font-medium capitalize">{i.provider}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.display_name ?? i.subject} · подтверждён {dateTime(i.verified_at)}
                  </div>
                </div>
                <ConfirmButton
                  size="sm"
                  confirmLabel="Отвязать?"
                  disabled={(session.identities?.length ?? 0) <= 1 || (unlink.isPending && unlink.variables !== i.provider)}
                  loading={unlink.isPending && unlink.variables === i.provider}
                  onConfirm={() => unlink.mutate(i.provider)}
                >
                  Отвязать
                </ConfirmButton>
              </div>
            ))}
            <LoginButtons link returnTo="/settings" size="sm" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Игровой профиль</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {session.game_profile ? (
              <div className="space-y-1">
                <div className="text-lg font-semibold">{session.game_profile.nickname}</div>
                <Badge variant="good">{SOURCE[session.game_profile.source] ?? session.game_profile.source}</Badge>
                <div className="text-xs text-muted-foreground">FACEIT ID {session.game_profile.faceit_player_id} {session.game_profile.steam_id && `· SteamID ${session.game_profile.steam_id}`}</div>
              </div>
            ) : (
              <EmptyState title="Профиль FACEIT не определён">Привяжите FACEIT или Steam-аккаунт, к которому привязан ваш FACEIT.</EmptyState>
            )}
          </CardContent>
        </Card>
      </div>
      <AsyncView query={settings} skeleton={<PreferencesSkeleton />}>
        {(data) => <Preferences initial={data} />}
      </AsyncView>
    </div>
  )
}

function PreferencesSkeleton() {
  return (
    <LoadingSkeleton label="Загружаем настройки">
      <div className="space-y-5 rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-8 w-56 rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </LoadingSkeleton>
  )
}

const same = (a: UserSettings, b: UserSettings) => JSON.stringify(a) === JSON.stringify(b)

/** Edits a local copy; "Сохранить" is enabled only with unsaved changes, shows its pending state, confirms
 * with a toast and reports failures right next to the button. */
function Preferences({ initial }: { initial: UserSettings }) {
  const save = useSaveSettings()
  const [form, setForm] = useState<UserSettings>(initial)
  const [watch, setWatch] = useState('')
  // a newer server copy (another tab, or our own save) replaces the form only when it has no local edits
  const [base, setBase] = useState(initial)
  useEffect(() => {
    if (!same(initial, base)) {
      setForm((f) => (same(f, base) ? initial : f))
      setBase(initial)
    }
  }, [initial, base])
  const dirty = !same(form, base)
  const addWatch = () => {
    const v = watch.trim()
    if (v) setForm({ ...form, watchlist: [...new Set([...form.watchlist, v])] })
    setWatch('')
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Предпочтения</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <label className="flex flex-wrap items-center gap-3">
          <span className="w-56 text-muted-foreground">Выборка матчей по умолчанию</span>
          <Select label="Выборка" value={String(form.sample_size)} onChange={(v) => setForm({ ...form, sample_size: Number(v) as UserSettings['sample_size'] })} options={[20, 50, 100, 200].map((n) => ({ value: String(n), label: `${n}` }))} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-56 text-muted-foreground">Любимые карты</span>
          {MAPS.map((m) => {
            const on = form.preferred_maps.includes(m)
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setForm({ ...form, preferred_maps: on ? form.preferred_maps.filter((x) => x !== m) : [...form.preferred_maps, m] })}
                className={cn(
                  'pressable inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-card-2 hover:text-foreground',
                )}
              >
                {on && <Check className="animate-pop-in size-3" />}
                {mapName(m)}
              </button>
            )
          })}
        </div>
        <label className="flex items-center gap-3">
          <span className="w-56 text-muted-foreground">Показывать риск-сигналы</span>
          <input type="checkbox" checked={form.show_risk_signals} onChange={(e) => setForm({ ...form, show_risk_signals: e.target.checked })} className="size-4 accent-[var(--primary)]" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-56 text-muted-foreground">Список наблюдения</span>
          {form.watchlist.map((w) => (
            <Badge key={w} className="animate-pop-in">
              {w}
              <button type="button" aria-label={`Убрать ${w}`} onClick={() => setForm({ ...form, watchlist: form.watchlist.filter((x) => x !== w) })} className="rounded hover:text-foreground">
                <X />
              </button>
            </Badge>
          ))}
          <Input
            value={watch}
            onChange={(e) => setWatch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addWatch()
              }
            }}
            placeholder="ник"
            className="h-8 w-40"
            aria-label="Добавить ник"
          />
          <Button size="sm" variant="secondary" onClick={addWatch} disabled={!watch.trim()}>
            Добавить
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={() => save.mutate(form, { onSuccess: (d) => setBase(d) })} loading={save.isPending} disabled={!dirty}>
            Сохранить
          </Button>
          {dirty && !save.isPending && (
            <Button variant="ghost" size="sm" onClick={() => setForm(base)}>
              Отменить изменения
            </Button>
          )}
          {!dirty && save.isSuccess && (
            <span className="animate-fade-in inline-flex items-center gap-1 text-xs text-good-text" role="status">
              <Check className="size-3.5" /> Сохранено
            </span>
          )}
          {dirty && !save.isPending && !save.error && <span className="text-xs text-muted-foreground">Есть несохранённые изменения</span>}
          <InlineError error={dirty ? save.error : null} />
        </div>
      </CardContent>
    </Card>
  )
}
