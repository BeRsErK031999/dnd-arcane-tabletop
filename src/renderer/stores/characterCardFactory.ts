import type {
  Campaign,
  CharacterCard,
  CharacterCardId,
  CharacterCardKind,
  IsoDateString,
  Scene,
  SceneCanvasObject,
  SceneCanvasObjectTokenState,
} from '@shared/types'
import { getSceneCanvasState } from './sceneCanvasFactory'

export interface CharacterCardInput {
  name: string
  kind?: CharacterCardKind
  playerName?: string
  description?: string
  armorClass?: number
  hitPointsCurrent?: number
  hitPointsMaximum?: number
  hitPointsTemporary?: number
  initiativeModifier?: number
  portraitAssetId?: string
  notes?: string
}

export function createCampaignWithHydratedCharacterCards(campaign: Campaign): Campaign {
  return {
    ...campaign,
    characterCards: campaign.characterCards.map((card) =>
      normalizeCharacterCard(card, campaign.id, campaign.createdAt),
    ),
  }
}

export function createCampaignWithNewCharacterCard(
  campaign: Campaign,
  input: CharacterCardInput,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const card = createCharacterCard(campaign, input, updatedAt)

  return {
    ...campaign,
    updatedAt,
    characterCards: [...campaign.characterCards.map((candidate) => normalizeCharacterCard(candidate, campaign.id)), card],
  }
}

export function createCampaignWithUpdatedCharacterCard(
  campaign: Campaign,
  cardId: CharacterCardId,
  input: CharacterCardInput,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  findCharacterCardOrThrow(campaign, cardId)

  return {
    ...campaign,
    updatedAt,
    characterCards: campaign.characterCards.map((card) => {
      const normalizedCard = normalizeCharacterCard(card, campaign.id)

      return normalizedCard.id === cardId
        ? createCharacterCard(campaign, input, updatedAt, normalizedCard)
        : normalizedCard
    }),
  }
}

export function createCampaignWithoutCharacterCard(
  campaign: Campaign,
  cardId: CharacterCardId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  findCharacterCardOrThrow(campaign, cardId)

  return {
    ...campaign,
    updatedAt,
    characterCards: campaign.characterCards
      .filter((card) => card.id !== cardId)
      .map((card) => normalizeCharacterCard(card, campaign.id)),
    scenes: campaign.scenes.map((scene) => createSceneWithoutCharacterCardLinks(scene, cardId, updatedAt)),
  }
}

export function createCharacterCardList(cards: CharacterCard[], campaignId: Campaign['id']): CharacterCard[] {
  return cards
    .map((card) => normalizeCharacterCard(card, campaignId))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
}

function createCharacterCard(
  campaign: Campaign,
  input: CharacterCardInput,
  updatedAt: IsoDateString,
  previousCard?: CharacterCard,
): CharacterCard {
  return {
    id: previousCard?.id ?? createCharacterCardId(),
    campaignId: campaign.id,
    kind: normalizeCharacterCardKind(input.kind),
    name: normalizeCardName(input.name),
    playerName: normalizeOptionalText(input.playerName),
    description: normalizeOptionalText(input.description),
    armorClass: normalizeOptionalInteger(input.armorClass),
    hitPoints: normalizeHitPoints(input),
    initiativeModifier: normalizeOptionalSignedInteger(input.initiativeModifier),
    portraitAssetId: normalizePortraitAssetId(campaign, input.portraitAssetId),
    notes: normalizeOptionalText(input.notes),
    createdAt: previousCard?.createdAt ?? updatedAt,
    updatedAt,
  }
}

