import { useCallback, useEffect, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import type { CampaignSummary } from '@shared/types'

export type CampaignsStoreStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useCampaignsStore() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [status, setStatus] = useState<CampaignsStoreStatus>('idle')

  const refresh = useCallback(async () => {
    setStatus('loading')

    try {
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    campaigns,
    status,
    refresh,
  }
}
