import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import {
  describeRule,
  type Alarm,
  type AlarmDraft,
  type AlarmList,
  type AlarmSort,
  type Folder,
  type FolderSummary,
  type UiState,
} from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ConflictsPanel } from '../components/ConflictsPanel';
import { OccurrencePreview } from '../components/OccurrencePreview';
import { useToast } from '../components/Toaster';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const SORT_OPTIONS: { value: AlarmSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Created' },
  { value: 'next', label: 'Next occurrence' },
];

/** A-08: these controls only exist once a folder holds two or more alarms. */
const MULTI_ALARM_THRESHOLD = 2;

export function AlarmsPage() {
  const { folderId = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<AlarmSort>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewFor, setPreviewFor] = useState<Alarm | undefined>();
  const [pendingDelete, setPendingDelete] = useState<Alarm | undefined>();
  const [uiStateLoaded, setUiStateLoaded] = useState(false);

  const debouncedSearch = useDebouncedValue(search);

  const folder = useQuery({
    queryKey: ['folder', folderId],
    queryFn: () => api.get<Folder>(`/folders/${folderId}`),
  });

  const summary = useQuery({
    queryKey: ['folder-summary', folderId],
    queryFn: () => api.get<FolderSummary>(`/folders/${folderId}/summary`),
  });

  const draft = useQuery({
    queryKey: ['alarm-draft'],
    queryFn: () => api.get<{ draft: AlarmDraft | null }>('/me/alarm-draft'),
  });

  // A-04: the stored sort order is applied once, before the first list request
  // that the user would notice.
  const uiState = useQuery({
    queryKey: ['ui-state'],
    queryFn: () => api.get<UiState>('/me/ui-state'),
  });

  // Applied during render rather than in an effect, so the first list request
  // already carries the stored sort order instead of firing twice.
  if (uiState.isFetched && !uiStateLoaded) {
    setUiStateLoaded(true);
    if (uiState.data?.sort) setSort(uiState.data.sort);
  }

  const saveUiState = useMutation({
    mutationFn: (next: { folderId: string; sort: AlarmSort }) => api.put<UiState>('/me/ui-state', next),
  });

  const listKey = ['alarms', folderId, debouncedSearch, sort] as const;

  const alarms = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams({ folderId, sort });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      return api.get<AlarmList>(`/alarms?${params.toString()}`);
    },
    // Keeps the previous rows visible while a new search is in flight, so the
    // table does not fall back to its skeleton on every keystroke.
    placeholderData: (previous) => previous,
  });

  /**
   * A-05: the row flips immediately, then reconciles with the server. On
   * failure the previous list is restored and a toast explains why.
   */
  const toggleEnabled = useMutation({
    mutationFn: (alarm: Alarm) =>
      api.post<Alarm>(`/alarms/${alarm.id}/${alarm.enabled ? 'disable' : 'enable'}`),
    onMutate: async (alarm) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<AlarmList>(listKey);

      queryClient.setQueryData<AlarmList>(listKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((row) =>
                row.id === alarm.id ? { ...row, enabled: !row.enabled } : row,
              ),
            }
          : current,
      );

      return { previous };
    },
    onError: (error, _alarm, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      toast.push('error', error instanceof ApiError ? error.message : 'Could not update alarm.');
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AlarmList>(listKey, (current) =>
        current
          ? { ...current, items: current.items.map((row) => (row.id === updated.id ? updated : row)) }
          : current,
      );
      toast.push('success', `"${updated.name}" ${updated.enabled ? 'enabled' : 'disabled'}.`);
    },
    onSettled: () => {
      // Enabling can create an R-08 collision, so the panel and the counts are
      // both stale once a toggle lands.
      void queryClient.invalidateQueries({ queryKey: ['conflicts', folderId] });
      void queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      void queryClient.invalidateQueries({ queryKey: ['folder-summary', folderId] });
    },
  });

  const bulkToggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post<AlarmList>('/alarms/bulk-enable', { ids: [...selected], enabled }),
    onSuccess: async (_result, enabled) => {
      const count = selected.size;
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['alarms', folderId] });
      await queryClient.invalidateQueries({ queryKey: ['conflicts', folderId] });
      await queryClient.invalidateQueries({ queryKey: ['folder-summary', folderId] });
      toast.push('success', `${count} alarm${count === 1 ? '' : 's'} ${enabled ? 'enabled' : 'disabled'}.`);
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : 'Could not update alarms.');
    },
  });

  const deleteAlarm = useMutation({
    mutationFn: (alarm: Alarm) => api.delete<void>(`/alarms/${alarm.id}`),
    onSuccess: async (_result, alarm) => {
      setPendingDelete(undefined);
      await queryClient.invalidateQueries({ queryKey: ['alarms', folderId] });
      await queryClient.invalidateQueries({ queryKey: ['conflicts', folderId] });
      await queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      await queryClient.invalidateQueries({ queryKey: ['folder-summary', folderId] });
      toast.push('success', `"${alarm.name}" deleted.`);
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : 'Could not delete alarm.');
    },
  });

  const rows = alarms.data?.items ?? [];
  const alarmCount = folder.data?.alarmCount ?? 0;
  const showMultiAlarmTools = alarmCount >= MULTI_ALARM_THRESHOLD;
  const resumableDraft = draft.data?.draft;

  function onSortChange(next: AlarmSort) {
    setSort(next);
    saveUiState.mutate({ folderId, sort: next });
  }

  function toggleSelection(alarmId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(alarmId)) next.delete(alarmId);
      else next.add(alarmId);
      return next;
    });
  }

  return (
    <main className="page" data-testid="alarms-page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/folders" data-testid="folders-back-link">
          Folders
        </Link>
        <span aria-hidden="true"> / </span>
        <span data-testid="alarms-folder-name">{folder.data?.name ?? '…'}</span>
      </nav>

      <header className="page-header">
        <h1 className="page-title">{folder.data?.name ?? 'Alarms'}</h1>
        <Link
          className="button button-primary"
          to={`/folders/${folderId}/alarms/new`}
          data-testid="alarm-create-link"
        >
          New alarm
        </Link>
      </header>

      {resumableDraft ? (
        <p className="alert alert-info" data-testid="draft-resume-banner">
          You have an unfinished alarm, last edited {new Date(resumableDraft.updatedAt).toLocaleString()}.{' '}
          <Link to={`/folders/${folderId}/alarms/new`} data-testid="draft-resume-link">
            Resume it
          </Link>
          .
        </p>
      ) : null}

      <section className="summary-strip" data-testid="folder-summary">
        <span data-testid="summary-alarm-count">{summary.data?.alarmCount ?? 0} alarms</span>
        <span data-testid="summary-enabled-count">{summary.data?.enabledCount ?? 0} enabled</span>
        <span data-testid="summary-next-7-days">
          {summary.data?.occurrencesNext7Days ?? 0} occurrences in the next 7 days
        </span>
        <span data-testid="summary-next-occurrence">
          next: {summary.data?.nextOccurrence?.local ?? 'none'}
        </span>
      </section>

      <div className="toolbar" data-testid="alarm-toolbar">
        <div className="field">
          <label htmlFor="alarm-search">Search by name</label>
          <input
            id="alarm-search"
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter alarms"
            data-testid="alarm-search-input"
          />
        </div>

        <div className="field">
          <label htmlFor="alarm-sort">Sort by</label>
          <select
            id="alarm-sort"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as AlarmSort)}
            data-testid="alarm-sort-select"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showMultiAlarmTools ? (
        <div className="bulk-bar" data-testid="bulk-actions-container">
          <span data-testid="bulk-selection-count">{selected.size} selected</span>
          <button
            type="button"
            className="button"
            disabled={selected.size === 0 || bulkToggle.isPending}
            onClick={() => bulkToggle.mutate(true)}
            data-testid="bulk-enable-button"
          >
            Enable selected
          </button>
          <button
            type="button"
            className="button"
            disabled={selected.size === 0 || bulkToggle.isPending}
            onClick={() => bulkToggle.mutate(false)}
            data-testid="bulk-disable-button"
          >
            Disable selected
          </button>
        </div>
      ) : null}

      <section
        className="card"
        aria-busy={alarms.isLoading}
        aria-labelledby="alarm-list-heading"
        data-testid="alarm-list-container"
      >
        <h2 id="alarm-list-heading" className="card-title">
          Alarms{' '}
          <span className="count-badge" data-testid="alarm-total">
            {alarms.data?.total ?? 0}
          </span>
        </h2>

        {alarms.isLoading ? (
          <div className="skeleton-list" data-testid="alarm-list-skeleton">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="skeleton-row" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="empty-state" data-testid="alarm-list-empty">
            {debouncedSearch.trim()
              ? `No alarms match "${debouncedSearch.trim()}".`
              : 'This folder has no alarms yet.'}
          </p>
        ) : (
          <table className="table" data-testid="alarm-table">
            <caption className="visually-hidden">Alarms in {folder.data?.name ?? 'this folder'}</caption>
            <thead>
              <tr>
                {showMultiAlarmTools ? <th scope="col">Select</th> : null}
                <th scope="col">Name</th>
                <th scope="col">Time</th>
                <th scope="col">Time zone</th>
                <th scope="col">Repeats</th>
                <th scope="col">Enabled</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((alarm) => (
                <tr key={alarm.id} data-testid="alarm-row" data-alarm-id={alarm.id}>
                  {showMultiAlarmTools ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(alarm.id)}
                        onChange={() => toggleSelection(alarm.id)}
                        aria-label={`Select ${alarm.name}`}
                        data-testid="alarm-select-checkbox"
                      />
                    </td>
                  ) : null}
                  <th scope="row" data-testid="alarm-name-cell">
                    {alarm.name}
                  </th>
                  <td data-testid="alarm-time-cell">{alarm.timeOfDay}</td>
                  <td data-testid="alarm-timezone-cell">{alarm.timezone}</td>
                  <td data-testid="alarm-rule-cell">{describeRule(alarm.rule)}</td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={alarm.enabled}
                      className={`toggle ${alarm.enabled ? 'toggle-on' : 'toggle-off'}`}
                      onClick={() => toggleEnabled.mutate(alarm)}
                      aria-label={`${alarm.enabled ? 'Disable' : 'Enable'} ${alarm.name}`}
                      data-testid="alarm-enabled-toggle"
                    >
                      {alarm.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="button"
                      onClick={() => setPreviewFor(alarm)}
                      aria-label={`Preview occurrences of ${alarm.name}`}
                      data-testid="alarm-preview-button"
                    >
                      Preview
                    </button>
                    <Link
                      className="button"
                      to={`/alarms/${alarm.id}/edit`}
                      aria-label={`Edit ${alarm.name}`}
                      data-testid="alarm-edit-link"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => setPendingDelete(alarm)}
                      aria-label={`Delete ${alarm.name}`}
                      data-testid="alarm-delete-button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {previewFor ? (
        <OccurrencePreview
          alarmId={previewFor.id}
          heading={`Next occurrences of ${previewFor.name}`}
        />
      ) : null}

      {showMultiAlarmTools ? <ConflictsPanel folderId={folderId} /> : null}

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(undefined);
        }}
        title="Delete alarm"
        description={pendingDelete ? `Delete "${pendingDelete.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete alarm"
        busy={deleteAlarm.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteAlarm.mutate(pendingDelete);
        }}
        testId="alarm-delete-dialog"
      />
    </main>
  );
}
