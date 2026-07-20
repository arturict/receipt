import { eventLabels, formatDate } from '../lib/domain'
import type { EventRow } from '../lib/types'

interface TimelineProps {
  events: EventRow[]
  truncated: boolean
}

export function Timeline({ events, truncated }: TimelineProps) {
  return (
    <aside className="timeline" aria-labelledby="timeline-title">
      <header>
        <p className="eyebrow">Audit trail</p>
        <h2 id="timeline-title">What happened</h2>
      </header>
      <ol>
        {events.map((event) => (
          <li className={`timeline__event timeline__event--${event.actor}`} key={event.$id}>
            <span className="timeline__dot" aria-hidden="true" />
            <div>
              <strong>{eventLabels[event.kind]}</strong>
              <p>{event.summary}</p>
              <time dateTime={event.$createdAt}>{formatDate(event.$createdAt, true)}</time>
            </div>
          </li>
        ))}
      </ol>
      {truncated ? (
        <p className="timeline-truncated">Showing the newest 500 workspace events. Older audit records remain in Appwrite.</p>
      ) : null}
    </aside>
  )
}
