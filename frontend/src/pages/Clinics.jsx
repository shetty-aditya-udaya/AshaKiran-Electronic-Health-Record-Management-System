import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import { toast } from 'react-hot-toast';
import { fallbackClinics } from '../data/fallbackClinics.js';
import { useTranslation } from 'react-i18next';

// ── Helpers ────────────────────────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'AshaKiran-App' } }
    );
    const d = await res.json();
    return d.address?.city || d.address?.town || d.address?.village || d.address?.suburb || 'your area';
  } catch {
    return 'your area';
  }
}

async function fetchFromOverpass(lat, lng) {
  const r = 5000;
  const query = `
    [out:json][timeout:30];
    (
      node["amenity"~"hospital|clinic|health_centre|doctors"](around:${r},${lat},${lng});
      way["amenity"~"hospital|clinic|health_centre|doctors"](around:${r},${lat},${lng});
    );
    out center;
  `;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();
  return data.elements
    .map((el) => {
      const tags = el.tags || {};
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (!elLat || !elLng) return null;
      return {
        id: el.id,
        name: tags.name || tags['name:en'] || 'Health Center',
        type:
          tags.amenity === 'hospital'
            ? 'Hospital'
            : tags.amenity === 'doctors'
            ? 'Doctor'
            : 'Clinic',
        latitude: elLat,
        longitude: elLng,
        phone: tags.phone || tags['contact:phone'] || null,
        address: tags['addr:street']
          ? `${tags['addr:street']}${tags['addr:city'] ? ', ' + tags['addr:city'] : ''}`
          : tags['addr:full'] || null,
      };
    })
    .filter(Boolean)
    .slice(0, 30);
}

// ── Custom Icons ───────────────────────────────────────────────────────────────

