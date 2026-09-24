import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from './api/client';
import type { Session } from './api/types';
import { AlarmsPage } from './routes/AlarmsPage';
import { FoldersPage } from './routes/FoldersPage';
import { LoginPage } from './routes/LoginPage';
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
      <span className="topbar-brand">Alarm Configurator</span>
      <div className="topbar-user">
        <span data-testid="topbar-user-name">{session.user.name}</span>
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
      <div className="page page-narrow" aria-busy="true" data-testid="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (!session.data) {
    return location.pathname === '/login' ? <LoginPage /> : <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <TopBar session={session.data} />
      <Routes>
        <Route path="/" element={<Navigate to="/folders" replace />} />
        <Route path="/login" element={<Navigate to="/folders" replace />} />
        <Route path="/folders" element={<FoldersPage />} />
        <Route path="/folders/:folderId" element={<AlarmsPage />} />
        <Route path="/folders/:folderId/alarms/new" element={<WizardPage mode="create" />} />
        <Route path="/alarms/:alarmId/edit" element={<WizardPage mode="edit" />} />
        <Route path="*" element={<Navigate to="/folders" replace />} />
      </Routes>
    </div>
  );
}
