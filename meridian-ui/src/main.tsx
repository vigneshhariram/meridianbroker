import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingState, TooltipProvider } from './components/ui'
import { Toaster } from 'sonner'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <TooltipProvider>
          <Suspense
            fallback={
              <main className="session-loading">
                <LoadingState label="Opening your workspace…" />
              </main>
            }
          >
            <App />
          </Suspense>
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{
              unstyled: true,
              classNames: {
                toast: 'app-toast',
                title: 'app-toast-title',
                description: 'app-toast-description',
                closeButton: 'app-toast-close',
              },
            }}
          />
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
)
