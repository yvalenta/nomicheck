import type { Request, Response } from "express";
import { cambiarEstadoEmpresa, listarEmpresasAdmin } from "../services/empresasAdminService.js";
import { cambiarEstadoEmpresaSchema, crearEmpresaAdminSchema, reasignarAdminSchema } from "../validation/empresa.js";
import { crearEmpresaConAdmin, entrarComoVistaPlataforma, quitarAdminEmpresa, reasignarAdminEmpresa } from "../services/authService.js";
import { ErrorConflicto } from "../services/empleadosService.js";

// Las tres rutas que escriben `Usuario` desde acá pasan `req.usuario!.id`
// hasta el servicio: `Usuario` está vigilado por `fn_auditar_cambio`
// (migración `20260830140000_auditoria_usuario`), que lee el autor de
// `app.usuario_actual`, y sin ese id el rastro queda con `usuarioId = NULL` —
// constancia de que a alguien lo sacaron de una empresa y ninguna de quién lo
// sacó. El `!` no es optimismo: las cuatro rutas del panel entran por
// `conPermiso("plataforma.empresas")`, que es `[requiereAuth, requierePermiso]`,
// así que `req.usuario` ya está adjunto cuando el controlador corre. El actor
// viaja SOLO para el trigger: nunca decide nada (quién puede hacerlo ya lo
// decidió `requierePermiso`).

export async function listar(_req: Request, res: Response) {
  res.json(await listarEmpresasAdmin());
}

export async function crear(req: Request, res: Response) {
  const parseo = crearEmpresaAdminSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const { empresa, usuario } = await crearEmpresaConAdmin(parseo.data, req.usuario!.id);
    res.status(201).json({ empresa, usuario });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo crear la empresa" });
  }
}

export async function reasignarAdmin(req: Request, res: Response) {
  const empresaId = Number(req.params.id);
  const parseo = reasignarAdminSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const usuario = await reasignarAdminEmpresa(empresaId, parseo.data, req.usuario!.id);
    res.status(201).json({ usuario });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo reasignar el admin" });
  }
}

export async function quitarAdmin(req: Request, res: Response) {
  const empresaId = Number(req.params.id);
  const usuarioId = String(req.params.usuarioId);
  try {
    await quitarAdminEmpresa(empresaId, usuarioId, req.usuario!.id);
    res.status(204).end();
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo quitar el admin" });
  }
}

// «Ver como» (solo lectura): entra a la empresa con membresía auditor +
// puntero. La vuelta NO está acá: con la vista puesta el rol efectivo es
// auditor y este panel entero responde 403 — el salir vive en
// POST /auth/vista-plataforma/salir, alcanzable desde adentro.
export async function entrar(req: Request, res: Response) {
  const empresaId = Number(req.params.id);
  const resultado = await entrarComoVistaPlataforma(req.usuario!.id, empresaId);
  switch (resultado.estado) {
    case "ok":
      res.json({ empresaId: resultado.empresaId });
      return;
    case "membresia_real":
      // Sin instrucciones de navegación: el selector vive dentro de /empresa
      // y una cuenta de plataforma parada en ninguna empresa no llega ahí.
      res.status(409).json({
        error: `Tu cuenta ya es ${resultado.rol} de esta empresa — esa pertenencia es real, no una vista.`,
      });
      return;
    case "suspendida":
      res.status(422).json({ error: "La empresa está suspendida; reactívala antes de entrar." });
      return;
    default: // no_encontrada (el servicio jamás devuelve no_plataforma acá)
      res.status(422).json({ error: "Empresa no encontrada" });
  }
}

export async function cambiarEstado(req: Request, res: Response) {
  const empresaId = Number(req.params.id);
  const parseo = cambiarEstadoEmpresaSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const empresa = await cambiarEstadoEmpresa(empresaId, parseo.data.activa);
    res.json({ empresa });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo cambiar el estado" });
  }
}
