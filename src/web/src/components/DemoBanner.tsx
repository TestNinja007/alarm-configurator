import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface Health {
  status: string;
  version: string;
  demoMode: boolean;
  testSupport: boolean;
}

/**
 * Shown only when the server reports DEMO_MODE=1, which the public deployment
 * sets and a local instance does not. Keeping it server-driven means a test
 * framework running locally never has to account for it.
 */
export function DemoBanner() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<Health>('/health'),
    // The deployment does not change underneath a session.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  if (!health.data?.demoMode) return null;

  return (
    <div className="demo-banner" role="note" data-testid="demo-banner">
      <strong>Public sandbox.</strong> This is a demonstration instance. The
      sign-in details are published in the repository, anyone can use them, and
      everything stored here is visible to everybody. Please do not enter real
      or personal information — the data is reset without warning.
    </div>
  );
}
