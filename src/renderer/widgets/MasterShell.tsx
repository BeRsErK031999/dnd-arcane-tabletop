import type { ReactNode } from 'react'

interface MasterShellProps {
  activeScreen: string
  children: ReactNode
}

const navigationItems = ['Кампании', 'Сцены', 'Бой', 'Заметки', 'Экран игроков']

export function MasterShell({ activeScreen, children }: MasterShellProps) {
  return (
    <div className="app-shell" data-screen={activeScreen}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">D20</div>
          <div>
            <p className="brand__name">D&D Arcane Tabletop</p>
            <span className="brand__meta">Local desktop</span>
          </div>
        </div>

        <nav aria-label="Master tools">
          <ul className="nav-list">
            {navigationItems.map((item, index) => (
              <li className={index === 0 ? 'nav-item nav-item--active' : 'nav-item'} key={item}>
                <span className="nav-dot" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">JSON storage abstraction</div>
      </aside>

      <main className="workspace">{children}</main>
    </div>
  )
}