function normalizeCharacterCard(
  card: Partial<CharacterCard>,
  campaignId: Campaign['id'],
  fallbackTimestamp: IsoDateString = new Date().toISOString(),
): CharacterCard {
  return {
    id: card.id ?? createCharacterCardId(),
    campaignId,
    kind: normalizeCharacterCardKind(card.kind),
    name: normalizeCardName(card.name ?? ''),
    playerName: normalizeOptionalText(card.playerName),
    description: normalizeOptionalText(card.description),
    armorClass: normalizeOptionalInteger(card.armorClass),
    hitPoints: normalizeHitPoints({
      hitPointsCurrent: card.hitPoints?.current,
      hitPointsMaximum: card.hitPoints?.maximum,
      hitPointsTemporary: card.hitPoints?.temporary,
      name: card.name ?? '',
    }),
    initiativeModifier: normalizeOptionalSignedInteger(card.initiativeModifier),
    portraitAssetId: card.portraitAssetId,
    notes: normalizeOptionalText(card.notes),
    createdAt: card.createdAt ?? fallbackTimestamp,
    updatedAt: card.updatedAt ?? fallbackTimestamp,
  }
}

function createSceneWithoutCharacterCardLinks(
  scene: Scene,
  cardId: CharacterCardId,
  updatedAt: IsoDateString,
): Scene {
  const canvas = getSceneCanvasState(scene)
  let didRemoveLink = false
  const objects = canvas.objects.map((object) => {
    if (object.tokenState?.characterCardId !== cardId) {
      return object
    }

    didRemoveLink = true
    return {
      ...object,
      tokenState: normalizeTokenState({
        ...object.tokenState,
        characterCardId: undefined,
      }),
    }
  })

  if (!didRemoveLink) {
    return scene
  }

  return {
    ...scene,
    canvas: {
      ...canvas,
      objects,
      updatedAt,
    },
  }
}

function normalizeTokenState(
  tokenState: SceneCanvasObjectTokenState,
): SceneCanvasObject['tokenState'] {
  const note = tokenState.note?.trim()
  const normalizedState: SceneCanvasObjectTokenState = {
    characterCardId: tokenState.characterCardId,
    hitPoints: normalizeOptionalInteger(tokenState.hitPoints),
    armorClass: normalizeOptionalInteger(tokenState.armorClass),
    note: note === '' ? undefined : note,
  }

  return Object.values(normalizedState).some((value) => value !== undefined) ? normalizedState : undefined
}

function normalizeHitPoints(input: CharacterCardInput): CharacterCard['hitPoints'] {
  const current = normalizeOptionalInteger(input.hitPointsCurrent)
  const maximum = normalizeOptionalInteger(input.hitPointsMaximum)
  const temporary = normalizeOptionalInteger(input.hitPointsTemporary)

  if (current === undefined && maximum === undefined && temporary === undefined) {
    return undefined
  }

  const safeMaximum = maximum ?? current ?? 1
  const safeCurrent = current ?? safeMaximum

  return {
    current: Math.min(safeCurrent, safeMaximum),
    maximum: safeMaximum,
    temporary,
  }
}

function normalizeCharacterCardKind(kind: CharacterCardKind | undefined): CharacterCardKind {
  if (kind === 'npc' || kind === 'monster') {
    return kind
  }

  return 'player'
}

function normalizePortraitAssetId(campaign: Campaign, assetId: string | undefined): string | undefined {
  if (!assetId) {
    return undefined
  }

  const asset = campaign.assets.find((candidate) => candidate.id === assetId)
  return asset?.kind === 'portrait' || asset?.kind === 'token' ? asset.id : undefined
}

function normalizeCardName(name: string): string {
  const trimmedName = name.trim()
  return trimmedName === '' ? 'Новая карточка' : trimmedName
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim()
  return trimmedValue === '' ? undefined : trimmedValue
}

function normalizeOptionalInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, Math.round(Number(value)))
}

function normalizeOptionalSignedInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined
  }

  return Math.round(Number(value))
}

function findCharacterCardOrThrow(campaign: Campaign, cardId: CharacterCardId): CharacterCard {
  const card = campaign.characterCards.find((candidate) => candidate.id === cardId)

  if (!card) {
    throw new Error('character-card-not-found')
  }

  return normalizeCharacterCard(card, campaign.id)
}

function createCharacterCardId(): CharacterCardId {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `character-${randomId}`
  }

  return `character-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
