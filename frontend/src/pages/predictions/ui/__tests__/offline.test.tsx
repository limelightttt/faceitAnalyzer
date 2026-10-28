import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/shared/ui'

import { PredictionsPage } from '../predictions-page'

describe('offline with nothing cached', () => {
  afterEach(() => onlineManager.setOnline(true))

  it('every section waits with an explanation instead of an endless skeleton', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    onlineManager.setOnline(false)
    const qc = new QueryClient()
    qc.setQueryData(['session'], { authenticated: true, providers: { steam: { configured: true }, faceit: { configured: false }, dev: { configured: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <MemoryRouter>
            <PredictionsPage />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findAllByText('Нет подключения к интернету')).toHaveLength(2) // metrics + list
    expect(container.querySelector('.skeleton')).toBeNull()
    vi.unstubAllGlobals()
  })
})
