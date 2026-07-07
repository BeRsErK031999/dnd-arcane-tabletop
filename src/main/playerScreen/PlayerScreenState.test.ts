import { describe, expect, it } from 'vitest'
import { createDefaultPlayerScreenState } from '../../shared/types/index.js'

describe('createDefaultPlayerScreenState', () => {
  it('creates a visible blank player screen state', () => {
    const state = createDefaultPlayerScreenState('2026-07-07T00:00:00.000Z')

    expect(state).toMatchObject({
      mode: 'blank',
      isHidden: false,
      title: 'Экран игроков',
      initiativeVisible: false,
      updatedAt: '2026-07-07T00:00:00.000Z',
    })
  })

  it('creates independent collection fields', () => {
    const left = createDefaultPlayerScreenState()
    const right = createDefaultPlayerScreenState()

    expect(left.visibleTokenIds).not.toBe(right.visibleTokenIds)
    expect(left.revealedAssetIds).not.toBe(right.revealedAssetIds)
  })
})
