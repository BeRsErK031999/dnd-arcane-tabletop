import { useState, type ReactNode } from 'react'
import { WORKSPACE_NAVIGATION_EVENT } from '@shared/constants'

interface MasterShellProps {
  activeScreen: string
  children: ReactNode
}

type WorkspaceSection = 'campaigns' | 'scenes' | 'combat' | 'notes' | 'players'

const navigationItems: Array<{ id: WorkspaceSection; label: string }> = [
  { id: 'campaigns', label: 'Кампании' },
  { id: 'scenes', label: 'Сцены' },
  { id: 'combat', label: 'Бой' },
  { id: 'notes', label: 'Заметки' },
  { id: 'players', label: 'Экран игроков' },
]

export function MasterShell({ activeScreen, children }: MasterShellProps) {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('campaigns')

  function navigateToSection(section: WorkspaceSection): void {
    setActiveSection(section)
    window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: { section } }))
  }

  return (
    <div className="app-shell" data-screen={activeScreen}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">D20</div>
          <div>
            <p className="brand__name">D&D Arcane Tabletop</p>
            <span className="brand__meta">Локальное приложение</span>
          </div>
        </div>

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
