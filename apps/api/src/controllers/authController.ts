import type { Request, Response } from "express";
import { registroSchema, invitarSchema } from "../validation/empresa.js";
import { registroIndividualSchema } from "../validation/liquidacion.js";
import { registrarEmpresa, registrarIndividual, invitarColaborador, asegurarPerfilIndividual } from "../services/authService.js";
import { ErrorConflicto } from "../services/empleadosService.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export async function registro(req: Request, res: Response) {
  const parseo = registroSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const { usuario, empresa } = await registrarEmpresa(parseo.data);
    res.status(201).json({ usuario, empresa });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo registrar" });
  }
}

export async function registroIndividual(req: Request, res: Response) {
  const parseo = registroIndividualSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const usuario = await registrarIndividual(parseo.data);
    res.status(201).json({ usuario });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo registrar" });
  }
}

// No usa requiereAuth a propósito: ese middleware exige que el perfil Usuario
// YA exista (403 si no) — precisamente lo que este endpoint tiene que crear
// la primera vez que alguien entra con Google (Supabase Auth ya lo autenticó,
// pero nunca pasó por registrarIndividual). Valida el JWT directo.
export async function perfilIndividual(req: Request, res: Response) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Falta el header Authorization" });
    return;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Sesión inválida o expirada" });
    return;
  }
  const nombreFallback =
    (data.user.user_metadata?.full_name as string | undefined) ??
    (data.user.user_metadata?.name as string | undefined) ??
    data.user.email ??
    "Usuario";
  try {
    const usuario = await asegurarPerfilIndividual(data.user.id, data.user.email, nombreFallback);
    res.json({ usuario });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo crear el perfil" });
  }
}

export async function invitar(req: Request, res: Response) {
  const parseo = invitarSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }
  const empleadoId = Number(req.params.id);
  try {
    const resultado = await invitarColaborador(empleadoId, parseo.data.email);
    res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo invitar" });
  }
}
