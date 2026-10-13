import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { ThemeProvider } from './lib/theme.tsx'
import { SeasonProvider } from './lib/season.tsx'
import { SpeedInsightsTracker } from './components/SpeedInsightsTracker.tsx'
import { DialogHost } from './lib/dialog.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'
import './lib/sound.ts'
import './lib/consoleWarning.ts'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SeasonProvider>
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
      </SeasonProvider>
    </ThemeProvider>
  </StrictMode>,
)
