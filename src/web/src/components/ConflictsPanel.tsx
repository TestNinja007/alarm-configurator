import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ConflictPair } from '../api/types';

/**
 * R-08 collisions currently present in a folder.
 *
 * A-08: the caller only renders this once the folder holds two or more alarms,
 * since a single alarm can never collide with anything.
 *
 * The list is usually empty. R-08 refuses to create or update an alarm into a
 * collision, so the only way to reach this state is to enable an alarm that was
 * created while disabled — see the README section on conflicts.
 */
export function ConflictsPanel({ folderId }: { folderId: string }) {
  const conflicts = useQuery({
    queryKey: ['conflicts', folderId],
    queryFn: () => api.get<{ items: ConflictPair[]; windowDays: number }>(`/folders/${folderId}/conflicts`),
  });

  const items = conflicts.data?.items ?? [];

  return (
    <section
      className="card"
      aria-busy={conflicts.isLoading}
      aria-labelledby="conflicts-panel-heading"
      data-testid="conflicts-panel-container"
    >
      <h2 id="conflicts-panel-heading" className="card-title">
        Conflicts
        <span className="count-badge" data-testid="conflicts-count">
          {items.length}
        </span>
      </h2>

      {conflicts.isLoading ? (
        <div className="skeleton-list" data-testid="conflicts-panel-skeleton">
          <div className="skeleton-row" />
        </div>
      ) : items.length === 0 ? (
        <p className="empty-state" data-testid="conflicts-panel-empty">
          No two enabled alarms in this folder share an instant in the next{' '}
          {conflicts.data?.windowDays ?? 90} days.
        </p>
      ) : (
        <ul className="conflict-list" data-testid="conflicts-list">
          {items.map((pair) => (
            <li
              key={`${pair.alarmAId}-${pair.alarmBId}`}
              className="conflict-row"
              data-testid="conflict-row"
              data-alarm-a-id={pair.alarmAId}
              data-alarm-b-id={pair.alarmBId}
            >
              <span data-testid="conflict-names">
                <strong>{pair.alarmAName}</strong> and <strong>{pair.alarmBName}</strong>
              </span>
              <span className="conflict-detail" data-testid="conflict-first-utc">
                first at {pair.firstUtc}
              </span>
              <span className="conflict-detail" data-testid="conflict-count">
                {pair.collisionCount} collision{pair.collisionCount === 1 ? '' : 's'} in the window
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
