// The project's URL and public anon key: what the browser uses when VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY aren't set, and what api/attendance-photo uses to read with the caller's
// own access. Both are public (they ship in the site's JavaScript). Kept free of imports so the
// Vercel Functions can load it too.
export const DEFAULT_SUPABASE_URL = 'https://ieovepkcseytccagzedg.supabase.co'
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imllb3ZlcGtjc2V5dGNjYWd6ZWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjU1NDUsImV4cCI6MjEwNDc0MTU0NX0.OMZEAONl3XoSwjb_RhYo70fYXThONXVBGQLlGF-OQ7s'
