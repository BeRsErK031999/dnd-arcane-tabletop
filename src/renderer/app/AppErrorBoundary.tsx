import { Component, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  message: string | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: null,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="error-boundary" role="alert">
        <section className="error-boundary__panel">
          <p className="eyebrow">Renderer Error</p>
          <h1>Интерфейс нужно перезагрузить</h1>
          <p className="muted">
            {this.state.message ?? 'Неожиданная ошибка остановила отрисовку текущего окна.'}
          </p>
          <button className="button" onClick={() => window.location.reload()} type="button">
            Перезагрузить интерфейс
          </button>
        </section>
      </main>
    )
  }
}
