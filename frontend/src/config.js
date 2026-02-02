const defaultApiBase = import.meta.env.DEV ? "http://localhost:8000/api" : "/api";
export const API_BASE = import.meta.env.VITE_API_BASE ?? defaultApiBase;
