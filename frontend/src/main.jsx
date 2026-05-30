import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n'
import { ConnectionProvider } from './context/ConnectionContext.jsx'
import { SyncProvider } from './context/SyncContext.jsx'


ReactDOM.createRoot(document.getElementById('root')).render(
  <ConnectionProvider>
    <SyncProvider>
      <App />
    </SyncProvider>
  </ConnectionProvider>
)
