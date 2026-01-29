import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import PDFPreviewPage from './PDFPreviewPage.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/pdf-preview/:taskId" element={<PDFPreviewPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)