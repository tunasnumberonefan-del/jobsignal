import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as RT from '@radix-ui/react-tooltip';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { ApiError } from './lib/api';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache(),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <RT.Provider>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: '!bg-raised !text-ink !border-line !shadow-paper !font-sans !rounded-[8px]',
              actionButtonStyle: { background: 'var(--accent)', color: 'var(--accent-ink)' },
            }}
          />
        </RT.Provider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
