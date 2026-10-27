import { Link } from 'react-router-dom'

import { EmptyState } from '@/shared/ui'

export function NotFoundPage() {
  return (
    <EmptyState title="Страница не найдена">
      <Link to="/" className="underline">
        На главную
      </Link>
    </EmptyState>
  )
}
