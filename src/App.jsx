import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Analytics } from '@vercel/analytics/react'
import Landing from './pages/Landing.jsx'
import Editor from './pages/Editor.jsx'
import Tools from './pages/Tools.jsx'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/:toolId" element={<Tools />} />
      </Routes>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1e1e22',
            color: '#f0f0f4',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            borderRadius: '8px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#1e1e22' } },
          error:   { iconTheme: { primary: '#e84545', secondary: '#1e1e22' } },
        }}
      />
      <Analytics />
    </>
  )
}
