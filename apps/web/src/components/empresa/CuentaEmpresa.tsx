import { useState } from "react";
import { Check, FileSignature, ShieldAlert } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import {
  actualizarDatosEmpresa,
  obtenerDatosEmpresa,
  obtenerEstadoCuenta,
  type DatosEmpresa,
  type EstadoCuenta,
} from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";
import { useDatos } from "../../hooks/useDatos.ts";
import { nombreMes, ultimosMeses } from "./mesesCuenta.ts";

// Qué se le va a cobrar a esta empresa este mes, y por qué.
//
// ── Por qué existe antes que la factura ────────────────────────────────────
//
// Un cobro que aparece sin haberse podido anticipar es una disputa. Esta
// pantalla muestra el MISMO cálculo que produce el documento de cobro —el
// monto viene del servidor, de `services/medidorCierres.ts`— así que la empresa
// no puede ver acá un número y recibir otro después.
//
// Y muestra lo que NO se cobra, con su motivo. Un descuento sin explicación
// genera exactamente la misma llamada que un cobro de más.

export default function CuentaEmpresa() {
  const meses = ultimosMeses();
  const [mes, setMes] = useState(meses[0]);
  const { datos, cargando, error } = useDatos<EstadoCuenta>(`cuenta:${mes}`, () =>
    obtenerEstadoCuenta(mes),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Tu cuenta</h2>
          <p className="text-sm text-muted mt-0.5">
            El portal, el cálculo y la PILA no se cobran. Se cobra que cada cierre quede probado
            ante un tercero.
          </p>
        </div>
        <label className="text-sm text-muted flex items-center gap-2">
          Mes
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-ink"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DatosEmpresaCard />

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {cargando && <p className="text-sm text-muted px-1">Calculando…</p>}

      {!cargando && datos && (
        <>
          <PaycheckCard titulo={`Total de ${nombreMes(datos.mes)}`}>
            <div className="px-3 py-4 flex flex-col gap-2">
              {datos.cierresFacturables === 0 ? (
                <>
                  <p className="text-2xl font-bold text-ink tabular-nums">{formatCOP(0)}</p>
                  <p className="text-sm text-muted">
                    {datos.cierresTotales === 0
                      ? "Todavía no cerraste ningún periodo este mes. Sin cierres no hay cobro."
                      : "Ningún cierre de este mes quedó con evidencia cobrable — mira el detalle."}
                  </p>
                </>
              ) : datos.requiereConversacion ? (
                <>
                  <p className="text-2xl font-bold text-ink">A convenir</p>
                  <p className="text-sm text-muted">
                    Con {datos.empleadosFacturables} personas quedas fuera de las bandas de lista.
                    El precio se acuerda: escríbenos y lo cerramos.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-ink tabular-nums">
                    {formatCOP(datos.precioCop ?? 0)}
                  </p>
                  <p className="text-sm text-muted">
                    Banda <strong className="text-ink">{datos.banda?.etiqueta}</strong> —{" "}
                    {datos.cierresFacturables}{" "}
                    {datos.cierresFacturables === 1 ? "cierre" : "cierres"} con evidencia
                    verificada, sobre un máximo de{" "}
                    <strong className="text-ink">{datos.empleadosFacturables}</strong>{" "}
                    {datos.empleadosFacturables === 1 ? "persona" : "personas"}.
                  </p>
                  {/* Lo que más pregunta una empresa con nómina quincenal. */}
                  {datos.cierresFacturables > 1 && (
                    <p className="text-xs text-muted">
                      Cerraste {datos.cierresFacturables} veces y se cobra una sola: el precio es
                      por mes, no por cierre.
                    </p>
                  )}
                </>
              )}
            </div>
          </PaycheckCard>

          {datos.detalle.length > 0 && (
            <PaycheckCard titulo="Los cierres de este mes">
              <div className="flex flex-col">
                {datos.detalle.map((c) => (
                  <div
                    key={`${c.periodoId}-${c.cerradoEn}`}
                    className="flex items-center gap-3 px-3 py-3 border-b border-borde last:border-0"
                  >
                    {c.firmaValida ? (
                      <Check size={16} className="text-emerald-600 shrink-0" aria-hidden />
                    ) : (
                      <ShieldAlert size={16} className="text-amber-500 shrink-0" aria-hidden />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {c.fechaInicio} a {c.fechaFin}
                      </p>
                      <p className="text-xs text-muted">
                        {c.conEvidencia}{" "}
                        {c.conEvidencia === 1 ? "persona" : "personas"} con evidencia ·{" "}
                        {c.estadoCierre.replace(/_/g, " ")}
                      </p>
                    </div>
                    <span
                      className={`text-xs shrink-0 ${c.firmaValida ? "text-muted" : "text-amber-600"}`}
                    >
                      {c.firmaValida ? "se cobra" : "no se cobra"}
                    </span>
                  </div>
                ))}
              </div>
            </PaycheckCard>
          )}

          {datos.excluidos.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex gap-2.5">
              <ShieldAlert size={16} className="text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <div className="text-sm text-ink">
                <p className="font-medium">
                  {datos.excluidos.length}{" "}
                  {datos.excluidos.length === 1 ? "cierre queda" : "cierres quedan"} fuera del
                  cobro
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                  {datos.excluidos.map((e) => (
                    <li key={e.periodoId}>
                      Periodo {e.periodoId} — {e.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <PaycheckCard titulo="Las bandas">
            <div className="flex flex-col">
              {datos.bandas.map((b) => {
                const actual = datos.banda?.etiqueta === b.etiqueta;
                return (
                  <div
                    key={b.etiqueta}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${
                      actual ? "bg-emerald-50 rounded-xl" : ""
                    }`}
                  >
                    <span className={actual ? "font-medium text-ink" : "text-muted"}>
                      {b.etiqueta}
                      {actual && <span className="text-xs text-emerald-700 ml-2">tu banda</span>}
                    </span>
                    <span className={`tabular-nums ${actual ? "font-semibold text-ink" : "text-muted"}`}>
                      {b.precioCop === null ? "a convenir" : `${formatCOP(b.precioCop)} / mes`}
                    </span>
                  </div>
                );
              })}
            </div>
          </PaycheckCard>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex gap-2.5">
            <FileSignature size={16} className="text-muted shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs text-muted leading-relaxed">
              Cada cierre cobrado lleva una firma Ed25519 sobre el resultado completo, con el hash
              del catálogo legal que lo produjo.{" "}
              <strong className="text-ink font-medium">
                Puedes verificarlo por tu cuenta, sin nosotros
              </strong>{" "}
              — la llave pública está en{" "}
              <a href="/api/batch/publickey" className="underline hover:text-ink">
                /api/batch/publickey
              </a>
              . Un cierre cuya firma no verifica no se cobra.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// Nombre, NIT y sector — editable aquí porque hasta el 2026-08-20 la empresa
// era lo único del panel sin edición: un NIT provisional solo se corregía
// con SQL. Guardar exige rol admin (el backend lo impone) y queda en la
// auditoría con autor, como cualquier cambio de empleado.
function DatosEmpresaCard() {
  const { datos } = useDatos<DatosEmpresa>("empresa:datos", obtenerDatosEmpresa);
  const [form, setForm] = useState<DatosEmpresa | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const f = form ?? datos;
  if (!f) return null;
  const editado =
    !!datos &&
    (f.nombre !== datos.nombre || f.nit !== datos.nit || f.sector !== datos.sector);

  function campo<K extends keyof DatosEmpresa>(k: K, v: string) {
    setAviso(null);
    setForm({ ...(f as DatosEmpresa), [k]: v });
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      const guardado = await actualizarDatosEmpresa(f as DatosEmpresa);
      setForm(guardado);
      setAviso({ ok: true, texto: "Datos guardados — el cambio queda en la auditoría." });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PaycheckCard titulo="Datos de la empresa">
      <div className="px-3 pb-4 pt-1 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Nombre
            <input
              value={f.nombre}
              onChange={(e) => campo("nombre", e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            NIT
            <input
              value={f.nit}
              onChange={(e) => campo("nit", e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Sector
            <input
              value={f.sector}
              onChange={(e) => campo("sector", e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={guardar}
            disabled={!editado || guardando}
            className="rounded-full bg-mint px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
          {aviso && (
            <p className={`text-xs ${aviso.ok ? "text-teal-700" : "text-coral"}`}>{aviso.texto}</p>
          )}
          {f.nit.startsWith("PROV-") && !aviso && (
            <p className="text-xs text-amber-600">
              El NIT es provisional — reemplázalo por el real: sale impreso en la cuenta de cobro.
            </p>
          )}
        </div>
      </div>
    </PaycheckCard>
  );
}
