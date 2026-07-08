import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  Asset,
  CharacterCard,
  Scene,
  SceneCanvasFogRegion,
  SceneCanvasFogRegionId,
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
  formatGridDistance,
  getSceneCanvasLayerSummary,
  getSceneCanvasState,
  snapCanvasValue,
} from '@renderer/stores/sceneCanvasFactory'
import type {
  SceneCanvasObjectPosition,
  SceneFogRegionDraft,
  SceneFogRegionInput,
  SceneFogRegionTemplate,
  SceneFogRegionUpdate,
  SceneMeasurementDraft,
  SceneMeasurementInput,
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
  onAddFogRegion(region: SceneFogRegionInput): void
  onAddMeasurement(measurement: SceneMeasurementInput): void
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
  onUpdateFogRegion(regionId: SceneCanvasFogRegionId, regionUpdate: SceneFogRegionUpdate): void
  onUpdateObjectTokenState(objectId: SceneCanvasObjectId, tokenState: SceneCanvasObjectTokenState): void
  onUpdateGrid(grid: Partial<SceneGrid>): void
  onUpdateViewport(viewport: Partial<SceneCanvasViewport>): void
}

type SceneCanvasTool =
  | { kind: 'select' }
  | { kind: 'measurement'; template: SceneMeasurementTemplate }
  | { kind: 'fog-draw'; shape: SceneFogRegionTemplate }
  | { kind: 'fog-edit' }

interface SceneCanvasPointerFrame {
  left: number
  top: number
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
}

