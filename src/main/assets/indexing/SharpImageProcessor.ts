import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { ImageProcessingResult, ImageProcessor } from './ImageProcessor.js'

const previewMaxSize = 360

export class SharpImageProcessor implements ImageProcessor {
  async process(sourceFilePath: string, previewFilePath: string): Promise<ImageProcessingResult> {
    const sourceImage = sharp(sourceFilePath, { failOn: 'none' })
    const metadata = await sourceImage.metadata()

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error('Image metadata is incomplete')
    }

    await mkdir(path.dirname(previewFilePath), { recursive: true })
    await sharp(sourceFilePath, { failOn: 'none' })
      .rotate()
      .resize(previewMaxSize, previewMaxSize, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toFile(previewFilePath)

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format.toLowerCase(),
      mimeType: metadata.mediaType ?? mimeTypeForFormat(metadata.format),
      previewPath: previewFilePath,
    }
  }
}

function mimeTypeForFormat(format: string): string {
  const normalizedFormat = format.toLowerCase()
  if (normalizedFormat === 'jpg') {
    return 'image/jpeg'
  }
  if (normalizedFormat === 'svg') {
    return 'image/svg+xml'
  }
  return `image/${normalizedFormat}`
}
