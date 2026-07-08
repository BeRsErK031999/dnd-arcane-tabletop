import { describe, expect, it } from 'vitest'
import type { CombatState } from '@shared/types'
import { createEmptyCampaign } from './campaignFactory'
import {
  createCampaignWithCombatStarted,
  createCampaignWithHydratedCombatState,
  createCampaignWithNewCombatParticipant,
  createCampaignWithNextCombatRound,
  createCampaignWithNextCombatTurn,
  createCampaignWithPlayerInitiativeVisibility,
  createCampaignWithUpdatedCombatParticipant,
  createCampaignWithoutCombatParticipant,
  createPlayerInitiativeTracker,
} from './combatFactory'

describe('combatFactory', () => {
  it('creates participants and keeps initiative order', () => {
    const campaign = createCampaignFixture()

    const withFirst = createCampaignWithNewCombatParticipant(
      campaign,
      {
        id: 'combat-scout',
        name: '  Разведчик  ',
        initiative: 12.4,
        isPlayerControlled: true,
      },
      '2026-07-08T01:00:00.000Z',
    )
    const withSecond = createCampaignWithNewCombatParticipant(
      withFirst,
      {
        id: 'combat-captain',
        name: 'Капитан',
        initiative: 18,
      },
      '2026-07-08T02:00:00.000Z',
    )

    expect(withSecond.combatState.participants.map((participant) => participant.id)).toEqual([
      'combat-captain',
      'combat-scout',
    ])
    expect(withSecond.combatState.participants[1]).toMatchObject({
      name: 'Разведчик',
      initiative: 12,
      isPlayerControlled: true,
      isDefeated: false,
    })
    expect(withSecond.updatedAt).toBe('2026-07-08T02:00:00.000Z')
  })

  it('starts combat and advances turns and rounds', () => {
    const campaign = createCombatFixture()
    const started = createCampaignWithCombatStarted(campaign, '2026-07-08T03:00:00.000Z')
    const nextTurn = createCampaignWithNextCombatTurn(started, '2026-07-08T04:00:00.000Z')
    const wrappedTurn = createCampaignWithNextCombatTurn(nextTurn, '2026-07-08T05:00:00.000Z')
    const nextRound = createCampaignWithNextCombatRound(wrappedTurn, '2026-07-08T06:00:00.000Z')

    expect(started.combatState).toMatchObject({
      isActive: true,
      round: 1,
      turnIndex: 0,
    })
    expect(nextTurn.combatState).toMatchObject({
      round: 1,
      turnIndex: 1,
    })
    expect(wrappedTurn.combatState).toMatchObject({
      round: 2,
      turnIndex: 0,
    })
    expect(nextRound.combatState).toMatchObject({
      round: 3,
      turnIndex: 0,
    })
  })

  it('skips defeated participants when advancing turns', () => {
    const campaign = createCampaignWithUpdatedCombatParticipant(
      createCombatFixture(),
      'combat-scout',
      {
        name: 'Разведчик',
        initiative: 12,
        isPlayerControlled: true,
        isDefeated: true,
      },
      '2026-07-08T03:00:00.000Z',
    )
    const started = createCampaignWithCombatStarted(campaign, '2026-07-08T04:00:00.000Z')
    const nextTurn = createCampaignWithNextCombatTurn(started, '2026-07-08T05:00:00.000Z')

    expect(started.combatState.participants[started.combatState.turnIndex]?.id).toBe('combat-captain')
    expect(nextTurn.combatState.participants[nextTurn.combatState.turnIndex]?.id).toBe('combat-captain')
    expect(nextTurn.combatState.round).toBe(2)
  })

  it('builds player-safe initiative projection', () => {
    const campaign = createCampaignWithPlayerInitiativeVisibility(
      createCampaignWithCombatStarted(createCombatFixture(), '2026-07-08T03:00:00.000Z'),
      true,
      '2026-07-08T04:00:00.000Z',
    )

    expect(campaign.playerScreenState).toMatchObject({
      initiativeVisible: true,
      initiativeTracker: {
        isActive: true,
        round: 1,
        participants: [
          {
            id: 'combat-captain',
            name: 'Капитан',
            initiative: 18,
            isActive: true,
          },
          {
            id: 'combat-scout',
            name: 'Разведчик',
            initiative: 12,
            isActive: false,
          },
        ],
      },
    })
    expect(JSON.stringify(campaign.playerScreenState.initiativeTracker)).not.toContain('token-')
    expect(JSON.stringify(campaign.playerScreenState.initiativeTracker)).not.toContain('character-')
  })

  it('hydrates legacy combat state and removes participants', () => {
    const campaign = createCampaignFixture()
    const legacyCombatState = {
      campaignId: 'other-campaign',
      isActive: true,
      round: -1,
      turnIndex: 99,
      participants: [
        {
          id: 'combat-legacy',
          name: '',
          initiative: Number.NaN,
          isPlayerControlled: false,
          isDefeated: false,
        },
      ],
    } as unknown as CombatState

    const hydrated = createCampaignWithHydratedCombatState({
      ...campaign,
      combatState: legacyCombatState,
    })
    const removed = createCampaignWithoutCombatParticipant(hydrated, 'combat-legacy', '2026-07-08T07:00:00.000Z')

    expect(hydrated.combatState).toMatchObject({
      campaignId: 'campaign-test',
      isActive: true,
      round: 1,
      turnIndex: 0,
      participants: [
        {
          id: 'combat-legacy',
          name: 'Участник',
          initiative: 0,
        },
      ],
    })
    expect(removed.combatState.participants).toEqual([])
    expect(removed.combatState.isActive).toBe(false)
  })

  it('creates standalone public tracker snapshots', () => {
    const tracker = createPlayerInitiativeTracker(createCampaignWithCombatStarted(createCombatFixture()).combatState)

    expect(tracker.participants.map((participant) => [participant.name, participant.isActive])).toEqual([
      ['Капитан', true],
      ['Разведчик', false],
    ])
  })
})

function createCampaignFixture() {
  return createEmptyCampaign({
    id: 'campaign-test',
    name: 'Campaign',
    timestamp: '2026-07-08T00:00:00.000Z',
  })
}

function createCombatFixture() {
  const withScout = createCampaignWithNewCombatParticipant(
    createCampaignFixture(),
    {
      id: 'combat-scout',
      name: 'Разведчик',
      initiative: 12,
      isPlayerControlled: true,
      characterCardId: 'character-scout',
    },
  )

  return createCampaignWithNewCombatParticipant(withScout, {
    id: 'combat-captain',
    name: 'Капитан',
    initiative: 18,
    tokenId: 'token-captain',
  })
}
