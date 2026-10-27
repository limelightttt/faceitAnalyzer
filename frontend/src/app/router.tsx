import { createBrowserRouter } from 'react-router-dom'

import { CoachPage } from '@/pages/coach'
import { DemoDetailPage } from '@/pages/demo-detail'
import { DemosPage } from '@/pages/demos'
import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'
import { PredictionsPage } from '@/pages/predictions'
import { ScoutPage } from '@/pages/scout'
import { ScoutReportPage } from '@/pages/scout-report'
import { SettingsPage } from '@/pages/settings'
import {
  MatchDetailPage,
  PlayerComparePage,
  PlayerEloPage,
  PlayerInsightsPage,
  PlayerLayout,
  PlayerMatchesPage,
  PlayerMatchmakingPage,
  PlayerOverviewPage,
} from '@/pages/player'

import { AppLayout } from './layout/app-layout'

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'scout', element: <ScoutPage /> },
      { path: 'scout/:scoutId', element: <ScoutReportPage /> },
      { path: 'coach', element: <CoachPage /> },
      { path: 'predictions', element: <PredictionsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'demos', element: <DemosPage /> },
      { path: 'demos/:demoId', element: <DemoDetailPage /> },
      {
        path: 'players/:nickname',
        element: <PlayerLayout />,
        children: [
          { index: true, element: <PlayerOverviewPage /> },
          { path: 'matches', element: <PlayerMatchesPage /> },
          { path: 'matches/:matchId', element: <MatchDetailPage /> },
          { path: 'compare', element: <PlayerComparePage /> },
          { path: 'insights', element: <PlayerInsightsPage /> },
          { path: 'elo', element: <PlayerEloPage /> },
          { path: 'matchmaking', element: <PlayerMatchmakingPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
