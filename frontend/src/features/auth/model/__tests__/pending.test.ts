import { describe, expect, it } from 'vitest'

import { classifyAuthError } from '../pending'

describe('classifyAuthError', () => {
  it.each([
    ['Закрытая бета: этот аккаунт не в списке доступа (BETA_ALLOWLIST)', 'allowlist'],
    ['Сессия входа устарела, начните вход заново', 'state'],
    ['Вход начат в другом браузере (защита от login CSRF)', 'state'],
    ['Steam недоступен для проверки входа', 'unavailable'],
    ['FACEIT вернул ошибку: access_denied', 'cancelled'],
    ['Steam не подтвердил вход', 'cancelled'],
    ['Этот аккаунт уже привязан к другой учётной записи FACEIT Intelligence', 'linked'],
    ['что-то иное', 'other'],
  ])('%s → %s', (message, kind) => {
    const f = classifyAuthError(message)
    expect(f.kind).toBe(kind)
    expect(f.title).not.toBe(message) // headline adds meaning instead of echoing the server text
  })
})
