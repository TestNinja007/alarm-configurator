import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ToasterProvider } from './components/Toaster';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tests drive this app directly; refetching because a window regained
      // focus would make list contents depend on where the mouse went.
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 0,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToasterProvider>
          <App />
        </ToasterProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
