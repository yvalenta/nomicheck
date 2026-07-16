import { createClient } from "@supabase/supabase-js";

// Cliente con service-role — solo en el servidor, nunca en el navegador
// (SDD.md §08). Se usa para verificar JWTs y para operaciones de Auth que
// requieren privilegios (crear usuario en registro, invitar colaborador).
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
