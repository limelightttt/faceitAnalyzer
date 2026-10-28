import { Compass, Home, Radar } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button, StatusPanel } from '@/shared/ui'

export function NotFoundPage() {
  return (
    <StatusPanel
      icon={Compass}
      title="Страница не найдена"
      className="mt-6 py-14"
      actions={
        <>
          <Button asChild size="sm">
            <Link to="/">
              <Home /> На главную
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/scout">
              <Radar /> Разведка матча
            </Link>
          </Button>
        </>
      }
    >
      Такого адреса в FACEIT Intelligence нет — возможно, ссылка устарела или в ней опечатка.
    </StatusPanel>
  )
}
