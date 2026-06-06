// Dynamic API Base URL resolution:
// If VITE_API_BASE_URL is specified (e.g., in .env.production during production build), use it.
// Otherwise, default to empty string "" so that all requests are relative paths.
// Relative paths automatically resolve to the host domain (e.g. localhost:5173 or 192.168.x.y:5173 in dev,
// and ashakiran-frontend.vercel.app in production).
// This leverages Vite's dev proxy and Vercel's rewrites seamlessly, avoiding localhost mobile connection blocks and CORS preflight blocks.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
