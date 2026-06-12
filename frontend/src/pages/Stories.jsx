import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const CATEGORIES = ['All', 'ASHA Workers', 'Maternal Care', 'TB & Disease', 'Documentary', 'Field Life'];

const VIDEOS = [
  {
    id: 'C6QnU19vkk4',
    title: 'Main Bhi ASHA — A Day in the Life of an ASHA Worker',
    channel: 'Ministry of Health & Family Welfare',
    channelVerified: true,
    category: 'Field Life',
    desc: 'Follow a certified ASHA worker through her daily rounds — from home visits to immunisation drives — in this official Ministry of Health production.',
    tags: ['Daily Life', 'Field Work', 'Government'],
    featured: true,
  },
  {
    id: 'WMVEruQei0s',
    title: 'The Healthcare Workers Taking Care of Mothers and Babies',
    channel: 'UNICEF India',
    channelVerified: true,
    category: 'Maternal Care',
    desc: 'UNICEF India documents the frontline heroes ensuring safe motherhood and child survival across remote Indian villages.',
    tags: ['Maternal Health', 'Child Care', 'UNICEF'],
  },
  {
    id: 'byLthGsJwfc',
    title: 'Healers of India — Strengthening Primary Health Care Through ASHA Workers',
    channel: 'American India Foundation',
    channelVerified: true,
    category: 'Documentary',
    desc: 'A powerful documentary showcasing how ASHA workers are the invisible backbone of India\'s primary healthcare system in rural communities.',
    tags: ['Documentary', 'Primary Care', 'Rural Health'],
  },
  {
    id: 'nJy9sD5cV3s',
    title: "India's Female ASHA Workers: Backbone of the Country's Healthcare System",
    channel: 'FRANCE 24 English',
    channelVerified: true,
    category: 'Documentary',
    desc: 'International media coverage of how women ASHA workers transformed India\'s response to COVID-19 and continue to fight for fair wages.',
    tags: ['International', 'Gender', 'COVID-19'],
  },
  {
    id: 'FFpwhIlh4_M',
    title: 'ASHA — The Foot Soldiers of Change (Documentary Film)',
    channel: 'Independent Documentary',
    channelVerified: false,
    category: 'Documentary',
    desc: 'An award-winning documentary film capturing the transformative work of ASHA workers across three states over a span of two years.',
    tags: ['Documentary', 'Award-winning', 'Multi-state'],
  },
  {
    id: 'xN1vqRwBu_c',
    title: 'Meet Sunita Didi: The ASHA Worker Who Achieved a 100% TB Cure Rate',
    channel: 'TB Story',
    channelVerified: false,
    category: 'TB & Disease',
    desc: 'Sunita Kumari became a TB warrior in her village, tracking every patient until they completed their medication with zero dropout.',
    tags: ['TB', 'Disease Control', 'Success Story'],
  },
  {
    id: '6fVyEpMiBOU',
    title: 'A Day in the Life of an ASHA Worker',
    channel: 'India Health Stories',
    channelVerified: false,
    category: 'Field Life',
    desc: 'From dawn to dusk, this short documentary captures the exhausting yet deeply rewarding daily work of an ASHA Karyakarta in rural Bihar.',
    tags: ['Daily Life', 'Bihar', 'Field Work'],
  },
  {
    id: 'mfJ4KkwF9Hc',
    title: 'ASHA | Health Activist | Functions & Role Explained',
    channel: 'SMCI Next',
    channelVerified: false,
    category: 'ASHA Workers',
    desc: 'An educational breakdown of the ASHA programme — her role, responsibilities, and how she coordinates with AWW and ANM for community health.',
    tags: ['Educational', 'Role & Functions', 'Training'],
  },
];