interface SceneCanvasDrawState {
  pointerId: number
  tool: Extract<SceneCanvasTool, { kind: 'measurement' | 'fog-draw' }>
  frame: SceneCanvasPointerFrame
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  latestX: number
  latestY: number
  moved: boolean
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

interface SceneFogRegionDragState {
  regionId: SceneCanvasFogRegionId
  pointerId: number
  mode: 'move' | 'resize'
  shape: SceneCanvasFogRegion['shape']
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  originWidth: number
  originHeight: number
  sceneUnitsPerClientX: number
  sceneUnitsPerClientY: number
  latestX: number
  latestY: number
  latestWidth: number
  latestHeight: number
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
  onUpdateFogRegion,
  onUpdateObjectTokenState,
  onUpdateGrid,
  onUpdateViewport,
}: SceneCanvasProps) {
  const [activeTool, setActiveTool] = useState<SceneCanvasTool>({ kind: 'select' })
  const [drawState, setDrawState] = useState<SceneCanvasDrawState | null>(null)
  const [dragState, setDragState] = useState<SceneObjectDragState | null>(null)
  const [fogDragState, setFogDragState] = useState<SceneFogRegionDragState | null>(null)
  const [selectedFogRegionId, setSelectedFogRegionId] = useState<SceneCanvasFogRegionId | null>(null)

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

  useEffect(() => {
    if (drawState === null || scene === null) {
      return
    }

    function handleWindowPointerMove(event: globalThis.PointerEvent): void {
      if (event.pointerId !== drawState?.pointerId) {
        return
      }

      event.preventDefault()

      const point = getCanvasPointFromClient(event.clientX, event.clientY, drawState.frame)
      const deltaX = event.clientX - drawState.startClientX
      const deltaY = event.clientY - drawState.startClientY

      setDrawState({
        ...drawState,
        latestX: point.x,
        latestY: point.y,
        moved: drawState.moved || Math.hypot(deltaX, deltaY) > 6,
      })
    }

    function handleWindowPointerEnd(event: globalThis.PointerEvent): void {
      if (event.pointerId !== drawState?.pointerId) {
        return
      }

      event.preventDefault()

      const finalPoint = getCanvasPointFromClient(event.clientX, event.clientY, drawState.frame)
      const finalState = {
        ...drawState,
        latestX: finalPoint.x,
        latestY: finalPoint.y,
        moved: drawState.moved || Math.hypot(event.clientX - drawState.startClientX, event.clientY - drawState.startClientY) > 6,
      }

      setDrawState(null)

      if (!finalState.moved || getDrawDistance(finalState) < 12) {
        return
      }

      if (finalState.tool.kind === 'measurement') {
        onAddMeasurement(createMeasurementInputFromDraw(finalState))
        return
      }

      onAddFogRegion(createFogRegionInputFromDraw(finalState))
      setActiveTool({ kind: 'fog-edit' })
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerEnd)
    window.addEventListener('pointercancel', handleWindowPointerEnd)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerEnd)
      window.removeEventListener('pointercancel', handleWindowPointerEnd)
    }
  }, [drawState, onAddFogRegion, onAddMeasurement, scene])

  useEffect(() => {
    if (fogDragState === null || scene === null) {
      return
    }

    const activeScene = scene
    const canvas = getSceneCanvasState(activeScene)
    const region = canvas.fog.regions.find((candidate) => candidate.id === fogDragState.regionId)

    if (!region) {
      setFogDragState(null)
      return
    }

    function handleWindowPointerMove(event: globalThis.PointerEvent): void {
      if (event.pointerId !== fogDragState?.pointerId) {
        return
      }

      event.preventDefault()

      const deltaX = (event.clientX - fogDragState.startClientX) * fogDragState.sceneUnitsPerClientX
      const deltaY = (event.clientY - fogDragState.startClientY) * fogDragState.sceneUnitsPerClientY
      const position = getDraggedFogRegionPosition(
        fogDragState,
        activeScene.grid,
        canvas.width,
        canvas.height,
        deltaX,
        deltaY,
      )

      setFogDragState({
        ...fogDragState,
        ...position,
        moved: fogDragState.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3,
      })
    }

    function handleWindowPointerEnd(event: globalThis.PointerEvent): void {
      if (event.pointerId !== fogDragState?.pointerId) {
        return
      }

      event.preventDefault()

      const deltaX = (event.clientX - fogDragState.startClientX) * fogDragState.sceneUnitsPerClientX
      const deltaY = (event.clientY - fogDragState.startClientY) * fogDragState.sceneUnitsPerClientY
      const position = getDraggedFogRegionPosition(
        fogDragState,
        activeScene.grid,
        canvas.width,
        canvas.height,
        deltaX,
        deltaY,
      )
      const regionUpdate: SceneFogRegionUpdate = {
        x: position.latestX,
        y: position.latestY,
        width: position.latestWidth,
        height: position.latestHeight,
      }
      const didChangeRegion =
        regionUpdate.x !== fogDragState.originX ||
        regionUpdate.y !== fogDragState.originY ||
        regionUpdate.width !== fogDragState.originWidth ||
        regionUpdate.height !== fogDragState.originHeight

      setFogDragState(null)

      if ((fogDragState.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) && didChangeRegion) {
        onUpdateFogRegion(fogDragState.regionId, regionUpdate)
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
  }, [fogDragState, onUpdateFogRegion, scene])

  useEffect(() => {
    if (scene === null || selectedFogRegionId === null) {
      return
    }

    const canvas = getSceneCanvasState(scene)

    if (!canvas.fog.regions.some((region) => region.id === selectedFogRegionId)) {
      setSelectedFogRegionId(null)
    }
  }, [scene, selectedFogRegionId])

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return
      }

      setDrawState(null)
      setFogDragState(null)
      setActiveTool({ kind: 'select' })
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    function handleSceneHotkey(event: globalThis.KeyboardEvent): void {
      if (scene === null || shouldIgnoreSceneHotkey(event)) {
        return
      }

      const key = event.key.toLowerCase()
      const activeScene = scene
      const canvas = getSceneCanvasState(activeScene)

      switch (key) {
        case 'v':
          event.preventDefault()
          setDrawState(null)
          setFogDragState(null)
          setActiveTool({ kind: 'select' })
          return
        case 'g':
          event.preventDefault()
          onUpdateGrid({ enabled: !activeScene.grid.enabled })
          return
        case 'm':
          event.preventDefault()
          setActiveTool({ kind: 'measurement', template: 'ruler' })
          return
        case 'a':
          event.preventDefault()
          setActiveTool({ kind: 'measurement', template: 'circle' })
          return
        case 'f':
          event.preventDefault()
          setActiveTool(canvas.fog.regions.length > 0 ? { kind: 'fog-edit' } : { kind: 'fog-draw', shape: 'rectangle' })
          return
        case 'z':
          event.preventDefault()
          onUpdateViewport({ zoom: canvas.viewport.zoom + (event.shiftKey ? -0.1 : 0.1) })
          return
      }
    }

    window.addEventListener('keydown', handleSceneHotkey)

    return () => {
      window.removeEventListener('keydown', handleSceneHotkey)
    }
  }, [onUpdateGrid, onUpdateViewport, scene])

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

  function handleCanvasDrawStart(event: ReactPointerEvent<HTMLDivElement>): void {
    if (isStorageBusy || event.button !== 0 || (activeTool.kind !== 'measurement' && activeTool.kind !== 'fog-draw')) {
      return
    }

    const contentRect = event.currentTarget.closest('.scene-canvas__content')?.getBoundingClientRect()

    if (!contentRect || contentRect.width <= 0 || contentRect.height <= 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)

    const frame: SceneCanvasPointerFrame = {
      left: contentRect.left,
      top: contentRect.top,
      width: contentRect.width,
      height: contentRect.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    }
    const point = getCanvasPointFromClient(event.clientX, event.clientY, frame)

    setDrawState({
      pointerId: event.pointerId,
      tool: activeTool,
      frame,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: point.x,
      originY: point.y,
      latestX: point.x,
      latestY: point.y,
      moved: false,
    })
  }

  function handleFogRegionDragStart(
    region: SceneCanvasFogRegion,
    mode: SceneFogRegionDragState['mode'],
    event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>,
  ): void {
    if (isStorageBusy || activeTool.kind !== 'fog-edit' || event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedFogRegionId(region.id)

    const contentRect = event.currentTarget.closest('.scene-canvas__content')?.getBoundingClientRect()
    const sceneUnitsPerClientX =
      contentRect && contentRect.width > 0 ? canvas.width / contentRect.width : 1 / canvas.viewport.zoom
    const sceneUnitsPerClientY =
      contentRect && contentRect.height > 0 ? canvas.height / contentRect.height : 1 / canvas.viewport.zoom

    setFogDragState({
      regionId: region.id,
      pointerId: event.pointerId,
      mode,
      shape: region.shape,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: region.x,
      originY: region.y,
      originWidth: region.width,
      originHeight: region.height,
      sceneUnitsPerClientX,
      sceneUnitsPerClientY,
      latestX: region.x,
      latestY: region.y,
      latestWidth: region.width,
      latestHeight: region.height,
      moved: false,
    })
  }

  const previewMeasurement =
    drawState?.tool.kind === 'measurement' ? createPreviewMeasurementFromDraw(drawState, activeScene.grid) : null
  const previewFogRegion = drawState?.tool.kind === 'fog-draw' ? createPreviewFogRegionFromDraw(drawState) : null
  const renderedFog = createFogStateWithDraggedRegion(canvas.fog, fogDragState)
  const isFogEditable = activeTool.kind === 'fog-edit'
  const isCanvasDrawActive = activeTool.kind === 'measurement' || activeTool.kind === 'fog-draw'

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
              {previewMeasurement ? (
                <CanvasMeasurement
                  canvasHeight={canvas.height}
                  canvasWidth={canvas.width}
                  isPreview
                  measurement={previewMeasurement}
                />
              ) : null}
            </div>

            <SceneCanvasFogOverlay
              canvasHeight={canvas.height}
              canvasWidth={canvas.width}
              draggedRegionId={fogDragState?.regionId}
              fog={renderedFog}
              isEditable={isFogEditable}
              onMoveStart={(region, event) => handleFogRegionDragStart(region, 'move', event)}
              onResizeStart={(region, event) => handleFogRegionDragStart(region, 'resize', event)}
              selectedRegionId={selectedFogRegionId}
              variant="master"
            />
            {previewFogRegion ? (
              <SceneCanvasFogOverlay
                canvasHeight={canvas.height}
                canvasWidth={canvas.width}
                fog={{
                  enabled: true,
                  opacity: canvas.fog.opacity,
                  regions: [previewFogRegion],
                }}
                isPreview
                variant="master"
              />
            ) : null}
            <div
              aria-hidden="true"
              className={
                isCanvasDrawActive
                  ? 'scene-canvas__interaction-layer scene-canvas__interaction-layer--active'
                  : 'scene-canvas__interaction-layer'
              }
              onPointerDown={handleCanvasDrawStart}
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
          activeTool={activeTool}
          canvas={canvas}
          grid={activeScene.grid}
          isStorageBusy={isStorageBusy}
          onClearFogRegions={onClearFogRegions}
          onClearMeasurements={onClearMeasurements}
          onRemoveLastFogRegion={onRemoveLastFogRegion}
          onSetTool={setActiveTool}
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
  activeTool: SceneCanvasTool
  canvas: ReturnType<typeof getSceneCanvasState>
  grid: SceneGrid
  isStorageBusy: boolean
  onClearFogRegions(): void
  onClearMeasurements(): void
  onRemoveLastFogRegion(): void
  onSetTool(tool: SceneCanvasTool): void
  onUpdateFog(fog: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>): void
  onUpdateGrid(grid: Partial<SceneGrid>): void
  onUpdateViewport(viewport: Partial<SceneCanvasViewport>): void
}

