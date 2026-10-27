import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { type UserSettings, useSaveSettings, useSession, useSettings } from '@/entities/session'
import { LoginButtons, LogoutButton } from '@/features/auth'
import { apiDelete } from '@/shared/api/client'
import { dateTime, mapName } from '@/shared/lib/format'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, PageSkeleton, Select } from '@/shared/ui'

const MAPS = ['de_mirage', 'de_inferno', 'de_dust2', 'de_nuke', 'de_ancient', 'de_anubis', 'de_train']
const SOURCE: Record<string, string> = {
  faceit_oauth: 'подтверждён входом через FACEIT',
  steam_lookup: 'найден по SteamID подтверждённого Steam-аккаунта',
  dev: 'тестовый вход',
}

export function SettingsPage() {
  const { data: session } = useSession()
  const settings = useSettings(Boolean(session?.authenticated))
  const save = useSaveSettings()
  const qc = useQueryClient()
  const unlink = useMutation({ mutationFn: (p: string) => apiDelete(`/auth/identities/${p}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }) })
  const [form, setForm] = useState<UserSettings | null>(null)
  const [watch, setWatch] = useState('')
  useEffect(() => {
    if (settings.data) setForm(settings.data)
  }, [settings.data])
  if (!session) return <PageSkeleton />
  if (!session.authenticated)
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
              <div key={i.provider} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <div className="font-medium capitalize">{i.provider}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.display_name ?? i.subject} · подтверждён {dateTime(i.verified_at)}
                  </div>
                </div>
                <Button variant="destructive" size="sm" disabled={(session.identities?.length ?? 0) <= 1 || unlink.isPending} onClick={() => unlink.mutate(i.provider)}>
                  Отвязать
                </Button>
              </div>
            ))}
            <LoginButtons link returnTo="/settings" size="sm" />
            {unlink.error instanceof Error && <div className="text-xs text-critical-text">{unlink.error.message}</div>}
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
      {form && (
        <Card>
          <CardHeader>
            <CardTitle>Предпочтения</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <label className="flex items-center gap-3">
              <span className="w-56 text-muted-foreground">Выборка матчей по умолчанию</span>
              <Select label="Выборка" value={String(form.sample_size)} onChange={(v) => setForm({ ...form, sample_size: Number(v) as UserSettings['sample_size'] })} options={[20, 50, 100, 200].map((n) => ({ value: String(n), label: `${n}` }))} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-56 text-muted-foreground">Любимые карты</span>
              {MAPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={form.preferred_maps.includes(m)}
                  onClick={() => setForm({ ...form, preferred_maps: form.preferred_maps.includes(m) ? form.preferred_maps.filter((x) => x !== m) : [...form.preferred_maps, m] })}
                  className={`rounded-md border px-2 py-1 text-xs ${form.preferred_maps.includes(m) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  {mapName(m)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3">
              <span className="w-56 text-muted-foreground">Показывать риск-сигналы</span>
              <input type="checkbox" checked={form.show_risk_signals} onChange={(e) => setForm({ ...form, show_risk_signals: e.target.checked })} className="size-4 accent-[var(--primary)]" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-56 text-muted-foreground">Список наблюдения</span>
              {form.watchlist.map((w) => (
                <Badge key={w}>
                  {w}
                  <button type="button" aria-label={`Убрать ${w}`} onClick={() => setForm({ ...form, watchlist: form.watchlist.filter((x) => x !== w) })}>
                    ×
                  </button>
                </Badge>
              ))}
              <Input value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="ник" className="h-8 w-40" aria-label="Добавить ник" />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (watch.trim()) setForm({ ...form, watchlist: [...new Set([...form.watchlist, watch.trim()])] })
                  setWatch('')
                }}
              >
                Добавить
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                Сохранить
              </Button>
              {save.isSuccess && <span className="text-xs text-good-text">Сохранено</span>}
              {save.error instanceof Error && <span className="text-xs text-critical-text">{save.error.message}</span>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
