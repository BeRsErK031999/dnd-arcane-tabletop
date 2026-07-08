import type {
  Campaign,
  CharacterCardId,
  CombatParticipant,
  CombatParticipantId,
  CombatState,
  IsoDateString,
  PlayerInitiativeTracker,
  PlayerScreenState,
  TokenId,
} from '@shared/types'

export interface CombatParticipantInput {
  name: string
  initiative?: number
  characterCardId?: CharacterCardId
  tokenId?: TokenId
  isPlayerControlled?: boolean
  isDefeated?: boolean
}

export function createCampaignWithHydratedCombatState(campaign: Campaign): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)

  return {
    ...campaign,
    combatState,
    playerScreenState: createPlayerScreenStateWithInitiative(
      campaign.playerScreenState,
      combatState,
      campaign.updatedAt,
    ),
  }
}

export function createCampaignWithNewCombatParticipant(
  campaign: Campaign,
  input: CombatParticipantInput & { id?: CombatParticipantId },
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)
  const activeParticipantId = getActiveCombatParticipant(combatState)?.id
  const participant = createCombatParticipant(input, input.id)

  return createCampaignWithCombatState(
    campaign,
    {
      ...combatState,
      participants: [...combatState.participants, participant],
    },
    updatedAt,
    activeParticipantId,
  )
}

export function createCampaignWithUpdatedCombatParticipant(
  campaign: Campaign,
  participantId: CombatParticipantId,
  input: CombatParticipantInput,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)
  const activeParticipantId = getActiveCombatParticipant(combatState)?.id
  findCombatParticipantOrThrow(combatState, participantId)

  return createCampaignWithCombatState(
    campaign,
    {
      ...combatState,
      participants: combatState.participants.map((participant) =>
        participant.id === participantId ? createCombatParticipant(input, participant.id) : participant,
      ),
    },
    updatedAt,
    activeParticipantId,
  )
}

export function createCampaignWithoutCombatParticipant(
  campaign: Campaign,
  participantId: CombatParticipantId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)
  findCombatParticipantOrThrow(combatState, participantId)

  return createCampaignWithCombatState(
    campaign,
    {
      ...combatState,
      participants: combatState.participants.filter((participant) => participant.id !== participantId),
    },
    updatedAt,
  )
}

export function createCampaignWithCombatStarted(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)

  return createCampaignWithCombatState(
    campaign,
    {
      ...combatState,
      isActive: combatState.participants.length > 0,
      round: combatState.participants.length > 0 ? Math.max(1, combatState.round) : 0,
      turnIndex: getFirstAvailableTurnIndex(combatState.participants),
    },
    updatedAt,
  )
}

export function createCampaignWithCombatStopped(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)

  return createCampaignWithCombatState(
    campaign,
    {
      ...combatState,
      isActive: false,
      round: 0,
      turnIndex: 0,
    },
    updatedAt,
  )
}

export function createCampaignWithNextCombatTurn(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)

  if (combatState.participants.length === 0) {
    return createCampaignWithCombatStopped(campaign, updatedAt)
  }

  const nextTurnIndex = getNextTurnIndex(combatState.participants, combatState.turnIndex)
  const didWrapRound = nextTurnIndex <= combatState.turnIndex

  return createCampaignWithCombatState(
    campaign,
    {
      ...combatState,
      isActive: true,
      round: Math.max(1, combatState.round) + (didWrapRound ? 1 : 0),
      turnIndex: nextTurnIndex,
    },
    updatedAt,
  )
}

export function createCampaignWithNextCombatRound(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)

  if (combatState.participants.length === 0) {
    return createCampaignWithCombatStopped(campaign, updatedAt)
  }

  return createCampaignWithCombatState(
    campaign,
    {
      ...combatState,
      isActive: true,
      round: Math.max(1, combatState.round) + 1,
      turnIndex: getFirstAvailableTurnIndex(combatState.participants),
    },
    updatedAt,
  )
}

export function createCampaignWithPlayerInitiativeVisibility(
  campaign: Campaign,
  isVisible: boolean,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const combatState = createCombatState(campaign.combatState, campaign.id)

  return {
    ...campaign,
    updatedAt,
    combatState,
    playerScreenState: {
      ...campaign.playerScreenState,
      initiativeVisible: isVisible,
      initiativeTracker: isVisible ? createPlayerInitiativeTracker(combatState) : undefined,
      updatedAt,
    },
  }
}

export function createCombatParticipantList(
  combatState: CombatState | undefined,
  campaignId: Campaign['id'],
): CombatParticipant[] {
  return createCombatState(combatState, campaignId).participants
}

export function createPlayerInitiativeTracker(combatState: CombatState): PlayerInitiativeTracker {
  const normalizedCombatState = createCombatState(combatState, combatState.campaignId)

  return {
    isActive: normalizedCombatState.isActive,
    round: normalizedCombatState.round,
    turnIndex: normalizedCombatState.turnIndex,
    participants: normalizedCombatState.participants.map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      initiative: participant.initiative,
      isActive: normalizedCombatState.isActive && index === normalizedCombatState.turnIndex,
      isPlayerControlled: participant.isPlayerControlled,
      isDefeated: participant.isDefeated,
    })),
  }
}

