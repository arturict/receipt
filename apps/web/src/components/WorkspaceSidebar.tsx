import { requestStatusLabel } from '../lib/domain'
import type { ReceiptState } from '../lib/types'
import { Icon } from './Icon'

interface WorkspaceSidebarProps {
  disabled: boolean
  state: ReceiptState
  selectedRequestId: string | null
  onNewCase: () => void
  onSelect: (requestId: string) => void
}

export function WorkspaceSidebar({
  disabled,
  state,
  selectedRequestId,
  onNewCase,
  onSelect,
}: WorkspaceSidebarProps) {
  return (
    <aside className="workspace-sidebar">
      <div className="brand-lockup">
        <span className="brand-mark">R/</span>
        <div><strong>Receipt</strong><small>Scope control room</small></div>
      </div>

      <button className="button button--sidebar" disabled={disabled} type="button" onClick={onNewCase}>
        <Icon name="plus" /> New scope room
      </button>

      <nav aria-label="Scope rooms">
        <p className="nav-label">Rooms · {state.requests.length}</p>
        {state.requests.length === 0 ? (
          <p className="sidebar-empty">No client requests yet.</p>
        ) : (
          <ul>
            {state.requests.map((request) => {
              const project = state.projects.find((item) => item.$id === request.projectId)
              const active = request.$id === selectedRequestId
              return (
                <li key={request.$id}>
                  <button
                    aria-current={active ? 'page' : undefined}
                    className={active ? 'room-link room-link--active' : 'room-link'}
                    disabled={disabled}
                    type="button"
                    onClick={() => onSelect(request.$id)}
                  >
                    <span className={`room-link__signal room-link__signal--${request.status}`} />
                    <span>
                      <strong>{project?.name || 'Untitled project'}</strong>
                      <small>{project?.clientName || 'Unknown client'}</small>
                    </span>
                    <em>{requestStatusLabel(request.status)}</em>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <footer>
        <span className="privacy-mark" aria-hidden="true">◎</span>
        <p><strong>Fictional demo data only</strong><small>This anonymous workspace is isolated but cannot be recovered if browser data is cleared.</small></p>
      </footer>
    </aside>
  )
}
