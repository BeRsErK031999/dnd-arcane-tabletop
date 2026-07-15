import { app } from 'electron'
import path from 'node:path'

export function getCampaignsDirectory(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'campaigns')
  }

  return path.join(process.cwd(), 'data', 'campaigns')
}

export function getAssetLibraryDirectory(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'asset-library')
  }

  return path.join(process.cwd(), 'data', 'asset-library')
}
