import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Github } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useTranslation } from 'react-i18next';

export default function ContactUs() {
  const { t } = useTranslation();

  return (
    <div className="bg-surface text-on-surface font-body selection:bg-primary-container selection:text-on-primary-container min-h-screen flex flex-col justify-between">
      <main className="flex-grow py-20 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container text-xs font-semibold tracking-wider uppercase mb-6">
              {t('connectWithUs', 'Connect With Us')}
            </span>
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-on-surface mb-4 tracking-tight">
              {t('contactUs')}
            </h1>
            <p className="text-on-surface-variant text-lg leading-relaxed">
              {t('contactUsSub', 'Have questions, feedback, or want to collaborate on AshaKiran? Reach out to the developer or explore the open-source repository.')}
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Gmail Card */}
            <a
              href="mailto:shettyaditya266@gmail.com"
              className="group flex items-center gap-5 p-8 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#0F766E]/40 dark:hover:border-[#0F766E]/40 transition-all duration-300"
            >
              <div className="p-4 bg-[#F0F7F7] text-[#0F766E] dark:bg-slate-800 dark:text-teal-400 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Mail size={28} className="stroke-[1.75]" />
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                  {t('emailContact', 'Email Contact')}
                </span>
                <span className="block text-lg font-bold text-slate-800 dark:text-slate-200 mb-1 group-hover:text-[#0F766E] dark:group-hover:text-[#0F766E] transition-colors duration-200">
                  shettyaditya266@gmail.com
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline">
                  {t('sendEmail', 'Send Email')}
                  <span className="material-symbols-outlined text-xs">arrow_forward</span>
                </span>
              </div>
            </a>

            {/* GitHub Card */}
            <a
              href="https://github.com/shetty-aditya-udaya/AshaKiran-Electronic-Health-Record-Management-System"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-5 p-8 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#0F766E]/40 dark:hover:border-[#0F766E]/40 transition-all duration-300"
            >
              <div className="p-4 bg-[#F0F7F7] text-[#0F766E] dark:bg-slate-800 dark:text-teal-400 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Github size={28} className="stroke-[1.75]" />
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                  {t('githubRepository', 'GitHub Repository')}
                </span>
                <span className="block text-lg font-bold text-slate-800 dark:text-slate-200 mb-1 group-hover:text-[#0F766E] dark:group-hover:text-[#0F766E] transition-colors duration-200">
                  {t('ashakiranEhrSystem', 'AshaKiran EHR System')}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline">
                  {t('exploreCodebase', 'Explore Codebase')}
                  <span className="material-symbols-outlined text-xs">arrow_forward</span>
                </span>
              </div>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-12 px-8 bg-slate-50 dark:bg-gray-900 border-t border-slate-200/60 transition-colors duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-7xl mx-auto">
          <div className="space-y-4">
            <BrandLogo size="sm" mode="light" className="!px-0" />
            <p className="font-body text-sm text-slate-600 dark:text-slate-400">{t('copyrightText', '© 2026 AshaKiran Healthcare. Care. Empower. Uplift. All rights reserved.')}</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4 md:justify-end">
            <Link to="/programmes" className="font-body text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 transition-all">{t('programs', 'Programs')}</Link>
            <Link to="/contact" className="font-body text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 transition-all">{t('contactUs')}</Link>
            <Link to="/privacy" className="font-body text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 transition-all">{t('privacyPolicy', 'Privacy Policy')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
