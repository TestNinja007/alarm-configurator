import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { describeRule, type Alarm, type AlarmList, type AlarmSort, type Folder } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toaster';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const SORT_OPTIONS: { value: AlarmSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Created' },
  { value: 'next', label: 'Next occurrence' },
];

export function AlarmsPage() {
  const { folderId = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<AlarmSort>('name');
  const [pendingDelete, setPendingDelete] = useState<Alarm | undefined>();

  const debouncedSearch = useDebouncedValue(search);

  const folder = useQuery({
    queryKey: ['folder', folderId],
    queryFn: () => api.get<Folder>(`/folders/${folderId}`),
  });

  const listKey = ['alarms', folderId, debouncedSearch, sort] as const;

  const alarms = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams({ folderId, sort });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      return api.get<AlarmList>(`/alarms?${params.toString()}`);
    },
    // Keeps the previous rows on screen while a new search request is in
    // flight, so the table does not flash back to its skeleton on every keystroke.
    placeholderData: (previous) => previous,
  });

  /**
   * A-05: the row flips immediately, then reconciles with whatever the server
   * returns. On failure the previous list is put back and a toast explains why.
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
      void queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
    },
  });

  const deleteAlarm = useMutation({
    mutationFn: (alarm: Alarm) => api.delete<void>(`/alarms/${alarm.id}`),
    onSuccess: async (_result, alarm) => {
      setPendingDelete(undefined);
      await queryClient.invalidateQueries({ queryKey: ['alarms', folderId] });
      await queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      toast.push('success', `"${alarm.name}" deleted.`);
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : 'Could not delete alarm.');
    },
  });

  const rows = alarms.data?.items ?? [];

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
      </header>

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
            onChange={(event) => setSort(event.target.value as AlarmSort)}
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

      {/*
        A-01: the container reports aria-busy while the first page loads and
        renders a skeleton in place of the table.
      */}
      <section
        className="card"
        aria-busy={alarms.isLoading}
        aria-labelledby="alarm-list-heading"
        data-testid="alarm-list-container"
      >
        <h2 id="alarm-list-heading" className="card-title">
          Alarms <span className="count-badge" data-testid="alarm-total">{alarms.data?.total ?? 0}</span>
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
                  <td>
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
