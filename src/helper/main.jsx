import React from 'react'
import ReactDOM from 'react-dom/client'
import RootBoundary from '../components/RootBoundary'
import { UserProvider } from '../contexts/UserContext'
import HelperApp from './HelperApp'
import '../index.css'

// EN Helper's own entry point. Only what it needs: the signed-in user and the
// recorder. None of the main app's tabs, boards or chat load here.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootBoundary>
      <UserProvider>
        <HelperApp />
      </UserProvider>
    </RootBoundary>
  </React.StrictMode>,
)
