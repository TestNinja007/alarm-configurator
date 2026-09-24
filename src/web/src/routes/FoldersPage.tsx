import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { Folder } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toaster';

export function FoldersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Folder | undefined>();

  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => api.get<{ items: Folder[] }>('/folders'),
  });

  const createFolder = useMutation({
    mutationFn: (folderName: string) => api.post<Folder>('/folders', { name: folderName }),
    onSuccess: async (folder) => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.push('success', `Folder "${folder.name}" created.`);
    },
  });

  const deleteFolder = useMutation({
    // R-10: the confirmation flag is part of the request, not a UI-only concept.
    mutationFn: (folder: Folder) => api.delete<void>(`/folders/${folder.id}?confirm=true`),
    onSuccess: async (_result, folder) => {
      setPendingDelete(undefined);
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.push('success', `Folder "${folder.name}" deleted.`);
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : 'Could not delete folder.');
    },
  });

  const createError = createFolder.error instanceof ApiError ? createFolder.error : undefined;
  const nameError = createError?.fieldError('name') ?? createError?.message;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createFolder.mutate(name);
  }

  return (
    <main className="page" data-testid="folders-page">
      <header className="page-header">
        <h1 className="page-title">Folders</h1>
      </header>

      <form className="card form form-inline" onSubmit={onSubmit} noValidate data-testid="folder-create-form">
        <div className="field">
          <label htmlFor="folder-name">New folder name</label>
          <input
            id="folder-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'folder-name-error' : undefined}
            data-testid="folder-name-input"
          />
          {nameError ? (
            <p id="folder-name-error" className="field-error" data-testid="folder-name-error">
              {nameError}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          className="button button-primary"
          disabled={createFolder.isPending || name.trim().length === 0}
          data-testid="folder-create-button"
        >
          Create folder
        </button>
      </form>

      <section
        className="card"
        aria-busy={folders.isLoading}
        aria-labelledby="folder-list-heading"
        data-testid="folder-list-container"
      >
        <h2 id="folder-list-heading" className="card-title">
          Your folders
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
              <li key={folder.id} className="folder-row" data-testid="folder-row" data-folder-id={folder.id}>
                <Link className="folder-link" to={`/folders/${folder.id}`} data-testid="folder-link">
                  {folder.name}
                </Link>
                <span className="folder-counts" data-testid="folder-counts">
                  {folder.alarmCount} alarm{folder.alarmCount === 1 ? '' : 's'},{' '}
                  {folder.enabledCount} enabled
                </span>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => setPendingDelete(folder)}
                  aria-label={`Delete folder ${folder.name}`}
                  data-testid="folder-delete-button"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state" data-testid="folder-list-empty">
            No folders yet. Create one to start adding alarms.
          </p>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(undefined);
        }}
        title="Delete folder"
        description={
          pendingDelete
            ? `Deleting "${pendingDelete.name}" also deletes its ${pendingDelete.alarmCount} alarm${
                pendingDelete.alarmCount === 1 ? '' : 's'
              }. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete folder"
        busy={deleteFolder.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteFolder.mutate(pendingDelete);
        }}
        testId="folder-delete-dialog"
      />
    </main>
  );
}
