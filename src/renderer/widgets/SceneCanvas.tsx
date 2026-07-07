import type { CSSProperties } from 'react'
import type { Asset, Scene, SceneCanvasLayer, SceneCanvasObject } from '@shared/types'
import {
  createPlayerSceneCanvasProjection,
  getSceneCanvasLayerSummary,
  getSceneCanvasState,
} from '@renderer/stores/sceneCanvasFactory'

interface SceneCanvasProps {
  scene: Scene | null
  mapAsset: Asset | null
  isPlayerSynced: boolean
  isStorageBusy: boolean
  onSendToPlayers(): void
}

export function SceneCanvas({
  scene,
  mapAsset,
  isPlayerSynced,
  isStorageBusy,
  onSendToPlayers,
}: SceneCanvasProps) {
  if (scene === null) {
    return (
      <div className="scene-canvas scene-canvas--empty">
        <div className="scene-canvas__empty">
          <span className="status-badge status-badge--neutral">Stage 6</span>
          <h3>Сцена не выбрана</h3>
          <p>Откройте кампанию и создайте первую сцену.</p>
        </div>
      </div>
    )
  }

  const canvas = getSceneCanvasState(scene)
  const layerSummary = getSceneCanvasLayerSummary(scene)
  const playerProjection = createPlayerSceneCanvasProjection(scene, mapAsset ? [mapAsset] : [])

  return (
    <div className="scene-canvas">
      <div className="scene-canvas__stage">
        <div className="scene-canvas__viewport" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
          {mapAsset ? (
            <img className="scene-canvas__map" alt="" src={mapAsset.filePath} />
          ) : (
            <div className="scene-canvas__map-placeholder">
              <span>Карта не привязана</span>
            </div>
          )}

          {scene.grid.enabled ? (
            <div
              className="scene-canvas__grid"
              style={{
                backgroundSize: `${scene.grid.size}px ${scene.grid.size}px`,
                opacity: scene.grid.opacity,
              }}
            />
          ) : null}

          <div className="scene-canvas__objects">
            {canvas.objects.map((object) => (
              <div
                className={object.isPlayerVisible ? 'scene-canvas-object' : 'scene-canvas-object scene-canvas-object--master'}
                key={object.id}
                style={getCanvasObjectStyle(object, canvas.width, canvas.height)}
              >
                <span>{object.text ?? object.name}</span>
              </div>
            ))}
          </div>
        </div>

        <dl className="scene-canvas__metrics">
          <div>
            <dt>Размер</dt>
            <dd>
              {canvas.width} x {canvas.height}
            </dd>
          </div>
          <div>
            <dt>Сетка</dt>
            <dd>{scene.grid.enabled ? `${scene.grid.size}px` : 'выключена'}</dd>
          </div>
          <div>
            <dt>Объекты</dt>
            <dd>{canvas.objects.length}</dd>
          </div>
          <div>
            <dt>Player projection</dt>
            <dd>{isPlayerSynced ? 'синхронизирован' : 'не отправлен'}</dd>
          </div>
        </dl>
      </div>

      <aside className="scene-canvas__layers" aria-label="Слои сцены">
        <div>
          <p className="eyebrow">Layers</p>
          <h3>Слои сцены</h3>
        </div>
        <ul>
          {layerSummary.map((layer) => (
            <li className={getLayerClassName(layer)} key={layer.id}>
              <div>
                <span>{layer.name}</span>
                <small>{getLayerVisibilityLabel(layer.visibility)}</small>
              </div>
              <small>
                {getLayerKindLabel(layer.kind)} · {layer.objectCount}
              </small>
            </li>
          ))}
        </ul>
        <div className="scene-canvas__projection">
          <span>Игрокам</span>
          <strong>
            {playerProjection.layers.length} слоя, {playerProjection.objects.length} объекта
          </strong>
        </div>
        <button className="button" disabled={isStorageBusy} onClick={onSendToPlayers} type="button">
          Показать активную сцену игрокам
        </button>
      </aside>
    </div>
  )
}

function getCanvasObjectStyle(object: SceneCanvasObject, canvasWidth: number, canvasHeight: number): CSSProperties {
  return {
    left: `${(object.x / canvasWidth) * 100}%`,
    top: `${(object.y / canvasHeight) * 100}%`,
    width: `${(object.width / canvasWidth) * 100}%`,
    height: `${(object.height / canvasHeight) * 100}%`,
    color: object.color,
    transform: `rotate(${object.rotation}deg)`,
  }
}

function getLayerClassName(layer: SceneCanvasLayer): string {
  const classNames = ['scene-canvas-layer']

  if (layer.visibility === 'master-only') {
    classNames.push('scene-canvas-layer--master')
  }

  if (layer.visibility === 'disabled') {
    classNames.push('scene-canvas-layer--disabled')
  }

  return classNames.join(' ')
}

function getLayerVisibilityLabel(visibility: SceneCanvasLayer['visibility']): string {
  switch (visibility) {
    case 'player-visible':
      return 'виден игрокам'
    case 'master-only':
      return 'только мастер'
    case 'disabled':
      return 'выключен'
  }
}

function getLayerKindLabel(kind: SceneCanvasLayer['kind']): string {
  switch (kind) {
    case 'map':
      return 'map'
    case 'grid':
      return 'grid'
    case 'object':
      return 'objects'
    case 'token':
      return 'tokens'
    case 'master':
      return 'master'
    case 'fog':
      return 'fog'
  }
}
