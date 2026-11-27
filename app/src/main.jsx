import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import App from './App.jsx'
import { CLERK_PUBLISHABLE_KEY } from './lib/supabase'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{ variables: { colorPrimary: '#3B4BD8', fontFamily: 'Inter, system-ui, sans-serif', borderRadius: '8px' } }}
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>
)