const makeUserIcon = () =>
  L.divIcon({
    html: `<div style="width:16px;height:16px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(37,99,235,0.25)"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const makeClinicIcon = () =>
  L.divIcon({
    html: `<div style="width:14px;height:14px;background:#16a34a;border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25)"></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

// ── Component ──────────────────────────────────────────────────────────────────

export default function Clinics() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('idle'); // idle | locating | fetching | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [clinics, setClinics] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [detectedCity, setDetectedCity] = useState('');
  const [manualQuery, setManualQuery] = useState('');

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layerGroup = useRef(null);
  const resultsRef = useRef(null);

  // ── Init Leaflet ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current, { zoomControl: true }).setView(
      [20.5937, 78.9629],
      5
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(mapInstance.current);
    layerGroup.current = L.layerGroup().addTo(mapInstance.current);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // ── Update markers whenever location/clinics change ────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !layerGroup.current) return;
    layerGroup.current.clearLayers();
    const bounds = [];

    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], { icon: makeUserIcon() })
        .addTo(layerGroup.current)
        .bindPopup(`<b>📍 ${t('youAreHerePopup', 'You are here')}</b>`);
      bounds.push([userLocation.lat, userLocation.lng]);
    }

    clinics.forEach((c) => {
      L.marker([c.latitude, c.longitude], { icon: makeClinicIcon() })
        .addTo(layerGroup.current)
        .bindPopup(
          `<div style="min-width:160px"><b>${c.name}</b><br/><span style="color:#555;font-size:12px">${t(c.type.toLowerCase(), c.type)}${c.distance != null ? ' · ' + c.distance.toFixed(1) + ' km' : ''}</span></div>`
        );
      bounds.push([c.latitude, c.longitude]);
    });

    if (bounds.length > 1) {
      mapInstance.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else if (userLocation) {
      mapInstance.current.setView([userLocation.lat, userLocation.lng], 14);
    }
  }, [userLocation, clinics, t]);

  // ── GPS location ──────────────────────────────────────────────────────────
  const doGPS = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });

  // ── Search after we have lat/lng ─────────────────────────────────────────
  const doSearch = async (lat, lng) => {
    setStatus('fetching');
    console.log("User location:", { lat, lng });
    try {
      let results = await fetchFromOverpass(lat, lng);
      console.log("Clinic API response (raw):", results);
      
      results = results
        .map((c) => ({ ...c, distance: haversine(lat, lng, c.latitude, c.longitude) }))
        .filter((c) => c.distance <= 50)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20);

      if (results.length === 0) {
        // fallback
        results = fallbackClinics
          .map((c) => ({ ...c, distance: haversine(lat, lng, c.latitude, c.longitude) }))
          .filter((c) => c.distance <= 50)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 20);
        console.log("Filtered clinics (fallback):", results);
        toast(t('clinicsFallbackToast', 'Showing nearby verified clinics'), { icon: 'ℹ️' });
      } else {
        console.log("Filtered clinics:", results);
        toast.success(t('clinicsFoundToast', 'Found {{count}} facilities nearby', { count: results.length }));
      }
      setClinics(results);
      setStatus('done');
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 300);
    } catch (err) {
      console.error(err);
      const results = fallbackClinics
        .map((c) => ({ ...c, distance: haversine(lat, lng, c.latitude, c.longitude) }))
        .filter((c) => c.distance <= 50)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20);
      console.log("Filtered clinics (fallback-error):", results);
      setClinics(results);
      setStatus('done');
      toast(t('clinicsErrorToast', 'Showing nearby verified clinics'), { icon: 'ℹ️' });
    }
  };

  // ── Handle GPS button ─────────────────────────────────────────────────────
  const handleGetLocation = async () => {
    setStatus('locating');
    setErrorMsg('');
    setClinics([]);
    try {
      const pos = await doGPS();
      const { latitude: lat, longitude: lng } = pos.coords;
      setUserLocation({ lat, lng });
      const city = await reverseGeocode(lat, lng);
      setDetectedCity(city);
      toast.success(t('gpsSuccessToast', 'GPS location detected: {{city}}', { city }));
      await doSearch(lat, lng);
    } catch (err) {
      if (err.code === 1) {
        setErrorMsg(t('gpsPermissionDenied', 'Location permission denied. Please allow access and try again.'));
      } else {
        setErrorMsg(t('gpsFailedMsg', 'GPS failed: {{msg}}. Try searching manually.', { msg: err.message }));
      }
      setStatus('error');
    }
  };

  // ── Manual search ─────────────────────────────────────────────────────────
  const handleManualSearch = async (e) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    setStatus('locating');
    setErrorMsg('');
    setClinics([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualQuery)}&format=json&limit=1`
      );
      const data = await res.json();
      if (!data?.length) {
        toast.error(t('locationNotFoundToast', 'Location not found. Try a different query.'));
        setStatus('idle');
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      setUserLocation({ lat, lng });
      setDetectedCity(data[0].display_name.split(',')[0]);
      await doSearch(lat, lng);
    } catch {
      toast.error(t('searchFailedToast', 'Search failed. Check your connection.'));
      setStatus('error');
      setErrorMsg(t('searchFailedMsg', 'Search failed. Please try again.'));
    }
  };

  const isLoading = status === 'locating' || status === 'fetching';

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen">
      <main className="pt-24 max-w-7xl mx-auto px-4 sm:px-8 pb-20">

        {/* Header */}
        <header className="mb-10">
          <h1 className="font-headline text-4xl md:text-5xl font-bold tracking-tight text-primary mb-3">
            {t('clinicsHeaderTitle', 'Clinics & Health Centers')}
          </h1>
          <p className="text-lg text-on-surface-variant leading-relaxed max-w-2xl mb-8">
            {t('clinicsHeaderDesc', 'Find nearby hospitals, clinics, and primary health centers using your GPS or search by location.')}
          </p>

          {/* Search bar */}
          <form
            onSubmit={handleManualSearch}
            className="flex flex-col md:flex-row gap-3 items-center bg-surface-container-lowest p-2 rounded-xl shadow-sm border border-outline-variant/10 max-w-3xl"
          >
            <div className="relative flex-grow w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-xl">search</span>
              <input
                type="text"
                className="w-full pl-12 pr-4 py-3.5 rounded-full border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface font-body text-sm"
                placeholder={t('clinicsSearchPlaceholder', 'Search by city, area, or pincode')}
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 md:flex-none px-8 py-3.5 bg-primary text-on-primary font-bold rounded-full hover:brightness-110 transition-all disabled:opacity-50 text-sm"
              >
                {status === 'locating' && !userLocation ? t('searching', 'Searching...') : t('search', 'Search')}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleGetLocation}
                className="flex-1 md:flex-none px-6 py-3.5 border-2 border-primary text-primary font-bold rounded-full hover:bg-primary hover:text-on-primary transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
                {t('gps', 'GPS')}
              </button>
            </div>
          </form>
        </header>

        {/* Status bar */}
        {status === 'locating' && (
          <div className="flex items-center gap-3 mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-sm font-medium">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            {t('fetchingGps', 'Fetching your GPS location...')}
          </div>
        )}
        {status === 'fetching' && (
          <div className="flex items-center gap-3 mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm font-medium">
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            {detectedCity ? t('searchingClinicsNear', 'Searching clinics near') + ` ${detectedCity}...` : t('searchingNearbyClinics', 'Searching nearby clinics...')}
          </div>
        )}
        {status === 'error' && errorMsg && (
          <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            <span className="material-symbols-outlined text-red-500 shrink-0">error</span>
            {errorMsg}
          </div>
        )}
        {status === 'done' && detectedCity && (
          <div className="flex items-center gap-2 mb-6 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
            {t('showingResultsNear', 'Showing results near')} <strong className="text-on-surface ml-1">{detectedCity}</strong>
            <span className="ml-2 px-2 py-0.5 bg-primary-container text-on-primary-container rounded-full text-xs font-bold">{clinics.length} {t('found', 'found')}</span>
          </div>
        )}

        {/* ── MAP ─────────────────────────────────────────────────────────── */}
        <div className="w-full h-[420px] md:h-[520px] rounded-2xl overflow-hidden shadow-xl border border-outline-variant/10 mb-10 relative">
          <div ref={mapRef} className="w-full h-full" />
          {/* GPS button overlay */}
          <button
            onClick={handleGetLocation}
            disabled={isLoading}
            className="absolute top-4 right-4 z-[1000] w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-on-surface hover:text-primary transition-colors disabled:opacity-50"
            title={t('useMyLocation', 'Use my location')}
          >
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
          </button>
          {/* Empty map overlay */}
          {status === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 z-[500] pointer-events-none">
              <div className="bg-white/90 backdrop-blur px-6 py-4 rounded-2xl shadow-xl text-center pointer-events-auto">
                <span className="material-symbols-outlined text-4xl text-primary mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }}>location_searching</span>
                <p className="font-bold text-on-surface text-sm mb-3">{t('findClinicsNearYou', 'Find clinics near you')}</p>
                <button
                  onClick={handleGetLocation}
                  className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-full text-sm hover:brightness-110 transition-all"
                >
                  {t('useMyGps', 'Use My GPS')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RESULTS ─────────────────────────────────────────────────────── */}
        <div ref={resultsRef}>
          {status === 'done' && clinics.length === 0 && (
            <div className="py-20 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/5">
              <span className="material-symbols-outlined text-5xl text-outline block mb-3">search_off</span>
              <h3 className="font-bold text-on-surface mb-1">{t('noClinicsFound', 'No clinics found nearby')}</h3>
              <p className="text-on-surface-variant text-sm">{t('noClinicsFoundDesc', 'Try expanding your search area or searching by city name.')}</p>
            </div>
          )}

          {clinics.length > 0 && (
            <>
              <h2 className="font-headline text-2xl font-bold text-on-surface mb-6">
                {t('nearbyFacilities', 'Nearby Facilities')}
                {detectedCity && <span className="text-primary font-normal text-lg ml-2">{t('near', 'near')} {detectedCity}</span>}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {clinics.map((clinic) => (
                  <article
                    key={clinic.id}
                    className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10 shadow-sm hover:shadow-md hover:border-primary/20 transition-all group"
                  >
                    {/* Type badge + distance */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full ${
                          clinic.type === 'Hospital'
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-tertiary-container text-on-tertiary-container'
                        }`}
                      >
                        {t(clinic.type.toLowerCase(), clinic.type)}
                      </span>
                      {clinic.distance != null && (
                        <span className="text-xs font-semibold text-primary flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">near_me</span>
                          {clinic.distance.toFixed(1)} km
                        </span>
                      )}
                    </div>

                    <h3 className="font-headline text-base font-bold text-on-surface group-hover:text-primary transition-colors mb-1 leading-snug">
                      {clinic.name}
                    </h3>

                    {clinic.address && (
                      <p className="text-xs text-on-surface-variant flex items-start gap-1 mb-4">
                        <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">location_on</span>
                        {clinic.address}
                      </p>
                    )}

                    {/* Services */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      <span className="px-2 py-1 bg-surface-container-low rounded-full text-[10px] font-medium text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">medical_services</span> {t('generalCare', 'General Care')}
                      </span>
                      {clinic.type === 'Hospital' && (
                        <span className="px-2 py-1 bg-surface-container-low rounded-full text-[10px] font-medium text-on-surface-variant flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">baby_changing_station</span> {t('maternal', 'Maternal')}
                        </span>
                      )}
                      {clinic.type === 'Clinic' && (
                        <span className="px-2 py-1 bg-surface-container-low rounded-full text-[10px] font-medium text-on-surface-variant flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">vaccines</span> {t('vaccination', 'Vaccination')}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (mapInstance.current)
                            mapInstance.current.setView([clinic.latitude, clinic.longitude], 16);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="flex-1 py-2.5 bg-primary/10 text-primary text-sm font-bold rounded-full hover:bg-primary hover:text-on-primary transition-all"
                      >
                        {t('viewOnMap', 'View on Map')}
                      </button>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 bg-surface-container-high text-on-surface-variant rounded-full hover:bg-surface-container-highest transition-colors flex items-center justify-center"
                        title={t('getDirections', 'Get directions')}
                      >
                        <span className="material-symbols-outlined text-lg">directions</span>
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
