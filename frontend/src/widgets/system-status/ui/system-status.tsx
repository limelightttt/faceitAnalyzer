import { RefreshCw, ServerCrash, WifiOff } from 'lucide-react'
import { useState } from 'react'

import { useHealth } from '@/entities/system'
import { checkServerNow, useConnectivity } from '@/shared/api/network'
import { cn } from '@/shared/lib/cn'
import { Button, Notice } from '@/shared/ui'

/** Long-lived system status under the header: no internet, or this app's server unreachable. Previously
 * loaded data stays on screen; the banner explains why it may be outdated and disappears on recovery. */
export function ConnectionBanner() {
  const { online, serverReachable } = useConnectivity()
  const [checking, setChecking] = useState(false)
  if (online && serverReachable) return null
  const offline = !online
  const check = async () => {
    setChecking(true)
    await checkServerNow()
    setChecking(false)
  }
  return (
    <div role="status" aria-live="polite" className={cn('animate-enter border-b', offline ? 'border-warning/40 bg-warning/10' : 'border-critical/30 bg-critical/10')}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs">
        {offline ? <WifiOff className="size-4 shrink-0" /> : <ServerCrash className="size-4 shrink-0 text-critical-text" />}
        <div className="min-w-0 flex-1">
          <span className="font-medium">{offline ? 'Нет подключения к интернету.' : 'Сервер FACEIT Intelligence не отвечает.'}</span>{' '}
          <span className="text-muted-foreground">
            {offline ? 'Показаны ранее загруженные данные — они могут быть устаревшими. Действия станут доступны после восстановления связи.' : 'Проверьте, что приложение запущено. Переподключаемся автоматически.'}
          </span>
        </div>
        {!offline && (
          <Button size="sm" variant="ghost" onClick={check} loading={checking} className="h-7 shrink-0">
            <RefreshCw /> Проверить
          </Button>
        )}
      </div>
    </div>
  )
}

/** FACEIT quota exhausted: when fresh data will be possible again. */
export function RateLimitNote() {
  const h = useHealth()
  const rl = h.data?.rate_limit
  if (!rl?.limited) return null
  return (
    <Notice tone="warning">
      Лимит запросов FACEIT API исчерпан. Новые данные появятся примерно через {Math.ceil(rl.retry_in_s / 60)} мин
      {rl.retry_at && ` (после ${new Date(rl.retry_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})`}. Уже загруженное доступно из кэша.
    </Notice>
  )
}

/** Server-level problems that limit what the app can do (missing FACEIT key, rate limit). */
export function ServiceNotes() {
  const h = useHealth()
  if (!h.data) return null
  if (!h.data.api_key_configured)
    return <Notice tone="critical">FACEIT Data API не настроен (FACEIT_API_KEY). Статистика и разведка недоступны, работают только демки.</Notice>
  return <RateLimitNote />
}
