import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { AdminUser, AdminUserList, Role, Tier } from '../api/types';
import { useToast } from '../components/Toaster';

const TIER_ORDER: Tier[] = ['basic', 'regular', 'advanced'];

/**
 * Administering accounts: role, tier and suspension.
 *
 * Reachable only by an administrator, and the route is simply absent for
 * anyone else — the server answers 404 rather than 403, so there is nothing
 * here that hints the page exists.
 */
export function AdminPage({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUserList>('/admin/users'),
  });

  const update = useMutation({
    mutationFn: (change: { id: string; role?: Role; tier?: Tier; suspended?: boolean }) => {
      const { id, ...body } = change;
      return api.patch<AdminUser>(`/admin/users/${id}`, body);
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.push('success', `${user.email} updated.`);
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : 'Could not update account.');
    },
  });

  const rows = users.data?.items ?? [];

  return (
    <main className="page" data-testid="admin-page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/folders" data-testid="folders-back-link">
          Folders
        </Link>
        <span aria-hidden="true"> / </span>
        <span>Accounts</span>
      </nav>

      <header className="page-header">
        <h1 className="page-title">Accounts</h1>
      </header>

      <section
        className="card"
        aria-busy={users.isLoading}
        aria-labelledby="admin-users-heading"
        data-testid="admin-users-container"
      >
        <h2 id="admin-users-heading" className="card-title">
          Everyone{' '}
          <span className="count-badge" data-testid="admin-user-count">
            {rows.length}
          </span>
        </h2>

        {users.isLoading ? (
          <div className="skeleton-list" data-testid="admin-users-skeleton">
            {[0, 1, 2].map((row) => (
              <div key={row} className="skeleton-row" />
            ))}
          </div>
        ) : (
          <table className="table" data-testid="admin-users-table">
            <caption className="visually-hidden">All accounts</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Name</th>
                <th scope="col">Tier</th>
                <th scope="col">Role</th>
                <th scope="col">Usage</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} data-testid="admin-user-row" data-user-id={user.id}>
                    <th scope="row" data-testid="admin-user-email">
                      {user.email}
                      {isSelf ? <span className="rule-window">you</span> : null}
                    </th>
                    <td data-testid="admin-user-name">{user.name}</td>
                    <td>
                      <select
                        value={user.tier}
                        onChange={(event) =>
                          update.mutate({ id: user.id, tier: event.target.value as Tier })
                        }
                        aria-label={`Tier for ${user.email}`}
                        data-testid="admin-user-tier-select"
                      >
                        {TIER_ORDER.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={user.role}
                        // Demoting yourself would lock you out of this page with
                        // no way back, so the server refuses it and so does this.
                        disabled={isSelf}
                        onChange={(event) =>
                          update.mutate({ id: user.id, role: event.target.value as Role })
                        }
                        aria-label={`Role for ${user.email}`}
                        data-testid="admin-user-role-select"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td data-testid="admin-user-usage">
                      {user.folders} folders, {user.alarms} alarms
                    </td>
                    <td>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!user.suspended}
                        className={`toggle ${user.suspended ? 'toggle-off' : 'toggle-on'}`}
                        disabled={isSelf}
                        onClick={() =>
                          update.mutate({ id: user.id, suspended: !user.suspended })
                        }
                        aria-label={
                          user.suspended ? `Restore ${user.email}` : `Suspend ${user.email}`
                        }
                        data-testid="admin-user-suspend-toggle"
                      >
                        {user.suspended ? 'Suspended' : 'Active'}
                      </button>
                      {!user.verified ? (
                        <span className="rule-window" data-testid="admin-user-unverified">
                          unconfirmed
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" aria-labelledby="admin-tiers-heading" data-testid="admin-tiers-container">
        <h2 id="admin-tiers-heading" className="card-title">
          What each tier allows
        </h2>
        {/* Published by the API rather than written here, so the two cannot drift. */}
        <table className="table" data-testid="admin-tiers-table">
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col">Folders</th>
              <th scope="col">Alarms per folder</th>
              <th scope="col">Repeat in a day</th>
              <th scope="col">Shortest interval</th>
              <th scope="col">Generated speech</th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER.map((tier) => {
              const limits = users.data?.tiers[tier];
              if (!limits) return null;
              return (
                <tr key={tier} data-testid="admin-tier-row" data-tier={tier}>
                  <th scope="row">{tier}</th>
                  <td>{limits.maxFolders ?? 'unlimited'}</td>
                  <td>{limits.maxAlarmsPerFolder ?? 'unlimited'}</td>
                  <td>{limits.repeatWithinDay ? 'yes' : 'no'}</td>
                  <td>
                    {limits.minRepeatSeconds === null
                      ? '—'
                      : limits.minRepeatSeconds >= 60
                        ? `${limits.minRepeatSeconds / 60} min`
                        : `${limits.minRepeatSeconds} sec`}
                  </td>
                  <td>{limits.generatedSpeech ? 'yes' : 'no'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
