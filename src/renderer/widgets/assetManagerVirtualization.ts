export interface AssetGridWindowInput {
  itemCount: number
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
  minimumCardWidth?: number
  rowHeight?: number
  gap?: number
  overscanRows?: number
}

export interface AssetGridWindow {
  columnCount: number
  rowCount: number
  cardWidth: number
  rowHeight: number
  gap: number
  startIndex: number
  endIndex: number
  totalHeight: number
}

export function calculateAssetGridWindow({
  itemCount,
  viewportWidth,
  viewportHeight,
  scrollTop,
  minimumCardWidth = 220,
  rowHeight = 300,
  gap = 12,
  overscanRows = 2,
}: AssetGridWindowInput): AssetGridWindow {
  const safeWidth = Math.max(1, viewportWidth)
  const safeHeight = Math.max(1, viewportHeight)
  const safeItemCount = Math.max(0, Math.trunc(itemCount))
  const columnCount = Math.max(1, Math.floor((safeWidth + gap) / (minimumCardWidth + gap)))
  const rowCount = Math.ceil(safeItemCount / columnCount)
  const cardWidth = (safeWidth - gap * (columnCount - 1)) / columnCount
  const firstVisibleRow = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight))
  const lastVisibleRow = Math.min(rowCount, Math.ceil((Math.max(0, scrollTop) + safeHeight) / rowHeight))
  const startRow = Math.max(0, firstVisibleRow - overscanRows)
  const endRow = Math.min(rowCount, lastVisibleRow + overscanRows)

  return {
    columnCount,
    rowCount,
    cardWidth,
    rowHeight,
    gap,
    startIndex: Math.min(safeItemCount, startRow * columnCount),
    endIndex: Math.min(safeItemCount, endRow * columnCount),
    totalHeight: rowCount * rowHeight,
  }
}