const FEATURED = VIDEOS.find(v => v.featured);
const thumb = (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
const embedUrl = (id) => `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

// ----- Sub-components -----

function VideoModal({ video, onClose }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl z-10">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        {/* 16:9 iframe wrapper */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src={embedUrl(video.id)}
            title={t(`stories.video.${video.id}.title`, video.title)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
        <div className="mt-4 px-1">
          <h3 className="text-white font-headline font-bold text-lg">{t(`stories.video.${video.id}.title`, video.title)}</h3>
          <p className="text-emerald-300/70 text-sm mt-1 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">smart_display</span>
            {video.channel}
            {video.channelVerified && <span className="material-symbols-outlined text-primary-fixed text-base" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video, index, onPlay }) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  return (
    <article
      className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm flex flex-col group"
      style={{ animation: `fadeUp 0.5s ease ${index * 60}ms both` }}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden bg-slate-800 aspect-video">
        {imgError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/80">
            <span className="material-symbols-outlined text-4xl text-emerald-400/50 mb-2">play_disabled</span>
            <p className="text-emerald-400/50 text-xs">{t('stories.thumbnailUnavailable', 'Thumbnail unavailable')}</p>
          </div>
        ) : (
          <img
            src={thumb(video.id)}
            alt={t(`stories.video.${video.id}.title`, video.title)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={() => onPlay(video)}
            className="w-14 h-14 rounded-full bg-white/20 backdrop-blur border border-white/30 flex items-center justify-center hover:bg-primary/80 transition-all"
            aria-label={t('stories.playVideo', 'Play video')}
          >
            <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
          </button>
        </div>
        {/* Category badge */}
        <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${
          video.category === 'ASHA Workers' ? 'bg-primary/80 text-white' :
          video.category === 'Maternal Care' ? 'bg-tertiary/80 text-white' :
          video.category === 'TB & Disease' ? 'bg-error/80 text-white' :
          video.category === 'Field Life' ? 'bg-secondary/80 text-white' :
          'bg-emerald-900/80 text-white'
        }`}>
          {t('stories.category.' + video.category.toLowerCase().replace(/\s+/g, '').replace('&', 'and'), video.category)}
        </span>
        {/* YouTube logo mark */}
        <span className="absolute bottom-3 right-3 opacity-80">
          <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
            <rect width="20" height="14" rx="3" fill="#FF0000"/>
            <polygon points="8,4 14,7 8,10" fill="white"/>
          </svg>
        </span>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-headline font-bold text-on-surface text-base leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {t(`stories.video.${video.id}.title`, video.title)}
        </h3>
        <p className="text-on-surface-variant/70 text-xs flex items-center gap-1 mb-3">
          <span className="material-symbols-outlined text-sm">subscriptions</span>
          {video.channel}
          {video.channelVerified && (
            <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          )}
        </p>
        <p className="text-on-surface-variant text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
          {t(`stories.video.${video.id}.desc`, video.desc)}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {video.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-surface-container-low rounded-full text-[10px] font-bold text-on-surface-variant">
              {t('stories.tag.' + tag.toLowerCase().replace(/\s+/g, '').replace('&', 'and'), tag)}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onPlay(video)}
            className="flex-1 py-2.5 bg-primary/10 text-primary font-bold text-sm rounded-xl hover:bg-primary hover:text-on-primary transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
            {t('stories.playHere', 'Play Here')}
          </button>
          <a
            href={watchUrl(video.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 border border-outline-variant/30 text-on-surface-variant rounded-xl hover:bg-surface-container-high transition-all flex items-center gap-1.5 text-sm font-bold"
            title={t('stories.watchOnYoutube', 'Watch on YouTube')}
          >
            <svg width="16" height="11" viewBox="0 0 20 14" fill="none" className="flex-shrink-0">
              <rect width="20" height="14" rx="3" fill="#FF0000"/>
              <polygon points="8,4 14,7 8,10" fill="white"/>
            </svg>
            {t('stories.youtubeLink', 'YouTube')}
          </a>
        </div>
      </div>
    </article>
  );
}

// ----- Main Page -----