function SceneCanvasControls({
  activeTool,
  canvas,
  grid,
  isStorageBusy,
  onClearFogRegions,
  onClearMeasurements,
  onRemoveLastFogRegion,
  onSetTool,
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
            step={0.5}
            onChange={(event) => onUpdateGrid({ distancePerCell: getNumberValue(event.target.value, grid.distancePerCell) })}
            type="number"
            value={grid.distancePerCell}
          />
        </label>
        <label>
          <span>Единицы</span>
          <select
            disabled={isStorageBusy}
            onChange={(event) => onUpdateGrid(getGridUnitUpdate(event.target.value))}
            value={getGridUnitValue(grid.unitLabel)}
          >
            <option value="ft">ft</option>
            <option value="m">метры</option>
          </select>
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
            aria-label="Выбрать объекты сцены"
            aria-pressed={activeTool.kind === 'select'}
            className={getToolButtonClassName(activeTool.kind === 'select')}
            disabled={isStorageBusy}
            onClick={() => onSetTool({ kind: 'select' })}
            title="Выбор"
            type="button"
          >
            ↖
          </button>
          <button
            aria-label="Добавить линейку"
            aria-pressed={isMeasurementToolActive(activeTool, 'ruler')}
            className={getToolButtonClassName(isMeasurementToolActive(activeTool, 'ruler'))}
            disabled={isStorageBusy}
            onClick={() => onSetTool({ kind: 'measurement', template: 'ruler' })}
            title="Линейка"
            type="button"
          >
            ↔
          </button>
          <button
            aria-label="Добавить круг измерения"
            aria-pressed={isMeasurementToolActive(activeTool, 'circle')}
            className={getToolButtonClassName(isMeasurementToolActive(activeTool, 'circle'))}
            disabled={isStorageBusy}
            onClick={() => onSetTool({ kind: 'measurement', template: 'circle' })}
            title="Круг"
            type="button"
          >
            ○
          </button>
          <button
            aria-label="Добавить конус измерения"
            aria-pressed={isMeasurementToolActive(activeTool, 'cone')}
            className={getToolButtonClassName(isMeasurementToolActive(activeTool, 'cone'))}
            disabled={isStorageBusy}
            onClick={() => onSetTool({ kind: 'measurement', template: 'cone' })}
            title="Конус"
            type="button"
          >
            ◢
          </button>
          <button
            aria-label="Добавить квадрат измерения"
            aria-pressed={isMeasurementToolActive(activeTool, 'square')}
            className={getToolButtonClassName(isMeasurementToolActive(activeTool, 'square'))}
            disabled={isStorageBusy}
            onClick={() => onSetTool({ kind: 'measurement', template: 'square' })}
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
            aria-pressed={isFogDrawToolActive(activeTool, 'rectangle')}
            className={getToolButtonClassName(isFogDrawToolActive(activeTool, 'rectangle'))}
            disabled={isStorageBusy}
            onClick={() => onSetTool({ kind: 'fog-draw', shape: 'rectangle' })}
            title="Закрыть прямоугольник"
            type="button"
          >
            ▣
          </button>
          <button
            aria-label="Закрыть круглую область туманом"
            aria-pressed={isFogDrawToolActive(activeTool, 'circle')}
            className={getToolButtonClassName(isFogDrawToolActive(activeTool, 'circle'))}
            disabled={isStorageBusy}
            onClick={() => onSetTool({ kind: 'fog-draw', shape: 'circle' })}
            title="Закрыть круг"
            type="button"
          >
            ●
          </button>
          <button
            aria-label="Редактировать области тумана"
            aria-pressed={activeTool.kind === 'fog-edit'}
            className={getToolButtonClassName(activeTool.kind === 'fog-edit')}
            disabled={isStorageBusy || canvas.fog.regions.length === 0}
            onClick={() => onSetTool({ kind: 'fog-edit' })}
            title="Двигать и менять размер"
            type="button"
          >
            ⤢
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
  draggedRegionId,
  fog,
  isEditable = false,
  isPreview = false,
  onMoveStart,
  onResizeStart,
  selectedRegionId,
  variant,
}: {
  canvasHeight: number
  canvasWidth: number
  draggedRegionId?: SceneCanvasFogRegionId
  fog: SceneCanvasFogState
  isEditable?: boolean
  isPreview?: boolean
  onMoveStart?: (region: SceneCanvasFogRegion, event: ReactPointerEvent<HTMLDivElement>) => void
  onResizeStart?: (region: SceneCanvasFogRegion, event: ReactPointerEvent<HTMLButtonElement>) => void
  selectedRegionId?: SceneCanvasFogRegionId | null
  variant: 'master' | 'player'
}) {
  if (!fog.enabled || fog.regions.length === 0) {
    return null
  }

  return (
    <div
      className={getFogOverlayClassName(variant, isEditable, isPreview)}
      aria-hidden={variant === 'player' ? 'true' : undefined}
    >
      {fog.regions.map((region) => {
        const isSelected = selectedRegionId === region.id
        const isDragging = draggedRegionId === region.id

        return (
          <div
            className={getFogRegionClassName(region, isEditable, isPreview, isSelected, isDragging)}
            key={region.id}
            onPointerDown={isEditable ? (event) => onMoveStart?.(region, event) : undefined}
            style={getFogRegionStyle(region, canvasWidth, canvasHeight, fog.opacity)}
          >
            {variant === 'master' ? <span>{region.label}</span> : null}
            {isEditable ? (
              <button
                aria-label={`Изменить размер ${region.label}`}
                className="scene-canvas-fog-region__resize"
                onPointerDown={(event) => onResizeStart?.(region, event)}
                title="Изменить размер"
                type="button"
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function CanvasMeasurement({
  canvasHeight,
  canvasWidth,
  isPreview = false,
  measurement,
}: {
  canvasHeight: number
  canvasWidth: number
  isPreview?: boolean
  measurement: SceneCanvasMeasurement
}) {
  const previewClassName = isPreview ? ' scene-canvas-measurement--preview' : ''

  if (measurement.kind === 'ruler') {
    return (
      <div
        className={`scene-canvas-measurement scene-canvas-measurement--ruler${previewClassName}`}
        style={getRulerMeasurementStyle(measurement, canvasWidth, canvasHeight)}
      >
        <span>{measurement.label}</span>
      </div>
    )
  }

  return (
    <div
      className={`scene-canvas-measurement scene-canvas-measurement--area scene-canvas-measurement--${measurement.shape ?? 'circle'}${previewClassName}`}
      style={getAreaMeasurementStyle(measurement, canvasWidth, canvasHeight)}
    >
      <span>{measurement.label}</span>
    </div>
  )
}

function getCanvasPointFromClient(
  clientX: number,
  clientY: number,
  frame: SceneCanvasPointerFrame,
): SceneCanvasObjectPosition {
  return {
    x: clampCanvasValue(((clientX - frame.left) / frame.width) * frame.canvasWidth, 0, frame.canvasWidth),
    y: clampCanvasValue(((clientY - frame.top) / frame.height) * frame.canvasHeight, 0, frame.canvasHeight),
  }
}

function getDrawDistance(drawState: SceneCanvasDrawState): number {
  return Math.hypot(drawState.latestX - drawState.originX, drawState.latestY - drawState.originY)
}

function createMeasurementInputFromDraw(drawState: SceneCanvasDrawState): SceneMeasurementDraft {
  const template = drawState.tool.kind === 'measurement' ? drawState.tool.template : 'ruler'

  return {
    template,
    originX: drawState.originX,
    originY: drawState.originY,
    targetX: drawState.latestX,
    targetY: drawState.latestY,
  }
}

function createPreviewMeasurementFromDraw(
  drawState: SceneCanvasDrawState,
  grid: SceneGrid,
): SceneCanvasMeasurement {
  const input = createMeasurementInputFromDraw(drawState)
  const distance = Math.max(1, Math.hypot(input.targetX - input.originX, input.targetY - input.originY))
  const cells = distance / grid.size
  const label = formatGridDistance(cells, grid)

  if (input.template === 'ruler') {
    return {
      id: 'measurement-preview',
      kind: 'ruler',
      name: 'Линейка',
      originX: input.originX,
      originY: input.originY,
      targetX: input.targetX,
      targetY: input.targetY,
      radius: 0,
      color: '#2c806f',
      label,
      isPlayerVisible: true,
    }
  }

  return {
    id: 'measurement-preview',
    kind: 'area',
    shape: input.template,
    name: getMeasurementTemplateName(input.template),
    originX: input.originX,
    originY: input.originY,
    targetX: input.targetX,
    targetY: input.targetY,
    radius: distance,
    color: getMeasurementTemplateColor(input.template),
    label,
    isPlayerVisible: true,
  }
}

function createFogRegionInputFromDraw(drawState: SceneCanvasDrawState): SceneFogRegionDraft {
  const shape = drawState.tool.kind === 'fog-draw' ? drawState.tool.shape : 'rectangle'

  return {
    shape,
    ...getFogRegionBoundsFromDraw(drawState, shape),
  }
}

function createPreviewFogRegionFromDraw(drawState: SceneCanvasDrawState): SceneCanvasFogRegion {
  const input = createFogRegionInputFromDraw(drawState)

  return {
    id: 'fog-preview',
    label: input.shape === 'circle' ? 'Круг тумана' : 'Область тумана',
    ...input,
  }
}

function createFogStateWithDraggedRegion(
  fog: SceneCanvasFogState,
  fogDragState: SceneFogRegionDragState | null,
): SceneCanvasFogState {
  if (fogDragState === null) {
    return fog
  }

  return {
    ...fog,
    regions: fog.regions.map((region) =>
      region.id === fogDragState.regionId
        ? {
            ...region,
            x: fogDragState.latestX,
            y: fogDragState.latestY,
            width: fogDragState.latestWidth,
            height: fogDragState.latestHeight,
          }
        : region,
    ),
  }
}

function getFogRegionBoundsFromDraw(
  drawState: SceneCanvasDrawState,
  shape: SceneFogRegionTemplate,
): Pick<SceneCanvasFogRegion, 'x' | 'y' | 'width' | 'height'> {
  const rawDeltaX = drawState.latestX - drawState.originX
  const rawDeltaY = drawState.latestY - drawState.originY

  if (shape === 'circle') {
    const size = Math.max(Math.abs(rawDeltaX), Math.abs(rawDeltaY))

    return {
      x: rawDeltaX < 0 ? drawState.originX - size : drawState.originX,
      y: rawDeltaY < 0 ? drawState.originY - size : drawState.originY,
      width: size,
      height: size,
    }
  }

  return {
    x: Math.min(drawState.originX, drawState.latestX),
    y: Math.min(drawState.originY, drawState.latestY),
    width: Math.abs(rawDeltaX),
    height: Math.abs(rawDeltaY),
  }
}

function getDraggedFogRegionPosition(
  fogDragState: SceneFogRegionDragState,
  grid: SceneGrid,
  canvasWidth: number,
  canvasHeight: number,
  deltaX: number,
  deltaY: number,
): Pick<SceneFogRegionDragState, 'latestX' | 'latestY' | 'latestWidth' | 'latestHeight'> {
  if (fogDragState.mode === 'move') {
    const width = fogDragState.originWidth
    const height = fogDragState.originHeight
    const x = getSnappedCanvasValue(fogDragState.originX + deltaX, grid)
    const y = getSnappedCanvasValue(fogDragState.originY + deltaY, grid)

    return {
      latestX: clampCanvasValue(x, 0, canvasWidth - width),
      latestY: clampCanvasValue(y, 0, canvasHeight - height),
      latestWidth: width,
      latestHeight: height,
    }
  }

  if (fogDragState.shape === 'circle') {
    const maxSize = Math.max(40, Math.min(canvasWidth - fogDragState.originX, canvasHeight - fogDragState.originY))
    const size = clampCanvasValue(
      getSnappedCanvasDimension(Math.max(fogDragState.originWidth + deltaX, fogDragState.originHeight + deltaY), grid),
      40,
      maxSize,
    )

    return {
      latestX: fogDragState.originX,
      latestY: fogDragState.originY,
      latestWidth: size,
      latestHeight: size,
    }
  }

  return {
    latestX: fogDragState.originX,
    latestY: fogDragState.originY,
    latestWidth: clampCanvasValue(
      getSnappedCanvasDimension(fogDragState.originWidth + deltaX, grid),
      40,
      canvasWidth - fogDragState.originX,
    ),
    latestHeight: clampCanvasValue(
      getSnappedCanvasDimension(fogDragState.originHeight + deltaY, grid),
      40,
      canvasHeight - fogDragState.originY,
    ),
  }
}

function getSnappedCanvasValue(value: number, grid: SceneGrid): number {
  return grid.enabled && grid.snapToGrid ? snapCanvasValue(value, grid) : value
}

function getSnappedCanvasDimension(value: number, grid: SceneGrid): number {
  const positiveValue = Math.max(40, value)

  return grid.enabled && grid.snapToGrid ? Math.max(grid.size, snapCanvasValue(positiveValue, grid)) : positiveValue
}

function getMeasurementTemplateName(template: SceneMeasurementTemplate): string {
  switch (template) {
    case 'ruler':
      return 'Линейка'
    case 'circle':
      return 'Круг'
    case 'cone':
      return 'Конус'
    case 'square':
      return 'Квадрат'
  }
}

function getMeasurementTemplateColor(template: SceneMeasurementTemplate): string {
  switch (template) {
    case 'ruler':
      return '#2c806f'
    case 'circle':
      return '#9f2d3c'
    case 'cone':
      return '#d8a86a'
    case 'square':
      return '#49625f'
  }
}

function getFogOverlayClassName(variant: 'master' | 'player', isEditable: boolean, isPreview: boolean): string {
  return [
    'scene-canvas-fog',
    `scene-canvas-fog--${variant}`,
    isEditable ? 'scene-canvas-fog--editable' : '',
    isPreview ? 'scene-canvas-fog--preview' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function getFogRegionClassName(
  region: SceneCanvasFogRegion,
  isEditable: boolean,
  isPreview: boolean,
  isSelected: boolean,
  isDragging: boolean,
): string {
  return [
    'scene-canvas-fog-region',
    `scene-canvas-fog-region--${region.shape}`,
    isEditable ? 'scene-canvas-fog-region--editable' : '',
    isPreview ? 'scene-canvas-fog-region--preview' : '',
    isSelected ? 'scene-canvas-fog-region--selected' : '',
    isDragging ? 'scene-canvas-fog-region--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')
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

function isMeasurementToolActive(activeTool: SceneCanvasTool, template: SceneMeasurementTemplate): boolean {
  return activeTool.kind === 'measurement' && activeTool.template === template
}

function isFogDrawToolActive(activeTool: SceneCanvasTool, shape: SceneFogRegionTemplate): boolean {
  return activeTool.kind === 'fog-draw' && activeTool.shape === shape
}

function getToolButtonClassName(isActive: boolean): string {
  return isActive
    ? 'button button--secondary scene-canvas-icon-button scene-canvas-icon-button--active'
    : 'button button--secondary scene-canvas-icon-button'
}

function getGridUnitValue(unitLabel: string): 'ft' | 'm' {
  return unitLabel === 'm' ? 'm' : 'ft'
}

function getGridUnitUpdate(unitValue: string): Partial<SceneGrid> {
  if (unitValue === 'm') {
    return {
      unitLabel: 'm',
      distancePerCell: 1.5,
    }
  }

  return {
    unitLabel: 'ft',
    distancePerCell: 5,
  }
}

function shouldIgnoreSceneHotkey(event: globalThis.KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return true
  }

  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  )
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
