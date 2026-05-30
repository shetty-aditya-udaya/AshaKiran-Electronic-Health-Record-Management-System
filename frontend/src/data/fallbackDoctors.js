/**
 * Generates a set of realistic "nearby" doctor entries
 * centered around the user's actual GPS coordinates.
 *
 * Offsets are in degrees — at Indian latitudes:
 *   0.001° lat ≈ 111m
 *   0.001° lng ≈ 98m
 *
 * So a 0.05° offset ≈ ~5km, 0.10° ≈ ~10km, 0.20° ≈ ~20km
 */

const DOCTOR_TEMPLATES = [
  {
    id: "dr1",
    name: "Dr. Rajesh Kumar",
    specialization: "General Physician",
    hospital: "Primary Health Centre",
    availability: "Available Now",
    rating: 4.8,
    type: "Government",
    phone: "+91 98765 43210",
    consultMode: "In-Person",
    latOffset: 0.018,
    lngOffset: 0.012,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=RajeshKumar&backgroundColor=b6e3f4"
  },
  {
    id: "dr2",
    name: "Dr. Sunita Sharma",
    specialization: "Pediatrician",
    hospital: "Child Welfare Clinic",
    availability: "9 AM – 5 PM",
    rating: 4.9,
    type: "Private",
    phone: "+91 98765 43211",
    consultMode: "In-Person & Video",
    latOffset: -0.024,
    lngOffset: 0.031,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=SunitaSharma&backgroundColor=ffd5dc"
  },
  {
    id: "dr3",
    name: "Dr. Amit Varma",
    specialization: "Cardiologist",
    hospital: "District Heart Care Centre",
    availability: "On Call",
    rating: 4.7,
    type: "Private",
    phone: "+91 98765 43212",
    consultMode: "In-Person",
    latOffset: 0.043,
    lngOffset: -0.022,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=AmitVarma&backgroundColor=c0aede"
  },
  {
    id: "dr4",
    name: "Dr. Priya Deshmukh",
    specialization: "Gynecologist",
    hospital: "Govt. Maternal Health Center",
    availability: "Available Now",
    rating: 4.9,
    type: "Government",
    phone: "+91 98765 43213",
    consultMode: "In-Person",
    latOffset: -0.011,
    lngOffset: -0.038,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=PriyaDeshmukh&backgroundColor=d1f0d1"
  },
  {
    id: "dr5",
    name: "Dr. Vikram Singh",
    specialization: "Orthopedic",
    hospital: "Joint & Bone Specialist Clinic",
    availability: "10 AM – 6 PM",
    rating: 4.6,
    type: "Private",
    phone: "+91 98765 43214",
    consultMode: "In-Person",
    latOffset: 0.062,
    lngOffset: 0.048,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=VikramSingh&backgroundColor=ffdfbf"
  },
  {
    id: "dr6",
    name: "Dr. Ananya Iyer",
    specialization: "Dermatologist",
    hospital: "Skin & Wellness Centre",
    availability: "Available Now",
    rating: 4.5,
    type: "Private",
    phone: "+91 98765 43215",
    consultMode: "In-Person & Video",
    latOffset: -0.053,
    lngOffset: 0.017,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=AnanyaIyer&backgroundColor=ffd5dc"
  },
  {
    id: "dr7",
    name: "Dr. Sameer Khan",
    specialization: "Neurologist",
    hospital: "District Neuro Hospital",
    availability: "2 PM – 8 PM",
    rating: 4.9,
    type: "Private",
    phone: "+91 98765 43216",
    consultMode: "In-Person",
    latOffset: 0.071,
    lngOffset: -0.055,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=SameerKhan&backgroundColor=b6e3f4"
  },
  {
    id: "dr8",
    name: "Dr. Meera Patil",
    specialization: "ENT Specialist",
    hospital: "Community Health Centre",
    availability: "Available Now",
    rating: 4.7,
    type: "Government",
    phone: "+91 98765 43217",
    consultMode: "In-Person",
    latOffset: -0.036,
    lngOffset: -0.021,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=MeeraPatil&backgroundColor=d1f0d1"
  },
  {
    id: "dr9",
    name: "Dr. Karan Singh",
    specialization: "Ophthalmologist",
    hospital: "Eye Vision Clinic",
    availability: "9 AM – 4 PM",
    rating: 4.8,
    type: "Private",
    phone: "+91 98765 43218",
    consultMode: "In-Person",
    latOffset: 0.028,
    lngOffset: 0.064,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=KaranSingh&backgroundColor=c0aede"
  },
  {
    id: "dr10",
    name: "Dr. Sneha Hegde",
    specialization: "Psychiatrist",
    hospital: "Mental Wellness Institute",
    availability: "By Appointment",
    rating: 4.9,
    type: "Private",
    phone: "+91 98765 43219",
    consultMode: "In-Person & Video",
    latOffset: -0.081,
    lngOffset: 0.041,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=SnehaHegde&backgroundColor=ffd5dc"
  },
  {
    id: "dr11",
    name: "Dr. Rahul Malhotra",
    specialization: "General Physician",
    hospital: "Taluk PHC Centre",
    availability: "Available Now",
    rating: 4.6,
    type: "Government",
    phone: "+91 98765 43220",
    consultMode: "In-Person",
    latOffset: 0.009,
    lngOffset: -0.014,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=RahulMalhotra&backgroundColor=ffdfbf"
  },
  {
    id: "dr12",
    name: "Dr. Kavita Joshi",
    specialization: "Gynecologist",
    hospital: "Govt. Women's Hospital",
    availability: "Available Now",
    rating: 4.8,
    type: "Government",
    phone: "+91 98765 43221",
    consultMode: "In-Person",
    latOffset: -0.019,
    lngOffset: 0.053,
    image: "https://api.dicebear.com/7.x/personas/svg?seed=KavitaJoshi&backgroundColor=d1f0d1"
  }
];

/**
 * Returns doctor list with coordinates anchored near userLat/userLng.
 * Each doctor gets a small random jitter so repeated calls look natural.
 */
export function generateNearbyDoctors(userLat, userLng) {
  return DOCTOR_TEMPLATES.map(doc => ({
    ...doc,
    latitude:  userLat + doc.latOffset + (Math.random() - 0.5) * 0.003,
    longitude: userLng + doc.lngOffset + (Math.random() - 0.5) * 0.003,
  }));
}

// Static fallback when no user location is available — Bengaluru center
export const fallbackDoctors = generateNearbyDoctors(12.9716, 77.5946);
