import { describe, expect, it } from 'vitest'
import { calculateAssetGridWindow } from './assetManagerVirtualization'

describe('calculateAssetGridWindow', () => {
  it('renders only visible rows plus overscan for a large library', () => {
    const window = calculateAssetGridWindow({
      itemCount: 10_000,
      viewportWidth: 960,
      viewportHeight: 600,
      scrollTop: 9_000,
    })

    expect(window.columnCount).toBe(4)
    expect(window.rowCount).toBe(2_500)
    expect(window.startIndex).toBe(112)
    expect(window.endIndex).toBe(136)
    expect(window.endIndex - window.startIndex).toBeLessThan(30)
    expect(window.totalHeight).toBe(750_000)
  })

  it('adapts to a narrow one-column viewport without exceeding item count', () => {
    const window = calculateAssetGridWindow({
      itemCount: 3,
      viewportWidth: 210,
      viewportHeight: 800,
      scrollTop: 0,
    })

    expect(window).toMatchObject({
      columnCount: 1,
      rowCount: 3,
      startIndex: 0,
      endIndex: 3,
      totalHeight: 900,
    })
  })
})
