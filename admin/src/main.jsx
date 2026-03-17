import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

// Initialize Sentry
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
})

const SentryApp = Sentry.withProfiler(App)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SentryApp />
      <Toaster position="top-right" />
    </BrowserRouter>
  </StrictMode>,
)
