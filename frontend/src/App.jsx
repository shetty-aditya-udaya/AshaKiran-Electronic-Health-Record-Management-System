import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { clearAllLocalData } from './lib/db';

// Core Pages
import Dashboard from './pages/Dashboard';
import PatientList from './pages/PatientList';
import AddPatient from './pages/AddPatient';
import Reminders from './pages/Reminders';
import Login from './pages/Login';
import Signup from './pages/Signup';
import LandingPage from './pages/LandingPage';
import Programmes from './pages/Programmes';
import Clinics from './pages/Clinics';
import Doctors from './pages/Doctors';
import AboutUs from './pages/AboutUs';
import Stories from './pages/Stories';
import Reports from './pages/Reports';
import PatientReportFolder from './pages/PatientReportFolder';
import CompleteVisit from './pages/CompleteVisit';
import Profile from './pages/Profile';
import ContactUs from './pages/ContactUs';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ErrorBoundary from './components/ErrorBoundary';
import Diagnostics from './pages/Diagnostics';

// Programme Modules
import MaternalHealth from './pages/modules/MaternalHealth';
import Vaccination from './pages/modules/Vaccination';
import DiseaseTracking from './pages/modules/DiseaseTracking';
import NCDMonitoring from './pages/modules/NCDMonitoring';

// Components
import BottomNav from './components/BottomNav';
import { useTranslation } from 'react-i18next';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'mr', name: 'मराठी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' }
];

import Navbar from './components/Navbar';
import AddVisitModal from './components/AddVisitModal';
import { useConnection } from './context/ConnectionContext';

