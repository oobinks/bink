import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import BookingForm from './pages/BookingForm.jsx';
import QuotePage from './pages/QuotePage.jsx';
import InvoicePage from './pages/InvoicePage.jsx';
import PressPage from './pages/PressPage.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public pages: no login needed. */}
        <Route path="/book" element={<BookingForm />} />
        <Route path="/q/:token" element={<QuotePage />} />
        <Route path="/i/:token" element={<InvoicePage />} />
        <Route path="/epk" element={<PressPage />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
