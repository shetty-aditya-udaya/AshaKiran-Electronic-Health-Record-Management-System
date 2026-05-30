/**
 * Centralized API configuration file for frontend requests
 * Prioritizes Vite environment variables in production, falls back to local flask server
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
