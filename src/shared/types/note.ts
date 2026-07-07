import type { CampaignId, EntityId, IsoDateString } from './common.js'

export type NoteId = EntityId

export type NoteScope = 'master' | 'players'

export interface Note {
  id: NoteId
  campaignId: CampaignId
  title: string
  body: string
  scope: NoteScope
  createdAt: IsoDateString
  updatedAt: IsoDateString
}
