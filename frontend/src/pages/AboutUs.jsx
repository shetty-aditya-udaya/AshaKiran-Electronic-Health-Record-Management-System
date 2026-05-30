import React from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useTranslation } from 'react-i18next';

export default function AboutUs() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="bg-surface text-on-surface font-body selection:bg-primary-container selection:text-on-primary-container">
      <style>{`
        .editorial-shadow { box-shadow: 0 20px 40px -15px rgba(0, 110, 64, 0.05); }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
      `}</style>

      <main>
        {/* Hero Section */}
        <section className="relative h-[819px] min-h-[600px] flex items-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              className="w-full h-full object-cover brightness-[0.7]"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuC6LavNaQVSIMgmYHtgqQp0nOuWQd-bVtSfQiadMJWEQO-yVH9pmficxTfPzGweidAVBennetDwi-T1QSDY-AedrlgfkcqBemZUghjUTOa1nL1Y4G0VJdDq6zIBkTPK-3FRexSfD-mSBjLZ8sk7FcgVuJB7XrOF0HmJQbZlMzefqUB8LJARhz9o0twAleTOAnAAIsb6gudioD01zMBsAjFCe8V8cF30uXQ9n2icCvWRwzjrA_nMfA1R09x5EMIZID2C3wkD1U0XK3S-"
              alt="Modern healthcare clinic in a rural landscape"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent"></div>
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-8">
            <div className="max-w-3xl">
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container text-xs font-semibold tracking-wider uppercase mb-6">{t('ourMission', 'Our Mission')}</span>
              <h1 className="text-5xl md:text-7xl font-headline font-bold text-white mb-6 leading-tight tracking-tight">
                {t('aboutHeroTitle', 'Bridging Healthcare Gaps in Rural India')}
              </h1>
              <p className="text-xl md:text-2xl text-emerald-50/90 leading-relaxed font-light">
                {t('aboutHeroSub', 'Leveraging technology to ensure that quality medical care is a right for every citizen, regardless of their pin code.')}
              </p>
            </div>
          </div>
        </section>

        {/* Mission Section */}
        <section className="py-24 max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: 'verified_user', title: t('aboutQualityTitle', 'Quality'), desc: t('aboutQualityDesc', 'Ensuring every consultation and treatment meets global medical standards through rigorous vetting and digital tracking.') },
              { icon: 'distance', title: t('aboutAccessibilityTitle', 'Accessibility'), desc: t('aboutAccessibilityDesc', 'Removing physical and financial barriers by mapping clinics and enabling remote consultations in remote villages.') },
              { icon: 'psychology', title: t('aboutEmpowermentTitle', 'Empowerment'), desc: t('aboutEmpowermentDesc', 'Providing local healthcare workers with tools and data to manage community health proactively and independently.') },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="p-10 rounded-lg bg-surface-container-lowest editorial-shadow border border-outline-variant/5">
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">{icon}</span>
                <h3 className="text-2xl font-headline font-bold mb-4 text-on-surface">{title}</h3>
                <p className="text-on-surface-variant leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Problem & Solution Section */}
        <section className="py-24 bg-surface-container-low">
          <div className="max-w-7xl mx-auto px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <h2 className="text-4xl font-headline font-bold text-on-surface">{t('challengesTitle', 'The Challenges We Face')}</h2>
                <div className="space-y-6">
                  {[
                    { icon: 'emergency', title: t('challengeDistanceTitle', 'Critical Distance'), desc: t('challengeDistanceDesc', 'Patients travel an average of 40km to reach the nearest qualified physician.') },
                    { icon: 'translate', title: t('challengeLanguageTitle', 'Language Barriers'), desc: t('challengeLanguageDesc', 'Complex medical advice often gets lost in translation between urban doctors and rural patients.') },
                    { icon: 'data_alert', title: t('challengeDataTitle', 'Data Fragmentation'), desc: t('challengeDataDesc', 'Lack of digital health records leads to redundant tests and delayed critical diagnoses.') },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} className="flex gap-6 p-6 rounded-2xl bg-error-container/10">
                      <span className="material-symbols-outlined text-error shrink-0">{icon}</span>
                      <div>
                        <h4 className="font-bold text-on-surface mb-1">{title}</h4>
                        <p className="text-on-surface-variant">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-8">
                <h2 className="text-4xl font-headline font-bold text-primary">{t('responseTitle', "AshaKiran's Response")}</h2>
                <div className="space-y-6">
                  {[
                    { icon: 'hub', title: t('responseMeshTitle', 'Clinic Mesh Network'), desc: t('responseMeshDesc', 'A decentralized registry of rural health centers updated in real-time via community contribution.') },
                    { icon: 'language', title: t('responseLocalTitle', 'Localized UX'), desc: t('responseLocalDesc', 'Native language support across 12 dialects ensuring clarity and trust in medical interactions.') },
                    { icon: 'cloud_sync', title: t('responseIdsTitle', 'Unified Health IDs'), desc: t('responseIdsDesc', 'Seamless digital records accessible via a phone number, enabling continuity of care.') },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} className="flex gap-6 p-6 rounded-2xl bg-primary-container/20">
                      <span className="material-symbols-outlined text-primary shrink-0">{icon}</span>
                      <div>
                        <h4 className="font-bold text-primary mb-1">{title}</h4>
                        <p className="text-on-surface-variant">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section className="py-24 max-w-7xl mx-auto px-8">
          <h2 className="text-3xl font-headline font-bold mb-12 text-center">{t('featuresTitle', 'Core Ecosystem Features')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 p-8 rounded-lg bg-emerald-900 text-white flex flex-col justify-between min-h-[300px]">
              <div>
                <span className="material-symbols-outlined text-primary-fixed text-5xl mb-6 block">map</span>
                <h3 className="text-3xl font-headline font-bold mb-4">{t('featureMappingTitle', 'Precision Mapping')}</h3>
                <p className="text-emerald-100/80 text-lg max-w-md">{t('featureMappingDesc', 'Find verified clinics nearby with detailed service lists and real-time operational status, powered by OpenStreetMap.')}</p>
              </div>
            </div>
            <div className="p-8 rounded-lg bg-surface-container-high flex flex-col justify-between">
              <div>
                <span className="material-symbols-outlined text-secondary text-4xl mb-4 block">person_search</span>
                <h3 className="text-xl font-headline font-bold mb-2">{t('featureDiscoveryTitle', 'Doctor Discovery')}</h3>
                <p className="text-on-surface-variant">{t('featureDiscoveryDesc', 'Verify credentials and book appointments with specialists who understand rural needs.')}</p>
              </div>
            </div>
            <div className="p-8 rounded-lg bg-surface-container-high flex flex-col justify-between">
              <div>
                <span className="material-symbols-outlined text-primary text-4xl mb-4 block">chat_bubble</span>
                <h3 className="text-xl font-headline font-bold mb-2">{t('featureNativeTitle', 'Native Support')}</h3>
                <p className="text-on-surface-variant">{t('featureNativeDesc', 'Speak in your language. AI-assisted translation for medical terms in 12 regional languages.')}</p>
              </div>
            </div>
            <div className="md:col-span-2 p-8 rounded-lg bg-primary-container flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1">
                <span className="material-symbols-outlined text-on-primary-container text-5xl mb-4 block">offline_pin</span>
                <h3 className="text-2xl font-headline font-bold text-on-primary-container mb-2">{t('featureOfflineTitle', 'Offline-First Tech')}</h3>
                <p className="text-on-primary-fixed-variant">{t('featureOfflineDesc', 'Works even in low-connectivity areas, syncing your data automatically when a network is found.')}</p>
              </div>
              <div className="w-full md:w-1/3 aspect-video bg-white/20 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary-container text-6xl">signal_wifi_off</span>
              </div>
            </div>
          </div>
        </section>

        {/* Who We Serve */}
        <section className="py-24 bg-surface-container-low">
          <div className="max-w-7xl mx-auto px-8">
            <h2 className="text-3xl font-headline font-bold mb-12 text-center">{t('whoWeServeTitle', 'Who We Serve')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDVXkEjHVCV6AlC5S1fG79nWCvMDHro8m236rLLiPxceTMNSQIvXp9pOASlqXEcGU1rPXBZvwtSdTC_mGuTJmABryQqqD4b8coXIuSboqCPpehTp1U21p-48yr_-VMdKnY2L0jQZ6pDXRmT072Fl_mUWd78uQzSXApUacCG5nnJoGEUktJ5cgzK0hM9QE2c5S3YDdZjnt-86CX8nCOFOr3WWDKaNrmxhL6nforbeQNyfsZe9_W086X2brrHNu0ogeKRKj2Bke5IVUiM',
                  alt: t('whoASHA', 'ASHA Workers'),
                  name: t('whoASHA', 'ASHA Workers'),
                  desc: t('whoASHADesc', 'Empowering ground-level heroes with diagnostic tools and digital coordination.')
                },
                {
                  img: '/rural-patient.png',
                  alt: t('whoPatients', 'Rural Patients'),
                  name: t('whoPatients', 'Rural Patients'),
                  desc: t('whoPatientsDesc', 'Providing easy access to health records and specialist care without the journey.')
                },
                {
                  img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC7E-O2RSzMKNMZ1ZBO6CXI3cAzrqNvffSAIpGtyjQACSbHGT0r7wd04_nFY0vnXeviqm5YCocXwDTUhzyJJYGBpMe4Dl6kQx_ZdmPgmQFDPQXLUWQ4rINWnBHLmlysetURN7vtLKcMS8htR4e3eXESh-dPsogAZtFIsX0jen9Q6-7EolCGEuqJEKoamJmFScr4lDNhCHQwZWtYKCH_OoBmPjSzVOPSpH7hxQ1w7w782FgreiCSSjgWumf89hlfyUbkaBwPLhlDEAmO',
                  alt: t('whoClinicians', 'Clinicians'),
                  name: t('whoClinicians', 'Clinicians'),
                  desc: t('whoCliniciansDesc', 'Extending their reach to help more patients with structured remote data.')
                }
              ].map(({ img, alt, name, desc }) => (
                <div key={name} className="bg-surface-container-lowest p-8 rounded-lg text-center">
                  <img 
                    className="w-24 h-24 rounded-full mx-auto mb-6 object-cover ring-4 ring-primary/10" 
                    src={img} 
                    alt={alt} 
                    width="96"
                    height="96"
                    loading="lazy"
                  />
                  <h4 className="text-xl font-bold mb-2">{name}</h4>
                  <p className="text-on-surface-variant text-sm">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Impact Highlights */}
        <section className="py-24 max-w-7xl mx-auto px-8 border-t border-b border-outline-variant/5">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl font-headline font-bold text-on-surface mb-4">{t('impactTitle', 'Our Impact Highlights')}</h2>
            <p className="text-on-surface-variant text-lg leading-relaxed font-light">
              {t('impactDesc', 'Rather than chasing hyper-growth marketing metrics, we focus on steady, sustainable, and high-trust healthcare support in rural communities.')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { 
                value: '500+', 
                label: t('impactClinicsLabel', 'Clinics Mapped'), 
                desc: t('impactClinicsDesc', 'Verified rural clinics cataloged for precision medical access.'), 
                icon: 'local_hospital' 
              },
              { 
                value: '12', 
                label: t('impactLanguagesLabel', 'Languages Supported'), 
                desc: t('impactLanguagesDesc', 'Medical terms and interfaces translated to bridge communication gaps.'), 
                icon: 'translate' 
              },
              { 
                value: '500+', 
                label: t('impactVillagesLabel', 'Villages Covered'), 
                desc: t('impactVillagesDesc', 'Providing essential link infrastructure to remote habitations.'), 
                icon: 'holiday_village' 
              },
              { 
                value: 'Offline', 
                label: t('impactHealthLabel', 'Healthcare Support'), 
                desc: t('impactHealthDesc', 'Continuous digital record syncing working even in zero-connectivity areas.'), 
                icon: 'offline_pin' 
              },
            ].map(({ value, label, desc, icon }) => (
              <div key={label} className="p-8 rounded-2xl bg-surface-container-lowest border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-primary/30 hover:shadow-md transition-all duration-300">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center mb-6 group-hover:bg-primary/10 transition-colors duration-300">
                    <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform duration-300">{icon}</span>
                  </div>
                  <span className="block text-4xl font-headline font-extrabold text-primary mb-2">{value}</span>
                  <h4 className="text-on-surface font-bold text-lg mb-2">{label}</h4>
                </div>
                <p className="text-on-surface-variant text-sm leading-relaxed mt-2">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pioneer Tribute */}
        <section className="py-24 bg-primary-fixed text-on-primary-fixed">
          <div className="max-w-7xl mx-auto px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="relative">
                <div className="rounded-xl shadow-2xl w-full aspect-[4/5] overflow-hidden relative">
                  <img
                    src="/anandibai-joshi.png"
                    alt={t('anandibaiAlt', "Dr. Anandibai Joshi — India's first female physician")}
                    className="w-full h-full object-cover object-top hover:scale-105 transition-all duration-700"
                  />
                  {/* Subtle vignette overlay for vintage feel */}
                  <div className="absolute inset-0 rounded-xl" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,60,30,0.35) 100%)' }} />
                </div>
                <div className="absolute -bottom-8 -right-8 p-8 bg-white rounded-lg shadow-xl hidden md:block max-w-xs">
                  <p className="italic text-primary-dim font-medium text-lg">{t('anandibaiQuote', '"I will serve my country with all my heart and all my soul."')}</p>
                </div>
              </div>
              <div className="space-y-6">
                <h2 className="text-4xl font-headline font-bold">{t('pioneerTitle', 'Honoring a Pioneer')}</h2>
                <p className="text-lg leading-relaxed opacity-90">{t('pioneerPara1', "Our work is inspired by the indomitable spirit of Dr. Anandibai Joshi, India's first female physician. In an era when education for women was restricted, she traveled across oceans to obtain a medical degree, driven by the heartbreak of losing her infant son to lack of medical care.")}</p>
                <p className="text-lg leading-relaxed opacity-90">{t('pioneerPara2', "Her journey symbolizes the very essence of AshaKiran: the unwavering belief that no life should be lost due to a lack of access to quality healthcare. We carry forward her legacy by bringing modern medicine to the doorstep of those who need it most.")}</p>
                <div className="pt-4">
                  <p className="font-bold text-xl">{t('anandibaiName', 'Dr. Anandibai Joshi')}</p>
                  <p className="text-sm opacity-75">{t('anandibaiTitle', 'Medical Pioneer & Visionary (1865–1887)')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="py-16 bg-surface">
          <div className="max-w-7xl mx-auto px-8 text-center">
            <p className="text-on-surface-variant uppercase tracking-[0.2em] text-sm font-bold mb-10">{t('builtWith', 'Built with Modern Infrastructure')}</p>
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-60 grayscale hover:grayscale-0 transition-all">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span className="font-bold text-xl">Tailwind CSS</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-4xl">map</span>
                <span className="font-bold text-xl">OpenStreetMap</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 100-16 8 8 0 000 16zM10.622 8.414l4.596 3.586-4.596 3.586V8.414z"/></svg>
                <span className="font-bold text-xl">React JS</span>
              </div>
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section className="py-24 max-w-4xl mx-auto px-8">
          <h2 className="text-4xl font-headline font-bold mb-16 text-center">{t('roadmapTitle', 'The Path Ahead')}</h2>
          <div className="space-y-0 relative before:absolute before:left-4 md:before:left-1/2 before:w-0.5 before:h-full before:bg-primary-container">
            {[
              { phase: t('phase01', 'Phase 01:'), title: t('roadmapPhase1Title', 'Offline AI Diagnosis'), desc: t('roadmapPhase1Desc', 'Implementing light-weight on-device AI for basic symptom screening without internet.'), active: true, reverse: false },
              { phase: t('phase02', 'Phase 02:'), title: t('roadmapPhase2Title', 'Telemedicine V2'), desc: t('roadmapPhase2Desc', 'High-fidelity video consultations with integrated hardware for remote vitals monitoring.'), active: false, reverse: true },
              { phase: t('phase03', 'Phase 03:'), title: t('roadmapPhase3Title', 'Nationwide Grid'), desc: t('roadmapPhase3Desc', 'Expanding AshaKiran to every aspirational district in India, creating a true national health mesh.'), active: false, reverse: true },
            ].map(({ phase, title, desc, active, reverse }, i) => (
              <div key={phase} className={`relative mb-16 md:flex ${reverse ? 'flex-row-reverse' : ''} justify-between items-center w-full`}>
                <div className="hidden md:block w-[45%]"></div>
                <div className={`absolute left-0 md:left-1/2 md:-translate-x-1/2 w-8 h-8 rounded-full ${active ? 'bg-primary' : 'bg-primary-container'} border-4 border-surface z-10`}></div>
                <div className="ml-12 md:ml-0 md:w-[45%] p-8 rounded-lg bg-surface-container-low">
                  <span className="text-primary font-bold text-sm">{phase}</span>
                  <h4 className="text-xl font-bold mt-2">{title}</h4>
                  <p className="text-on-surface-variant mt-2">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 max-w-7xl mx-auto px-8">
          <div className="bg-gradient-to-br from-primary to-primary-dim rounded-xl p-12 md:p-20 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full -ml-32 -mb-32 blur-3xl"></div>
            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-headline font-bold mb-8">{t('readyToTransform', 'Ready to transform rural healthcare?')}</h2>
              <p className="text-xl text-emerald-100 mb-12">{t('readyToTransformSub', 'Join us in our journey to build a healthier, more equitable future for every village.')}</p>
              <button
                onClick={() => navigate('/signup')}
                className="bg-white text-primary px-10 py-4 rounded-full text-lg font-bold hover:bg-emerald-50 transition-colors shadow-lg shadow-black/20"
              >
                {t('getStarted')}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-emerald-100 w-full rounded-t-[2rem] mt-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 max-w-7xl mx-auto px-8 py-16">
          <div className="space-y-4">
            <BrandLogo size="sm" mode="light" className="!px-0" />
            <p className="text-emerald-800/80 leading-relaxed">{t('footerTag', 'Modern medical infrastructure for rural India. Built with empathy, powered by technology.')}</p>
          </div>
          <div>
            <h5 className="font-bold text-emerald-950 mb-6">{t('explore', 'Explore')}</h5>
            <ul className="space-y-3">
              <li><Link className="text-emerald-800/80 hover:underline decoration-emerald-500/30" to="/programmes">{t('programmes')}</Link></li>
              <li><Link className="text-emerald-800/80 hover:underline decoration-emerald-500/30" to="/clinics">{t('clinics')}</Link></li>
              <li><Link className="text-emerald-800/80 hover:underline decoration-emerald-500/30" to="/doctors">{t('doctors')}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-emerald-950 mb-6">{t('company', 'Company')}</h5>
            <ul className="space-y-3">
              <li><Link className="text-emerald-800/80 hover:underline decoration-emerald-500/30" to="/about">{t('aboutUs')}</Link></li>
              <li><Link className="text-emerald-800/80 hover:underline decoration-emerald-500/30" to="/contact">{t('contactUs')}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-emerald-950 mb-6">{t('legal', 'Legal')}</h5>
            <ul className="space-y-3">
              <li><Link className="text-emerald-800/80 hover:underline decoration-emerald-500/30" to="/privacy">{t('privacyPolicy')}</Link></li>
              <li><a className="text-emerald-800/80 hover:underline decoration-emerald-500/30" href="#">{t('termsOfService', 'Terms of Service')}</a></li>
              <li><a className="text-emerald-800/80 hover:underline decoration-emerald-500/30" href="#">{t('patientRights', 'Patient Rights')}</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-8 py-6 border-t border-emerald-900/5 text-center">
          <p className="text-sm text-emerald-800/60">{t('copyrightText', '© 2026 AshaKiran Healthcare. Care. Empower. Uplift. All rights reserved.')}</p>
        </div>
      </footer>
    </div>
  );
}
