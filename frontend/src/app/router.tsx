import { createBrowserRouter } from 'react-router-dom'

import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'

import { AppLayout } from './layout/app-layout'
import { RouteError } from './layout/route-error'
import { lazyPage } from './lazy-route'

// Every page except the dashboard is its own chunk (charts included): the first screen loads fast even
// on a slow connection. While a chunk loads the current page stays visible and the header shows a
// thin progress bar (RouteProgress) instead of blanking the screen.
const player = () => import('@/pages/player')

export const routes = [
  {
    element: <AppLayout />,
    errorElement: <RouteError />, // last resort if the layout itself fails
    children: [
      {
        // errors render inside the app chrome (header, navigation stay usable)
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'scout', lazy: lazyPage(() => import('@/pages/scout'), (m) => m.ScoutPage) },
          { path: 'scout/:scoutId', lazy: lazyPage(() => import('@/pages/scout-report'), (m) => m.ScoutReportPage) },
          { path: 'stack', lazy: lazyPage(() => import('@/pages/stack'), (m) => m.StackPage) },
          { path: 'coach', lazy: lazyPage(() => import('@/pages/coach'), (m) => m.CoachPage) },
          { path: 'predictions', lazy: lazyPage(() => import('@/pages/predictions'), (m) => m.PredictionsPage) },
          { path: 'settings', lazy: lazyPage(() => import('@/pages/settings'), (m) => m.SettingsPage) },
          { path: 'demos', lazy: lazyPage(() => import('@/pages/demos'), (m) => m.DemosPage) },
          { path: 'demos/:demoId', lazy: lazyPage(() => import('@/pages/demo-detail'), (m) => m.DemoDetailPage) },
          {
            path: 'players/:nickname',
            lazy: lazyPage(player, (m) => m.PlayerLayout),
            children: [
              { index: true, lazy: lazyPage(player, (m) => m.PlayerOverviewPage) },
              { path: 'matches', lazy: lazyPage(player, (m) => m.PlayerMatchesPage) },
              { path: 'matches/:matchId', lazy: lazyPage(player, (m) => m.MatchDetailPage) },
              { path: 'compare', lazy: lazyPage(player, (m) => m.PlayerComparePage) },
              { path: 'insights', lazy: lazyPage(player, (m) => m.PlayerInsightsPage) },
              { path: 'elo', lazy: lazyPage(player, (m) => m.PlayerEloPage) },
              { path: 'matchmaking', lazy: lazyPage(player, (m) => m.PlayerMatchmakingPage) },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
