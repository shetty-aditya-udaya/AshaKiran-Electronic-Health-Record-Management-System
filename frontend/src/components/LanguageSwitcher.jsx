import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check } from 'lucide-react';

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ta', name: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'తెలుగు', flag: '🇮🇳' },
  { code: 'kn', name: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml', name: 'മലയാളം', flag: '🇮🇳' }
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const currentLangCode = i18n.language || 'en';
  const currentLang = languages.find(l => l.code === currentLangCode) || languages[0];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 pl-3 pr-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-[#E8ECF0] rounded-full shadow-sm outline-none hover:bg-slate-50 hover:border-slate-300 focus:ring-2 focus:ring-[#0F766E]/20 transition-all select-none cursor-pointer"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Globe size={13} className="text-slate-500 animate-spin-slow" />
        <span>{currentLang.flag} {currentLang.name}</span>
        <ChevronDown size={11} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-1.5 w-44 rounded-xl bg-white border border-slate-100 shadow-xl overflow-hidden py-1 z-50 transition-all origin-top-right"
          style={{
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.12)',
            animation: 'dropdownFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {languages.map((l) => {
            const isSelected = l.code === currentLangCode;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => handleSelect(l.code)}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50 ${
                  isSelected ? 'text-[#0F766E] bg-teal-50/50 font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm">{l.flag}</span>
                  <span>{l.name}</span>
                </span>
                {isSelected && <Check size={12} className="text-[#0F766E]" />}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
