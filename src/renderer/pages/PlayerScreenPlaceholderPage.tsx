import { useEffect, useState, type CSSProperties } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import {
  createDefaultPlayerScreenState,
  type PlayerSceneCanvasFogRegion,
  type PlayerSceneCanvasFogProjection,
  type PlayerSceneCanvasMeasurement,
  type PlayerSceneCanvasObject,
  type PlayerSceneCanvasProjection,
  type PlayerScreenState,
} from '@shared/types'

export function PlayerScreenPlaceholderPage() {
  const [playerScreenState, setPlayerScreenState] = useState<PlayerScreenState>(() => createDefaultPlayerScreenState())

  useEffect(() => {
    let isMounted = true

    void desktopApi.playerScreen.getState().then((state) => {
      if (isMounted) {
        setPlayerScreenState(state)
      }
    })

    const unsubscribe = desktopApi.playerScreen.onStateUpdated((state) => {
      setPlayerScreenState(state)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  if (playerScreenState.isHidden) {
    return (
      <main className="player-screen player-screen--hidden">
        <section className="player-screen__center">
          <p className="eyebrow">Player Screen</p>
          <h1 className="player-screen__title">Экран скрыт</h1>
          <p>Мастер временно убрал материалы с экрана игроков.</p>
        </section>
      </main>
    )
  }

  return (
    <main className={`player-screen player-screen--${playerScreenState.mode}`}>
      {renderPlayerScreenContent(playerScreenState)}
    </main>
  )
}

function renderPlayerScreenContent(state: PlayerScreenState) {
  switch (state.mode) {
    case 'scene':
      return (
        <section className="player-screen__scene">
          {state.sceneCanvas ? (
            <PlayerSceneCanvas canvas={state.sceneCanvas} />
          ) : (
            <div className="player-screen__map-preview" aria-hidden="true" />
          )}
          <div className="player-screen__content-panel">
            <p className="eyebrow">Scene</p>
            <h1 className="player-screen__title">{state.title ?? state.scenePreview?.name ?? 'Сцена'}</h1>
            <p>{state.message}</p>
            {state.scenePreview ? (
              <div className="player-screen__details">
                <span>{state.scenePreview.name}</span>
                <span>{state.scenePreview.locationLabel}</span>
              </div>
            ) : null}
            {state.initiativeVisible ? <span className="player-screen__badge">Инициатива видна</span> : null}
          </div>
        </section>
      )
    case 'image':
      return (
        <section className="player-screen__image">
          <div className="player-screen__image-frame">
            <p className="eyebrow">{state.handoutPreview?.sourceLabel ?? 'Image'}</p>
            <h1 className="player-screen__title">{state.title ?? state.handoutPreview?.name ?? 'Изображение'}</h1>
            <p>{state.message ?? state.handoutPreview?.description}</p>
          </div>
        </section>
      )
    case 'split':
      return (
        <section className="player-screen__split">
          <div className="player-screen__split-pane player-screen__split-pane--scene">
            <p className="eyebrow">Scene</p>
            <h1>{state.scenePreview?.name ?? 'Сцена'}</h1>
            <p>{state.scenePreview?.description ?? state.message}</p>
          </div>
          <div className="player-screen__split-pane player-screen__split-pane--handout">
            <p className="eyebrow">Handout</p>
            <h1>{state.handoutPreview?.name ?? 'Материал'}</h1>
            <p>{state.handoutPreview?.description ?? state.message}</p>
          </div>
        </section>
      )
    case 'blank':
      return (
        <section className="player-screen__center">
          <p className="eyebrow">Player Screen</p>
          <h1 className="player-screen__title">{state.title ?? 'Экран игроков'}</h1>
          <p>{state.message ?? 'Материалы для игроков пока не выбраны.'}</p>
        </section>
      )
  }
}

function PlayerSceneCanvas({ canvas }: { canvas: PlayerSceneCanvasProjection }) {
  const viewportTransform: CSSProperties = {
    transform: `translate(${canvas.viewport.panX}px, ${canvas.viewport.panY}px) scale(${canvas.viewport.zoom})`,
  }

  return (
    <div className="player-scene-canvas" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
      <div className="player-scene-canvas__content" style={viewportTransform}>
        {canvas.backgroundAsset ? (
          <img className="player-scene-canvas__map" alt="" src={canvas.backgroundAsset.filePath} />
        ) : (
          <div className="player-scene-canvas__placeholder" />
        )}
        {canvas.grid.enabled ? (
          <div
            className="player-scene-canvas__grid"
            style={{
              backgroundSize: `${canvas.grid.size}px ${canvas.grid.size}px`,
              color: canvas.grid.color,
              opacity: canvas.grid.opacity,
            }}
          />
        ) : null}
        <div className="player-scene-canvas__objects">
          {canvas.objects.map((object) => (
            <div
              className={object.asset ? 'player-scene-canvas-object player-scene-canvas-object--asset' : 'player-scene-canvas-object'}
              key={object.id}
              style={getPlayerCanvasObjectStyle(object, canvas.width, canvas.height)}
            >
              {object.asset ? <img alt="" src={object.asset.filePath} /> : null}
              <span>{object.text ?? object.name}</span>
            </div>
          ))}
        </div>
        <div className="player-scene-canvas__measurements">
          {canvas.measurements.map((measurement) => (
            <PlayerCanvasMeasurement
              canvasHeight={canvas.height}
              canvasWidth={canvas.width}
              key={measurement.id}
              measurement={measurement}
            />
          ))}
        </div>
        <PlayerSceneFogOverlay canvasHeight={canvas.height} canvasWidth={canvas.width} fog={canvas.fog} />
      </div>
    </div>
  )
}

function PlayerSceneFogOverlay({
  canvasHeight,
  canvasWidth,
  fog,
}: {
  canvasHeight: number
  canvasWidth: number
  fog: PlayerSceneCanvasFogProjection
}) {
  if (!fog.enabled || fog.regions.length === 0) {
    return null
  }

  return (
    <div className="player-scene-canvas__fog" aria-hidden="true">
      {fog.regions.map((region) => (
        <div
          className={`player-scene-canvas-fog-region player-scene-canvas-fog-region--${region.shape}`}
          key={region.id}
          style={getPlayerFogRegionStyle(region, canvasWidth, canvasHeight, fog.opacity)}
        />
      ))}
    </div>
  )
}

function PlayerCanvasMeasurement({
  canvasHeight,
  canvasWidth,
  measurement,
}: {
  canvasHeight: number
  canvasWidth: number
  measurement: PlayerSceneCanvasMeasurement
}) {
  if (measurement.kind === 'ruler') {
    return (
      <div
        className="player-scene-canvas-measurement player-scene-canvas-measurement--ruler"
        style={getPlayerRulerMeasurementStyle(measurement, canvasWidth, canvasHeight)}
      >
        <span>{measurement.label}</span>
      </div>
    )
  }

  return (
    <div
      className={`player-scene-canvas-measurement player-scene-canvas-measurement--area player-scene-canvas-measurement--${measurement.shape ?? 'circle'}`}
      style={getPlayerAreaMeasurementStyle(measurement, canvasWidth, canvasHeight)}
    >
      <span>{measurement.label}</span>
    </div>
  )
}

function getPlayerFogRegionStyle(
  region: PlayerSceneCanvasFogRegion,
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

function getPlayerCanvasObjectStyle(
  object: PlayerSceneCanvasObject,
  canvasWidth: number,
  canvasHeight: number,
): CSSProperties {
  return {
    left: `${(object.x / canvasWidth) * 100}%`,
    top: `${(object.y / canvasHeight) * 100}%`,
    width: `${(object.width / canvasWidth) * 100}%`,
    height: `${(object.height / canvasHeight) * 100}%`,
    color: object.color,
    transform: `rotate(${object.rotation}deg)`,
  }
}

function getPlayerRulerMeasurementStyle(
  measurement: PlayerSceneCanvasMeasurement,
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

function getPlayerAreaMeasurementStyle(
  measurement: PlayerSceneCanvasMeasurement,
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
