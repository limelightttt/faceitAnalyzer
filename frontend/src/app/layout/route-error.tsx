import { Bug, Home, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

import { NotFoundPage } from '@/pages/not-found'
import { useConnectivity } from '@/shared/api/network'
import { Button, StatusPanel } from '@/shared/ui'

import { isChunkLoadError } from '../lazy-route'

/** Errors while opening or rendering a page, shown inside the app chrome instead of the router's raw
 * "Unexpected Application Error". Technical details only in development builds. */
export function RouteError() {
  const error = useRouteError()
  const { online } = useConnectivity()
  const chunk = isChunkLoadError(error)
  // a page whose code never loaded opens by itself once the connection is back
  useEffect(() => {
    if (!chunk) return
    const reopen = () => window.location.reload()
    window.addEventListener('online', reopen)
    return () => window.removeEventListener('online', reopen)
  }, [chunk])

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  const reload = (
    <Button size="sm" onClick={() => window.location.reload()}>
      <RefreshCw /> Обновить страницу
    </Button>
  )
  if (chunk)
    return online ? (
      <StatusPanel icon={RefreshCw} tone="warning" title="Не удалось загрузить страницу" actions={reload} className="mt-6 py-12">
        Возможно, приложение обновилось или связь прервалась. Обновите страницу — данные сохранены.
      </StatusPanel>
    ) : (
      <StatusPanel role="status" icon={WifiOff} tone="warning" title="Эта страница ещё не открывалась, а подключения нет" className="mt-6 py-12">
        Страница откроется автоматически, когда связь появится. Уже открытые разделы доступны.
      </StatusPanel>
    )
  return (
    <StatusPanel
      role="alert"
      icon={Bug}
      tone="critical"
      title="На этой странице что-то сломалось"
      className="mt-6 py-12"
      actions={
        <>
          {reload}
          <Button asChild size="sm" variant="secondary">
            <Link to="/">
              <Home /> На главную
            </Link>
          </Button>
        </>
      }
    >
      Остальное приложение работает. Если ошибка повторяется — сообщите, что вы делали перед ней.
      {import.meta.env.DEV && error instanceof Error && <pre className="mt-3 max-w-xl overflow-auto rounded-md bg-card-2 p-2 text-left text-[11px]">{error.stack}</pre>}
    </StatusPanel>
  )
}
