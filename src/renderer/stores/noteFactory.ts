import type { Campaign, IsoDateString, Note, NoteId, NoteScope, PlayerScreenState } from '@shared/types'

export interface NoteInput {
  title: string
  body: string
  scope: NoteScope
}

export function createCampaignWithHydratedNotes(campaign: Campaign): Campaign {
  return {
    ...campaign,
    notes: createNoteList(campaign.notes, campaign.id, campaign.updatedAt),
  }
}

export function createCampaignWithNewNote(
  campaign: Campaign,
  input: NoteInput & { id?: NoteId },
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const note: Note = normalizeNote(
    {
      id: input.id ?? createNoteId(),
      campaignId: campaign.id,
      title: input.title,
      body: input.body,
      scope: input.scope,
      createdAt: updatedAt,
      updatedAt,
    },
    campaign.id,
    updatedAt,
  )

  return {
    ...campaign,
    updatedAt,
    notes: createNoteList([...campaign.notes, note], campaign.id, updatedAt),
  }
}

export function createCampaignWithUpdatedNote(
  campaign: Campaign,
  noteId: NoteId,
  input: NoteInput,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  findNoteOrThrow(campaign, noteId)

  return {
    ...campaign,
    updatedAt,
    notes: createNoteList(
      campaign.notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              title: input.title,
              body: input.body,
              scope: input.scope,
              updatedAt,
            }
          : note,
      ),
      campaign.id,
      updatedAt,
    ),
  }
}

export function createCampaignWithoutNote(
  campaign: Campaign,
  noteId: NoteId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  findNoteOrThrow(campaign, noteId)

  const nextPlayerScreenState =
    campaign.playerScreenState.handoutPreview?.id === noteId
      ? createHiddenPlayerHandoutState(campaign.playerScreenState, updatedAt)
      : campaign.playerScreenState

  return {
    ...campaign,
    updatedAt,
    notes: createNoteList(
      campaign.notes.filter((note) => note.id !== noteId),
      campaign.id,
      updatedAt,
    ),
    playerScreenState: nextPlayerScreenState,
  }
}

export function createCampaignWithNoteHandout(
  campaign: Campaign,
  noteId: NoteId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const note = findNoteOrThrow(campaign, noteId)

  if (note.scope !== 'players') {
    throw new Error('note-is-secret')
  }

  return {
    ...campaign,
    updatedAt,
    notes: createNoteList(campaign.notes, campaign.id, updatedAt),
    playerScreenState: createNotePlayerScreenState(campaign, note, updatedAt),
  }
}

export function createCampaignWithHiddenPlayerHandout(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return {
    ...campaign,
    updatedAt,
    playerScreenState: createHiddenPlayerHandoutState(campaign.playerScreenState, updatedAt),
  }
}

export function createNoteList(
  notes: readonly Note[],
  campaignId: Campaign['id'],
  fallbackTimestamp: IsoDateString = new Date().toISOString(),
): Note[] {
  return notes
    .map((note) => normalizeNote(note, campaignId, fallbackTimestamp))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function createNotePlayerScreenState(campaign: Campaign, note: Note, updatedAt: IsoDateString): PlayerScreenState {
  const normalizedNote = normalizeNote(note, campaign.id, updatedAt)
  const body = normalizedNote.body

  return {
    ...campaign.playerScreenState,
    mode: 'image',
    isHidden: false,
    title: normalizedNote.title,
    message: body === '' ? 'Материал готов к показу игрокам.' : body,
    campaignId: campaign.id,
    handoutPreview: {
      id: normalizedNote.id,
      name: normalizedNote.title,
      description: body === '' ? undefined : body,
      kind: 'handout',
      sourceLabel: 'Заметка',
    },
    updatedAt,
  }
}

function createHiddenPlayerHandoutState(state: PlayerScreenState, updatedAt: IsoDateString): PlayerScreenState {
  return {
    ...state,
    isHidden: true,
    updatedAt,
  }
}

function findNoteOrThrow(campaign: Campaign, noteId: NoteId): Note {
  const note = campaign.notes.find((candidate) => candidate.id === noteId)

  if (!note) {
    throw new Error('note-not-found')
  }

  return normalizeNote(note, campaign.id, campaign.updatedAt)
}

function normalizeNote(note: Note, campaignId: Campaign['id'], fallbackTimestamp: IsoDateString): Note {
  const createdAt = normalizeTimestamp(note.createdAt, fallbackTimestamp)
  const updatedAt = normalizeTimestamp(note.updatedAt, createdAt)

  return {
    id: note.id || createNoteId(),
    campaignId,
    title: normalizeNoteTitle(note.title),
    body: normalizeNoteBody(note.body),
    scope: normalizeNoteScope(note.scope),
    createdAt,
    updatedAt,
  }
}

function normalizeNoteTitle(title: string): string {
  const trimmedTitle = title.trim()
  return trimmedTitle === '' ? 'Новая заметка' : trimmedTitle
}

function normalizeNoteBody(body: string): string {
  return body.trim()
}

function normalizeNoteScope(scope: NoteScope): NoteScope {
  return scope === 'players' ? 'players' : 'master'
}

function normalizeTimestamp(timestamp: IsoDateString | undefined, fallbackTimestamp: IsoDateString): IsoDateString {
  return typeof timestamp === 'string' && timestamp.trim() !== '' ? timestamp : fallbackTimestamp
}

function createNoteId(): NoteId {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `note-${randomId}`
  }

  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
