import { useState } from 'react'
import { MasterDashboardPage } from '@renderer/pages/MasterDashboardPage'
import { PlayerScreenPlaceholderPage } from '@renderer/pages/PlayerScreenPlaceholderPage'
import { ProjectStartPage } from '@renderer/pages/ProjectStartPage'
import { useCampaignsStore } from '@renderer/stores/useCampaignsStore'
import { MasterShell } from '@renderer/widgets/MasterShell'
import { MASTER_SCREEN_QUERY_VALUE, PLAYER_SCREEN_QUERY_VALUE } from '@shared/constants'
import type { CampaignId } from '@shared/types'
import './styles.css'

export function App() {
  const screen = new URLSearchParams(window.location.search).get('screen')

  if (screen === PLAYER_SCREEN_QUERY_VALUE) {
    return <PlayerScreenPlaceholderPage />
  }

  return <MasterApplication activeScreen={screen ?? MASTER_SCREEN_QUERY_VALUE} />
}

interface MasterApplicationProps {
  activeScreen: string
}

function MasterApplication({ activeScreen }: MasterApplicationProps) {
  const campaignsStore = useCampaignsStore()
  const [workspaceCampaignId, setWorkspaceCampaignId] = useState<CampaignId | null>(null)
  const [isReturningHome, setIsReturningHome] = useState(false)

  async function returnToProjectLibrary(): Promise<void> {
    if (isReturningHome) {
      return
    }

    setIsReturningHome(true)
    const selectedCampaign = campaignsStore.selectedCampaign

    if (selectedCampaign !== null) {
      const saveResult = await campaignsStore.saveSelectedCampaign(
        selectedCampaign.name,
        selectedCampaign.description,
      )

      if (!saveResult.ok) {
        setIsReturningHome(false)
        return
      }
    }

    await campaignsStore.refresh()
    setWorkspaceCampaignId(null)
    setIsReturningHome(false)
  }

  if (workspaceCampaignId === null) {
    return (
      <ProjectStartPage
        campaignsStore={campaignsStore}
        onLaunchProject={(campaignId) => setWorkspaceCampaignId(campaignId)}
      />
    )
  }

  return (
    <MasterShell
      activeScreen={activeScreen}
      homeDisabled={isReturningHome}
      onHome={() => void returnToProjectLibrary()}
    >
      <MasterDashboardPage campaignsStore={campaignsStore} />
    </MasterShell>
  )
}
