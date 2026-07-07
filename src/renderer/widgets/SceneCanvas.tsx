import type { CSSProperties } from 'react'
import type {
  Asset,
  Scene,
  SceneCanvasLayer,
  SceneCanvasMeasurement,
  SceneCanvasObject,
  SceneCanvasViewport,
  SceneGrid,
} from '@shared/types'
import {
  createPlayerSceneCanvasProjection,
  getSceneCanvasLayerSummary,
  getSceneCanvasState,
} from '@renderer/stores/sceneCanvasFactory'
import type { SceneMeasurementTemplate } from '@renderer/stores/sceneToolsFactory'

interface SceneCanvasProps {
  scene: Scene | null
  mapAsset: Asset | null
  isPlayerSynced: boolean
  isStorageBusy: boolean
  onAddMeasurement(template: SceneMeasurementTemplate): void
  onClearMeasurements(): void
  onSendToPlayers(): void
  onUpdateGrid(grid: Partial<SceneGrid>): void
  onUpdateViewport(viewport: Partial<SceneCanvasViewport>): void
}

export function SceneCanvas({
  scene,
  mapAsset,
  isPlayerSynced,
  isStorageBusy,
  onAddMeasurement,
  onClearMeasurements,
  onSendToPlayers,
  onUpdateGrid,
  onUpdateViewport,
}: SceneCanvasProps) {
  if (scene === null) {
    return (
      <div className="scene-canvas scene-canvas--empty">
        <div className="scene-canvas__empty">
          <span className="status-badge status-badge--neutral">Stage 7</span>
          <h3>Сцена не выбрана</h3>
          <p>Откройте кампанию и создайте первую сцену.</p>
        </div>
      </div>
    )
  }

  const canvas = getSceneCanvasState(scene)
  const layerSummary = getSceneCanvasLayerSummary(scene)
  const playerProjection = createPlayerSceneCanvasProjection(scene, mapAsset ? [mapAsset] : [])
  const viewportTransform: CSSProperties = {
    transform: `translate(${canvas.viewport.panX}px, ${canvas.viewport.panY}px) scale(${canvas.viewport.zoom})`,
  }

  return (
    <div className="scene-canvas">
      <div className="scene-canvas__stage">
        <div className="scene-canvas__viewport" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
          <div className="scene-canvas__content" style={viewportTransform}>
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
                  color: scene.grid.color,
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

            <div className="scene-canvas__measurements">
              {canvas.measurements.map((measurement) => (
                <CanvasMeasurement
                  canvasHeight={canvas.height}
                  canvasWidth={canvas.width}
                  key={measurement.id}
                  measurement={measurement}
                />
              ))}
            </div>
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
            <dd>{scene.grid.enabled ? `${scene.grid.size}px / ${scene.grid.distancePerCell} ${scene.grid.unitLabel}` : 'выключена'}</dd>
          </div>
          <div>
            <dt>Zoom</dt>
            <dd>{Math.round(canvas.viewport.zoom * 100)}%</dd>
          </div>
          <div>
            <dt>Измерения</dt>
            <dd>{canvas.measurements.length}</dd>
          </div>
          <div>
            <dt>Projection</dt>
            <dd>{isPlayerSynced ? 'синхронизирован' : 'не отправлен'}</dd>
          </div>
        </dl>
      </div>

      <aside className="scene-canvas__layers" aria-label="Слои сцены">
        <SceneCanvasControls
          canvas={canvas}
          grid={scene.grid}
          isStorageBusy={isStorageBusy}
          onAddMeasurement={onAddMeasurement}
          onClearMeasurements={onClearMeasurements}
          onUpdateGrid={onUpdateGrid}
          onUpdateViewport={onUpdateViewport}
        />

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
            {playerProjection.layers.length} слоя, {playerProjection.objects.length} объекта,{' '}
            {playerProjection.measurements.length} измерения
          </strong>
        </div>
        <button className="button" disabled={isStorageBusy} onClick={onSendToPlayers} type="button">
          Показать активную сцену игрокам
        </button>
      </aside>
    </div>
  )
}

interface SceneCanvasControlsProps {
  canvas: ReturnType<typeof getSceneCanvasState>
  grid: SceneGrid
  isStorageBusy: boolean
  onAddMeasurement(template: SceneMeasurementTemplate): void
  onClearMeasurements(): void
  onUpdateGrid(grid: Partial<SceneGrid>): void
  onUpdateViewport(viewport: Partial<SceneCanvasViewport>): void
}

