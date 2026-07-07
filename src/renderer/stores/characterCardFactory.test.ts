import { describe, expect, it } from 'vitest'
import type { SceneCanvasObject } from '@shared/types'
import { createEmptyCampaign } from './campaignFactory'
import {
  createCampaignWithNewCharacterCard,
  createCampaignWithUpdatedCharacterCard,
  createCampaignWithoutCharacterCard,
} from './characterCardFactory'
import { getSceneCanvasState } from './sceneCanvasFactory'
import { createCampaignWithNewScene, getActiveCampaignScene } from './sceneFactory'

describe('characterCardFactory', () => {
  it('creates normalized simple character cards', () => {
    const campaign = createCampaignFixture()

    const updated = createCampaignWithNewCharacterCard(
      campaign,
      {
        name: '  Леди Мира  ',
        kind: 'npc',
        playerName: '  Артем  ',
        description: '  Советница города  ',
        armorClass: 15.4,
        hitPointsCurrent: 22,
        hitPointsMaximum: 30,
        hitPointsTemporary: 5,
        initiativeModifier: -1.4,
        notes: '  знает тайный ход  ',
      },
      '2026-07-07T13:00:00.000Z',
    )
    const card = updated.characterCards[0]

    expect(updated.updatedAt).toBe('2026-07-07T13:00:00.000Z')
    expect(card).toMatchObject({
      campaignId: 'campaign-test',
      kind: 'npc',
      name: 'Леди Мира',
      playerName: 'Артем',
      description: 'Советница города',
      armorClass: 15,
      hitPoints: {
        current: 22,
        maximum: 30,
        temporary: 5,
      },
      initiativeModifier: -1,
      notes: 'знает тайный ход',
      createdAt: '2026-07-07T13:00:00.000Z',
      updatedAt: '2026-07-07T13:00:00.000Z',
    })
  })

  it('updates selected cards and preserves createdAt', () => {
    const campaign = createCampaignWithNewCharacterCard(
      createCampaignFixture(),
      {
        name: 'Scout',
        kind: 'player',
      },
      '2026-07-07T13:00:00.000Z',
    )
    const cardId = campaign.characterCards[0].id

    const updated = createCampaignWithUpdatedCharacterCard(
      campaign,
      cardId,
      {
        name: 'Scout Captain',
        kind: 'player',
        hitPointsCurrent: 99,
        hitPointsMaximum: 40,
      },
      '2026-07-07T14:00:00.000Z',
    )

    expect(updated.characterCards[0]).toMatchObject({
      id: cardId,
      name: 'Scout Captain',
      createdAt: '2026-07-07T13:00:00.000Z',
      updatedAt: '2026-07-07T14:00:00.000Z',
      hitPoints: {
        current: 40,
        maximum: 40,
      },
    })
  })

  it('deletes cards and clears token links', () => {
    const campaign = createCampaignWithNewCharacterCard(
      createCampaignWithLinkedTokenFixture(),
      {
        name: 'Linked card',
        kind: 'monster',
      },
      '2026-07-07T13:00:00.000Z',
    )
    const cardId = campaign.characterCards[0].id
    const linkedCampaign = createCampaignWithLinkedTokenFixture(cardId, campaign)

    const updated = createCampaignWithoutCharacterCard(linkedCampaign, cardId, '2026-07-07T15:00:00.000Z')
    const activeScene = getActiveCampaignScene(updated)
    const object = getSceneCanvasState(activeScene!).objects[0]

    expect(updated.characterCards).toEqual([])
    expect(object.tokenState?.characterCardId).toBeUndefined()
    expect(object.tokenState?.hitPoints).toBe(10)
  })
})

function createCampaignFixture() {
  return createEmptyCampaign({
    id: 'campaign-test',
    name: 'Campaign',
    timestamp: '2026-07-07T00:00:00.000Z',
  })
}

function createCampaignWithLinkedTokenFixture(cardId?: string, sourceCampaign = createCampaignFixture()) {
  const withScene =
    sourceCampaign.scenes.length === 0
      ? createCampaignWithNewScene(
          sourceCampaign,
          { id: 'scene-test', name: 'Scene' },
          '2026-07-07T01:00:00.000Z',
        )
      : sourceCampaign
  const activeScene = getActiveCampaignScene(withScene)

  if (!activeScene) {
    throw new Error('active-scene-not-found')
  }

  const tokenObject: SceneCanvasObject = {
    id: 'object-token',
    layerId: 'scene-layer-tokens',
    kind: 'token-placeholder',
    name: 'Linked token',
    x: 140,
    y: 140,
    width: 70,
    height: 70,
    rotation: 0,
    color: '#2c806f',
    text: 'Linked token',
    tokenState: {
      characterCardId: cardId,
      hitPoints: 10,
    },
    isPlayerVisible: true,
  }

  return {
    ...withScene,
    scenes: withScene.scenes.map((scene) =>
      scene.id === activeScene.id
        ? {
            ...scene,
            canvas: {
              ...getSceneCanvasState(scene),
              objects: [tokenObject],
            },
          }
        : scene,
    ),
  }
}
