import { useEffect, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import { createDefaultPlayerScreenState, type PlayerScreenState } from '@shared/types'

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
          <div className="player-screen__map-preview" aria-hidden="true" />
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
