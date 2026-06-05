import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Programmes() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const programmes = [
    {
      id: "maternal",
      title: t("maternalCareTitle", "Maternal Care"),
      desc: t("maternalCareDesc", "Comprehensive pre-natal and post-natal tracking for mother and child health milestones."),
      icon: "pregnant_woman",
      path: "/programmes/maternal",
      colorClass: "bg-primary-container/30 text-primary group-hover:bg-primary group-hover:text-on-primary",
    },
    {
      id: "vax",
      title: t("childVaccinationTitle", "Child Vaccination"),
      desc: t("childVaccinationDesc", "Digital immunization registers to ensure zero missed doses for infants in the community."),
      icon: "vaccines",
      path: "/programmes/vaccination",
      colorClass: "bg-secondary-container/30 text-secondary group-hover:bg-secondary group-hover:text-on-secondary",
    },
    {
      id: "disease",
      title: t("diseaseTrackingTitle", "Disease Tracking"),
      desc: t("diseaseTrackingDesc", "Early identification and reporting of infectious diseases to prevent community outbreaks."),
      icon: "microbiology",
      path: "/programmes/disease",
      colorClass: "bg-error-container/20 text-error group-hover:bg-error group-hover:text-on-error",
    },
    {
      id: "ncd",
      title: t("ncdMonitoringTitle", "NCD Monitoring"),
      desc: t("ncdMonitoringDesc", "Tracking chronic conditions like hypertension and diabetes through regular screenings."),
      icon: "favorite",
      path: "/programmes/ncd",
      colorClass: "bg-tertiary-container/50 text-tertiary group-hover:bg-tertiary group-hover:text-on-tertiary",
    },
    {
      id: "family",
      title: t("familyPlanningTitle", "Family Planning"),
      desc: t("familyPlanningDesc", "Counseling and distribution of reproductive health resources for planned families."),
      icon: "family_restroom",
      path: "#",
      colorClass: "bg-primary-container/30 text-primary group-hover:bg-primary group-hover:text-on-primary",
    },
    {
      id: "outreach",
      title: t("communityOutreachTitle", "Community Outreach"),
      desc: t("communityOutreachDesc", "Engagement and health literacy campaigns for rural and underserved populations."),
      icon: "diversity_3",
      path: "#",
      colorClass: "bg-secondary-container/30 text-secondary group-hover:bg-secondary group-hover:text-on-secondary",
    }
  ];

  const filteredProgrammes = programmes.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col font-body">
      <main className="py-12 px-6 md:px-12 max-w-7xl mx-auto w-full flex-grow">
        {/* Title Section */}
        <section className="mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight mb-4 font-headline">{t('communityHealthcareProgrammes', 'Community Healthcare Programmes')}</h1>
          <p className="text-on-surface-variant text-lg max-w-3xl leading-relaxed">
            {t('programmesHeaderDescSimple', 'AshaKiran helps ASHA workers manage maternal care, chronic illness monitoring, child healthcare, follow-up visits, and rural health outreach through a unified digital platform.')}
          </p>
        </section>

        {/* Search & Filter Area */}
        <section className="mb-12 flex flex-col md:flex-row gap-6 items-start md:items-center">
          <div className="relative flex-grow w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-outline material-symbols-outlined">search</span>
            <input 
              className="w-full pl-12 pr-4 py-4 bg-surface-container-lowest border border-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-container text-on-surface shadow-sm font-body" 
              placeholder={t('searchProgrammesPlaceholder', 'Search programmes...')}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 w-full md:w-auto no-scrollbar">
            <button className="px-6 py-3 bg-primary text-white rounded-full font-medium whitespace-nowrap shadow-md">{t('allProgrammes', 'All Programmes')}</button>
            <button className="px-6 py-3 bg-surface-container-high text-primary rounded-full font-medium whitespace-nowrap hover:bg-surface-container-highest transition-colors">{t('maternal', 'Maternal')}</button>
            <button className="px-6 py-3 bg-surface-container-high text-primary rounded-full font-medium whitespace-nowrap hover:bg-surface-container-highest transition-colors">{t('prevention', 'Prevention')}</button>
            <button className="px-6 py-3 bg-surface-container-high text-primary rounded-full font-medium whitespace-nowrap hover:bg-surface-container-highest transition-colors">{t('monitoring', 'Monitoring')}</button>
          </div>
        </section>

        {/* Programme Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProgrammes.map((p) => (
            <div key={p.id} onClick={() => navigate(p.path)} className="cursor-pointer bg-surface-container-lowest rounded-lg p-8 shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-slate-50 hover:shadow-lg hover:border-slate-100 transition-all duration-300 group relative overflow-hidden flex flex-col">
              <div className={`mb-6 w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${p.colorClass.split(" ")[0]} ${p.colorClass.split(" ")[1]}`}>
                <span className="material-symbols-outlined text-4xl">{p.icon}</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-on-surface font-headline">{p.title}</h3>
              <p className="text-on-surface-variant mb-8 line-clamp-2 leading-relaxed">{p.desc}</p>
              <div className="mt-auto pointer-events-none">
                <button className={`w-full py-4 bg-surface-container-high font-bold rounded-full transition-all duration-300 ${p.colorClass.split(" ").slice(2).join(" ")} text-primary`}>
                  {t('viewDetails', 'View Details')}
                </button>
              </div>
            </div>
          ))}
        </section>

        {/* Asymmetric Hero Visual Section */}
        <section className="mt-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1">
            <img 
              className="rounded-lg shadow-xl w-full h-[400px] object-cover" 
              alt="a professional female healthcare worker in a clean clinic setting using a digital tablet" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMR0wwG3dgsD0tLof6jIQC02uwub4zkTJh35RyunqUnnZ16leDrxP6l2pBoikcKdVn3HBpzNm_DIANCgPZgEJw07SRs72laFHLgMofkoEm_P6SxgmrwlTJOd3Ao4XUIVHzTvbHkebsZrvE-Vv0c3gZ-mvO0H5Qb_L_nPeAvIy_yg8XtEvRGWQK8y3H4Lo5eenrWzz4SNkKc5_GPhgEOxyx_HsAHhju9ICS6sGCDReEcGfkIK-eCuRNg7DuLjT5fxVx3T9uGdHgGp9X" 
            />
          </div>
          <div className="order-1 lg:order-2 px-6">
            <span className="inline-block px-4 py-1 bg-teal-50 text-teal-800 border border-teal-100 rounded-full text-xs font-bold uppercase tracking-widest mb-6">
              {t('programmeOutreach', 'Outreach & Delivery')}
            </span>
            <h2 className="text-4xl font-bold mb-6 leading-tight font-headline">
              {t('nurturingRuralCareTitle', 'Structured Outreach & Monitoring')}
            </h2>
            <p className="text-on-surface-variant text-lg leading-relaxed mb-8">
              {t('nurturingRuralCareDesc', 'ASHA workers serve as the primary link between communities and public health systems. AshaKiran provides clinical record structures to standardize data collection, follow-ups, and risk tracking without administrative overhead.')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-surface-container-low rounded-lg border border-slate-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">pregnant_woman</span>
                <span className="text-sm font-semibold text-slate-800">{t('highlightMaternal', 'Maternal Care')}</span>
              </div>
              <div className="p-4 bg-surface-container-low rounded-lg border border-slate-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-xl">child_care</span>
                <span className="text-sm font-semibold text-slate-800">{t('highlightChild', 'Child Health')}</span>
              </div>
              <div className="p-4 bg-surface-container-low rounded-lg border border-slate-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary text-xl">favorite</span>
                <span className="text-sm font-semibold text-slate-800">{t('highlightChronic', 'Chronic Care')}</span>
              </div>
              <div className="p-4 bg-surface-container-low rounded-lg border border-slate-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-xl">event_repeat</span>
                <span className="text-sm font-semibold text-slate-800">{t('highlightFollowUp', 'Follow-up Tracking')}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
