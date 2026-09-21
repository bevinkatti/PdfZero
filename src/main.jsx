import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/globals.css'
import { usePdfStore } from './store/pdfStore.js'

// Restore PDF bytes from sessionStorage if a viewport resize wiped in-memory state
usePdfStore.getState().initFromSession()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
