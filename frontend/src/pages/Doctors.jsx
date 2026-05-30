import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import { toast } from 'react-hot-toast';
import { generateNearbyDoctors } from '../data/fallbackDoctors.js';
import { getDistance } from '../utils/distance.js';
import { useTranslation } from 'react-i18next';

// ── Reverse geocode city name ────────────────────────────────────────────────
async function reverseGeocodeCity(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'AshaKiran-App' } }
    );
    const d = await res.json();
    return (
      d.address?.suburb ||
      d.address?.neighbourhood ||
      d.address?.city ||
      d.address?.town ||
      d.address?.village ||
      'your area'
    );
  } catch {
    return 'your area';
  }
}

const SPECIALIZATIONS = [
  "All Specializations",
  "General Physician", "Pediatrician", "Gynecologist", "Cardiologist",
  "Dermatologist", "Orthopedic", "ENT Specialist", "Neurologist",
  "Ophthalmologist", "Psychiatrist"
];

const RADIUS_CHIPS = [5, 10, 15, 25];

const CACHE_KEY = 'ashakiran_nearby_doctors_cache';

// ── Custom map icons ─────────────────────────────────────────────────────────
const makeUserIcon = () =>
  L.divIcon({
    html: `<div style="width:18px;height:18px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 6px rgba(37,99,235,0.20)"></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const makeDoctorIcon = (isNearest = false) =>
  L.divIcon({
    html: `<div style="width:${isNearest ? 16 : 13}px;height:${isNearest ? 16 : 13}px;background:${isNearest ? '#0F766E' : '#16a34a'};border:2.5px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.25)"></div>`,
    className: '',
    iconSize: [isNearest ? 16 : 13, isNearest ? 16 : 13],
    iconAnchor: [isNearest ? 8 : 6, isNearest ? 8 : 6],
  });

// ── Distance label ────────────────────────────────────────────────────────────
function fmtDist(km, t) {
  if (km < 1) return `${Math.round(km * 1000)} m ${t('away', 'away')}`;
  return `${km.toFixed(1)} km ${t('away', 'away')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Doctors() {
  const { t } = useTranslation();
  const [loading, setLoading]         = useState(false);
  const [searched, setSearched]       = useState(false);
  const [doctors, setDoctors]         = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [detectedCity, setDetectedCity] = useState('');
  const [radius, setRadius]           = useState(10);
  const [selectedSpec, setSelectedSpec] = useState("All Specializations");
  const [showBookingModal, setShowBookingModal] = useState(null);
  const [fromCache, setFromCache]     = useState(false);

  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef  = useRef(null);
  const resultsRef     = useRef(null);
  // keep a stable reference to latest search params for the map-click handler
  const searchParamsRef = useRef({ radius: 10, spec: "All Specializations" });

  useEffect(() => {
    searchParamsRef.current = { radius, spec: selectedSpec };
  }, [radius, selectedSpec]);

  // ── Init Leaflet ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = L.map(mapRef.current).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(mapInstanceRef.current);
    layerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ── Core search ───────────────────────────────────────────────────────────────
  const performSearch = useCallback((lat, lng, currentRadius, spec) => {
    setLoading(true);
    setSearched(true);

    // Generate doctors anchored to user's actual position
    const allDocs = generateNearbyDoctors(lat, lng).map(doc => ({
      ...doc,
      distance: getDistance(lat, lng, doc.latitude, doc.longitude)
    }));

    let filtered = allDocs;
    if (spec !== "All Specializations") {
      filtered = filtered.filter(doc => doc.specialization === spec);
    }

    const inRange = filtered
      .filter(doc => doc.distance <= currentRadius)
      .sort((a, b) => a.distance - b.distance);

    if (inRange.length > 0) {
      setDoctors(inRange);
      setFromCache(false);
      // Persist to cache
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lng, docs: inRange, ts: Date.now() }));
      } catch {}
      toast.success(t('docsFoundRadiusToast', 'Found {{count}} doctors within {{radius}}km', { count: inRange.length, radius: currentRadius }));
    } else {
      // No results in radius — try expanding
      const expanded = filtered
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);
      if (expanded.length > 0) {
        setDoctors(expanded);
        toast(t('docsNearestToast', 'No {{spec}} within {{radius}}km. Showing nearest {{count}}.', { spec: spec === "All Specializations" ? "doctors" : spec, radius: currentRadius, count: expanded.length }), { icon: 'ℹ️' });
      } else {
        setDoctors([]);
        toast.error(t('noDocsFilterToast', 'No doctors found for these filters.'));
      }
      setFromCache(false);
    }

    setLoading(false);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
  }, [t]);

  // ── Update map markers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    layerGroupRef.current.clearLayers();
    const bounds = [];

    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], { icon: makeUserIcon() })
        .addTo(layerGroupRef.current)
        .bindPopup(`<b>📍 ${t('youAreHerePopup', 'You are here')}</b>`);
      bounds.push([userLocation.lat, userLocation.lng]);
    }

    doctors.forEach((doc, i) => {
      L.marker([doc.latitude, doc.longitude], { icon: makeDoctorIcon(i === 0) })
        .addTo(layerGroupRef.current)
        .bindPopup(`
          <div style="min-width:160px;font-family:Inter,sans-serif">
            <b style="color:#0F766E">${doc.name}</b><br/>
            <span style="font-size:11px;color:#64748b">${t(doc.specialization.toLowerCase().replace(/\s+/g, ''), doc.specialization)}</span><br/>
            <span style="font-size:11px;color:#16a34a;font-weight:600">${fmtDist(doc.distance, t)}</span><br/>
            <span style="font-size:11px;color:#94a3b8">${doc.hospital}</span>
          </div>
        `);
      bounds.push([doc.latitude, doc.longitude]);
    });

    if (bounds.length > 1) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    } else if (userLocation) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 13);
    }
  }, [userLocation, doctors, t]);

  // ── GPS detection ─────────────────────────────────────────────────────────────
  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error(t('gpsNotSupported', 'Geolocation not supported by your browser.'));
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const loc = { lat, lng };
        setUserLocation(loc);
        const city = await reverseGeocodeCity(lat, lng);
        setDetectedCity(city);
        toast.success(t('gpsSuccessToast', 'GPS location detected: {{city}}', { city }));
        performSearch(lat, lng, searchParamsRef.current.radius, searchParamsRef.current.spec);
      },
      (err) => {
        setLoading(false);
        if (err.code === 1) {
          // Permission denied — try cache
          try {
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
            if (cached && cached.docs?.length) {
              setDoctors(cached.docs);
              setSearched(true);
              setFromCache(true);
              toast(t('locationDeniedCache', 'Location denied. Showing last known nearby doctors.'), { icon: '📦' });
              return;
            }
          } catch {}
          toast.error(t('gpsPermissionDenied', 'Location permission denied. Please enable GPS.'));
        } else {
          toast.error(t('gpsError', 'GPS error. Please try again.'));
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }, [performSearch, t]);

  const handleApplyFilters = useCallback(() => {
    if (!userLocation) {
      handleGetLocation();
      return;
    }
    performSearch(userLocation.lat, userLocation.lng, radius, selectedSpec);
  }, [userLocation, radius, selectedSpec, performSearch, handleGetLocation]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-50 min-h-screen font-sans">
      <main className="pt-20">

        {/* ── Header ── */}
        <section className="w-full bg-gradient-to-br from-[#0F766E] to-[#0a5958] py-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none" />
          <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10">
            <h1 className="text-3xl md:text-5xl font-extrabold mb-2 tracking-tight">{t('findNearbyDoctors', 'Find Nearby Doctors')}</h1>
            <p className="text-sm md:text-base opacity-80 max-w-xl mb-6">
              {t('doctorsHeaderDesc', 'Real-time healthcare professional discovery for ASHA field workers.')}
            </p>

            {/* Location status banner */}
            {detectedCity && (
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur border border-white/25 rounded-full px-4 py-2 text-sm font-semibold mb-6">
                <span className="text-base">📍</span>
                {t('showingNearbyDoctorsNear', 'Showing nearby doctors near')} <span className="text-emerald-200 ml-1">{detectedCity}</span>
              </div>
            )}

            {/* Filter bar */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 shadow-2xl border border-white/20 max-w-4xl">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">

                {/* Specialization */}
                <div className="md:col-span-4 flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-75">{t('specialization', 'Specialization')}</label>
                  <div className="relative">
                    <select
                      value={selectedSpec}
                      onChange={e => setSelectedSpec(e.target.value)}
                      className="w-full bg-white text-slate-800 border-none rounded-xl text-sm p-3.5 outline-none appearance-none shadow-sm font-medium"
                    >
                      {SPECIALIZATIONS.map(s => <option key={s} value={s}>{t(s.toLowerCase().replace(/\s+/g, ''), s)}</option>)}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">expand_more</span>
                  </div>
                </div>

                {/* Radius chips */}
                <div className="md:col-span-5 flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-75">{t('searchRadius', 'Search Radius')}</label>
                  <div className="flex gap-2 flex-wrap">
                    {RADIUS_CHIPS.map(r => (
                      <button
                        key={r}
                        onClick={() => setRadius(r)}
                        className={`flex-1 min-w-[52px] py-2.5 rounded-xl text-xs font-bold transition-all border ${
                          radius === r
                            ? 'bg-white text-[#0F766E] border-white shadow-md'
                            : 'bg-white/15 text-white border-white/25 hover:bg-white/25'
                        }`}
                      >
                        {r}km
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search button */}
                <div className="md:col-span-3">
                  <button
                    onClick={handleApplyFilters}
                    disabled={loading}
                    className="w-full bg-white text-[#0F766E] font-bold py-3.5 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading
                      ? <><span className="w-4 h-4 border-2 border-[#0F766E]/30 border-t-[#0F766E] rounded-full animate-spin"/> {t('finding', 'Finding...')}</>
                      : <><span className="material-symbols-outlined text-base">search</span> {t('search', 'Search')}</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-28 mt-6">

          {/* ── Map ── */}
          <div className="w-full h-[380px] md:h-[480px] rounded-[2rem] overflow-hidden shadow-2xl border-4 border-white mb-8 relative">
            <div ref={mapRef} className="w-full h-full bg-slate-100" />

            {/* GPS button */}
            <button
              onClick={handleGetLocation}
              disabled={loading}
              className="absolute top-5 right-5 z-[1000] w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-600 hover:text-[#0F766E] transition-all disabled:opacity-50"
              title={t('detectMyLocation', 'Detect my location')}
            >
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
            </button>

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 z-[2000] bg-white/50 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-white px-8 py-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-3">
                  <div className="w-9 h-9 border-4 border-[#0F766E]/20 border-t-[#0F766E] rounded-full animate-spin" />
                  <p className="font-bold text-slate-700 text-sm">{t('findingDoctorsPrompt', 'Finding nearby healthcare professionals…')}</p>
                </div>
              </div>
            )}

            {/* Start-state prompt */}
            {!searched && !loading && (
              <div className="absolute inset-0 z-[1500] bg-black/5 flex items-center justify-center pointer-events-none">
                <div className="bg-white/95 backdrop-blur px-8 py-7 rounded-3xl shadow-2xl text-center pointer-events-auto max-w-xs">
                  <div className="w-14 h-14 bg-[#0F766E]/10 rounded-full flex items-center justify-center mx-auto mb-4 text-[#0F766E]">
                    <span className="material-symbols-outlined text-3xl">explore</span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-base mb-2">{t('discoverNearbyDoctors', 'Discover Nearby Doctors')}</h3>
                  <p className="text-slate-500 text-xs mb-5 leading-relaxed">
                    {t('allowLocationAccessPrompt', 'Allow location access to instantly find healthcare professionals within your selected radius.')}
                  </p>
                  <button
                    onClick={handleGetLocation}
                    className="px-8 py-3 text-white font-bold rounded-2xl hover:shadow-lg transition-all text-sm"
                    style={{ background: 'linear-gradient(135deg,#0F766E,#0d9488)' }}
                  >
                    📍 {t('useMyLocation', 'Use My Location')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Results ── */}
          <div ref={resultsRef} className="space-y-6">
            {searched && (
              <>
                {/* Results header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-800">
                      {doctors.length > 0 ? `${doctors.length} ` + t('doctorsFound', 'Doctors Found') : t('noDoctorsFound', 'No Doctors Found')}
                      {detectedCity && (
                        <span className="text-[#0F766E] font-normal text-base ml-2">
                          {t('near', 'near')} {detectedCity}
                        </span>
                      )}
                    </h2>
                    {fromCache && (
                      <p className="text-xs text-amber-600 font-semibold mt-0.5">
                        📦 {t('locationDeniedCache', 'Location denied. Showing last available nearby doctors.')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {t('withinRadius', 'Within')} {radius}km
                  </div>
                </div>

                {doctors.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {doctors.map((doc, i) => (
                      <article
                        key={doc.id}
                        className="bg-white rounded-3xl p-5 shadow-sm hover:shadow-xl border border-slate-100 hover:border-[#0F766E]/20 transition-all group flex flex-col"
                      >
                        {/* Doctor info row */}
                        <div className="flex gap-4 mb-4">
                          <div className="relative shrink-0">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                              <img
                                alt={doc.name}
                                src={doc.image}
                                className="w-full h-full object-cover"
                                onError={e => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name)}&background=E6F2F2&color=0F766E&size=64`; }}
                              />
                            </div>
                            {i === 0 && (
                              <div className="absolute -top-1.5 -left-1.5 bg-[#F59E0B] text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center shadow">
                                1
                              </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 bg-emerald-500 w-3.5 h-3.5 rounded-full border-2 border-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-800 group-hover:text-[#0F766E] transition-colors text-sm leading-tight">{doc.name}</h3>
                            <p className="text-[11px] font-bold text-[#0F766E] mt-0.5 truncate">{t(doc.specialization.toLowerCase().replace(/\s+/g, ''), doc.specialization)}</p>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{doc.hospital}</p>
                          </div>
                        </div>

                        {/* Distance — THE critical display */}
                        <div className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-3 py-2 mb-3 border border-slate-100">
                          <span className="material-symbols-outlined text-[#0F766E] text-sm">location_on</span>
                          <span className="text-xs font-extrabold text-[#0F766E]">{fmtDist(doc.distance, t)}</span>
                          <span className="text-[10px] text-slate-400 ml-auto">{doc.type}</span>
                        </div>

                        {/* Tags */}
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                          <div className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {t(doc.availability.toLowerCase().replace(/\s+/g, ''), doc.availability)}
                          </div>
                          <div className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border border-amber-100">
                            <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            {doc.rating}
                          </div>
                          {doc.consultMode && (
                            <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-[10px] font-bold border border-blue-100">
                              {t(doc.consultMode.toLowerCase().replace(/\s+/g, ''), doc.consultMode)}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2.5 mt-auto">
                          <button
                            onClick={() => {
                              if (mapInstanceRef.current) {
                                mapInstanceRef.current.setView([doc.latitude, doc.longitude], 16);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }
                            }}
                            className="py-2.5 bg-slate-50 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-100 transition-all border border-slate-200"
                          >
                            {t('viewOnMap', 'View on Map')}
                          </button>
                          <button
                            onClick={() => setShowBookingModal(doc)}
                            className="py-2.5 text-white font-bold text-xs rounded-xl shadow hover:shadow-lg hover:brightness-105 transition-all"
                            style={{ background: 'linear-gradient(135deg,#0F766E,#0d9488)' }}
                          >
                            {t('requestConsult', 'Request Consult')}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
                    <span className="material-symbols-outlined text-5xl text-slate-300 block mb-4">person_search</span>
                    <h3 className="font-bold text-lg text-slate-700 mb-1">
                      {t('noNearbyDoctorsFoundWithin', 'No nearby doctors found within')} {radius}km
                    </h3>
                    <p className="text-slate-400 text-sm mb-6">
                      {t('tryExpandingRadiusDesc', 'Try expanding the radius or changing the specialization.')}
                    </p>
                    <button
                      onClick={() => { setRadius(r => Math.min(r + 10, 25)); handleApplyFilters(); }}
                      className="px-8 py-3 text-white font-bold rounded-2xl text-sm"
                      style={{ background: 'linear-gradient(135deg,#0F766E,#0d9488)' }}
                    >
                      {t('expandRadius', 'Expand Radius')} (+10km)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Booking Modal ── */}
        {showBookingModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={() => setShowBookingModal(null)} />
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg relative z-10 overflow-hidden">
              <div className="p-8 text-white relative" style={{ background: 'linear-gradient(135deg,#0F766E,#0a5958)' }}>
                <button
                  onClick={() => setShowBookingModal(null)}
                  className="absolute top-5 right-5 w-9 h-9 bg-white/15 rounded-full flex items-center justify-center hover:bg-white/25 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-1">{t('healthcareConsultation', 'Healthcare Consultation')}</p>
                <h2 className="text-2xl font-extrabold mb-5">{t('bookAppointment', 'Book Appointment')}</h2>
                <div className="flex items-center gap-3 p-4 bg-white/10 rounded-2xl border border-white/15">
                  <div className="w-12 h-12 rounded-xl bg-white/20 overflow-hidden flex-shrink-0">
                    <img
                      alt={showBookingModal.name}
                      src={showBookingModal.image}
                      className="w-full h-full object-cover"
                      onError={e => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(showBookingModal.name)}&background=0F766E&color=fff&size=48`; }}
                    />
                  </div>
                  <div>
                    <p className="font-bold text-base leading-tight">{showBookingModal.name}</p>
                    <p className="text-sm text-emerald-200">{t(showBookingModal.specialization.toLowerCase().replace(/\s+/g, ''), showBookingModal.specialization)}</p>
                    <p className="text-xs text-white/60 mt-0.5">{fmtDist(showBookingModal.distance, t)}</p>
                  </div>
                </div>
              </div>
              <form className="p-8 space-y-5" onSubmit={(e) => {
                e.preventDefault();
                toast.success(t('requestSentToast', "Consultation request sent!"));
                setShowBookingModal(null);
              }}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{t('preferredDate', 'Preferred Date')}</label>
                    <input type="date" required className="w-full bg-slate-50 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#0F766E] outline-none border border-slate-200" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{t('preferredTime', 'Preferred Time')}</label>
                    <select required className="w-full bg-slate-50 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#0F766E] outline-none border border-slate-200">
                      <option>{t('morning', 'Morning (9AM-12PM)')}</option>
                      <option>{t('afternoon', 'Afternoon (1PM-4PM)')}</option>
                      <option>{t('evening', 'Evening (5PM-8PM)')}</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{t('consultationReason', 'Consultation Reason')}</label>
                  <textarea placeholder={t('describeConcernPlaceholder', 'Describe the concern briefly…')} className="w-full bg-slate-50 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#0F766E] outline-none h-28 resize-none border border-slate-200" />
                </div>
                <button type="submit" className="w-full text-white font-bold py-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all text-sm" style={{ background: 'linear-gradient(135deg,#0F766E,#0d9488)' }}>
                  {t('requestAppointment', 'Request Appointment')}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .leaflet-container { font-family: 'Inter', sans-serif; }
        .leaflet-popup-content-wrapper { border-radius: 1.25rem !important; padding: 0 !important; box-shadow: 0 12px 24px rgba(0,0,0,0.12); }
        .leaflet-popup-content { margin: 12px 14px !important; }
        .leaflet-popup-close-button { top: 8px !important; right: 8px !important; }
      `}} />
    </div>
  );
}
