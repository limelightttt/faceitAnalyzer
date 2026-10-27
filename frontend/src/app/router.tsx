import { createBrowserRouter } from 'react-router-dom'

import { DemoDetailPage } from '@/pages/demo-detail'
import { DemosPage } from '@/pages/demos'
import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'
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
