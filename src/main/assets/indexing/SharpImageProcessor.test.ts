import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { SharpImageProcessor } from './SharpImageProcessor.js'

const tempDirectories: string[] = []

afterEach(async () => {
  sharp.cache(false)
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })),
  )
})

describe('SharpImageProcessor', () => {
  it('reads image metadata and writes a bounded WebP preview', async () => {
    const directory = await createTempDirectory()
    const sourceFilePath = path.join(directory, 'source.png')
    const previewFilePath = path.join(directory, 'previews', 'source.webp')
    await sharp({
      create: {
        width: 720,
        height: 360,
        channels: 4,
        background: { r: 63, g: 42, b: 91, alpha: 1 },
      },
    })
      .png()
      .toFile(sourceFilePath)

    const result = await new SharpImageProcessor().process(sourceFilePath, previewFilePath)
    const previewMetadata = await sharp(previewFilePath).metadata()

    expect(result).toMatchObject({
      width: 720,
      height: 360,
      format: 'png',
      mimeType: 'image/png',
      previewPath: previewFilePath,
    })
    expect(previewMetadata).toMatchObject({ format: 'webp', width: 360, height: 180 })
    await expect(stat(previewFilePath)).resolves.toMatchObject({ isFile: expect.any(Function) })
  })
})

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'arcane-preview-'))
  tempDirectories.push(directory)
  return directory
}
