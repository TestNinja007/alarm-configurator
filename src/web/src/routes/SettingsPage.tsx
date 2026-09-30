import { Link } from 'react-router-dom';
import type { User } from '../api/types';
import { ChangePassword } from '../components/ChangePassword';
import { DeleteAccount } from '../components/DeleteAccount';
import { NotificationSettings } from '../components/NotificationSettings';
import { ProfileSettings } from '../components/ProfileSettings';

/**
 * Everything about the account rather than about alarms, in one place: name,
 * password, notifications, and deleting the account. Ordered least to most
 * destructive, so the irreversible one is last and on its own.
 */
export function SettingsPage({ user }: { user: User }) {
  return (
    <main className="page" data-testid="settings-page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/folders" data-testid="folders-back-link">
          Folders
        </Link>
        <span aria-hidden="true"> / </span>
        <span>Settings</span>
      </nav>

      <header className="page-header">
        <h1 className="page-title">Settings</h1>
      </header>

      <ProfileSettings user={user} />
      <ChangePassword />
      <NotificationSettings />
      <DeleteAccount />
    </main>
  );
}
