import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '../button'
import { ConfirmButton } from '../confirm-button'

describe('Button', () => {
  it('treats a double-click as one action', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Сохранить</Button>)
    const b = screen.getByRole('button', { name: 'Сохранить' })
    fireEvent.click(b, { detail: 1 })
    fireEvent.click(b, { detail: 2 })
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is busy and blocked while loading', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} loading>
        Сохранить
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Сохранить' })
    expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b).toBeDisabled()
  })

  it('confirms destructive actions in two separate steps', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmButton onConfirm={onConfirm} aria-label="Удалить демо">
        x
      </ConfirmButton>,
    )
    const b = screen.getByRole('button', { name: 'Удалить демо' })
    fireEvent.click(b, { detail: 1 })
    fireEvent.click(b, { detail: 2 }) // a double-click only arms it
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Нажмите ещё раз/ }), { detail: 1 })
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
