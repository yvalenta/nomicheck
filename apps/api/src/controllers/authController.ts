import type { Request, Response } from "express";
import { registroSchema, invitarSchema, empresaActivaSchema } from "../validation/empresa.js";
import { registroIndividualSchema } from "../validation/liquidacion.js";
import {
  registrarEmpresa,
  registrarIndividual,
  invitarColaborador,
  asegurarPerfilIndividual,
  cambiarEmpresaActiva,
  salirDeVistaPlataforma,
  empresasDeUsuario,
} from "../services/authService.js";
import { ErrorConflicto } from "../services/empleadosService.js";
import { EMPRESA_SUSPENDIDA, NO_PERTENECES } from "../middleware/auth.js";
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

// "¿Quién soy?" — el frontend no conoce el rol real de la cuenta hasta
// autenticar (no hay 3 SPAs separadas por rol con lógica propia de sesión,
// pero ninguna sabía a qué portal pertenece la cuenta hasta que un fetch le
// daba 403). requiereAuth ya resolvió req.usuario; esto solo lo expone.
// `empresas` es la lista completa de membresías de la CUENTA — el selector del
// header la dibuja y `empresaId` dice en cuál está parada ahora. Va acá y no en
// un endpoint aparte porque el portal ya llama a whoami al arrancar: un segundo
// fetch para pintar el mismo header sería una ida de más en cada carga.
// `rolCuenta` viaja junto al efectivo por el «ver como»: es lo único que le
// permite a la web distinguir la vista de plataforma (cuenta admin_plataforma
// parada como auditor) de un auditor real, y pintar la barra de salida.
export async function whoami(req: Request, res: Response) {
  const { id, rol, rolCuenta, empresaId, empleadoId } = req.usuario!;
  res.json({ rol, rolCuenta, empresaId, empleadoId, empresas: await empresasDeUsuario(id) });
}

// Cambiar de empresa activa. El `empresaId` del body es una PROPUESTA: quien
// decide es la membresía (ver `cambiarEmpresaActiva`). Los dos rechazos
// responden con el mismo status y el mismo texto que la puerta —
// `middleware/auth.ts`—, para que el cliente no tenga que aprender dos
// vocabularios para el mismo hecho.
export async function empresaActiva(req: Request, res: Response) {
  const parseo = empresaActivaSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  const resultado = await cambiarEmpresaActiva(req.usuario!.id, parseo.data.empresaId);
  if (resultado.estado === "sin_membresia") {
    res.status(403).json({ error: NO_PERTENECES });
    return;
  }
  if (resultado.estado === "suspendida") {
    res.status(403).json({ error: EMPRESA_SUSPENDIDA });
    return;
  }
  res.json({ empresaId: resultado.empresaId, rol: resultado.rol });
}

// Salir del «ver como» de plataforma (la contraparte de
// POST /admin/empresas/:id/entrar — ver el porqué de la ruta en routes/index.ts).
// Idempotente: sin vista puesta responde ok igual.
export async function salirVistaPlataforma(req: Request, res: Response) {
  const resultado = await salirDeVistaPlataforma(req.usuario!.id);
  if (resultado.estado === "no_plataforma") {
    res.status(403).json({ error: "Solo la cuenta de plataforma puede salir de una vista." });
    return;
  }
  if (resultado.estado === "membresia_real") {
    res.status(409).json({
      error: "Estás en esta empresa por una membresía real, no por una vista; usa el selector de empresas.",
    });
    return;
  }
  if (resultado.estado !== "ok") {
    // no_encontrada/suspendida no salen del salir; el estrechamiento es para
    // el compilador y para que un estado nuevo del union no pase en silencio.
    res.status(422).json({ error: "No se pudo salir de la vista." });
    return;
  }
  res.json({ empresaId: resultado.empresaId });
}

export async function invitar(req: Request, res: Response) {
  const parseo = invitarSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }
  const empleadoId = Number(req.params.id);
  try {
    // El empresaId del USUARIO AUTENTICADO, nunca del body ni de la URL: es lo
    // que impide invitar sobre un empleado de otra empresa.
    const resultado = await invitarColaborador(
      empleadoId,
      parseo.data.email,
      req.usuario!.empresaId!,
      req.usuario!.id
    );
    res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo invitar" });
  }
}
