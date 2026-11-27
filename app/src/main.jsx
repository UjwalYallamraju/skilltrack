import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { HashRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { CLERK_PUBLISHABLE_KEY } from './lib/supabase'
import { queryClient } from './lib/queries'
import { FeedbackProvider } from './components/ui'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{ variables: { colorPrimary: '#3B4BD8', fontFamily: 'Inter, system-ui, sans-serif', borderRadius: '8px' } }}
    >
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </HashRouter>
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
)