export default function Stories({ t: propT }) {
  const navigate = useNavigate();
  const { t: i18nT } = useTranslation();
  const t = propT || i18nT;
  const [activeCategory, setActiveCategory] = useState('All');
  const [playingVideo, setPlayingVideo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = VIDEOS.filter(v => {
    const matchCat = activeCategory === 'All' || v.category === activeCategory;
    const matchSearch = !searchQuery ||
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.channel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
        .line-clamp-2 { overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .line-clamp-3 { overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
      `}</style>

      {/* ── Hero ── */}
      <section 
        className="relative h-[65vh] min-h-[480px] flex items-center overflow-hidden bg-cover bg-center w-full"
        style={{
          backgroundImage: "linear-gradient(rgba(0, 60, 50, 0.45), rgba(0, 30, 25, 0.55)), url('/hero-image.jpg')",
          animation: 'fadeIn 1.2s ease both'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/50 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 w-full text-left" style={{ animation: 'fadeUp 0.8s ease both 0.2s' }}>
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-headline font-extrabold text-white leading-none tracking-tight mb-5 drop-shadow-md">
            {t('stories.heroTitle', 'Stories of Care')}
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl text-emerald-50/90 max-w-2xl font-medium leading-relaxed drop-shadow">
            {t('stories.heroSub', "Real narratives of courage, compassion, and transformation from India's rural health activists.")}
          </p>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 pb-24">

        {/* ── Featured Embed ── */}
        <section className="mt-16 mb-20">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            {/* Embed */}
            <div className="lg:col-span-3 rounded-2xl overflow-hidden shadow-2xl border border-outline-variant/10 bg-black" style={{ paddingBottom: 0 }}>
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${FEATURED.id}?rel=0&modestbranding=1`}
                  title={t(`stories.video.${FEATURED.id}.title`, FEATURED.title)}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            </div>
            {/* Info */}
            <div className="lg:col-span-2 py-2">
              <span className="inline-block px-3 py-1 rounded-full bg-primary-container text-on-primary-container text-[10px] font-bold tracking-widest uppercase mb-4">
                {t('stories.featuredStory', 'Featured Story')}
              </span>
              <h2 className="text-2xl md:text-3xl font-headline font-bold text-on-surface mb-4 leading-snug">
                {t(`stories.video.${FEATURED.id}.title`, FEATURED.title)}
              </h2>
              <p className="text-on-surface-variant leading-relaxed mb-6">
                {t(`stories.video.${FEATURED.id}.desc`, FEATURED.desc)}
              </p>
              <div className="flex items-center gap-3 p-4 bg-surface-container-low rounded-xl mb-6">
                <svg width="28" height="20" viewBox="0 0 20 14" fill="none"><rect width="20" height="14" rx="3" fill="#FF0000"/><polygon points="8,4 14,7 8,10" fill="white"/></svg>
                <div>
                  <p className="font-bold text-sm text-on-surface flex items-center gap-1.5">
                    {FEATURED.channel}
                    <span className="material-symbols-outlined text-secondary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  </p>
                  <p className="text-xs text-on-surface-variant">{t('stories.verifiedSource', 'Official Government & Verified Source')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {FEATURED.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 bg-primary-container text-on-primary-container rounded-full text-xs font-bold">
                    {t('stories.tag.' + tag.toLowerCase().replace(/\s+/g, '').replace('&', 'and'), tag)}
                  </span>
                ))}
              </div>
              <a
                href={watchUrl(FEATURED.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-md"
              >
                <svg width="18" height="13" viewBox="0 0 20 14" fill="none"><rect width="20" height="14" rx="3" fill="white"/><polygon points="8,4 14,7 8,10" fill="#FF0000"/></svg>
                {t('stories.watchOnYoutube', 'Watch on YouTube')}
              </a>
            </div>
          </div>
        </section>

        {/* ── Search + Filters ── */}
        <div className="flex flex-col md:flex-row gap-4 mb-10">
          {/* Search */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-xl">search</span>
            <input
              type="text"
              placeholder={t('stories.searchPlaceholder', 'Search stories, channels, tags…')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {/* Category filters */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2.5 rounded-full font-bold text-sm transition-all whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {t('stories.category.' + cat.toLowerCase().replace(/\s+/g, '').replace('&', 'and'), cat)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Attribution notice ── */}
        <div className="flex items-start gap-3 p-4 bg-surface-container-low border border-outline-variant/10 rounded-xl mb-8 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-xl shrink-0 mt-0.5">info</span>
          <p>{t('stories.attributionNotice', 'All videos are sourced from YouTube. Content belongs to respective creators. AshaKiran does not host or download any video content — all streams are played directly from YouTube.')}</p>
        </div>

        {/* ── Video Grid ── */}
        {filtered.length === 0 ? (
          <div className="py-32 text-center">
            <span className="material-symbols-outlined text-5xl text-outline mb-4 block">search_off</span>
            <h3 className="font-bold text-xl text-on-surface mb-2">{t('stories.noStoriesFound', 'No stories found')}</h3>
            <p className="text-on-surface-variant">{t('stories.noStoriesDesc', 'Try a different search or category.')}</p>
            <button onClick={() => { setSearchQuery(''); setActiveCategory('All'); }} className="mt-6 px-6 py-2.5 bg-primary text-on-primary rounded-full font-bold text-sm">
              {t('stories.resetFilters', 'Reset Filters')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.filter(v => !v.featured).map((video, i) => (
              <VideoCard key={video.id} video={video} index={i} onPlay={setPlayingVideo} />
            ))}
          </div>
        )}

        {/* ── Impact Stats ── */}
        <section className="mt-24 py-16 bg-gradient-to-br from-emerald-900 to-emerald-800 rounded-2xl px-8 text-center">
          <h2 className="text-2xl font-headline font-bold text-white mb-12">{t('stories.collectiveImpact', 'Collective Impact')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            {[
              { value: '3.2M+', label: t('stories.patientsServed', 'Patients Served') },
              { value: '1,200+', label: t('stories.villagesCovered', 'Villages Covered') },
              { value: '10k+', label: t('stories.workersTrained', 'Workers Trained') },
              { value: '12', label: t('stories.statesReached', 'States Reached') },
            ].map(({ value, label }) => (
              <div key={label}>
                <span className="block text-4xl md:text-5xl font-headline font-extrabold text-primary-fixed mb-2">{value}</span>
                <span className="text-emerald-200/80 uppercase tracking-widest text-xs font-bold">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-primary rounded-2xl p-10 flex flex-col justify-between gap-6">
            <div>
              <span className="material-symbols-outlined text-primary-fixed text-4xl mb-4 block" style={{ fontVariationSettings: "'FILL' 1" }}>volunteer_activism</span>
              <h3 className="text-2xl font-headline font-bold text-on-primary mb-2">{t('stories.joinMission', 'Join the Mission')}</h3>
              <p className="text-on-primary/80 leading-relaxed">{t('stories.joinMissionDesc', 'Become an ASHA worker or PHC partner and help extend care to the last mile.')}</p>
            </div>
            <button onClick={() => navigate('/signup')} className="self-start px-8 py-3 bg-white text-primary font-bold rounded-full hover:bg-primary-fixed transition-all shadow-md">
              {t('getStarted', 'Get Started')}
            </button>
          </div>
          <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-10 flex flex-col justify-between gap-6">
            <div>
              <span className="material-symbols-outlined text-primary text-4xl mb-4 block" style={{ fontVariationSettings: "'FILL' 1" }}>edit_note</span>
              <h3 className="text-2xl font-headline font-bold text-on-surface mb-2">{t('stories.shareStory', 'Share Your Story')}</h3>
              <p className="text-on-surface-variant leading-relaxed">{t('stories.shareStoryDesc', "Are you a health worker with a story to tell? We'd love to feature your impact.")}</p>
            </div>
            <button className="self-start px-8 py-3 border-2 border-primary text-primary font-bold rounded-full hover:bg-primary hover:text-on-primary transition-all">
              {t('stories.submitStory', 'Submit Your Story')}
            </button>
          </div>
        </section>
      </main>

      {/* ── Video Modal ── */}
      {playingVideo && <VideoModal video={playingVideo} onClose={() => setPlayingVideo(null)} />}
    </div>
  );
}

