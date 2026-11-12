import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { ThemeProvider } from './lib/theme.tsx'
import { SpeedInsightsTracker } from './components/SpeedInsightsTracker.tsx'
import { DialogHost } from './lib/dialog.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'
import './lib/sound.ts'
import './lib/consoleWarning.ts'
import { startInstallListener } from './lib/install.ts'
import { startIdleWatch } from './lib/idle.ts'

startInstallListener()
startIdleWatch()

// A tab opened before a release asks for page files that deploy replaced. Reload once to pick up
// the new ones; the timestamp stops a loop if the file is missing for another reason.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'chunk-reload-at'
  let last = 0
  try { last = Number(sessionStorage.getItem(key)) || 0 } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return
  try { sessionStorage.setItem(key, String(Date.now())) } catch { /* storage blocked */ }
  event.preventDefault()
  window.location.reload()
})

// Data fetched in the last 30 seconds is used as is: switching back to the tab (or between pages)
// doesn't refetch everything on screen at once. Polls and live events still refresh it sooner.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
          <SpeedInsightsTracker />
        </BrowserRouter>
        <DialogHost />
        <UpdateBanner />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
