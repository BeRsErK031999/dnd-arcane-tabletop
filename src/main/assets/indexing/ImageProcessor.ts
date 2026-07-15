export interface ImageProcessingResult {
  width: number
  height: number
  format: string
  mimeType: string
  previewPath: string
}

export interface ImageProcessor {
  process(sourceFilePath: string, previewFilePath: string): Promise<ImageProcessingResult>
}
