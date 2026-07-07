import { useCallback, useEffect, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import type { Campaign, CampaignId, CampaignSummary } from '@shared/types'
import { createEmptyCampaign, createUpdatedCampaignMetadata } from './campaignFactory'

export type CampaignsStoreStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'deleting' | 'error'
export type CampaignMutationResult = { ok: true; campaign: Campaign } | { ok: false; reason: string }

export function useCampaignsStore() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [status, setStatus] = useState<CampaignsStoreStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    setLastError(null)

    try {
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
    } catch {
      setLastError('Не удалось прочитать список кампаний.')
      setStatus('error')
    }
  }, [])

  const createCampaign = useCallback(
    async (name: string, description?: string): Promise<CampaignMutationResult> => {
      setStatus('saving')
      setLastError(null)

      try {
        const campaign = createEmptyCampaign({ name, description })
        await desktopApi.storage.saveCampaign(campaign)
        setSelectedCampaign(campaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign }
      } catch {
        setLastError('Не удалось создать кампанию.')
        setStatus('error')
        return { ok: false, reason: 'create-failed' }
      }
    },
    [],
  )

  const openCampaign = useCallback(async (campaignId: CampaignId): Promise<CampaignMutationResult> => {
    setStatus('loading')
    setLastError(null)

    try {
      const campaign = await desktopApi.storage.loadCampaign(campaignId)

      if (campaign === null) {
        setLastError('Кампания не найдена.')
        setStatus('error')
        return { ok: false, reason: 'campaign-not-found' }
      }

      setSelectedCampaign(campaign)
      setStatus('ready')
      return { ok: true, campaign }
    } catch {
      setLastError('Не удалось открыть кампанию.')
      setStatus('error')
      return { ok: false, reason: 'open-failed' }
    }
  }, [])

  const saveSelectedCampaign = useCallback(
    async (name: string, description?: string): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для сохранения.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createUpdatedCampaignMetadata(selectedCampaign, name, description)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось сохранить кампанию.')
        setStatus('error')
        return { ok: false, reason: 'save-failed' }
      }
    },
    [selectedCampaign],
  )

  const deleteSelectedCampaign = useCallback(async (): Promise<boolean> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для удаления.')
      return false
    }

    setStatus('deleting')
    setLastError(null)

    try {
      await desktopApi.storage.deleteCampaign(selectedCampaign.id)
      setSelectedCampaign(null)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return true
    } catch {
      setLastError('Не удалось удалить кампанию.')
      setStatus('error')
      return false
    }
  }, [selectedCampaign])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    campaigns,
    selectedCampaign,
    status,
    lastError,
    refresh,
    createCampaign,
    openCampaign,
    saveSelectedCampaign,
    deleteSelectedCampaign,
  }
}
