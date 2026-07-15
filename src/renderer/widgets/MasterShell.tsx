import { useEffect, useState, type ReactNode } from 'react'
import { WORKSPACE_NAVIGATION_EVENT } from '@shared/constants'

interface MasterShellProps {
  activeScreen: string
  children: ReactNode
  homeDisabled?: boolean
  onHome?: () => void
}

type WorkspaceSection = 'scenes' | 'assets' | 'combat' | 'notes' | 'players'

const navigationItems: Array<{ id: WorkspaceSection; label: string; shortLabel: string; icon: string }> = [
  { id: 'scenes', label: 'Сцены', shortLabel: 'Сцены', icon: '▦' },
  { id: 'assets', label: 'Общая библиотека ассетов', shortLabel: 'Ассеты', icon: '◇' },
  { id: 'combat', label: 'Бой и инициатива', shortLabel: 'Бой', icon: '⚔' },
  { id: 'notes', label: 'Заметки', shortLabel: 'Заметки', icon: '✎' },
  { id: 'players', label: 'Экран игроков', shortLabel: 'Игроки', icon: '▣' },
]

export function MasterShell({ activeScreen, children, homeDisabled = false, onHome }: MasterShellProps) {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('scenes')

  useEffect(() => {
    function handleWorkspaceNavigation(event: Event): void {
      const section = getWorkspaceNavigationSection(event)

      if (section !== null) {
        setActiveSection(section)
      }
    }

    window.addEventListener(WORKSPACE_NAVIGATION_EVENT, handleWorkspaceNavigation)

    return () => {
      window.removeEventListener(WORKSPACE_NAVIGATION_EVENT, handleWorkspaceNavigation)
    }
  }, [])

  function navigateToSection(section: WorkspaceSection): void {
    const nextSection = activeSection === section && section !== 'scenes' ? 'scenes' : section
    setActiveSection(nextSection)
    window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: { section: nextSection } }))
  }

  return (
    <div className="app-shell" data-screen={activeScreen}>
      <aside aria-label="Инструменты редактора" className="sidebar">
        <button
          aria-label="Вернуться к проектам и сохранить изменения"
          className="brand brand--button"
          disabled={homeDisabled}
          onClick={onHome}
          title="К проектам"
          type="button"
        >
          <div className="brand__mark">D20</div>
          <span className="brand__meta">{homeDisabled ? 'Сохраняем...' : 'Проекты'}</span>
        </button>

        <nav aria-label="Master tools">
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.id}>
                <button
                  aria-label={item.label}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                  className={activeSection === item.id ? 'nav-item nav-item--active' : 'nav-item'}
                  data-nav-section={item.id}
                  onClick={() => navigateToSection(item.id)}
                  type="button"
                >
                  <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.shortLabel}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="workspace">{children}</main>
    </div>
  )
}

function getWorkspaceNavigationSection(event: Event): WorkspaceSection | null {
  if (!(event instanceof CustomEvent) || typeof event.detail !== 'object' || event.detail === null) {
    return null
  }

  const section = (event.detail as { section?: unknown }).section

  return isWorkspaceSection(section) ? section : null
}

function isWorkspaceSection(value: unknown): value is WorkspaceSection {
  return (
    value === 'scenes' ||
    value === 'assets' ||
    value === 'combat' ||
    value === 'notes' ||
    value === 'players'
  )
}
