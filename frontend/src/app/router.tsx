import { createBrowserRouter } from 'react-router-dom'

import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'

import { AppLayout } from './layout/app-layout'

// Every page except the dashboard is its own chunk (charts included): the first screen loads fast even
// on a slow connection. While a chunk loads the current page stays visible and the header shows a
// thin progress bar (RouteProgress) instead of blanking the screen.
const player = () => import('@/pages/player')

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'scout', lazy: () => import('@/pages/scout').then((m) => ({ Component: m.ScoutPage })) },
      { path: 'scout/:scoutId', lazy: () => import('@/pages/scout-report').then((m) => ({ Component: m.ScoutReportPage })) },
      { path: 'coach', lazy: () => import('@/pages/coach').then((m) => ({ Component: m.CoachPage })) },
      { path: 'predictions', lazy: () => import('@/pages/predictions').then((m) => ({ Component: m.PredictionsPage })) },
      { path: 'settings', lazy: () => import('@/pages/settings').then((m) => ({ Component: m.SettingsPage })) },
      { path: 'demos', lazy: () => import('@/pages/demos').then((m) => ({ Component: m.DemosPage })) },
      { path: 'demos/:demoId', lazy: () => import('@/pages/demo-detail').then((m) => ({ Component: m.DemoDetailPage })) },
      {
        path: 'players/:nickname',
        lazy: () => player().then((m) => ({ Component: m.PlayerLayout })),
        children: [
          { index: true, lazy: () => player().then((m) => ({ Component: m.PlayerOverviewPage })) },
          { path: 'matches', lazy: () => player().then((m) => ({ Component: m.PlayerMatchesPage })) },
          { path: 'matches/:matchId', lazy: () => player().then((m) => ({ Component: m.MatchDetailPage })) },
          { path: 'compare', lazy: () => player().then((m) => ({ Component: m.PlayerComparePage })) },
          { path: 'insights', lazy: () => player().then((m) => ({ Component: m.PlayerInsightsPage })) },
          { path: 'elo', lazy: () => player().then((m) => ({ Component: m.PlayerEloPage })) },
          { path: 'matchmaking', lazy: () => player().then((m) => ({ Component: m.PlayerMatchmakingPage })) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
