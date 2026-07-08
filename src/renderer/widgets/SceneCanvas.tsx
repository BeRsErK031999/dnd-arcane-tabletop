import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  Asset,
  CharacterCard,
  Scene,
  SceneCanvasFogRegion,
  SceneCanvasFogState,
  SceneCanvasLayer,
  SceneCanvasMeasurement,
  SceneCanvasObject,
  SceneCanvasObjectId,
  SceneCanvasObjectTokenState,
  SceneCanvasViewport,
  SceneGrid,
} from '@shared/types'
import {
  createPlayerSceneCanvasProjection,
  getSceneCanvasLayerSummary,
  getSceneCanvasState,
  snapCanvasValue,
} from '@renderer/stores/sceneCanvasFactory'
import type {
  SceneCanvasObjectPosition,
  SceneFogRegionTemplate,
  SceneMeasurementTemplate,
  SceneObjectMoveDirection,
} from '@renderer/stores/sceneToolsFactory'

interface SceneCanvasProps {
  scene: Scene | null
  mapAsset: Asset | null
  assets: Asset[]
  characterCards: CharacterCard[]
  isPlayerSynced: boolean
  isStorageBusy: boolean
  selectedObjectId: SceneCanvasObjectId | null
  onAddFogRegion(shape: SceneFogRegionTemplate): void
  onAddMeasurement(template: SceneMeasurementTemplate): void
  onClearFogRegions(): void
  onClearMeasurements(): void
  onDuplicateObject(objectId: SceneCanvasObjectId): void
  onMoveObject(objectId: SceneCanvasObjectId, direction: SceneObjectMoveDirection): void
  onMoveObjectTo(objectId: SceneCanvasObjectId, position: SceneCanvasObjectPosition): void
  onRemoveLastFogRegion(): void
  onSelectObject(objectId: SceneCanvasObjectId): void
  onSendToPlayers(): void
  onSetObjectVisibility(objectId: SceneCanvasObjectId, isPlayerVisible: boolean): void
  onUpdateFog(fog: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>): void
  onUpdateObjectTokenState(objectId: SceneCanvasObjectId, tokenState: SceneCanvasObjectTokenState): void
  onUpdateGrid(grid: Partial<SceneGrid>): void
  onUpdateViewport(viewport: Partial<SceneCanvasViewport>): void
}

interface SceneObjectDragState {
  objectId: SceneCanvasObjectId
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  sceneUnitsPerClientX: number
  sceneUnitsPerClientY: number
  latestX: number
  latestY: number
  moved: boolean
}

