import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { describeRule, type Alarm, type AlarmList, type Folder } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NameDialog } from '../components/NameDialog';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useToast } from '../components/Toaster';

/** Time and recurrence in one line, for a row that has no room for a table. */
function scheduleLine(alarm: Alarm): string {
  return `${alarm.timeOfDay} · ${describeRule(alarm.rule)}`;
}

export function FoldersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Folder | undefined>();
  const [renamed, setRenamed] = useState('');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Folder | undefined>();

  const debouncedSearch = useDebouncedValue(search);
  const searching = debouncedSearch.trim().length > 0;

  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => api.get<{ items: Folder[] }>('/folders'),
  });

  /**
   * The alarms in no group, listed here rather than behind a link.
   *
   * They are not a folder and should not have to pretend to be one: an alarm
   * made in the moment belongs at the top level until its owner decides
   * otherwise, next to the groups rather than inside a box called Unfiled.
   */
  const loose = useQuery({
    queryKey: ['alarms', 'unfiled', 'root'],
    queryFn: () => api.get<AlarmList>('/alarms?unfiled=true&sort=name&pageSize=100'),
  });

  // One search across everything, grouped or not.
  const results = useQuery({
    queryKey: ['alarms', 'search', debouncedSearch],
    queryFn: () =>
      api.get<AlarmList>(`/alarms?q=${encodeURIComponent(debouncedSearch.trim())}&sort=name`),
    enabled: searching,
    placeholderData: (previous) => previous,
  });

  const groupNameById = new Map((folders.data?.items ?? []).map((item) => [item.id, item.name]));

  const createFolder = useMutation({
    mutationFn: (folderName: string) => api.post<Folder>('/folders', { name: folderName }),
    onSuccess: async (folder) => {
      setName('');
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.push('success', `Group "${folder.name}" created.`);
    },
  });

  const renameFolder = useMutation({
    mutationFn: (next: { id: string; name: string }) =>
      api.patch<Folder>(`/folders/${next.id}`, { name: next.name }),
    onSuccess: async (folder) => {
      setRenaming(undefined);
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      // The group's name is printed beside every search result.
      void queryClient.invalidateQueries({ queryKey: ['alarms'] });
      toast.push('success', `Renamed to "${folder.name}".`);
    },
  });

  const deleteFolder = useMutation({
    // R-10: the confirmation flag is part of the request, not a UI-only concept.
    mutationFn: (folder: Folder) => api.delete<void>(`/folders/${folder.id}?confirm=true`),
    onSuccess: async (_result, folder) => {
      setPendingDelete(undefined);
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      await queryClient.invalidateQueries({ queryKey: ['alarms'] });
      // Its alarms went with it, so the scheduler must stop expecting them.
      void queryClient.invalidateQueries({ queryKey: ['upcoming'] });
      toast.push('success', `Group "${folder.name}" deleted.`);
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : 'Could not delete group.');
    },
  });

  const createError = createFolder.error instanceof ApiError ? createFolder.error : undefined;
  const nameError = createError?.fieldError('name') ?? createError?.message;

  const renameError = renameFolder.error instanceof ApiError ? renameFolder.error : undefined;
  const renameNameError = renameError?.fieldError('name') ?? renameError?.message;

  /** Opens on the name it already has, so a small correction stays small. */
  function openRename(folder: Folder) {
    setRenaming(folder);
    setRenamed(folder.name);
    renameFolder.reset();
  }

  /** Opens clean: a name abandoned last time is not an answer to this time. */
  function openCreate(open: boolean) {
    setCreating(open);
    if (open) {
      setName('');
      createFolder.reset();
    }
  }

  const looseAlarms = loose.data?.items ?? [];
  const found = results.data?.items ?? [];

  return (
    <main className="page" data-testid="folders-page">
      <header className="page-header">
        <h1 className="page-title">Alarm groups</h1>
        {/*
          Straight to a new alarm without picking a group first. Deciding where
          something belongs before deciding what it is gets the order backwards
          for anything made in the moment.
        */}
        <span className="page-header-actions">
          <button
            type="button"
            className="button"
            onClick={() => openCreate(true)}
            data-testid="folder-create-open-button"
          >
            New group
          </button>
          <Link
            className="button button-primary"
            to="/folders/unfiled/alarms/new"
            data-testid="alarm-create-unfiled-link"
          >
            New alarm
          </Link>
        </span>
      </header>

      <form
        className="card form"
        role="search"
        onSubmit={(event) => event.preventDefault()}
        data-testid="alarm-search-form"
      >
        <div className="field">
          <label htmlFor="alarm-search">Search alarms</label>
          <input
            id="alarm-search"
            type="search"
            value={search}
            placeholder="Any alarm, in a group or not"
            onChange={(event) => setSearch(event.target.value)}
            data-testid="alarm-search-input"
          />
        </div>
      </form>

      {searching ? (
        <section
          className="card"
          aria-busy={results.isLoading}
          aria-labelledby="search-results-heading"
          data-testid="alarm-search-results"
        >
          <h2 id="search-results-heading" className="card-title">
            {results.isLoading
              ? 'Searching…'
              : `${found.length} alarm${found.length === 1 ? '' : 's'} matching “${debouncedSearch.trim()}”`}
          </h2>

          {found.length > 0 ? (
            <ul className="folder-list">
              {found.map((alarm) => (
                <li key={alarm.id} className="folder-row" data-testid="search-result-row">
                  <Link
                    className="folder-link"
                    to={`/alarms/${alarm.id}/edit`}
                    data-testid="search-result-link"
                  >
                    {alarm.name}
                  </Link>
                  <span className="folder-counts">
                    {scheduleLine(alarm)} ·{' '}
                    {alarm.folderId ? (groupNameById.get(alarm.folderId) ?? 'A group') : 'No group'}
                  </span>
                </li>
              ))}
            </ul>
          ) : results.isLoading ? null : (
            <p className="empty-state" data-testid="alarm-search-empty">
              Nothing matches that.
            </p>
          )}
        </section>
      ) : (
        <>
          {looseAlarms.length > 0 ? (
            <section
              className="card"
              aria-labelledby="loose-alarms-heading"
              data-testid="loose-alarm-list-container"
            >
              <h2 id="loose-alarms-heading" className="card-title">
                Not in a group
              </h2>
              <ul className="folder-list" data-testid="loose-alarm-list">
                {looseAlarms.map((alarm) => (
                  <li
                    key={alarm.id}
                    className="folder-row"
                    data-testid="loose-alarm-row"
                    data-alarm-id={alarm.id}
                  >
                    <Link
                      className="folder-link"
                      to={`/alarms/${alarm.id}/edit`}
                      data-testid="loose-alarm-link"
                    >
                      {alarm.name}
                    </Link>
                    <span className="folder-counts" data-testid="loose-alarm-schedule">
                      {scheduleLine(alarm)}
                      {alarm.enabled ? '' : ' · disabled'}
                      {alarm.selfDestruct ? ' · self-destructs' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            className="card"
            aria-busy={folders.isLoading}
            aria-labelledby="folder-list-heading"
            data-testid="folder-list-container"
          >
            <h2 id="folder-list-heading" className="card-title">
              Your groups
            </h2>

            {folders.isLoading ? (
              <ul className="skeleton-list" data-testid="folder-list-skeleton">
                {[0, 1, 2].map((row) => (
                  <li key={row} className="skeleton-row" />
                ))}
              </ul>
            ) : folders.data && folders.data.items.length > 0 ? (
              <ul className="folder-list" data-testid="folder-list">
                {folders.data.items.map((folder) => (
                  <li
                    key={folder.id}
                    className="folder-row"
                    data-testid="folder-row"
                    data-folder-id={folder.id}
                  >
                    <Link
                      className="folder-link"
                      to={`/folders/${folder.id}`}
                      data-testid="folder-link"
                    >
                      {folder.name}
                    </Link>
                    <span className="folder-counts" data-testid="folder-counts">
                      {folder.alarmCount} alarm{folder.alarmCount === 1 ? '' : 's'},{' '}
                      {folder.enabledCount} enabled
                    </span>
                    <button
                      type="button"
                      className="button"
                      onClick={() => openRename(folder)}
                      aria-label={`Rename group ${folder.name}`}
                      data-testid="folder-rename-button"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => setPendingDelete(folder)}
                      aria-label={`Delete group ${folder.name}`}
                      data-testid="folder-delete-button"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state" data-testid="folder-list-empty">
                No groups yet. Alarms work without one — make a group when you have
                enough to sort.
              </p>
            )}
          </section>
        </>
      )}

      <NameDialog
        open={renaming !== undefined}
        onOpenChange={(open) => {
          if (!open) setRenaming(undefined);
        }}
        title="Rename group"
        label="Group name"
        value={renamed}
        onValueChange={setRenamed}
        onSubmit={() => {
          if (renaming) renameFolder.mutate({ id: renaming.id, name: renamed });
        }}
        submitLabel="Save name"
        busy={renameFolder.isPending}
        error={renameNameError}
        testId="folder-rename-dialog"
      />

      <NameDialog
        open={creating}
        onOpenChange={openCreate}
        title="New group"
        description="A group is a set of alarms you start together — a workout, a wind-down, a work block."
        label="Group name"
        value={name}
        onValueChange={setName}
        onSubmit={() => createFolder.mutate(name)}
        submitLabel="Create group"
        busy={createFolder.isPending}
        error={nameError}
        testId="folder-create-dialog"
      />

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(undefined);
        }}
        title="Delete group"
        description={
          pendingDelete
            ? `Deleting "${pendingDelete.name}" also deletes its ${pendingDelete.alarmCount} alarm${
                pendingDelete.alarmCount === 1 ? '' : 's'
              }. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete group"
        busy={deleteFolder.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteFolder.mutate(pendingDelete);
        }}
        testId="folder-delete-dialog"
      />
    </main>
  );
}
