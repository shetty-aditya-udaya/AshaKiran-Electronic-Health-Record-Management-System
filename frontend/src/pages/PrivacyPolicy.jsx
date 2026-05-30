import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useTranslation } from 'react-i18next';

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  return (
    <div className="bg-surface text-on-surface font-body selection:bg-primary-container selection:text-on-primary-container min-h-screen flex flex-col justify-between">
      <main className="flex-grow py-20 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container text-xs font-semibold tracking-wider uppercase mb-6">
              {t('legalGuidelines', 'Legal Guidelines')}
            </span>
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-on-surface mb-4 tracking-tight">
              {t('privacyPolicy', 'Privacy Policy')}
            </h1>
            <p className="text-on-surface-variant text-lg leading-relaxed">
              {t('privacySub', 'At AshaKiran, patient data security and privacy are central to our mission. This policy outlines how healthcare records and user details are securely handled.')}
            </p>
          </div>

          {/* Privacy Clauses */}
          <div className="space-y-8 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 p-8 md:p-12 rounded-2xl shadow-sm">
            
            {/* Section 1 */}
            <div>
              <h2 className="text-xl font-headline font-bold text-[#0F766E] mb-3">
                {t('privacySec1Title', '1. Data Storage & Local Security')}
              </h2>
              <ul className="space-y-3 list-disc list-inside text-on-surface-variant leading-relaxed">
                <li>{t('privacySec1Para1', 'All user data is securely stored and handled with industry-standard encryption protocols.')}</li>
                <li>{t('privacySec1Para2', 'Offline sync data stored locally on your device (IndexedDB/Cache) is securely managed to prevent unauthorized extraction.')}</li>
              </ul>
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Section 2 */}
            <div>
              <h2 className="text-xl font-headline font-bold text-[#0F766E] mb-3">
                {t('privacySec2Title', '2. Patient Records & Public Isolation')}
              </h2>
              <ul className="space-y-3 list-disc list-inside text-on-surface-variant leading-relaxed">
                <li>{t('privacySec2Para1', 'Patient records are strictly private and accessible only to authorized healthcare coordinators.')}</li>
                <li>{t('privacySec2Para2', 'The platform does not share sensitive patient information publicly under any circumstances.')}</li>
                <li>{t('privacySec2Para3', 'Healthcare records must be handled responsibly and ethically by all registered ASHA workers and staff members.')}</li>
              </ul>
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Section 3 */}
            <div>
              <h2 className="text-xl font-headline font-bold text-[#0F766E] mb-3">
                {t('privacySec3Title', '3. Access Control & Upload Consent')}
              </h2>
              <ul className="space-y-3 list-disc list-inside text-on-surface-variant leading-relaxed">
                <li>{t('privacySec3Para1', 'Unauthorized access, snooping, or data extraction from patient databases is strictly prohibited.')}</li>
                <li>{t('privacySec3Para2', 'Users must obtain proper, explicit consent from patients before uploading their clinical profiles or medical records.')}</li>
              </ul>
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Section 4 */}
            <div>
              <h2 className="text-xl font-headline font-bold text-[#0F766E] mb-3">
                {t('privacySec4Title', '4. Redistribution & Commercial Reuse')}
              </h2>
              <p className="text-on-surface-variant leading-relaxed">
                {t('privacySec4Para1', 'AshaKiran is an open-source clinical project built to support ground-level community health workers. The application owner/developer permission is explicitly required before commercial reuse or redistribution of this software or its core services.')}
              </p>
            </div>

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
