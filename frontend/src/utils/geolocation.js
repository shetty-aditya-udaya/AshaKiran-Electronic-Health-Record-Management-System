/**
 * Geolocation Utility for AshaKiran
 * Prioritizes High-Accuracy GPS with IP Fallback and reverse geocoding.
 */

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
};

/**
 * Fetch human-readable address from coordinates using OpenStreetMap Nominatim
 */
export async function fetchAddressFromCoords(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'AshaKiran-Healthcare-App'
        }
      }
    );
    if (!response.ok) throw new Error('Nominatim API error');
    const data = await response.json();
    
    // Extract city, town, or village
    return {
      address: data.display_name,
      city: data.address.city || data.address.town || data.address.village || data.address.suburb || 'Unknown Location'
    };
  } catch (error) {
    console.error('Reverse Geocoding failed:', error);
    return { address: '', city: 'Remote Location' };
  }
}

/**
 * Fallback to IP-based location if GPS fails
 */
export async function fetchIPLocation() {
  try {
    // Using ipapi.co as it has good accuracy and supports HTTPS
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('IP Geolocation API error');
    const data = await response.json();
    return {
      lat: data.latitude,
      lng: data.longitude,
      city: data.city,
      isApproximate: true
    };
  } catch (error) {
    console.error('IP Geolocation failed:', error);
    // Absolute fallback: Center of Bangalore (Bengaluru) as requested by user
    return { lat: 12.9716, lng: 77.5946, city: 'Bengaluru (Estimated)', isApproximate: true };
  }
}

/**
 * Main entry point: Get precise location with fallback
 */
export async function getPreciseLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      fetchIPLocation().then(resolve);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const geoInfo = await fetchAddressFromCoords(latitude, longitude);
        resolve({
          lat: latitude,
          lng: longitude,
          city: geoInfo.city,
          address: geoInfo.address,
          isApproximate: false
        });
      },
      async (error) => {
        console.warn('GPS identification failed, falling back to IP:', error.message);
        const ipLoc = await fetchIPLocation();
        resolve(ipLoc);
      },
      GEOLOCATION_OPTIONS
    );
  });
}
