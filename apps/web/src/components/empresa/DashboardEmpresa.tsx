import { useEffect, useState } from "react";
import { LogOut, Mail, Plus, UserRound } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { supabase } from "../../lib/supabase";
import {
  crearEmpleado,
  invitarEmpleado,
  liquidarFinalEmpleado,
  listarEmpleados,
  retirarEmpleado,
  type Empleado,
} from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function DashboardEmpresa() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  function recargar() {
    listarEmpleados()
      .then(setEmpleados)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }

  useEffect(recargar, []);

  async function agregar(datos: Omit<Empleado, "id" | "activo" | "fechaRetiro">) {
    setError(null);
    try {
      await crearEmpleado(datos);
      setMostrarForm(false);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el empleado");
    }
  }

  async function invitar(id: number) {
    const email = window.prompt("Correo del colaborador para invitarlo:");
    if (!email) return;
    try {
      await invitarEmpleado(id, email);
      window.alert("Invitación enviada.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo invitar");
    }
  }

  async function retirar(id: number) {
    const fechaRetiro = window.prompt("Fecha de retiro (YYYY-MM-DD):");
    if (!fechaRetiro) return;
    try {
      await retirarEmpleado(id, fechaRetiro);
      recargar();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo registrar el retiro");
    }
  }

  async function liquidarFinal(id: number) {
    try {
      const recibo = await liquidarFinalEmpleado(id);
      window.alert(`Liquidación final generada. Neto: ${formatCOP(recibo.neto)}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo liquidar");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold text-ink">Tus colaboradores</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-mint-dark hover:underline"
          >
            <Plus size={16} /> Agregar
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-coral"
          >
            <LogOut size={15} /> Salir
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {mostrarForm && <FormEmpleado onGuardar={agregar} />}

      <PaycheckCard>
        {cargando && <p className="text-sm text-muted px-3 py-6 text-center">Cargando…</p>}
        {!cargando && empleados.length === 0 && (
          <p className="text-sm text-muted px-3 py-6 text-center">Aún no tienes colaboradores.</p>
        )}
        <div className="flex flex-col">
          {empleados.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors duration-200"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-mint-dark flex items-center justify-center shrink-0">
                <UserRound size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{e.nombre}</p>
                <p className="text-xs text-muted">
                  {e.documento} · {e.tipoNomina === "turnos" ? "Por turnos" : "Salario fijo"}
                </p>
              </div>
              <p className="text-sm font-semibold text-ink tabular-nums shrink-0">
                {formatCOP(e.salarioBase)}
              </p>
              <button
                onClick={() => invitar(e.id)}
                title="Invitar a crear su cuenta"
                className="text-muted hover:text-mint-dark shrink-0"
              >
                <Mail size={17} />
              </button>
              {!e.fechaRetiro && (
                <button
                  onClick={() => retirar(e.id)}
                  title="Registrar retiro"
                  className="text-xs text-muted hover:text-coral shrink-0 underline"
                >
                  Retirar
                </button>
              )}
              {e.fechaRetiro && (
                <button
                  onClick={() => liquidarFinal(e.id)}
                  title="Liquidar prestaciones finales"
                  className="text-xs text-mint-dark hover:underline shrink-0"
                >
                  Liquidar final
                </button>
              )}
            </div>
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}

function FormEmpleado({ onGuardar }: { onGuardar: (d: Omit<Empleado, "id" | "activo" | "fechaRetiro">) => void }) {
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [salarioBase, setSalarioBase] = useState("");
  const [tipoNomina, setTipoNomina] = useState<Empleado["tipoNomina"]>("turnos");
  const [auxilioTransporte, setAuxilioTransporte] = useState(true);
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [tipoContrato, setTipoContrato] = useState<Empleado["tipoContrato"]>("indefinido");

  return (
    <PaycheckCard titulo="Nuevo colaborador">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar({ nombre, documento, salarioBase: Number(salarioBase), tipoNomina, auxilioTransporte, fechaIngreso, tipoContrato });
        }}
        className="px-3 pb-3 pt-1 flex flex-col gap-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
          <input required placeholder="Documento" value={documento} onChange={(e) => setDocumento(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            type="number"
            placeholder="Salario básico"
            value={salarioBase}
            onChange={(e) => setSalarioBase(e.target.value)}
            className={inputCls}
          />
          <select value={tipoNomina} onChange={(e) => setTipoNomina(e.target.value as Empleado["tipoNomina"])} className={inputCls}>
            <option value="turnos">Por turnos</option>
            <option value="fijo">Salario fijo</option>
          </select>
        </div>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Tipo de contrato
          <select
            value={tipoContrato}
            onChange={(e) => setTipoContrato(e.target.value as Empleado["tipoContrato"])}
            className={inputCls}
          >
            <option value="indefinido">Término indefinido (u otro contrato laboral ordinario)</option>
            <option value="aprendizaje_sena_lectiva">Aprendizaje SENA — etapa lectiva</option>
            <option value="aprendizaje_sena_practica">Aprendizaje SENA — etapa práctica</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Fecha de ingreso (antigüedad para cesantías, prima y vacaciones)
          <input
            required
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFechaIngreso(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={auxilioTransporte}
            onChange={(e) => setAuxilioTransporte(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          Recibe auxilio de transporte
        </label>
        <button
          type="submit"
          className="rounded-xl bg-mint text-white font-semibold py-2.5 hover:bg-mint-dark transition-colors duration-200"
        >
          Guardar colaborador
        </button>
      </form>
    </PaycheckCard>
  );
}
