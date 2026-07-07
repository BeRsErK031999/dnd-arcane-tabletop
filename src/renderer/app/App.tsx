import { MASTER_SCREEN_QUERY_VALUE, PLAYER_SCREEN_QUERY_VALUE } from '@shared/constants'
import { MasterDashboardPage } from '@renderer/pages/MasterDashboardPage'
import { PlayerScreenPlaceholderPage } from '@renderer/pages/PlayerScreenPlaceholderPage'
import { MasterShell } from '@renderer/widgets/MasterShell'
import './styles.css'

export function App() {
  const screen = new URLSearchParams(window.location.search).get('screen')

  if (screen === PLAYER_SCREEN_QUERY_VALUE) {
    return <PlayerScreenPlaceholderPage />
  }

  return (
    <MasterShell activeScreen={screen ?? MASTER_SCREEN_QUERY_VALUE}>
      <MasterDashboardPage />
    </MasterShell>
  )
}
