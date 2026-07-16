import { createClient } from "@supabase/supabase-js";

// Cliente de Auth únicamente — nunca se usa para queries de datos (SDD.md §04
// "supabase-js para datos en el frontend": NO). Todo acceso a datos pasa por
// apps/api con el JWT de esta sesión en el header Authorization.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
