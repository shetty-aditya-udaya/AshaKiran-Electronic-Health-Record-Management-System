import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/apiClient';

export default function Signup() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', village: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const data = await api.post('/api/register', formData);
      toast.success(t('signupSuccess'), { duration: 4000 });
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const errorKey = err.data?.error || err.message;
      toast.error(t(errorKey) || t('signupFailed', 'Signup failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden select-none bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url('/auth-bg.png')" }}
    >
      {/* Soft translucent overlay */}
      <div className="absolute inset-0 bg-white/72 pointer-events-none z-0" />

      {/* Decorative floating healthcare icons / particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none">
        {/* Particle 1: Heart */}
        <div className="absolute top-[18%] left-[12%] text-rose-400/30 animate-auth-particle-1">
          <svg className="w-10 h-10 md:w-14 md:h-14 fill-current" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        {/* Particle 2: Sparkle/Cross */}
        <div className="absolute bottom-[22%] left-[16%] text-teal-600/25 animate-auth-particle-2">
          <svg className="w-12 h-12 md:w-16 md:h-16 fill-current" viewBox="0 0 24 24">
            <path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z"/>
          </svg>
        </div>
        {/* Particle 3: Sparkles/Star */}
        <div className="absolute top-[25%] right-[15%] text-amber-500/30 animate-auth-particle-3">
          <svg className="w-9 h-9 md:w-12 md:h-12 fill-current" viewBox="0 0 24 24">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        </div>
        {/* Particle 4: Small Cross */}
        <div className="absolute bottom-[16%] right-[18%] text-teal-500/20 animate-auth-particle-1">
          <svg className="w-8 h-8 md:w-10 md:h-10 fill-current" viewBox="0 0 24 24">
            <path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z"/>
          </svg>
        </div>
      </div>

      {/* Main glassmorphism card */}
      <div 
        className="relative z-10 w-full max-w-[94%] sm:max-w-[90%] md:max-w-[460px] p-6 sm:p-8 md:p-10 animate-auth-card border"
        style={{
          background: 'rgba(255, 255, 255, 0.82)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderColor: 'rgba(255, 255, 255, 0.45)',
          borderRadius: '28px',
          boxShadow: '0 20px 60px rgba(15, 118, 110, 0.12)'
        }}
      >
        {/* Branding header */}
        <div className="flex flex-col items-center text-center mb-6">
          <img 
            src="/ashakiran-logo.png" 
            alt="AshaKiran Logo" 
            className="h-16 w-16 md:h-20 md:w-20 object-contain mb-3 drop-shadow-sm transition-transform duration-300 hover:scale-105"
          />
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#0F766E] tracking-tight">
            Asha<span className="text-[#F59E0B]">Kiran</span>
          </h1>
          <p className="text-xs md:text-sm font-semibold tracking-wide text-slate-500 mt-1 uppercase">
            {t('brandSubtitle', 'Care. Empower. Uplift.')}
          </p>
        </div>

        {/* Title & subtitle */}
        <div className="mb-6 text-center">
          <h2 className="text-xl md:text-2xl font-bold text-[#0F766E]">{t('signup')}</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">{t('signupSub', 'Create your ASHA portal account to start serving')}</p>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative group">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5 ml-1 tracking-[0.12em] transition-colors group-focus-within:text-[#0F766E]">
              {t('name')}
            </label>
            <input 
              required
              type="text" 
              className="w-full px-5 py-3.5 bg-[#F8FAFC] border border-slate-200/80 rounded-xl outline-none focus:border-[#0F766E] focus:ring-4 focus:ring-[#0F766E]/12 transition-all font-medium text-slate-800 placeholder:text-slate-300"
              placeholder="e.g. Priya Devi"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="relative group">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5 ml-1 tracking-[0.12em] transition-colors group-focus-within:text-[#0F766E]">
              {t('email')}
            </label>
            <input 
              required
              type="email" 
              className="w-full px-5 py-3.5 bg-[#F8FAFC] border border-slate-200/80 rounded-xl outline-none focus:border-[#0F766E] focus:ring-4 focus:ring-[#0F766E]/12 transition-all font-medium text-slate-800 placeholder:text-slate-300"
              placeholder="asha@example.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div className="relative group">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5 ml-1 tracking-[0.12em] transition-colors group-focus-within:text-[#0F766E]">
              {t('password')}
            </label>
            <input 
              required
              type="password" 
              className="w-full px-5 py-3.5 bg-[#F8FAFC] border border-slate-200/80 rounded-xl outline-none focus:border-[#0F766E] focus:ring-4 focus:ring-[#0F766E]/12 transition-all font-medium text-slate-800 placeholder:text-slate-300"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>

          <div className="relative group">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5 ml-1 tracking-[0.12em] transition-colors group-focus-within:text-[#0F766E]">
              {t('village')}
            </label>
            <input 
              required
              type="text" 
              className="w-full px-5 py-3.5 bg-[#F8FAFC] border border-slate-200/80 rounded-xl outline-none focus:border-[#0F766E] focus:ring-4 focus:ring-[#0F766E]/12 transition-all font-medium text-slate-800 placeholder:text-slate-300"
              placeholder="e.g. Rampur"
              value={formData.village}
              onChange={(e) => setFormData({...formData, village: e.target.value})}
            />
          </div>

          {/* Primary CTA */}
          <button 
            type="submit" 
            disabled={loading}
            className={`w-full relative overflow-hidden group min-h-[52px] px-6 py-3.5 font-bold text-sm sm:text-base flex items-center justify-center gap-2 rounded-xl text-white select-none transition-all duration-200 active:scale-98 mt-5 ${
              loading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-[0_8px_24px_rgba(15,118,110,0.25)] hover:-translate-y-[1px]'
            }`}
            style={{
              background: 'linear-gradient(135deg, #0F766E, #0d9488)'
            }}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t('signup')
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-sm font-semibold text-slate-500">
          {t('alreadyHaveAccount', 'Already have an account?')}{' '}
          <Link 
            to="/login" 
            className="text-[#0F766E] font-extrabold hover:text-[#0b5c56] hover:underline ml-1 transition-colors"
          >
            {t('login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
