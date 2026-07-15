import { useEffect, useState, type ReactNode } from 'react'
import { WORKSPACE_NAVIGATION_EVENT } from '@shared/constants'

interface MasterShellProps {
  activeScreen: string
  children: ReactNode
  homeDisabled?: boolean
  onHome?: () => void
}

type WorkspaceSection = 'campaigns' | 'scenes' | 'combat' | 'notes' | 'players'

const navigationItems: Array<{ id: WorkspaceSection; label: string }> = [
  { id: 'campaigns', label: 'Кампании' },
  { id: 'scenes', label: 'Сцены' },
  { id: 'combat', label: 'Бой' },
  { id: 'notes', label: 'Заметки' },
  { id: 'players', label: 'Экран игроков' },
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
    setActiveSection(section)
    window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: { section } }))
  }

  return (
    <div className="app-shell" data-screen={activeScreen}>
      <aside className="sidebar">
        <button
          aria-label="Вернуться к проектам и сохранить изменения"
          className="brand brand--button"
          disabled={homeDisabled}
          onClick={onHome}
          title="К проектам"
          type="button"
        >
          <div className="brand__mark">D20</div>
          <div>
            <p className="brand__name">D&D Arcane Tabletop</p>
            <span className="brand__meta">{homeDisabled ? 'Сохраняем проект...' : 'К списку проектов'}</span>
          </div>
        </button>

        <nav aria-label="Master tools">
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.id}>
                <button
                  aria-current={activeSection === item.id ? 'page' : undefined}
                  className={activeSection === item.id ? 'nav-item nav-item--active' : 'nav-item'}
                  onClick={() => navigateToSection(item.id)}
                  type="button"
                >
                  <span className="nav-dot" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">Данные хранятся локально</div>
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
    value === 'campaigns' ||
    value === 'scenes' ||
    value === 'combat' ||
    value === 'notes' ||
    value === 'players'
  )
}