function createCampaignWithCombatState(
  campaign: Campaign,
  combatState: CombatState,
  updatedAt: IsoDateString,
  activeParticipantId?: CombatParticipantId,
): Campaign {
  const normalizedCombatState = createCombatState(combatState, campaign.id, activeParticipantId)

  return {
    ...campaign,
    updatedAt,
    combatState: normalizedCombatState,
    playerScreenState: createPlayerScreenStateWithInitiative(
      campaign.playerScreenState,
      normalizedCombatState,
      updatedAt,
    ),
  }
}

function createPlayerScreenStateWithInitiative(
  playerScreenState: PlayerScreenState,
  combatState: CombatState,
  updatedAt: IsoDateString,
): PlayerScreenState {
  if (!playerScreenState.initiativeVisible) {
    return {
      ...playerScreenState,
      initiativeTracker: undefined,
    }
  }

  return {
    ...playerScreenState,
    initiativeTracker: createPlayerInitiativeTracker(combatState),
    updatedAt,
  }
}

function createCombatState(
  combatState: Partial<CombatState> | undefined,
  campaignId: Campaign['id'],
  activeParticipantId?: CombatParticipantId,
): CombatState {
  const participants = normalizeCombatParticipants(combatState?.participants)
  const turnIndex = getTurnIndex(participants, combatState?.turnIndex, activeParticipantId)
  const hasParticipants = participants.length > 0
  const isActive = Boolean(combatState?.isActive) && hasParticipants
  const round = isActive ? Math.max(1, normalizeInteger(combatState?.round, 1)) : 0

  return {
    campaignId,
    isActive,
    round,
    turnIndex: hasParticipants ? turnIndex : 0,
    participants,
  }
}

function normalizeCombatParticipants(participants: readonly Partial<CombatParticipant>[] | undefined): CombatParticipant[] {
  if (!Array.isArray(participants)) {
    return []
  }

  return participants.map(normalizeCombatParticipant).sort(sortCombatParticipants)
}

function normalizeCombatParticipant(participant: Partial<CombatParticipant>): CombatParticipant {
  return {
    id: participant.id ?? createCombatParticipantId(),
    name: normalizeParticipantName(participant.name),
    initiative: normalizeSignedInteger(participant.initiative),
    tokenId: participant.tokenId,
    characterCardId: participant.characterCardId,
    isPlayerControlled: Boolean(participant.isPlayerControlled),
    isDefeated: Boolean(participant.isDefeated),
  }
}

function createCombatParticipant(
  input: CombatParticipantInput,
  participantId: CombatParticipantId = createCombatParticipantId(),
): CombatParticipant {
  return normalizeCombatParticipant({
    id: participantId,
    name: input.name,
    initiative: input.initiative,
    tokenId: input.tokenId,
    characterCardId: input.characterCardId,
    isPlayerControlled: input.isPlayerControlled,
    isDefeated: input.isDefeated,
  })
}

function getTurnIndex(
  participants: CombatParticipant[],
  requestedTurnIndex: number | undefined,
  activeParticipantId?: CombatParticipantId,
): number {
  if (participants.length === 0) {
    return 0
  }

  if (activeParticipantId) {
    const activeIndex = participants.findIndex((participant) => participant.id === activeParticipantId)

    if (activeIndex >= 0) {
      return activeIndex
    }
  }

  return Math.min(Math.max(0, normalizeInteger(requestedTurnIndex, 0)), participants.length - 1)
}

function getActiveCombatParticipant(combatState: CombatState): CombatParticipant | null {
  return combatState.participants[combatState.turnIndex] ?? null
}

function getFirstAvailableTurnIndex(participants: CombatParticipant[]): number {
  const availableIndex = participants.findIndex((participant) => !participant.isDefeated)
  return availableIndex >= 0 ? availableIndex : 0
}

function getNextTurnIndex(participants: CombatParticipant[], turnIndex: number): number {
  const safeTurnIndex = Math.min(Math.max(0, turnIndex), participants.length - 1)
  const hasAvailableParticipants = participants.some((participant) => !participant.isDefeated)

  for (let offset = 1; offset <= participants.length; offset += 1) {
    const candidateIndex = (safeTurnIndex + offset) % participants.length
    const candidate = participants[candidateIndex]

    if (!hasAvailableParticipants || !candidate.isDefeated) {
      return candidateIndex
    }
  }

  return safeTurnIndex
}

function findCombatParticipantOrThrow(
  combatState: CombatState,
  participantId: CombatParticipantId,
): CombatParticipant {
  const participant = combatState.participants.find((candidate) => candidate.id === participantId)

  if (!participant) {
    throw new Error('combat-participant-not-found')
  }

  return participant
}

function normalizeParticipantName(name: string | undefined): string {
  const trimmedName = name?.trim() ?? ''
  return trimmedName === '' ? 'Участник' : trimmedName
}

function normalizeInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.round(Number(value)))
}

function normalizeSignedInteger(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(Number(value))
}

function sortCombatParticipants(left: CombatParticipant, right: CombatParticipant): number {
  return (
    right.initiative - left.initiative ||
    left.name.localeCompare(right.name, 'ru') ||
    left.id.localeCompare(right.id)
  )
}

function createCombatParticipantId(): CombatParticipantId {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `combat-${randomId}`
  }

  return `combat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
