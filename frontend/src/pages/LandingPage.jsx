import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Instagram, 
  Github, 
  Play, 
  ArrowRight, 
  Activity, 
  Heart, 
  ShieldAlert, 
  Award, 
  Users, 
  CheckCircle2, 
  Star, 
  Plus, 
  Minus, 
  Database,
  Volume2,
  FileText,
  Mail,
  Shield,
  LayoutDashboard,
  UserSquare2,
  BellRing,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useTranslation } from 'react-i18next';

export default function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Carousel Slider indices
  const [carouselIndex, setCarouselIndex] = useState(0);
  // FAQ Active indices
  const [faqOpenIndex, setFaqOpenIndex] = useState(null);
  // Video Player Play Mock
  const [isPlaying, setIsPlaying] = useState(false);
  // Premium carousel: selected card for the centered spotlight
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const autoPlayRef = useRef(null);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Premium Carousel Gestures & Circular Loop Helpers
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef(0);
  const hasDragged = useRef(false);

  const numCards = 8;
  const getCircularDistance = (i, activeIdx) => {
    let diff = i - activeIdx;
    while (diff < -numCards / 2) diff += numCards;
    while (diff > numCards / 2) diff -= numCards;
    return diff;
  };

  const handleDragStart = (clientX) => {
    dragStartX.current = clientX;
    setIsDraggingState(true);
    setDragOffset(0);
    hasDragged.current = false;
    stopAutoPlay();
  };

  const handleDragMove = (clientX) => {
    if (!dragStartX.current) return;
    const diff = dragStartX.current - clientX;
    setDragOffset(diff);
    if (Math.abs(diff) > 8) {
      hasDragged.current = true;
    }
  };

  const handleDragEnd = () => {
    if (!dragStartX.current) return;
    setIsDraggingState(false);
    
    const isMobile = windowWidth < 768;
    const spacing = isMobile ? 180 : windowWidth < 1024 ? 250 : 310;
    const threshold = spacing * 0.25;

    if (dragOffset > threshold) {
      nextCard();
    } else if (dragOffset < -threshold) {
      prevCard();
    } else {
      startAutoPlay();
    }
    
    setDragOffset(0);
    dragStartX.current = 0;
  };

  const handleTouchStart = (e) => {
    handleTouchStartRef.current = e.touches[0].clientX; // backup
    handleDragStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    handleDragMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  const handleMouseDown = (e) => {
    handleDragStart(e.clientX);
  };

  const handleMouseMove = (e) => {
    handleDragMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  const handleMouseLeave = () => {
    if (dragStartX.current) {
      handleDragEnd();
    }
  };

  const handleTouchStartRef = useRef(0);

  const handleGetStarted = () => {
    navigate('/signup');
  };

  // Auto-rotating slider for health workflow cards
  useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % 4);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const toggleFaq = (index) => {
    setFaqOpenIndex(faqOpenIndex === index ? null : index);
  };

  // ── Premium infinite-scroll carousel cards ────────────────────────────────
  const carouselCards = [
    {
      title: t("carouselMchTitle", "Maternal & Child Tracking"),
      subtext: t("carouselMchSubtext", "Seamlessly log antenatal care, child nutrition metrics, and vital sign updates across your entire assigned zone."),
      gradient: "linear-gradient(135deg, #0d6e6e 0%, #0a4f4f 100%)",
      glowColor: "rgba(13,110,110,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#5eead4",
      accentColor: "#99f6e4",
      tag: t("carouselMchTag", "MCH"),
      icon: <Heart className="w-9 h-9" />,
      illustration: "/illustrations/maternal_care.jpg",
      isPhoto: true,
    },
    {
      title: t("carouselVaxTitle", "Immunization Schedules"),
      subtext: t("carouselVaxSubtext", "Auto-generate digital reminders for infant vaccine schedules, preventing coverage gaps across remote villages."),
      gradient: "linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)",
      glowColor: "rgba(30,64,175,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#93c5fd",
      accentColor: "#bfdbfe",
      tag: t("carouselVaxTag", "Vaccination"),
      icon: <Activity className="w-9 h-9" />,
      illustration: "/illustrations/immunization_photo.png",
      isPhoto: true,
    },
    {
      title: t("carouselNcdTitle", "NCD Screening Logs"),
      subtext: t("carouselNcdSubtext", "Screen, flag, and follow up on hypertension, diabetes and chronic conditions with structured follow-up pipelines."),
      gradient: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
      glowColor: "rgba(124,58,237,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#c4b5fd",
      accentColor: "#ddd6fe",
      tag: t("carouselNcdTag", "NCD"),
      icon: <ShieldAlert className="w-9 h-9" />,
      illustration: "/illustrations/ncd_screening.png",
      isPhoto: true,
    },
    {
      title: t("carouselSyncTitle", "Offline Sync Support"),
      subtext: t("carouselSyncSubtext", "Work seamlessly in zero-connectivity zones. All data syncs automatically the moment connectivity is restored."),
      gradient: "linear-gradient(135deg, #065f46 0%, #064e3b 100%)",
      glowColor: "rgba(6,95,70,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#6ee7b7",
      accentColor: "#a7f3d0",
      tag: t("carouselSyncTag", "Offline-First"),
      icon: <Database className="w-9 h-9" />,
      illustration: "/illustrations/offline_sync.png",
      isPhoto: true,
    },
    {
      title: t("carouselVisitTitle", "Smart Visit Scheduling"),
      subtext: t("carouselVisitSubtext", "Plan, assign, and track home visits with intelligent prioritization based on patient risk levels and urgency."),
      gradient: "linear-gradient(135deg, #92400e 0%, #78350f 100%)",
      glowColor: "rgba(146,64,14,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#fbbf24",
      accentColor: "#fde68a",
      tag: t("carouselVisitTag", "Scheduling"),
      icon: <BellRing className="w-9 h-9" />,
      illustration: "/illustrations/visit_scheduling.png",
      isPhoto: true,
    },
    {
      title: t("carouselRecordsTitle", "Secure Patient Records"),
      subtext: t("carouselRecordsSubtext", "End-to-end encrypted patient profiles with complete medical history, prescriptions, and lab reports at your fingertips."),
      gradient: "linear-gradient(135deg, #be123c 0%, #9f1239 100%)",
      glowColor: "rgba(190,18,60,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#fca5a5",
      accentColor: "#fecdd3",
      tag: t("carouselRecordsTag", "Records"),
      icon: <Shield className="w-9 h-9" />,
      illustration: "/illustrations/patient_records.png",
      isPhoto: true,
    },
    {
      title: t("carouselAccessTitle", "Rural Healthcare Access"),
      subtext: t("carouselAccessSubtext", "Bridging the gap between urban medical expertise and rural doorsteps through digital-first community health delivery."),
      gradient: "linear-gradient(135deg, #0369a1 0%, #075985 100%)",
      glowColor: "rgba(3,105,161,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#7dd3fc",
      accentColor: "#bae6fd",
      tag: t("carouselAccessTag", "Access"),
      icon: <Users className="w-9 h-9" />,
      illustration: "/illustrations/rural_healthcare.png",
      isPhoto: true,
    },
    {
      title: t("carouselReportsTitle", "Medical Reports & Advice"),
      subtext: t("carouselReportsSubtext", "Capture and share structured medical reports with doctors instantly, enabling faster diagnosis and treatment plans."),
      gradient: "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)",
      glowColor: "rgba(79,70,229,0.55)",
      iconBg: "rgba(255,255,255,0.15)",
      iconColor: "#a5b4fc",
      accentColor: "#c7d2fe",
      tag: t("carouselReportsTag", "Reports"),
      icon: <ClipboardList className="w-9 h-9" />,
      illustration: "/illustrations/medical_reports.png",
      isPhoto: true,
    },
  ];


  // Spotlight carousel autoplay
  const NUM = carouselCards.length;
  const startAutoPlay = () => {
    stopAutoPlay();
    autoPlayRef.current = setInterval(() => {
      setSpotlightIdx(prev => (prev + 1) % NUM);
    }, 3800);
  };
  const stopAutoPlay = () => {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
  };
  useEffect(() => {
    startAutoPlay();
    return () => stopAutoPlay();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function prevCard() { setSpotlightIdx(p => (p - 1 + NUM) % NUM); startAutoPlay(); }
  function nextCard() { setSpotlightIdx(p => (p + 1) % NUM); startAutoPlay(); }

  // Old 4-card carousel (kept for reference, no longer rendered)
  const cards = [
    {
      title: "Medical Advice",
      subtext: "Get expert guidance and healthcare consultation metrics.",
      bg: "bg-purple-600 text-white border-purple-500",
      accentBg: "bg-purple-800/80",
      textColor: "text-purple-100",
      icon: <ClipboardList className="w-8 h-8 text-purple-200" />
    },
    {
      title: "Maternal & Child Tracking",
      subtext: "Seamlessly log antenatal care, child nutrition indices, and vital tracking updates.",
      bg: "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200/60 dark:border-slate-800/80",
      accentBg: "bg-teal-50 dark:bg-teal-950/40",
      textColor: "text-slate-500 dark:text-slate-400",
      icon: <Heart className="w-8 h-8 text-rose-500" />
    },
    {
      title: "Immunization Schedules",
      subtext: "Automate digital reminders for infant vaccine schedules across villages.",
      bg: "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200/60 dark:border-slate-800/80",
      accentBg: "bg-teal-50 dark:bg-teal-950/40",
      textColor: "text-slate-500 dark:text-slate-400",
      icon: <Activity className="w-8 h-8 text-teal-600" />
    },
    {
      title: "NCD Screening Logs",
      subtext: "Screen, flag, and follow up on chronic conditions in your assigned zone.",
      bg: "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200/60 dark:border-slate-800/80",
      accentBg: "bg-teal-50 dark:bg-teal-950/40",
      textColor: "text-slate-500 dark:text-slate-400",
      icon: <ShieldAlert className="w-8 h-8 text-amber-500" />
    }
  ];

  const faqs = [
    {
      question: t("faqOfflineRegQ", "How does AshaKiran handle offline patient data registration?"),
      answer: t("faqOfflineRegA", "AshaKiran utilizes a secure, offline-first IndexedDB container directly inside your browser. All registration details, medical logs, and timeline updates are stored locally and will sync automatically in the background the moment an internet connection is established.")
    },
    {
      question: t("faqRealtimeLogsQ", "Can medical officers view real-time logs updated by ground workers?"),
      answer: t("faqRealtimeLogsA", "Yes. Once synced, ground worker logs are pushed directly into our secure cloud databases, generating instant dashboard updates. Medical officers can review high-risk flags, refer patients, and analyze field metrics in real-time.")
    },
    {
      question: t("faqEncryptedRecordsQ", "How are patient health records securely encrypted on the platform?"),
      answer: t("faqEncryptedRecordsA", "AshaKiran ensures high protection using AES-256 equivalent browser-level database isolation, end-to-end encrypted transit pathways (HTTPS/TLS), and secure server credentials. Unauthorized access is strictly blocked to maintain client confidentiality.")
    },
    {
      question: t("faqLocalLanguagesQ", "Does the app support local languages for demographic entry?"),
      answer: t("faqLocalLanguagesA", "Absolutely. AshaKiran is custom-built with multi-language localizer frameworks supporting Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, and English, allowing workers to operate in their regional dialects effortlessly.")
    }
  ];

  return (
    <div className="bg-[#F8FAFC] text-slate-800 dark:bg-slate-950 dark:text-slate-100 font-body selection:bg-teal-100 selection:text-teal-900 min-h-screen transition-colors duration-300">
      
      <main className="pb-24">
        {/* ==========================================
            SECTION 1: HERO FOLD (EXACT PRESERVATION)
            ========================================== */}
        <section className="relative min-h-[85vh] flex items-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              alt="Health Worker in Rural Setting" 
              className="w-full h-full object-cover object-[center_20%]" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuARd5qvRGZiqcuMXt2CcKn_Gj0JDuX07l6eNEhkggVXqGEtiWEKxq92WVbXDx0HlK2VrTwK9NwoLyoI3KcFfgnKRaATGZzTnevdJiYteGRN-652naHvywqwLVuUcK8GKMBRjihGxLt2cO7Z3htS3QssGgHfD7RbDTonVuU4NGr_TH8GnuBLqy1gyC1dLCGpC_lQycRe4czjiPDs-XY57D-Vtqu8J5wx0KZZ_KthWPdQlDu4LqqWMUxSo3QW1Z0CAfC6fmk4kcgUaPfb"
            />
            <div className="absolute inset-0 bg-black/40"></div>
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 w-full">
            <div className="max-w-3xl">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-headline font-bold text-white leading-[1.1] mb-8 tracking-tight text-shadow-hero">
                {t('heroTitleBefore', 'Empowering ASHA Workers, ')}<span className="text-teal-300">{t('heroTitleSpan', 'Transforming')}</span>{t('heroTitleAfter', ' Rural Healthcare')}
              </h1>
              <p className="text-white/90 max-w-xl mb-10 leading-relaxed text-lg md:text-xl font-medium text-shadow-hero">
                {t('heroSub', 'Providing the tools and training to bring quality healthcare to every doorstep in rural communities. Together, we heal and grow.')}
              </p>
              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={handleGetStarted}
                  className="bg-[#0F766E] text-white px-8 py-4 rounded-full font-headline font-bold text-lg hover:bg-teal-800 active:scale-95 transition-all shadow-lg flex items-center gap-2"
                >
                  {t('getStarted')}
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => navigate('/stories')} 
                  className="bg-white/20 backdrop-blur-md border border-white/30 text-white px-8 py-4 rounded-full font-headline font-bold text-lg hover:bg-white/30 transition-all flex items-center gap-2"
                >
                  {t('watchStory')}
                  <Play className="w-5 h-5 fill-white" />
                </button>
              </div>
            </div>
          </div>
        </section>


        {/* ==========================================
            SECTION 4: HEALTH NURTURED WITH CARE — PREMIUM CAROUSEL
            ========================================== */}
        <section
          style={{ background: 'linear-gradient(160deg, #F7F2E8 0%, #F2EBD9 50%, #F7F2E8 100%)' }}
          className="relative py-24 overflow-hidden border-b border-[#E8DFC8] dark:border-slate-800 transition-colors dark:!bg-none dark:bg-slate-950"
        >
          {/* Decorative warm orbs */}
          <div
            className="pointer-events-none absolute -top-24 -left-24 w-[480px] h-[480px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-32 -right-16 w-[400px] h-[400px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(13,110,110,0.07) 0%, transparent 70%)' }}
          />

          <div className="max-w-7xl mx-auto px-6">
            {/* ── Section Header ── */}
            <div className="text-center max-w-2xl mx-auto mb-14 carousel-card-entrance">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-headline font-extrabold text-slate-900 dark:text-white leading-[1.08] tracking-tight mb-5">
                {t('healthNurtured', 'Health nurtured')}<br />
                <span style={{ background: 'linear-gradient(90deg, #0F766E, #5b21b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {t('withCare', 'with care')}
                </span>
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed font-light max-w-xl mx-auto">
                {t('healthNurturedSub', 'Customized digital workflows that go beyond basic logs — delivering community wellbeing at scale.')}
              </p>
            </div>

            {/* ── Spotlight Carousel ── */}
            {/*
                KEY LAYOUT: Each card wrapper has paddingTop: '58px' to reserve
                space for the illustration bubble. The bubble is absolutely
                positioned relative to the card top edge with 50% overlap.
            */}
            {/* ── Spotlight Carousel ── */}
            {/*
                KEY LAYOUT: Absolute-positioned dynamic closed-loop track.
                Each card wrapper has paddingTop: '68px' to reserve space for
                the overlapping illustration bubble.
            */}
            <style>{`
              @keyframes activeGlowPulse {
                0% {
                  box-shadow: 0 25px 60px -15px rgba(13,110,110,0.3), 0 0 0 0px rgba(94, 234, 212, 0.4);
                }
                50% {
                  box-shadow: 0 35px 75px -10px rgba(13,110,110,0.5), 0 0 30px 10px rgba(94, 234, 212, 0.7);
                }
                100% {
                  box-shadow: 0 25px 60px -15px rgba(13,110,110,0.3), 0 0 0 0px rgba(94, 234, 212, 0.4);
                }
              }
              .active-pulse-glow {
                animation: activeGlowPulse 3s infinite ease-in-out;
              }
              .carousel-card-3d {
                backface-visibility: hidden;
                transform-style: preserve-3d;
              }
            `}</style>

            <div
              className="relative flex items-end justify-center w-full select-none"
              style={{ 
                minHeight: windowWidth < 768 ? '440px' : '480px', 
                overflow: 'visible',
                touchAction: 'pan-y'
              }}
              onMouseEnter={stopAutoPlay}
              onMouseLeave={() => {
                if (!isDraggingState) {
                  startAutoPlay();
                }
              }}
            >
              {/* Prev button */}
              <button
                onClick={prevCard}
                className="absolute left-2 md:left-4 z-30 w-12 h-12 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-md shadow-md border border-[#E8DFC8]/60 hover:shadow-lg hover:bg-white hover:scale-110 active:scale-95 transition-all duration-200"
                aria-label="Previous card"
                style={{ bottom: '40%' }}
              >
                <ChevronLeft className="w-5 h-5 text-slate-700" />
              </button>

              {/* Card track (Absolute-positioned viewport wrapper) */}
              <div
                className="carousel-spotlight-track relative w-full h-full"
                style={{ 
                  overflow: 'visible',
                  minHeight: windowWidth < 768 ? '400px' : '430px',
                  cursor: isDraggingState ? 'grabbing' : 'grab',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {carouselCards.map((card, i) => {
                  const d = getCircularDistance(i, spotlightIdx);
                  const absOffset = Math.abs(d);
                  const isActive = d === 0;
                  const isAdjacent = absOffset === 1;
                  const isEdge = absOffset === 2;
                  const isVisible = absOffset <= 2;

                  // Spacings and Dimensions based on device width
                  const isMobile = windowWidth < 768;
                  const spacing = isMobile ? 185 : windowWidth < 1024 ? 260 : 320;
                  const cardWidth = isMobile ? '255px' : windowWidth < 1024 ? '300px' : '350px';

                  // Dynamic Styles
                  let scale = 1.0;
                  let opacity = 1.0;
                  let zIndex = 1;
                  let blurPx = 0;
                  let filter = 'none';

                  if (isActive) {
                    scale = 1.1;
                    opacity = 1.0;
                    zIndex = 10;
                    blurPx = 0;
                    filter = 'none';
                  } else if (isAdjacent) {
                    scale = 0.92;
                    opacity = 0.52;
                    zIndex = 5;
                    blurPx = 0.5;
                    filter = 'grayscale(20%) saturate(75%) brightness(95%)';
                  } else if (isEdge) {
                    scale = 0.82;
                    opacity = 0.22;
                    zIndex = 2;
                    blurPx = 2;
                    filter = 'grayscale(55%) saturate(40%) brightness(80%)';
                  } else {
                    scale = 0.7;
                    opacity = 0;
                    zIndex = 0;
                    blurPx = 4;
                    filter = 'grayscale(100%) saturate(0%) opacity(0)';
                  }

                  // Precise Translation Math incorporating Drag Visual Feedback
                  const translationX = d * spacing - dragOffset;

                  const isJpg = !!card.isPhoto;
                  const bubbleSizeActive = isJpg ? 140 : 120;
                  const bubbleTopActive = 68 - bubbleSizeActive / 2;
                  
                  const bubbleSizeInactive = isJpg ? 105 : 90;
                  const bubbleTopInactive = 68 - bubbleSizeInactive / 2;

                  return (
                    <div
                      key={i}
                      onClick={(e) => {
                        if (hasDragged.current) {
                          e.preventDefault();
                          return;
                        }
                        setSpotlightIdx(i);
                        startAutoPlay();
                      }}
                      className="absolute bottom-0 flex-shrink-0 cursor-pointer group carousel-card-3d"
                      style={{
                        paddingTop: '68px',
                        width: cardWidth,
                        zIndex,
                        opacity,
                        left: '50%',
                        transform: `translateX(-50%) translateX(${translationX}px) scale(${scale})`,
                        transformOrigin: 'bottom center',
                        filter: blurPx > 0 ? `blur(${blurPx}px) ${filter}` : filter,
                        transition: isDraggingState 
                          ? 'transform 0.05s cubic-bezier(0.1, 0.8, 0.2, 1), opacity 0.15s ease-out'
                          : 'transform 0.7s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.7s ease, filter 0.7s ease, z-index 0.7s ease',
                        pointerEvents: isVisible ? 'auto' : 'none',
                        overflow: 'visible',
                      }}
                    >
                      {/* ── Illustration bubble — floats above card ── */}
                      <div
                        className="absolute left-1/2 transition-all duration-700"
                        style={{
                          top: `${isActive ? bubbleTopActive : bubbleTopInactive}px`,
                          transform: 'translateX(-50%)',
                          zIndex: 20,
                        }}
                      >
                        {/* Ambient soft shadow */}
                        <div
                          className="absolute rounded-full pointer-events-none transition-all duration-700"
                          style={{
                            inset: '-4px',
                            background: isJpg ? 'rgba(13,110,110,0.06)' : 'rgba(0,0,0,0.03)',
                            filter: 'blur(6px)',
                            opacity: isActive ? 1 : 0.5,
                          }}
                        />
                        {/* Bubble Container */}
                        <div
                          className="relative flex items-center justify-center rounded-full overflow-hidden transition-all duration-700 ease-out group-hover:scale-105 group-hover:rotate-1"
                          style={{
                            width:  `${isActive ? bubbleSizeActive : bubbleSizeInactive}px`,
                            height: `${isActive ? bubbleSizeActive : bubbleSizeInactive}px`,
                            background: 'rgba(255,255,255,0.98)',
                            border: isActive 
                              ? (isJpg ? '4px solid rgba(255,255,255,1)' : '3px solid rgba(255,255,255,1)')
                              : (isJpg ? '3px solid rgba(255,255,255,1)' : '2px solid rgba(255,255,255,1)'),
                            boxShadow: isActive 
                              ? (isJpg 
                                  ? '0 12px 32px rgba(13,110,110,0.18), 0 4px 12px rgba(0,0,0,0.08)' 
                                  : '0 8px 24px rgba(13,110,110,0.08), 0 2px 8px rgba(0,0,0,0.06)')
                              : (isJpg 
                                  ? '0 10px 24px rgba(13,110,110,0.12), 0 3px 8px rgba(0,0,0,0.05)' 
                                  : '0 6px 16px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.03)'),
                          }}
                        >
                          {/* Inner shimmer */}
                          <div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            style={{ background: 'radial-gradient(circle at 33% 28%, rgba(255,255,255,0.85) 0%, transparent 55%)' }}
                          />
                          <img
                            src={card.illustration}
                            alt={card.title}
                            className={isJpg 
                              ? "w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110" 
                              : "w-[86%] h-[86%] object-contain"
                            }
                            draggable="false"
                            style={{ position: 'relative', zIndex: 1 }}
                          />
                        </div>
                      </div>

                      {/* ── Unified Morphing Card Body ── */}
                      <div
                        className={`relative overflow-hidden rounded-[36px] flex flex-col justify-between items-center text-center w-full transition-all duration-700 ${isActive ? 'active-pulse-glow' : ''}`}
                        style={{
                          background: isActive ? card.gradient : 'rgba(255,255,255,0.92)',
                          border: isActive ? 'none' : '1px solid rgba(255,255,255,0.95)',
                          boxShadow: isActive 
                            ? 'none' 
                            : '0 12px 32px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)',
                          minHeight: isMobile ? '365px' : '395px',
                          padding: isActive 
                            ? (isJpg ? '98px 28px 36px' : '92px 28px 36px') 
                            : (isJpg ? '82px 22px 28px' : '76px 22px 28px'),
                          transition: 'background 0.7s, border 0.7s, padding 0.7s, box-shadow 0.7s',
                        }}
                      >
                        {/* Top accent strip (only visible when inactive) */}
                        <div
                          className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[36px] transition-opacity duration-700"
                          style={{ 
                            background: card.gradient,
                            opacity: isActive ? 0 : 1 
                          }}
                        />

                        {/* Decorative inner glow (only visible when active) */}
                        <div
                          className="absolute pointer-events-none transition-opacity duration-700"
                          style={{
                            top: '-40px', right: '-40px',
                            width: '160px', height: '160px',
                            borderRadius: '50%',
                            background: `radial-gradient(circle, ${card.accentColor}24 0%, transparent 70%)`,
                            opacity: isActive ? 1 : 0
                          }}
                        />

                        <div className="flex flex-col items-center flex-1 justify-center w-full transition-all duration-700">
                          {/* Tag pill */}
                          <span
                            className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest mb-3 select-none transition-all duration-700"
                            style={{ 
                              background: isActive ? 'rgba(255,255,255,0.16)' : 'transparent', 
                              color: isActive ? card.accentColor : card.glowColor.replace('0.55','1'), 
                              border: isActive ? '1px solid rgba(255,255,255,0.20)' : '1px solid transparent' 
                            }}
                          >
                            {card.tag}
                          </span>

                          {/* Title */}
                          <h3 
                            className="text-lg font-extrabold font-headline leading-snug select-none transition-colors duration-700"
                            style={{ color: isActive ? '#ffffff' : '#1e293b' }}
                          >
                            {card.title}
                          </h3>

                          {/* Accent divider line */}
                          <div 
                            className="w-10 h-[1.5px] rounded-full my-3 transition-colors duration-700" 
                            style={{ background: isActive ? card.accentColor : '#e2e8f0' }} 
                          />

                          {/* Description */}
                          <p 
                            className="text-xs leading-relaxed font-light line-clamp-3 select-none transition-colors duration-700"
                            style={{ color: isActive ? 'rgba(255,255,255,0.85)' : '#64748b' }}
                          >
                            {card.subtext}
                          </p>
                        </div>

                        {/* CTA */}
                        <span
                          className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest mt-4 select-none transition-all duration-700"
                          style={{ 
                            color: isActive ? card.accentColor : card.glowColor.replace('0.55','1'),
                            opacity: isActive ? 1 : 0,
                            transform: isActive ? 'translateY(0)' : 'translateY(10px)',
                          }}
                        >
                          {t('learnMore', 'Learn more')} <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Next button */}
              <button
                onClick={nextCard}
                className="absolute right-2 md:right-4 z-30 w-12 h-12 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-md shadow-md border border-[#E8DFC8]/60 hover:shadow-lg hover:bg-white hover:scale-110 active:scale-95 transition-all duration-200"
                aria-label="Next card"
                style={{ bottom: '40%' }}
              >
                <ChevronRight className="w-5 h-5 text-slate-700" />
              </button>
            </div>

            {/* ── Dot indicators ── */}
            <div className="flex justify-center gap-2 mt-12">
              {carouselCards.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setSpotlightIdx(i); startAutoPlay(); }}
                  aria-label={`Go to card ${i + 1}`}
                  style={{
                    width:        spotlightIdx === i ? '28px' : '7px',
                    height:       '7px',
                    borderRadius: '999px',
                    background:   spotlightIdx === i
                      ? carouselCards[spotlightIdx].glowColor.replace('0.55', '1')
                      : 'rgba(0,0,0,0.15)',
                    transition: 'all 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>

          </div>
        </section>


        <section 
          style={{ background: 'linear-gradient(160deg, #F2F9FF 0%, #EAF6FF 100%)' }}
          className="py-24 px-6 border-b border-[#E0ECFC] dark:border-slate-900 transition-colors dark:!bg-none dark:bg-slate-950/20"
        >
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
              
              {/* Left Column */}
              <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-headline font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight">
                  {t('ecosystemTitle', 'A comprehensive digital health ecosystem for field workers')}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-lg font-light leading-relaxed">
                  {t('ecosystemSub', 'Delivering holistic field-testing tools, coordination aids, and reporting dashboards directly to your palm.')}
                </p>
              </div>

              {/* Right Column (Connected 2x2 Stacked Mosaic Grid) */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-1.5 overflow-visible">
                {[
                  {
                    title: t("mosaicOfflineTitle", "Offline First Architecture"),
                    desc: t("mosaicOfflineDesc", "Ensure field productivity even in zero-connectivity zones with reliable automatic background sync."),
                    icon: <Database className="w-6 h-6 text-teal-600" />
                  },
                  {
                    title: t("mosaicHighRiskTitle", "High-Risk Case Flags"),
                    desc: t("mosaicHighRiskDesc", "Instantly categorize and prioritize high-risk patients using automated color-coded alerts."),
                    icon: <ShieldAlert className="w-6 h-6 text-rose-500" />
                  },
                  {
                    title: t("mosaicReferralTitle", "Instant Referral Pipeline"),
                    desc: t("mosaicReferralDesc", "Streamline patient transfers and share digital health records instantly with local medical officers."),
                    icon: <ArrowRight className="w-6 h-6 text-indigo-500" />
                  },
                  {
                    title: t("mosaicIncentiveTitle", "Incentive & Target Analytics"),
                    desc: t("mosaicIncentiveDesc", "Real-time transparent logs tracking your daily targets, schedules, and active task progress."),
                    icon: <Award className="w-6 h-6 text-amber-500" />
                  }
                ].map((block, i) => {
                  // Determine diagonal card color synchronization
                  const isColorA = i === 0 || i === 3;
                  const bgClass  = isColorA 
                    ? "bg-[#F6F1FF] dark:bg-indigo-950/20 border-[#EBE0FF]/70 dark:border-indigo-900/40" 
                    : "bg-[#FAF8F5] dark:bg-slate-950/40 border-[#EFEBE4]/60 dark:border-slate-900/60";

                  // Asymmetrical borders: highly round only the outer grid corners
                  const roundClass = i === 0 
                    ? "rounded-tl-[44px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[16px]" 
                    : i === 1 
                    ? "rounded-tr-[44px] rounded-tl-[16px] rounded-bl-[16px] rounded-br-[16px]" 
                    : i === 2 
                    ? "rounded-bl-[44px] rounded-tl-[16px] rounded-tr-[16px] rounded-br-[16px]" 
                    : "rounded-br-[44px] rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px]";

                  return (
                    <div 
                      key={i} 
                      className={`group relative p-10 md:p-12 border flex flex-col justify-between gap-6 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03] hover:shadow-2xl hover:shadow-teal-900/5 hover:z-20 hover:border-slate-300/60 ${bgClass} ${roundClass}`}
                      style={{ minHeight: '270px' }}
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-100/60 dark:bg-slate-800/60 flex items-center justify-center shadow-inner transition-transform duration-500 group-hover:scale-[1.08] group-hover:rotate-[3deg]">
                        {block.icon}
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-xl font-bold font-headline text-slate-900 dark:text-white transition-all duration-500 group-hover:scale-[1.04] group-hover:translate-x-1 origin-left">
                          {block.title}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-light leading-relaxed transition-all duration-500 group-hover:scale-[1.01] origin-left">
                          {block.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 6: FIELD TESTIMONIALS CAROUSEL
            ========================================== */}
        <section 
          style={{ background: 'linear-gradient(160deg, #FFF9E8 0%, #FFF5D0 100%)' }}
          className="py-24 px-6 border-b border-[#FCEEC8] dark:border-slate-900 transition-colors dark:!bg-none dark:bg-slate-950/20"
        >
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-headline font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t('testimonialHeaderTitle', 'Hear from our dedicated ASHA Workers themselves!')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed font-light">
                {t('testimonialHeaderSub', 'Delivering the same high level of health service from district hospitals to remote doorsteps.')}
              </p>
            </div>
 
            {/* Testimonial Box */}
            <div className="relative bg-white dark:bg-slate-900 border border-white/60 dark:border-slate-800/80 rounded-3xl p-8 md:p-12 shadow-xl shadow-amber-900/5 overflow-hidden">
              {/* Subtle warm glow inside card */}
              <div 
                className="absolute -top-32 -left-32 w-[320px] h-[320px] rounded-full pointer-events-none" 
                style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.04) 0%, transparent 70%)' }}
              />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                {/* Left Column: Inspiring Quote */}
                <div className="lg:col-span-7 space-y-6">
                  <span className="text-6xl font-headline text-[#0F766E]/20 block h-4 select-none">“</span>
                  <p className="text-xl md:text-2xl font-light leading-relaxed text-slate-700 dark:text-slate-300 italic">
                    {t('sujataQuote', 'Before AshaKiran, tracking maternal records across three villages meant massive physical ledgers, missing sync pages, and delayed referral coordinates. Now, everything stays securely inside my phone, even when network connectivity drops.')}
                  </p>
                  <span className="text-6xl font-headline text-[#0F766E]/20 block text-right h-4 select-none">”</span>
                </div>
 
                {/* Right Column: Profile details */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm flex flex-col justify-between items-center text-center">
                  <div className="w-20 h-20 rounded-full overflow-hidden shadow-inner mb-4 border-2 border-teal-50">
                    <img 
                      src="/sujata.jpg" 
                      alt={t('sujataName', 'Sujata')} 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">{t('sujataName', 'Sujata')}</h4>
                  <p className="text-sm text-[#0F766E] font-medium mb-4">{t('sujataRole', 'ASHA Worker, Bengaluru Rural District')}</p>
                  
                  {/* Rating Graphic */}
                  <div className="flex gap-1 justify-center text-amber-500">
                    {[...Array(5)].map((_, idx) => (
                      <Star key={idx} className="w-5 h-5 fill-current" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
 
          </div>
        </section>

        <section 
          style={{ background: 'linear-gradient(160deg, #FFF4F7 0%, #FFEFF4 100%)' }}
          className="py-24 px-6 border-b border-[#FCE2EB] dark:border-slate-900 transition-colors dark:!bg-none dark:bg-slate-950/20"
        >
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
              
              {/* Left Column: Headline */}
              <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
                <span className="inline-block px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#0F766E] text-xs font-bold uppercase tracking-wider">
                  {t('supportFaqs', 'Support & FAQS')}
                </span>
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-headline font-extrabold text-slate-900 dark:text-white leading-[1.15] tracking-tight">
                  {t('faqsTitle', "Questions? We're glad you asked")}
                </h2>
                <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center gap-3 text-[#0F766E]">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-bold text-sm tracking-wide uppercase">{t('communityCentered', 'Community Centered')}</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-light leading-relaxed">
                    {t('supportFaqText', 'Need further technical coordinates? Browse the guidelines, or reach out to our program managers directly from your dashboard profile logs.')}
                  </p>
                </div>
              </div>

              {/* Right Column: Accordion */}
              <div className="lg:col-span-7 space-y-4">
                {faqs.map((faq, index) => {
                  const isOpen = faqOpenIndex === index;
                  return (
                    <div 
                      key={index}
                      className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm"
                    >
                      <button
                        onClick={() => toggleFaq(index)}
                        className="w-full flex justify-between items-center p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <span className="font-bold font-headline text-lg text-slate-800 dark:text-slate-200 leading-snug">
                          {faq.question}
                        </span>
                        <div className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[#0F766E]">
                          {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </div>
                      </button>
                      <div 
                        className={`transition-all duration-300 overflow-hidden ${
                          isOpen ? 'max-h-60 border-t border-slate-100 dark:border-slate-800/80' : 'max-h-0'
                        }`}
                      >
                        <p className="p-6 text-sm text-slate-500 dark:text-slate-400 font-light leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full py-12 px-8 bg-slate-50 dark:bg-gray-900 border-t border-slate-200/60 transition-colors duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-7xl mx-auto">
          <div className="space-y-4">
            <BrandLogo size="sm" mode="light" className="!px-0" />
            <p className="font-body text-sm text-slate-600 dark:text-slate-400">{t('copyright', '© 2026 AshaKiran Healthcare. Care. Empower. Uplift. All rights reserved.')}</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4 md:justify-end">
            <Link to="/programmes" className="font-body text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 transition-all">{t('programs', 'Programs')}</Link>
            <Link to="/contact" className="font-body text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 transition-all">{t('contactUs', 'Contact Us')}</Link>
            <Link to="/privacy" className="font-body text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 transition-all">{t('privacyPolicy', 'Privacy Policy')}</Link>
          </div>
        </div>
      </footer>

      {/* ==========================================
          SECTION 8: GLOBAL STICKY BOTTOM NAVIGATION
          ========================================== */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-8px_30px_rgb(0,0,0,0.06)] px-4 py-3 md:py-4 transition-colors">
        <div className="max-w-4xl mx-auto flex justify-around items-center">
          
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#0F766E] dark:text-slate-400 dark:hover:text-teal-400 transition-colors"
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] font-bold tracking-wider uppercase font-headline">{t('dashboard', 'Dashboard')}</span>
          </button>

          <button 
            onClick={() => navigate('/patients')}
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#0F766E] dark:text-slate-400 dark:hover:text-teal-400 transition-colors"
          >
            <UserSquare2 className="w-5 h-5" />
            <span className="text-[10px] font-bold tracking-wider uppercase font-headline">{t('patients', 'Patients')}</span>
          </button>

          <button 
            onClick={() => navigate('/reports')}
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#0F766E] dark:text-slate-400 dark:hover:text-teal-400 transition-colors"
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-bold tracking-wider uppercase font-headline">{t('reports', 'Reports')}</span>
          </button>

          <button 
            onClick={() => navigate('/reminders')}
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#0F766E] dark:text-slate-400 dark:hover:text-teal-400 transition-colors"
          >
            <BellRing className="w-5 h-5" />
            <span className="text-[10px] font-bold tracking-wider uppercase font-headline">{t('reminders', 'Reminders')}</span>
          </button>

        </div>
      </div>

    </div>
  );
}