export function SceneCanvas({
  scene,
  mapAsset,
  assets,
  characterCards,
  isPlayerSynced,
  isStorageBusy,
  selectedObjectId,
  onAddFogRegion,
  onAddMeasurement,
  onClearFogRegions,
  onClearMeasurements,
  onDuplicateObject,
  onMoveObject,
  onMoveObjectTo,
  onRemoveLastFogRegion,
  onSelectObject,
  onSendToPlayers,
  onSetObjectVisibility,
  onUpdateFog,
  onUpdateObjectTokenState,
  onUpdateGrid,
  onUpdateViewport,
}: SceneCanvasProps) {
  const [dragState, setDragState] = useState<SceneObjectDragState | null>(null)

  useEffect(() => {
    if (dragState === null || scene === null) {
      return
    }

    const activeScene = scene
    const canvas = getSceneCanvasState(activeScene)
    const object = canvas.objects.find((candidate) => candidate.id === dragState.objectId)

    if (!object) {
      setDragState(null)
      return
    }

    const activeObject = object

    function handleWindowPointerMove(event: globalThis.PointerEvent): void {
      if (event.pointerId !== dragState?.pointerId) {
        return
      }

      event.preventDefault()

      const deltaX = (event.clientX - dragState.startClientX) * dragState.sceneUnitsPerClientX
      const deltaY = (event.clientY - dragState.startClientY) * dragState.sceneUnitsPerClientY
      const position = getDraggedCanvasObjectPosition(
        activeObject,
        activeScene.grid,
        canvas.width,
        canvas.height,
        dragState.originX + deltaX,
        dragState.originY + deltaY,
      )

      setDragState({
        ...dragState,
        latestX: position.x,
        latestY: position.y,
        moved: dragState.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3,
      })
    }

    function handleWindowPointerEnd(event: globalThis.PointerEvent): void {
      if (event.pointerId !== dragState?.pointerId) {
        return
      }

      event.preventDefault()

      const finalPosition = { x: dragState.latestX, y: dragState.latestY }
      const didChangePosition = finalPosition.x !== dragState.originX || finalPosition.y !== dragState.originY

      setDragState(null)

      if (dragState.moved && didChangePosition) {
        onMoveObjectTo(dragState.objectId, finalPosition)
      }
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerEnd)
    window.addEventListener('pointercancel', handleWindowPointerEnd)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerEnd)
      window.removeEventListener('pointercancel', handleWindowPointerEnd)
    }
  }, [dragState, onMoveObjectTo, scene])

  if (scene === null) {
    return (
      <div className="scene-canvas scene-canvas--empty">
        <div className="scene-canvas__empty">
          <span className="status-badge status-badge--neutral">Сцены</span>
          <h3>Сцена не выбрана</h3>
          <p>Откройте кампанию и создайте первую сцену.</p>
        </div>
      </div>
    )
  }

  const activeScene = scene
  const canvas = getSceneCanvasState(activeScene)
  const layerSummary = getSceneCanvasLayerSummary(activeScene)
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  const playerProjection = createPlayerSceneCanvasProjection(activeScene, assets)
  const viewportTransform: CSSProperties = {
    transform: `translate(${canvas.viewport.panX}px, ${canvas.viewport.panY}px) scale(${canvas.viewport.zoom})`,
  }

  function handleObjectDragStart(object: SceneCanvasObject, event: ReactPointerEvent<HTMLButtonElement>): void {
    if (isStorageBusy || event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelectObject(object.id)

    const contentRect = event.currentTarget.closest('.scene-canvas__content')?.getBoundingClientRect()
    const sceneUnitsPerClientX =
      contentRect && contentRect.width > 0 ? canvas.width / contentRect.width : 1 / canvas.viewport.zoom
    const sceneUnitsPerClientY =
      contentRect && contentRect.height > 0 ? canvas.height / contentRect.height : 1 / canvas.viewport.zoom

    setDragState({
      objectId: object.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: object.x,
      originY: object.y,
      sceneUnitsPerClientX,
      sceneUnitsPerClientY,
      latestX: object.x,
      latestY: object.y,
      moved: false,
    })
  }

  function handleObjectDragCancel(object: SceneCanvasObject, event: ReactPointerEvent<HTMLButtonElement>): void {
    if (dragState === null || dragState.objectId !== object.id || dragState.pointerId !== event.pointerId) {
      return
    }

    setDragState(null)
  }

  return (
    <div className="scene-canvas">
      <div className="scene-canvas__main">
        <div className="scene-canvas__viewport" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
          <div className="scene-canvas__content" style={viewportTransform}>
            {mapAsset ? (
              <img className="scene-canvas__map" alt="" src={mapAsset.filePath} />
            ) : (
              <div className="scene-canvas__map-placeholder">
                <span>Карта не привязана</span>
              </div>
            )}

            {activeScene.grid.enabled ? (
              <div
                className="scene-canvas__grid"
                style={{
                  backgroundSize: `${activeScene.grid.size}px ${activeScene.grid.size}px`,
                  color: activeScene.grid.color,
                  opacity: activeScene.grid.opacity,
                }}
              />
            ) : null}

            <div className="scene-canvas__objects">
              {canvas.objects.map((object) => (
                <CanvasObject
                  asset={object.assetId ? assetsById.get(object.assetId) : undefined}
                  canvasHeight={canvas.height}
                  canvasWidth={canvas.width}
                  key={object.id}
                  object={object}
                  isSelected={object.id === selectedObjectId}
                  isDragDisabled={isStorageBusy}
                  isDragging={dragState?.objectId === object.id}
                  onSelectObject={onSelectObject}
                  onDragCancel={handleObjectDragCancel}
                  onDragStart={handleObjectDragStart}
                  previewPosition={
                    dragState?.objectId === object.id
                      ? { x: dragState.latestX, y: dragState.latestY }
                      : undefined
                  }
                />
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

            <SceneCanvasFogOverlay
              canvasHeight={canvas.height}
              canvasWidth={canvas.width}
              fog={canvas.fog}
              variant="master"
            />
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
            <dd>
              {activeScene.grid.enabled
                ? `${activeScene.grid.size}px / ${activeScene.grid.distancePerCell} ${activeScene.grid.unitLabel}`
                : 'выключена'}
            </dd>
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
            <dt>Туман</dt>
            <dd>{canvas.fog.enabled ? `${canvas.fog.regions.length} обл.` : 'выключен'}</dd>
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
          grid={activeScene.grid}
          isStorageBusy={isStorageBusy}
          onAddFogRegion={onAddFogRegion}
          onAddMeasurement={onAddMeasurement}
          onClearFogRegions={onClearFogRegions}
          onClearMeasurements={onClearMeasurements}
          onRemoveLastFogRegion={onRemoveLastFogRegion}
          onUpdateFog={onUpdateFog}
          onUpdateGrid={onUpdateGrid}
          onUpdateViewport={onUpdateViewport}
        />

        <SceneCanvasObjectControls
          canvas={canvas}
          characterCards={characterCards}
          isStorageBusy={isStorageBusy}
          onDuplicateObject={onDuplicateObject}
          onMoveObject={onMoveObject}
          onSelectObject={onSelectObject}
          onSetObjectVisibility={onSetObjectVisibility}
          onUpdateObjectTokenState={onUpdateObjectTokenState}
          selectedObjectId={selectedObjectId}
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
            {playerProjection.measurements.length} измерения, {playerProjection.fog.regions.length} fog
          </strong>
        </div>
        <button className="button" disabled={isStorageBusy} onClick={onSendToPlayers} type="button">
          Показать игрокам
        </button>
      </aside>
    </div>
  )
}

interface SceneCanvasObjectControlsProps {
  canvas: ReturnType<typeof getSceneCanvasState>
  characterCards: CharacterCard[]
  isStorageBusy: boolean
  selectedObjectId: SceneCanvasObjectId | null
  onDuplicateObject(objectId: SceneCanvasObjectId): void
  onMoveObject(objectId: SceneCanvasObjectId, direction: SceneObjectMoveDirection): void
  onSelectObject(objectId: SceneCanvasObjectId): void
  onSetObjectVisibility(objectId: SceneCanvasObjectId, isPlayerVisible: boolean): void
  onUpdateObjectTokenState(objectId: SceneCanvasObjectId, tokenState: SceneCanvasObjectTokenState): void
}

function SceneCanvasObjectControls({
  canvas,
  characterCards,
  isStorageBusy,
  selectedObjectId,
  onDuplicateObject,
  onMoveObject,
  onSelectObject,
  onSetObjectVisibility,
  onUpdateObjectTokenState,
}: SceneCanvasObjectControlsProps) {
  const selectedObject = selectedObjectId
    ? canvas.objects.find((object) => object.id === selectedObjectId) ?? null
    : null

  return (
    <section className="scene-canvas-control-group scene-canvas-object-tools">
      <div className="scene-canvas-control-group__header">
        <h3>Объекты</h3>
        <span>{canvas.objects.length}</span>
      </div>

      {canvas.objects.length === 0 ? (
        <p className="scene-canvas-object-tools__empty">Добавьте token, portrait или handout из библиотеки ассетов.</p>
      ) : (
        <div className="scene-canvas-object-tools__list" role="list">
          {canvas.objects.map((object) => (
            <button
              aria-pressed={object.id === selectedObjectId}
              className={
                object.id === selectedObjectId
                  ? 'scene-canvas-object-tools__item scene-canvas-object-tools__item--active'
                  : 'scene-canvas-object-tools__item'
              }
              key={object.id}
              onClick={() => onSelectObject(object.id)}
              type="button"
            >
              <span>{object.name}</span>
              <small>
                {getObjectKindLabel(object.kind)} · {getObjectVisibilityLabel(object)}
              </small>
            </button>
          ))}
        </div>
      )}

      {selectedObject ? (
        <div className="scene-canvas-object-tools__details">
          <div>
            <p className="eyebrow">Selected</p>
            <h4>{selectedObject.name}</h4>
          </div>
          <dl className="scene-canvas-object-tools__meta">
            <div>
              <dt>X/Y</dt>
              <dd>
                {selectedObject.x} / {selectedObject.y}
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {selectedObject.width} x {selectedObject.height}
              </dd>
            </div>
          </dl>

          <div className="scene-canvas-object-tools__moves" aria-label="Перемещение объекта">
            <button
              aria-label={`Переместить ${selectedObject.name} вверх`}
              className="button button--secondary scene-canvas-icon-button"
              disabled={isStorageBusy}
              onClick={() => onMoveObject(selectedObject.id, 'up')}
              title="Вверх"
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Переместить ${selectedObject.name} влево`}
              className="button button--secondary scene-canvas-icon-button"
              disabled={isStorageBusy}
              onClick={() => onMoveObject(selectedObject.id, 'left')}
              title="Влево"
              type="button"
            >
              ←
            </button>
            <button
              aria-label={`Переместить ${selectedObject.name} вправо`}
              className="button button--secondary scene-canvas-icon-button"
              disabled={isStorageBusy}
              onClick={() => onMoveObject(selectedObject.id, 'right')}
              title="Вправо"
              type="button"
            >
              →
            </button>
            <button
              aria-label={`Переместить ${selectedObject.name} вниз`}
              className="button button--secondary scene-canvas-icon-button"
              disabled={isStorageBusy}
              onClick={() => onMoveObject(selectedObject.id, 'down')}
              title="Вниз"
              type="button"
            >
              ↓
            </button>
          </div>

          <div className="scene-canvas-object-tools__actions">
            <button
              aria-label={`Дублировать ${selectedObject.name}`}
              className="button button--secondary scene-canvas-icon-button"
              disabled={isStorageBusy}
              onClick={() => onDuplicateObject(selectedObject.id)}
              title="Дублировать"
              type="button"
            >
              ⧉
            </button>
            <button
              aria-label={selectedObject.isPlayerVisible ? `Скрыть ${selectedObject.name}` : `Показать ${selectedObject.name}`}
              className="button button--secondary scene-canvas-icon-button"
              disabled={isStorageBusy}
              onClick={() => onSetObjectVisibility(selectedObject.id, !selectedObject.isPlayerVisible)}
              title={selectedObject.isPlayerVisible ? 'Скрыть от игроков' : 'Показать игрокам'}
              type="button"
            >
              {selectedObject.isPlayerVisible ? '◉' : '○'}
            </button>
          </div>

          {isTokenObject(selectedObject) ? (
            <div className="scene-canvas-object-tools__token">
              <div className="scene-canvas-control-group__header">
                <h4>Карточка токена</h4>
                <span>{selectedObject.tokenState?.hitPoints ?? 'HP'}</span>
              </div>
              <label>
                <span>Карточка</span>
                <select
                  disabled={isStorageBusy || characterCards.length === 0}
                  onChange={(event) =>
                    onUpdateObjectTokenState(selectedObject.id, {
                      characterCardId: event.target.value || undefined,
                    })
                  }
                  value={selectedObject.tokenState?.characterCardId ?? ''}
                >
                  <option value="">Без карточки</option>
                  {characterCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>HP</span>
                <input
                  disabled={isStorageBusy}
                  min={0}
                  onChange={(event) =>
                    onUpdateObjectTokenState(selectedObject.id, {
                      hitPoints: getOptionalNumberValue(event.target.value),
                    })
                  }
                  type="number"
                  value={selectedObject.tokenState?.hitPoints ?? ''}
                />
              </label>
              <label>
                <span>AC</span>
                <input
                  disabled={isStorageBusy}
                  min={0}
                  onChange={(event) =>
                    onUpdateObjectTokenState(selectedObject.id, {
                      armorClass: getOptionalNumberValue(event.target.value),
                    })
                  }
                  type="number"
                  value={selectedObject.tokenState?.armorClass ?? ''}
                />
              </label>
              <label>
                <span>Заметка</span>
                <textarea
                  disabled={isStorageBusy}
                  onChange={(event) =>
                    onUpdateObjectTokenState(selectedObject.id, {
                      note: event.target.value,
                    })
                  }
                  rows={3}
                  value={selectedObject.tokenState?.note ?? ''}
                />
              </label>
            </div>
          ) : (
            <p className="scene-canvas-object-tools__empty">Карточка HP/AC доступна для объектов слоя tokens.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}

interface SceneCanvasControlsProps {
  canvas: ReturnType<typeof getSceneCanvasState>
  grid: SceneGrid
  isStorageBusy: boolean
  onAddFogRegion(shape: SceneFogRegionTemplate): void
  onAddMeasurement(template: SceneMeasurementTemplate): void
  onClearFogRegions(): void
  onClearMeasurements(): void
  onRemoveLastFogRegion(): void
  onUpdateFog(fog: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>): void
  onUpdateGrid(grid: Partial<SceneGrid>): void
  onUpdateViewport(viewport: Partial<SceneCanvasViewport>): void
}

function SceneCanvasControls({
  canvas,
  grid,
  isStorageBusy,
  onAddFogRegion,
  onAddMeasurement,
  onClearFogRegions,
  onClearMeasurements,
  onRemoveLastFogRegion,
  onUpdateFog,
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
            aria-label="Уменьшить масштаб"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ zoom: canvas.viewport.zoom - 0.1 })}
            title="Уменьшить масштаб"
            type="button"
          >
            −
          </button>
          <button
            aria-label="Сбросить вид"
            className="button button--secondary scene-canvas-icon-button scene-canvas-icon-button--wide"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ zoom: 1, panX: 0, panY: 0 })}
            title="Сбросить вид"
            type="button"
          >
            100%
          </button>
          <button
            aria-label="Увеличить масштаб"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ zoom: canvas.viewport.zoom + 0.1 })}
            title="Увеличить масштаб"
            type="button"
          >
            +
          </button>
        </div>
        <div className="scene-canvas-pan-grid" aria-label="Панорама canvas">
          <button
            aria-label="Сдвинуть вверх"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panY: canvas.viewport.panY - 40 })}
            title="Сдвинуть вверх"
            type="button"
          >
            ↑
          </button>
          <button
            aria-label="Сдвинуть влево"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panX: canvas.viewport.panX - 40 })}
            title="Сдвинуть влево"
            type="button"
          >
            ←
          </button>
          <button
            aria-label="Сдвинуть вправо"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panX: canvas.viewport.panX + 40 })}
            title="Сдвинуть вправо"
            type="button"
          >
            →
          </button>
          <button
            aria-label="Сдвинуть вниз"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onUpdateViewport({ panY: canvas.viewport.panY + 40 })}
            title="Сдвинуть вниз"
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
          <button
            aria-label="Добавить линейку"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onAddMeasurement('ruler')}
            title="Линейка"
            type="button"
          >
            ↔
          </button>
          <button
            aria-label="Добавить круг измерения"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onAddMeasurement('circle')}
            title="Круг"
            type="button"
          >
            ○
          </button>
          <button
            aria-label="Добавить конус измерения"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onAddMeasurement('cone')}
            title="Конус"
            type="button"
          >
            ◢
          </button>
          <button
            aria-label="Добавить квадрат измерения"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onAddMeasurement('square')}
            title="Квадрат"
            type="button"
          >
            □
          </button>
        </div>
        <button
          aria-label="Очистить измерения"
          className="button button--secondary scene-canvas-compact-action"
          disabled={isStorageBusy || canvas.measurements.length === 0}
          onClick={onClearMeasurements}
          title="Очистить измерения"
          type="button"
        >
          Очистить
        </button>
      </section>

      <section className="scene-canvas-control-group">
        <div className="scene-canvas-control-group__header">
          <h3>Туман</h3>
          <label className="switch-control">
            <input
              checked={canvas.fog.enabled}
              disabled={isStorageBusy}
              onChange={(event) => onUpdateFog({ enabled: event.target.checked })}
              type="checkbox"
            />
            <span>Вкл</span>
          </label>
        </div>
        <label>
          <span>Плотность</span>
          <input
            disabled={isStorageBusy}
            max={0.96}
            min={0.25}
            onChange={(event) => onUpdateFog({ opacity: getNumberValue(event.target.value, canvas.fog.opacity) })}
            step={0.01}
            type="range"
            value={canvas.fog.opacity}
          />
        </label>
        <div className="scene-canvas-template-grid">
          <button
            aria-label="Закрыть прямоугольную область туманом"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onAddFogRegion('rectangle')}
            title="Закрыть прямоугольник"
            type="button"
          >
            ▣
          </button>
          <button
            aria-label="Закрыть круглую область туманом"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy}
            onClick={() => onAddFogRegion('circle')}
            title="Закрыть круг"
            type="button"
          >
            ●
          </button>
        </div>
        <div className="scene-canvas-fog-actions">
          <button
            aria-label="Открыть последнюю область тумана"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy || canvas.fog.regions.length === 0}
            onClick={onRemoveLastFogRegion}
            title="Открыть последнюю"
            type="button"
          >
            ◌
          </button>
          <button
            aria-label="Очистить весь туман"
            className="button button--secondary scene-canvas-icon-button"
            disabled={isStorageBusy || canvas.fog.regions.length === 0}
            onClick={onClearFogRegions}
            title="Очистить туман"
            type="button"
          >
            ×
          </button>
        </div>
      </section>
    </div>
  )
}

function SceneCanvasFogOverlay({
  canvasHeight,
  canvasWidth,
  fog,
  variant,
}: {
  canvasHeight: number
  canvasWidth: number
  fog: SceneCanvasFogState
  variant: 'master' | 'player'
}) {
  if (!fog.enabled || fog.regions.length === 0) {
    return null
  }

  return (
    <div className={`scene-canvas-fog scene-canvas-fog--${variant}`} aria-hidden="true">
      {fog.regions.map((region) => (
        <div
          className={`scene-canvas-fog-region scene-canvas-fog-region--${region.shape}`}
          key={region.id}
          style={getFogRegionStyle(region, canvasWidth, canvasHeight, fog.opacity)}
        >
          {variant === 'master' ? <span>{region.label}</span> : null}
        </div>
      ))}
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

function getFogRegionStyle(
  region: SceneCanvasFogRegion,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
): CSSProperties {
  return {
    left: `${(region.x / canvasWidth) * 100}%`,
    top: `${(region.y / canvasHeight) * 100}%`,
    width: `${(region.width / canvasWidth) * 100}%`,
    height: `${(region.height / canvasHeight) * 100}%`,
    opacity,
  }
}

function CanvasObject({
  asset,
  canvasHeight,
  canvasWidth,
  isDragDisabled,
  isDragging,
  isSelected,
  object,
  previewPosition,
  onDragCancel,
  onDragStart,
  onSelectObject,
}: {
  asset: Asset | undefined
  canvasHeight: number
  canvasWidth: number
  isDragDisabled: boolean
  isDragging: boolean
  isSelected: boolean
  object: SceneCanvasObject
  previewPosition: SceneCanvasObjectPosition | undefined
  onDragCancel(object: SceneCanvasObject, event: ReactPointerEvent<HTMLButtonElement>): void
  onDragStart(object: SceneCanvasObject, event: ReactPointerEvent<HTMLButtonElement>): void
  onSelectObject(objectId: SceneCanvasObjectId): void
}) {
  const classNames = ['scene-canvas-object']

  if (!object.isPlayerVisible) {
    classNames.push('scene-canvas-object--master')
  }

  if (asset) {
    classNames.push('scene-canvas-object--asset')
  }

  if (isSelected) {
    classNames.push('scene-canvas-object--selected')
  }

  if (isDragging) {
    classNames.push('scene-canvas-object--dragging')
  }

  return (
    <button
      aria-label={`Выбрать объект ${object.name}`}
      aria-pressed={isSelected}
      className={classNames.join(' ')}
      disabled={isDragDisabled}
      onClick={() => onSelectObject(object.id)}
      onPointerCancel={(event) => onDragCancel(object, event)}
      onPointerDown={(event) => onDragStart(object, event)}
      style={getCanvasObjectStyle(object, canvasWidth, canvasHeight, previewPosition)}
      title="Перетащите мышью, чтобы переместить объект"
      type="button"
    >
      {asset ? <img alt="" draggable={false} src={asset.filePath} /> : null}
      <span>{object.text ?? object.name}</span>
    </button>
  )
}

function getCanvasObjectStyle(
  object: SceneCanvasObject,
  canvasWidth: number,
  canvasHeight: number,
  previewPosition?: SceneCanvasObjectPosition,
): CSSProperties {
  const x = previewPosition?.x ?? object.x
  const y = previewPosition?.y ?? object.y

  return {
    left: `${(x / canvasWidth) * 100}%`,
    top: `${(y / canvasHeight) * 100}%`,
    width: `${(object.width / canvasWidth) * 100}%`,
    height: `${(object.height / canvasHeight) * 100}%`,
    color: object.color,
    transform: `rotate(${object.rotation}deg)`,
  }
}

function getDraggedCanvasObjectPosition(
  object: SceneCanvasObject,
  grid: SceneGrid,
  canvasWidth: number,
  canvasHeight: number,
  rawX: number,
  rawY: number,
): SceneCanvasObjectPosition {
  const x = grid.enabled && grid.snapToGrid ? snapCanvasValue(rawX, grid) : rawX
  const y = grid.enabled && grid.snapToGrid ? snapCanvasValue(rawY, grid) : rawY

  return {
    x: clampCanvasValue(x, 0, canvasWidth - object.width),
    y: clampCanvasValue(y, 0, canvasHeight - object.height),
  }
}

function clampCanvasValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
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

function isTokenObject(object: SceneCanvasObject): boolean {
  return object.kind === 'token-placeholder' || object.layerId === 'scene-layer-tokens'
}

function getObjectKindLabel(kind: SceneCanvasObject['kind']): string {
  switch (kind) {
    case 'marker':
      return 'Маркер'
    case 'note':
      return 'Заметка'
    case 'shape':
      return 'Фигура'
    case 'token-placeholder':
      return 'Токен'
  }
}

function getObjectVisibilityLabel(object: SceneCanvasObject): string {
  return object.isPlayerVisible ? 'виден игрокам' : 'скрыт'
}

function getOptionalNumberValue(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

function getNumberValue(value: string, fallback: number): number {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}
