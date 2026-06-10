/**
 * Navbar – AshaKiran v3.1
 *
 * Changes from v3.0
 * ─────────────────
 * • Profile pill: full name (no max-w truncation), truncates gracefully only
 *   when > 24 chars via CSS text-overflow on a constrained container.
 * • Role subtitle: conditionally shown — only when user.role is a non-empty,
 *   non-default string. "asha" default is humanised; unset → "Complete profile".
 * • Avatar wrapped in <ProfileRing> with animated completion arc.
 * • Dropdown: shows completion % + progress bar so workers know what's missing.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Globe, ChevronDown, LogOut, User, X, Menu, CheckCircle2, Activity } from 'lucide-react';
import ProfileRing from './ProfileRing';
import BrandLogo from './BrandLogo';
import { useProfileCompletion } from '../hooks/useProfileCompletion';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

// ── helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return 'A';
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

/** Humanises the raw role value from the DB */
function humanRole(role, t) {
  if (!role || role === 'asha') return null;           // treat bare 'asha' as unset
  const map = {
    'asha_worker': t('role.asha_worker', 'ASHA Worker'),
    'nurse':       t('role.nurse', 'Nurse'),
    'doctor':      t('role.doctor', 'Doctor'),
    'supervisor':  t('role.supervisor', 'Supervisor'),
    'admin':       t('role.admin', 'Admin'),
  };
  return map[role.toLowerCase()] || role;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Navbar({ user, handleLogout, avatar }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate    = useNavigate();
  const location    = useLocation();

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const { pct, label, ringColor, textColor } = useProfileCompletion();
  const roleLabel  = humanRole(user?.role, t);
  const displayName = user?.name || t('role.asha_worker', 'ASHA Worker');

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const navLinks = [
    { name: t('home'),       path: '/' },
    { name: t('programmes'), path: '/programmes' },
    { name: t('clinics'),    path: '/clinics' },
    { name: t('doctors'),    path: '/doctors' },
    { name: t('aboutUs'),    path: '/about' },
    { name: t('contactUs'),  path: '/contact' },
  ];

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <header
      className="sticky top-0 w-full z-50 transition-all duration-300 ease-in-out"
      style={{
        background: scrolled ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: scrolled ? 'blur(14px)' : 'blur(10px)',
        WebkitBackdropFilter: scrolled ? 'blur(14px)' : 'blur(10px)',
        borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
        boxShadow: scrolled ? '0 6px 24px rgba(15, 23, 42, 0.06)' : 'none',
      }}
    >
      <nav className="max-w-5xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between gap-4">

        {/* ── Logo ── */}
        <Link
          to="/"
          className="flex-shrink-0 select-none"
        >
          <BrandLogo size="sm" showTagline={true} className="!px-0 !py-0" />
        </Link>

        {/* ── Desktop nav links ── */}
        <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
          {navLinks.map(link => {
            const active = isActive(link.path);
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`relative px-3.5 py-1.5 text-sm rounded-lg transition-colors select-none ${
                  active
                    ? 'font-semibold text-[#0F766E] bg-[#F0F7F7]'
                    : 'font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {link.name}
                {active && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#0F766E]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Right cluster ── */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Language picker */}
          <LanguageSwitcher />

          {/* ── Authenticated: profile pill ── */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full border border-[#E8ECF0] bg-white hover:bg-slate-50 transition-colors"
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
              >
                {/* Avatar with completion ring */}
                <ProfileRing size={32} pct={pct} ringColor={ringColor} strokeWidth={2.5}>
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#E6F2F2] text-[#0F766E] flex items-center justify-center text-xs font-bold select-none">
                      {initials(displayName)}
                    </div>
                  )}
                </ProfileRing>

                {/* Name + role (desktop) */}
                <div className="hidden lg:flex flex-col items-start leading-tight min-w-0 max-w-[160px]">
                  <span
                    className="text-sm font-semibold text-slate-800 truncate w-full"
                    title={displayName}
                  >
                    {displayName}
                  </span>
                  {roleLabel ? (
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate w-full">
                      {roleLabel}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-[#B45309] truncate w-full">
                      {t('completeProfile')}
                    </span>
                  )}
                </div>

                <ChevronDown
                  size={13}
                  className={`hidden lg:block text-slate-400 flex-shrink-0 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* ── Profile dropdown ── */}
              {profileOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl overflow-hidden py-2 z-50"
                  style={{ border: '1px solid #E8ECF0', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                >
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-slate-50">
                    {/* Completion ring + name */}
                    <div className="flex items-center gap-3 mb-2.5">
                      <ProfileRing size={40} pct={pct} ringColor={ringColor} strokeWidth={3}>
                        {avatar ? (
                          <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#E6F2F2] text-[#0F766E] flex items-center justify-center text-sm font-bold select-none">
                            {initials(displayName)}
                          </div>
                        )}
                      </ProfileRing>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                        {roleLabel ? (
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{roleLabel}</p>
                        ) : (
                          <p className="text-[10px] font-semibold animate-pulse" style={{ color: textColor }}>{t('completeProfileLink', 'Complete profile →')}</p>
                        )}
                      </div>
                    </div>

                    {/* Completion bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-500">{t('profileCompletion', 'Profile completion')}</span>
                        <span className="text-[10px] font-bold" style={{ color: textColor }}>{pct}%</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: ringColor }}
                        />
                      </div>
                      {pct < 100 && (
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">{t(label, label)}</p>
                      )}
                      {pct === 100 && (
                        <p className="text-[10px] mt-1 font-semibold flex items-center gap-1" style={{ color: ringColor }}>
                          <CheckCircle2 size={10} /> {t('profileCompleted', 'Profile completed')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <User size={14} className="text-slate-400" />
                    {t('myProfile', 'My Profile')}
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/diagnostics'); }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <Activity size={14} className="text-slate-400" />
                    {t('diagnostics', 'Diagnostics')}
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); handleLogout(); navigate('/'); }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors border-t border-slate-50 mt-1"
                  >
                    <LogOut size={14} className="text-red-400" />
                    {t('logout', 'Logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate('/signup')}
              className="hidden sm:block text-sm font-semibold text-white px-4 py-1.5 rounded-full transition-all active:scale-95"
              style={{ background: '#0F766E' }}
            >
              {t('getStarted')}
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* ── Mobile drawer ── */}
      {menuOpen && (
        <div
          className="md:hidden bg-white px-4 pb-4 pt-2 space-y-1"
          style={{ borderTop: '1px solid #F0F2F5' }}
        >
          {navLinks.map(link => {
            const active = isActive(link.path);
            return (
              <Link
                key={link.name}
                to={link.path}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#F0F7F7] text-[#0F766E] font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {active && <span className="w-1.5 h-1.5 rounded-full bg-[#0F766E] flex-shrink-0" />}
                {link.name}
              </Link>
            );
          })}

          {/* Mobile profile summary */}
          {user && (
            <div
              className="flex items-center gap-3 px-3 py-3 rounded-xl mt-2"
              style={{ background: '#F8F9FB', border: '1px solid #E8ECF0' }}
            >
              <ProfileRing size={36} pct={pct} ringColor={ringColor} strokeWidth={2.5}>
                {avatar ? (
                  <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#E6F2F2] text-[#0F766E] flex items-center justify-center text-xs font-bold">
                    {initials(displayName)}
                  </div>
                )}
              </ProfileRing>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                <p className="text-[10px] font-medium" style={{ color: textColor }}>{label}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg flex-shrink-0"
                style={{ background: ringColor + '15', color: ringColor }}
              >
                {t('edit', 'Edit')}
              </button>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 mt-1">
            {user ? (
              <button
                onClick={() => { setMenuOpen(false); handleLogout(); navigate('/'); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-red-500 bg-red-50 border border-red-100 transition-colors"
              >
                <LogOut size={15} /> {t('logout', 'Logout')}
              </button>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); navigate('/signup'); }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: '#0F766E' }}
              >
                {t('getStarted')}
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