function SceneCanvasControls({
  canvas,
  grid,
  isStorageBusy,
  onAddMeasurement,
  onClearMeasurements,
  onUpdateGrid,
  onUpdateViewport,
}: SceneCanvasControlsProps) {
  return (
    <div className="scene-canvas-controls">
      <section className="scene-canvas-control-group">
        <div className="scene-canvas-control-group__header">
          <h3>Сетка</h3>
          <label className="switch-control">
            <input
              checked={grid.enabled}
              disabled={isStorageBusy}
              onChange={(event) => onUpdateGrid({ enabled: event.target.checked })}
              type="checkbox"
            />
            <span>Вкл</span>
          </label>
        </div>
        <label>
          <span>Клетка</span>
          <input
            disabled={isStorageBusy}
            max={180}
            min={24}
            onChange={(event) => onUpdateGrid({ size: getNumberValue(event.target.value, grid.size) })}
            type="number"
            value={grid.size}
          />
        </label>
        <label>
          <span>Дистанция</span>
          <input
            disabled={isStorageBusy}
            max={30}
            min={1}
            onChange={(event) => onUpdateGrid({ distancePerCell: getNumberValue(event.target.value, grid.distancePerCell) })}
            type="number"
            value={grid.distancePerCell}
          />
        </label>
        <label>
          <span>Единицы</span>
          <input
            disabled={isStorageBusy}
            maxLength={8}
            onChange={(event) => onUpdateGrid({ unitLabel: event.target.value })}
            value={grid.unitLabel}
          />
        </label>
        <label>
          <span>Цвет</span>
          <input
            disabled={isStorageBusy}
            onChange={(event) => onUpdateGrid({ color: event.target.value })}
            type="color"
            value={grid.color}
          />
        </label>
        <label>
          <span>Прозрачность</span>
          <input
            disabled={isStorageBusy}
            max={0.9}
            min={0.08}
            onChange={(event) => onUpdateGrid({ opacity: getNumberValue(event.target.value, grid.opacity) })}
            step={0.01}
            type="range"
            value={grid.opacity}
          />
        </label>
        <label className="switch-control switch-control--wide">
          <input
            checked={grid.snapToGrid}
            disabled={isStorageBusy}
            onChange={(event) => onUpdateGrid({ snapToGrid: event.target.checked })}
            type="checkbox"
          />
          <span>Snap-to-grid</span>
        </label>
      </section>

      <section className="scene-canvas-control-group">
        <div className="scene-canvas-control-group__header">
          <h3>Вид</h3>
          <span>{Math.round(canvas.viewport.zoom * 100)}%</span>
        </div>
        <div className="scene-canvas-button-grid">
          <button
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ zoom: canvas.viewport.zoom - 0.1 })}
            type="button"
          >
            -
          </button>
          <button
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ zoom: 1, panX: 0, panY: 0 })}
            type="button"
          >
            100%
          </button>
          <button
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ zoom: canvas.viewport.zoom + 0.1 })}
            type="button"
          >
            +
          </button>
        </div>
        <div className="scene-canvas-pan-grid" aria-label="Панорама canvas">
          <button
            aria-label="Сдвинуть вверх"
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panY: canvas.viewport.panY - 40 })}
            type="button"
          >
            ↑
          </button>
          <button
            aria-label="Сдвинуть влево"
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panX: canvas.viewport.panX - 40 })}
            type="button"
          >
            ←
          </button>
          <button
            aria-label="Сдвинуть вправо"
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panX: canvas.viewport.panX + 40 })}
            type="button"
          >
            →
          </button>
          <button
            aria-label="Сдвинуть вниз"
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panY: canvas.viewport.panY + 40 })}
            type="button"
          >
            ↓
          </button>
        </div>
      </section>

      <section className="scene-canvas-control-group">
        <div className="scene-canvas-control-group__header">
          <h3>Измерения</h3>
          <span>{canvas.measurements.length}</span>
        </div>
        <div className="scene-canvas-template-grid">
          <button className="button button--secondary" disabled={isStorageBusy} onClick={() => onAddMeasurement('ruler')} type="button">
            Линейка
          </button>
          <button className="button button--secondary" disabled={isStorageBusy} onClick={() => onAddMeasurement('circle')} type="button">
            Круг
          </button>
          <button className="button button--secondary" disabled={isStorageBusy} onClick={() => onAddMeasurement('cone')} type="button">
            Конус
          </button>
          <button className="button button--secondary" disabled={isStorageBusy} onClick={() => onAddMeasurement('square')} type="button">
            Квадрат
          </button>
        </div>
        <button className="button button--secondary" disabled={isStorageBusy || canvas.measurements.length === 0} onClick={onClearMeasurements} type="button">
          Очистить измерения
        </button>
      </section>
    </div>
  )
}

function CanvasMeasurement({
  canvasHeight,
  canvasWidth,
  measurement,
}: {
  canvasHeight: number
  canvasWidth: number
  measurement: SceneCanvasMeasurement
}) {
  if (measurement.kind === 'ruler') {
    return (
      <div
        className="scene-canvas-measurement scene-canvas-measurement--ruler"
        style={getRulerMeasurementStyle(measurement, canvasWidth, canvasHeight)}
      >
        <span>{measurement.label}</span>
      </div>
    )
  }

  return (
    <div
      className={`scene-canvas-measurement scene-canvas-measurement--area scene-canvas-measurement--${measurement.shape ?? 'circle'}`}
      style={getAreaMeasurementStyle(measurement, canvasWidth, canvasHeight)}
    >
      <span>{measurement.label}</span>
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

function getRulerMeasurementStyle(
  measurement: SceneCanvasMeasurement,
  canvasWidth: number,
  canvasHeight: number,
): CSSProperties {
  const deltaX = measurement.targetX - measurement.originX
  const deltaY = measurement.targetY - measurement.originY
  const length = Math.hypot(deltaX, deltaY)
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI)

  return {
    left: `${(measurement.originX / canvasWidth) * 100}%`,
    top: `${(measurement.originY / canvasHeight) * 100}%`,
    width: `${(length / canvasWidth) * 100}%`,
    color: measurement.color,
    transform: `rotate(${angle}deg)`,
  }
}

function getAreaMeasurementStyle(
  measurement: SceneCanvasMeasurement,
  canvasWidth: number,
  canvasHeight: number,
): CSSProperties {
  const angle = Math.atan2(measurement.targetY - measurement.originY, measurement.targetX - measurement.originX) * (180 / Math.PI)

  return {
    left: `${((measurement.originX - measurement.radius) / canvasWidth) * 100}%`,
    top: `${((measurement.originY - measurement.radius) / canvasHeight) * 100}%`,
    width: `${((measurement.radius * 2) / canvasWidth) * 100}%`,
    height: `${((measurement.radius * 2) / canvasHeight) * 100}%`,
    color: measurement.color,
    transform: measurement.shape === 'cone' ? `rotate(${angle}deg)` : undefined,
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

function getNumberValue(value: string, fallback: number): number {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}
