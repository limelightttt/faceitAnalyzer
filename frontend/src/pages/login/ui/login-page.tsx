import { AlertTriangle, Lock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { useHealth } from '@/entities/player'
import { LoginButtons } from '@/features/auth'
import { BrandMark } from '@/shared/ui'

export function LoginPage({ returnTo }: { returnTo?: string }) {
  const [params] = useSearchParams()
  const error = params.get('auth_error')
  const health = useHealth()
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center gap-6">
      <BrandMark size="lg" />
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Вход</h1>
        <p className="text-sm text-muted-foreground">
          Разведка матчей FACEIT, разбор демок и персональный коучинг. Войдите, чтобы приложение определило ваш FACEIT-профиль и сохраняло настройки, разведки и прогнозы.
        </p>
      </div>
      {error && (
        <div role="alert" className="flex gap-2 rounded-lg border border-critical/40 bg-critical/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical-text" />
          <span>{error}</span>
        </div>
      )}
      <LoginButtons returnTo={returnTo ?? '/'} size="lg" className="flex-col [&>*]:w-full" />
      <div className="space-y-1 text-xs text-subtle-foreground">
        <p>Steam: вход через steamcommunity.com (OpenID). Пароль приложению не передаётся.</p>
        {health.data?.private_beta && (
          <p className="flex items-center gap-1">
            <Lock className="size-3" /> Закрытая бета: доступ только для приглашённых аккаунтов.
          </p>
        )}
      </div>
    </div>
  )
}
