import { useEffect, useState, type CSSProperties } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import {
  createDefaultPlayerScreenState,
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
  return (
    <div className="player-scene-canvas" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
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
            opacity: canvas.grid.opacity,
          }}
        />
      ) : null}
      <div className="player-scene-canvas__objects">
        {canvas.objects.map((object) => (
          <div
            className="player-scene-canvas-object"
            key={object.id}
            style={getPlayerCanvasObjectStyle(object, canvas.width, canvas.height)}
          >
            <span>{object.text ?? object.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
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
