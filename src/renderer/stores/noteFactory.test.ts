import { describe, expect, it } from 'vitest'
import type { Note } from '@shared/types'
import { createEmptyCampaign } from './campaignFactory'
import {
  createCampaignWithHiddenPlayerHandout,
  createCampaignWithHydratedNotes,
  createCampaignWithNewNote,
  createCampaignWithNoteHandout,
  createCampaignWithUpdatedNote,
  createCampaignWithoutNote,
} from './noteFactory'

describe('noteFactory', () => {
  it('creates and normalizes campaign notes', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Campaign',
      timestamp: '2026-07-08T00:00:00.000Z',
    })

    const updated = createCampaignWithNewNote(
      campaign,
      {
        id: 'note-test',
        title: '  Письмо из башни  ',
        body: '  Встретимся у северных ворот.  ',
        scope: 'players',
      },
      '2026-07-08T01:00:00.000Z',
    )

    expect(updated.notes).toEqual([
      {
        id: 'note-test',
        campaignId: 'campaign-test',
        title: 'Письмо из башни',
        body: 'Встретимся у северных ворот.',
        scope: 'players',
        createdAt: '2026-07-08T01:00:00.000Z',
        updatedAt: '2026-07-08T01:00:00.000Z',
      },
    ])
    expect(updated.updatedAt).toBe('2026-07-08T01:00:00.000Z')
  })

  it('updates and deletes notes from campaign JSON state', () => {
    const campaign = createCampaignWithNewNote(
      createEmptyCampaign({
        id: 'campaign-test',
        name: 'Campaign',
        timestamp: '2026-07-08T00:00:00.000Z',
      }),
      {
        id: 'note-test',
        title: 'Черновик',
        body: 'старый текст',
        scope: 'master',
      },
      '2026-07-08T01:00:00.000Z',
    )

    const updated = createCampaignWithUpdatedNote(
      campaign,
      'note-test',
      {
        title: 'Публичное письмо',
        body: 'новый текст',
        scope: 'players',
      },
      '2026-07-08T02:00:00.000Z',
    )
    const deleted = createCampaignWithoutNote(updated, 'note-test', '2026-07-08T03:00:00.000Z')

    expect(updated.notes[0]).toMatchObject({
      id: 'note-test',
      title: 'Публичное письмо',
      body: 'новый текст',
      scope: 'players',
      createdAt: '2026-07-08T01:00:00.000Z',
      updatedAt: '2026-07-08T02:00:00.000Z',
    })
    expect(deleted.notes).toEqual([])
    expect(deleted.updatedAt).toBe('2026-07-08T03:00:00.000Z')
  })

  it('builds a player handout state only for public notes', () => {
    const campaign = createCampaignWithNewNote(
      createCampaignWithNewNote(
        createEmptyCampaign({
          id: 'campaign-test',
          name: 'Campaign',
          timestamp: '2026-07-08T00:00:00.000Z',
        }),
        {
          id: 'note-secret',
          title: 'Секретный ход',
          body: 'тайный проход за алтарем',
          scope: 'master',
        },
        '2026-07-08T01:00:00.000Z',
      ),
      {
        id: 'note-public',
        title: 'Письмо от капитана',
        body: 'Приходите на рассвете.',
        scope: 'players',
      },
      '2026-07-08T02:00:00.000Z',
    )

    const updated = createCampaignWithNoteHandout(campaign, 'note-public', '2026-07-08T03:00:00.000Z')

    expect(updated.playerScreenState).toMatchObject({
      mode: 'image',
      isHidden: false,
      title: 'Письмо от капитана',
      message: 'Приходите на рассвете.',
      campaignId: 'campaign-test',
      handoutPreview: {
        id: 'note-public',
        name: 'Письмо от капитана',
        description: 'Приходите на рассвете.',
        kind: 'handout',
        sourceLabel: 'Заметка',
      },
    })
    expect(JSON.stringify(updated.playerScreenState)).not.toContain('тайный проход')
    expect(() => createCampaignWithNoteHandout(campaign, 'note-secret')).toThrow('note-is-secret')
  })

  it('hydrates legacy notes and hides the active handout', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Campaign',
      timestamp: '2026-07-08T00:00:00.000Z',
    })
    const legacyNote = {
      id: 'note-legacy',
      campaignId: 'other-campaign',
      title: '',
      body: '  старый текст  ',
      scope: 'unknown',
      createdAt: '',
      updatedAt: '',
    } as unknown as Note
    const withLegacyNote = {
      ...campaign,
      notes: [legacyNote],
    }

    const hydrated = createCampaignWithHydratedNotes(withLegacyNote)
    const handout = createCampaignWithNoteHandout(
      createCampaignWithUpdatedNote(
        hydrated,
        'note-legacy',
        { title: 'Публичная заметка', body: 'готово', scope: 'players' },
        '2026-07-08T01:00:00.000Z',
      ),
      'note-legacy',
      '2026-07-08T02:00:00.000Z',
    )
    const hidden = createCampaignWithHiddenPlayerHandout(handout, '2026-07-08T03:00:00.000Z')

    expect(hydrated.notes[0]).toMatchObject({
      campaignId: 'campaign-test',
      title: 'Новая заметка',
      body: 'старый текст',
      scope: 'master',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    })
    expect(hidden.playerScreenState.isHidden).toBe(true)
    expect(hidden.playerScreenState.updatedAt).toBe('2026-07-08T03:00:00.000Z')
  })
})
