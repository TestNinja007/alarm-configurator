import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Occurrence, PreviewRequest } from '../api/types';

/**
 * The next ten occurrences, shown in the alarm's own time zone with the UTC
 * instant alongside. Used both by the wizard's review step, where the alarm
 * does not exist yet, and by the list's per-row preview.
 */
export function OccurrencePreview({
  request,
  alarmId,
  heading = 'Next occurrences',
}: {
  request?: PreviewRequest;
  alarmId?: string;
  heading?: string;
}) {
  const preview = useQuery({
    queryKey: ['occurrences', alarmId ?? 'preview', request],
    enabled: Boolean(alarmId) || Boolean(request),
    queryFn: () =>
      alarmId
        ? api.get<{ items: Occurrence[] }>(`/alarms/${alarmId}/occurrences?limit=10`)
        : api.post<{ items: Occurrence[] }>('/alarms/preview', { ...request, limit: 10 }),
  });

  return (
    <section
      className="card"
      aria-busy={preview.isLoading}
      aria-labelledby="occurrence-preview-heading"
      data-testid="occurrence-preview-container"
    >
      <h3 id="occurrence-preview-heading" className="card-title">
        {heading}
      </h3>

      {preview.isLoading ? (
        <div className="skeleton-list" data-testid="occurrence-preview-skeleton">
          {[0, 1, 2].map((row) => (
            <div key={row} className="skeleton-row" />
          ))}
        </div>
      ) : preview.isError ? (
        <p className="field-error" data-testid="occurrence-preview-error">
          The schedule is not complete enough to preview yet.
        </p>
      ) : preview.data && preview.data.items.length > 0 ? (
        <ol className="occurrence-list" data-testid="occurrence-list">
          {preview.data.items.map((occurrence) => (
            <li key={occurrence.utc} className="occurrence-row" data-testid="occurrence-row">
              <span data-testid="occurrence-local">{occurrence.local}</span>
              <span className="occurrence-utc" data-testid="occurrence-utc">
                {occurrence.utc}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-state" data-testid="occurrence-preview-empty">
          This schedule produces no further occurrences.
        </p>
      )}
    </section>
  );
}