export default function App() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const { isServerReachable } = useConnection();
  
  // Global Modal States
  const [isAddVisitOpen, setIsAddVisitOpen] = useState(false);
  const [addVisitPatientId, setAddVisitPatientId] = useState(null);

  const handleLangChange = (e) => {
    const next = e.target.value;
    i18n.changeLanguage(next);
  };


  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    // Tell SyncContext to start the sync engine in this tab
    window.dispatchEvent(new CustomEvent('user-logged-in'));
  };

  const handleLogout = async () => {
    // CRITICAL: Clear IndexedDB FIRST to prevent data leakage to the next user
    // on the same device. clearAllLocalData() wipes all Dexie stores.
    try {
      await clearAllLocalData();
    } catch (err) {
      console.error('[App] Failed to clear local DB on logout:', err);
    }

    // Preserve language preferences but fully clear all other cached data/session state
    const currentLang = localStorage.getItem('lang') || 'en';
    localStorage.clear();
    sessionStorage.clear();
    
    // Safely restore user language preferences
    if (currentLang) {
      localStorage.setItem('lang', currentLang);
    }
    
    setUser(null);
    
    // Tell SyncContext to stop the sync engine and clear state
    window.dispatchEvent(new CustomEvent('user-logged-out'));
  };

  // Auto-logout on session expiry (silent refresh failed — token truly expired on server)
  // IMPORTANT: We ONLY logout if the server was actually reachable (online).
  // If the device is offline and the refresh couldn't reach the server, we
  // keep the session alive so ASHA workers can continue working without internet.
  useEffect(() => {
    const onSessionExpired = () => {
      // Guard: if the server was unreachable, this is NOT a genuine expiry, just a connectivity loss. Keep session.
      if (!isServerReachable) {
        console.warn('[App] session-expired fired while offline — ignoring (session preserved)');
        return;
      }
      if (localStorage.getItem('token')) {
        console.warn('[App] Session expired (server confirmed) — logging out automatically');
        handleLogout();
      }
    };
    window.addEventListener('session-expired', onSessionExpired);
    return () => window.removeEventListener('session-expired', onSessionExpired);
  }, [isServerReachable]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProfileUpdate = (updated) => {
    if (!updated) { handleLogout(); return; }
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  };

  const handleOpenAddVisit = (patientId) => {
    setAddVisitPatientId(patientId);
    setIsAddVisitOpen(true);
  };

  const handleCloseAddVisit = () => {
    setIsAddVisitOpen(false);
    setAddVisitPatientId(null);
  };

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent
          lang={lang}
          user={user}
          t={t}
          handleLangChange={handleLangChange}
          handleLogin={handleLogin}
          handleLogout={handleLogout}
          handleProfileUpdate={handleProfileUpdate}
          handleOpenAddVisit={handleOpenAddVisit}
          handleCloseAddVisit={handleCloseAddVisit}
          isAddVisitOpen={isAddVisitOpen}
          addVisitPatientId={addVisitPatientId}
        />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function AppContent({
  lang,
  user,
  t,
  handleLangChange,
  handleLogin,
  handleLogout,
  handleProfileUpdate,
  handleOpenAddVisit,
  handleCloseAddVisit,
  isAddVisitOpen,
  addVisitPatientId
}) {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

  return (
    <div className={`lang-${lang} ${isAuthPage ? 'pb-0' : 'pb-[calc(6rem+env(safe-area-inset-bottom))]'} min-h-[100dvh] bg-slate-50 relative transition-all duration-300`}>
      <Toaster position="top-center" reverseOrder={false} />
      
      {!isAuthPage && (
        <Navbar 
          user={user} 
          handleLogout={handleLogout}
          avatar={user?.avatar || null}
        />
      )}

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage t={t} />} />
        <Route path="/programmes" element={<Programmes t={t} />} />
        <Route path="/clinics" element={<Clinics t={t} />} />
        <Route path="/doctors" element={<Doctors t={t} />} />
        <Route path="/about" element={<AboutUs t={t} />} />
        <Route path="/stories" element={<Stories t={t} />} />
        <Route path="/signup" element={<Signup t={t} />} />
        <Route path="/login" element={<Login onLogin={handleLogin} t={t} />} />
        <Route path="/contact" element={<ContactUs t={t} />} />
        <Route path="/privacy" element={<PrivacyPolicy t={t} />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={user ? <Dashboard t={t} /> : <Navigate to="/login" />} />
        <Route path="/programmes/maternal" element={user ? <MaternalHealth t={t} /> : <Navigate to="/login" />} />
        <Route path="/programmes/vaccination" element={user ? <Vaccination t={t} /> : <Navigate to="/login" />} />
        <Route path="/programmes/disease" element={user ? <DiseaseTracking t={t} /> : <Navigate to="/login" />} />
        <Route path="/programmes/ncd" element={user ? <NCDMonitoring t={t} /> : <Navigate to="/login" />} />
        <Route path="/patients" element={user ? <PatientList onOpenAddVisit={handleOpenAddVisit} /> : <Navigate to="/login" />} />
        <Route path="/reminders" element={user ? <Reminders t={t} /> : <Navigate to="/login" />} />
        <Route path="/visits/:id/complete" element={user ? <CompleteVisit t={t} /> : <Navigate to="/login" />} />
        <Route path="/reports" element={user ? <Reports t={t} /> : <Navigate to="/login" />} />
        <Route path="/reports/:id" element={user ? <PatientReportFolder t={t} /> : <Navigate to="/login" />} />
        <Route path="/profile" element={user ? <Profile onProfileUpdate={handleProfileUpdate} /> : <Navigate to="/login" />} />
        <Route path="/diagnostics" element={user ? <Diagnostics /> : <Navigate to="/login" />} />
        
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/"} />} />
      </Routes>

      {!isAuthPage && <BottomNav handleLogout={handleLogout} />}

      <AddVisitModal
        isOpen={isAddVisitOpen}
        onClose={handleCloseAddVisit}
        patientId={addVisitPatientId}
        onSuccess={() => {
          handleCloseAddVisit();
          // Note: If we need to refresh data, we might need a custom event or shared state
          window.dispatchEvent(new CustomEvent('visit-added'));
        }}
      />
    </div>
  );
}

