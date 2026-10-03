import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from './api/client';
import type { Session } from './api/types';
import { DemoBanner } from './components/DemoBanner';
import { Logo } from './components/Logo';
import { NotificationProvider } from './components/NotificationProvider';
import { AdminPage } from './routes/AdminPage';
import { AlarmsPage } from './routes/AlarmsPage';
import { FoldersPage } from './routes/FoldersPage';
import { LandingPage } from './routes/LandingPage';
import { LoginPage } from './routes/LoginPage';
import { SettingsPage } from './routes/SettingsPage';
import { ForgotPasswordPage } from './routes/ForgotPasswordPage';
import { RegisterPage } from './routes/RegisterPage';
import { ResetPasswordPage } from './routes/ResetPasswordPage';
import { VerifyPage } from './routes/VerifyPage';
import { WizardPage } from './routes/WizardPage';

function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<Session>('/auth/me'),
    retry: (failureCount, error) =>
      // A signed-out visitor is an expected answer, not a failure to retry.
      error instanceof ApiError && error.status === 401 ? false : failureCount < 2,
  });
}

function TopBar({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      void navigate('/login');
    },
  });

  return (
    <header className="topbar" data-testid="app-topbar">
      <span className="topbar-brand">
        <Logo size={22} />
        Nudge
      </span>
      <div className="topbar-user">
        <span data-testid="topbar-user-name">{session.user.name}</span>
        {session.user.role === 'admin' ? (
          <Link className="button" to="/admin" data-testid="admin-link">
            Accounts
          </Link>
        ) : null}
        <Link className="button" to="/settings" data-testid="settings-link">
          Settings
        </Link>
        <button
          type="button"
          className="button"
          onClick={() => logout.mutate()}
          data-testid="logout-button"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export function App() {
  const session = useSession();
  const location = useLocation();

  if (session.isLoading) {
    return (
      <div className="page app-splash" aria-busy="true" data-testid="app-loading">
        <div className="auth-lockup">
          <Logo size={44} />
          <p className="auth-wordmark">Nudge</p>
        </div>
        <p className="auth-tagline">Loading…</p>
      </div>
    );
  }

  if (!session.data) {
    // The front door. Everything else a signed-out visitor can reach is a
    // form, so this is the only page here that explains what the product is.
    if (location.pathname === '/') {
      return (
        <>
          <DemoBanner />
          <LandingPage />
        </>
      );
    }

    if (location.pathname === '/register') {
      return (
        <>
          <DemoBanner />
          <RegisterPage />
        </>
      );
    }

    if (location.pathname === '/forgot-password') {
      return (
        <>
          <DemoBanner />
          <ForgotPasswordPage />
        </>
      );
    }

    if (location.pathname === '/reset-password') {
      return (
        <>
          <DemoBanner />
          <ResetPasswordPage />
        </>
      );
    }

    if (location.pathname === '/verify') {
      return (
        <>
          <DemoBanner />
          <VerifyPage />
        </>
      );
    }

    return location.pathname === '/login' ? (
      <>
        <DemoBanner />
        <LoginPage />
      </>
    ) : (
      <Navigate to="/login" replace />
    );
  }

  return (
    <NotificationProvider>
      <div className="app-shell">
        <DemoBanner />
        <TopBar session={session.data} />
          <Routes>
          <Route path="/" element={<Navigate to="/folders" replace />} />
          <Route path="/login" element={<Navigate to="/folders" replace />} />
          <Route path="/register" element={<Navigate to="/folders" replace />} />
          <Route path="/verify" element={<Navigate to="/folders" replace />} />
          <Route path="/forgot-password" element={<Navigate to="/folders" replace />} />
          <Route path="/reset-password" element={<Navigate to="/folders" replace />} />
          <Route path="/folders" element={<FoldersPage />} />
          <Route path="/settings" element={<SettingsPage user={session.data.user} />} />
          {/* Only mounted for an administrator; the API answers 404 regardless. */}
          {session.data.user.role === 'admin' ? (
            <Route path="/admin" element={<AdminPage currentUserId={session.data.user.id} />} />
          ) : null}
          <Route path="/folders/:folderId" element={<AlarmsPage />} />
          <Route path="/folders/:folderId/alarms/new" element={<WizardPage mode="create" />} />
          <Route path="/alarms/:alarmId/edit" element={<WizardPage mode="edit" />} />
          <Route path="*" element={<Navigate to="/folders" replace />} />
        </Routes>
      </div>
    </NotificationProvider>
  );
}
