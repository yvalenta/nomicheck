import { useState } from "react";
import { FileSearch } from "lucide-react";
import BadgeEstado, { ESTADO_ETIQUETA } from "../components/ui/BadgeEstado.tsx";
import LegalRef from "../components/ui/LegalRef.tsx";
import Modal, { ModalClose } from "../components/ui/modal.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.tsx";
import { Calendar } from "../components/ui/calendar.tsx";
import Combobox from "../components/Combobox.tsx";
import DateField from "../components/DateField.tsx";
import EmptyState from "../components/EmptyState.tsx";
import SegmentedControl from "../components/SegmentedControl.tsx";
import Sello from "../components/Sello.tsx";
import Skeleton from "../components/Skeleton.tsx";
import SelectorEmpresa from "../components/empresa/SelectorEmpresa.tsx";
import TablaPermisos from "../components/empresa/TablaPermisos.tsx";
import { agruparPorDominio } from "../lib/permisosCatalogo.ts";
import type { EstadoPeriodo, FilaMatriz } from "../apiEmpresa";

// /showcase — la vitrina de componentes (CLAUDE.md: un componente nuevo nace
// acá, se juega con él aislado, y solo después se conecta al portal). No es
// documentación aparte que pueda mentir: importa los componentes reales, así
// que si uno cambia, la vitrina cambia con él. Solo carga en dev (guard en
// main.tsx) — la superficie pública no crece sin decisión explícita.

const RUTA = "apps/web/src";

function Muestra({ titulo, archivo, nota, children, ancho }: { titulo: string; archivo: string; nota?: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <section className={`rounded-2xl border border-borde bg-white shadow-suave p-5 ${ancho ? "sm:col-span-2" : ""}`}>
      <header className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-medium text-ink">{titulo}</h3>
        <code className="font-mono text-[11px] text-quiet">{RUTA}/{archivo}</code>
      </header>
      {children}
      {nota && <p className="mt-3 text-xs text-quiet">{nota}</p>}
    </section>
  );
}

function Tinta({ token, hex, uso }: { token: string; hex: string; uso: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-8 w-8 shrink-0 rounded-lg border border-borde" style={{ background: hex }} />
      <div className="leading-tight">
        <code className="font-mono text-[11px] text-ink">{token}</code>
        <p className="text-xs text-quiet">{uso}</p>
      </div>
    </div>
  );
}

function DemoModal() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-mint px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-dark"
      >
        Abrir modal
      </button>
      <Modal open={abierto} onClose={() => setAbierto(false)} labelledBy="demo-modal-titulo">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h4 id="demo-modal-titulo" className="text-base font-medium text-ink">Hoja de ejemplo</h4>
            <ModalClose onClose={() => setAbierto(false)} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Escape, clic fuera o el botón cierran. El scroll de fondo queda bloqueado.
          </p>
        </div>
      </Modal>
    </>
  );
}

function DemoPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm text-ink transition-colors hover:border-mint">
          Abrir popover
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm text-muted">Radix + tokens de la casa. Base de Combobox y DateField.</p>
      </PopoverContent>
    </Popover>
  );
}

function DemoCalendario() {
  const [fecha, setFecha] = useState<Date | undefined>(new Date());
  return <Calendar mode="single" selected={fecha} onSelect={setFecha} />;
}

function DemoDateField() {
  const [fecha, setFecha] = useState("");
  return <DateField value={fecha} onChange={setFecha} className="w-56" />;
}

function DemoCombobox() {
  const [valor, setValor] = useState("");
  return (
    <div className="w-64">
      <Combobox
        value={valor}
        onChange={setValor}
        opciones={[
          { value: "indefinido", label: "Término indefinido" },
          { value: "fijo", label: "Término fijo" },
          { value: "obra_labor", label: "Obra o labor" },
          { value: "servicios", label: "Prestación de servicios" },
        ]}
      />
    </div>
  );
}

// Matriz de mentira, y dicho en voz alta: la de verdad la publica la API
// (`GET /empresa/permisos`) y la vitrina no habla con la red. Sirve para ver la
// tabla con los tres casos que importan — un permiso de lectura que casi todos
// tienen, uno de escritura que solo el admin, y una clave SIN ficha en
// `permisosCatalogo.ts`, que debe salir igual con su nombre crudo.
const MATRIZ_VITRINA: FilaMatriz[] = [
  { clave: "empresa.ver", roles: ["admin_empresa", "analista_rrhh", "auditor"] },
  { clave: "nomina.operar", roles: ["admin_empresa", "analista_rrhh"] },
  { clave: "nomina.pagar", roles: ["admin_empresa"] },
  { clave: "auditoria.ver", roles: ["admin_empresa", "analista_rrhh", "auditor"] },
  { clave: "permiso.inventado.ver", roles: ["auditor"] },
];

const ROLES_VITRINA = ["admin_empresa", "analista_rrhh", "auditor", "colaborador"];

const EMPRESAS_VITRINA = [
  { id: 1, nombre: "Distribuciones El Puerto S.A.S.", rol: "admin_empresa" },
  { id: 2, nombre: "Clínica Andina Ltda.", rol: "admin_empresa" },
  { id: 3, nombre: "Transportes del Norte", rol: "auditor" },
];

function DemoSelectorEmpresa() {
  const [activa, setActiva] = useState(1);
  return (
    // Sobre midnight porque es donde vive: el disparador está dibujado para el
    // header corporativo y sobre blanco no se leería.
    <div className="rounded-xl bg-midnight bg-dots p-3 flex justify-end">
      <SelectorEmpresa
        empresas={EMPRESAS_VITRINA}
        activaId={activa}
        onElegir={setActiva}
        rolAdmitido={(rol) => rol === "admin_empresa"}
      />
    </div>
  );
}

function DemoSegmented() {
  const [activo, setActivo] = useState<"resumen" | "detalle" | "historial">("resumen");
  return (
    <SegmentedControl
      opciones={[
        { valor: "resumen", etiqueta: "Resumen" },
        { valor: "detalle", etiqueta: "Detalle" },
        { valor: "historial", etiqueta: "Historial" },
      ]}
      activo={activo}
      onCambio={setActivo}
    />
  );
}

export default function Showcase() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-midnight bg-dots px-6 py-8">
        <div className="mx-auto max-w-5xl flex items-center gap-4">
          <Sello size={38} variante="gradiente" />
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Vitrina de componentes</h1>
            <p className="mt-1 text-sm text-white/60 max-w-2xl">
              Un componente nuevo nace acá, aislado, antes de conectarse al portal.
              Las restricciones no se discuten por pantalla: son el SDD §06 y los
              tokens de <code className="font-mono text-[12px]">index.css</code>.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-10">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink mb-4">Las restricciones</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Muestra titulo="Tres tintas — la jerarquía se construye con tinta, no con negritas" archivo="index.css">
              <div className="flex flex-col gap-3">
                <Tinta token="--color-ink" hex="#16203a" uso="texto principal" />
                <Tinta token="--color-muted" hex="#64748b" uso="texto secundario" />
                <Tinta token="--color-quiet" hex="#9aa3b2" uso="etiquetas y ayudas" />
              </div>
            </Muestra>
            <Muestra
              titulo="Acción y semáforo — nunca decorativos"
              archivo="index.css"
              nota="Índigo es la ÚNICA acción. El semáforo son veredictos del motor: cada color afirma algo."
            >
              <div className="flex flex-col gap-3">
                <Tinta token="--color-mint (índigo)" hex="#5b50e8" uso="acción principal" />
                <Tinta token="--color-verde" hex="#0d9488" uso="correcto" />
                <Tinta token="--color-ambar" hex="#f59e0b" uso="advertencia" />
                <Tinta token="--color-coral-fuerte" hex="#e11d48" uso="discrepancia" />
              </div>
            </Muestra>
            <Muestra titulo="Tipografía" archivo="index.css">
              <div className="flex flex-col gap-2">
                <p className="font-display text-base text-ink">Space Grotesk — display de marca</p>
                <p className="text-sm text-ink">Inter — interfaz, tracking −0.15px</p>
                <p className="font-mono text-sm text-ink">1.423.500 — cifras mono, tabulares</p>
              </div>
            </Muestra>
            <Muestra
              titulo="Radios y sombras con significado"
              archivo="index.css"
              nota="8px controles, 16px cards, pill para estados. Sombra suave neutra; realce índigo solo si la card lo amerita."
            >
              <div className="flex items-end gap-3 flex-wrap">
                <span className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs text-muted">control 8px</span>
                <span className="rounded-2xl border border-borde bg-white px-4 py-3 text-xs text-muted shadow-suave">card 16px</span>
                <span className="rounded-2xl border border-borde bg-white px-4 py-3 text-xs text-muted shadow-realce">realce</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-muted">pill</span>
              </div>
            </Muestra>
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold text-ink mb-4">Los componentes</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Muestra titulo="Sello" archivo="components/Sello.tsx" nota="Reemplaza al ShieldCheck genérico en superficies de marca.">
              <div className="flex items-center gap-5">
                <span className="rounded-xl bg-midnight p-3"><Sello size={34} /></span>
                <Sello size={40} variante="gradiente" />
              </div>
            </Muestra>
            <Muestra titulo="BadgeEstado" archivo="components/ui/BadgeEstado.tsx" nota="Los seis estados del periodo; «liquidando» acepta progreso inline.">
              <div className="flex flex-wrap items-start gap-2">
                {(Object.keys(ESTADO_ETIQUETA) as EstadoPeriodo[]).map((estado) => (
                  <BadgeEstado key={estado} estado={estado} progreso={estado === "liquidando" ? 62 : undefined} />
                ))}
              </div>
            </Muestra>
            <Muestra titulo="LegalRef" archivo="components/ui/LegalRef.tsx">
              <p className="text-sm text-muted">
                El salario se paga en moneda legal{" "}
                <LegalRef ley="CST art. 134">
                  El salario en dinero debe pagarse en la moneda de curso legal, en el lugar y periodo pactados.
                </LegalRef>
              </p>
            </Muestra>
            <Muestra titulo="Modal" archivo="components/ui/modal.tsx">
              <DemoModal />
            </Muestra>
            <Muestra titulo="Popover" archivo="components/ui/popover.tsx">
              <DemoPopover />
            </Muestra>
            <Muestra titulo="SegmentedControl" archivo="components/SegmentedControl.tsx">
              <DemoSegmented />
            </Muestra>
            <Muestra titulo="Combobox" archivo="components/Combobox.tsx">
              <DemoCombobox />
            </Muestra>
            <Muestra titulo="DateField" archivo="components/DateField.tsx" nota="Produce YYYY-MM-DD, igual que el input nativo que reemplaza.">
              <DemoDateField />
            </Muestra>
            <Muestra titulo="Calendar" archivo="components/ui/calendar.tsx">
              <DemoCalendario />
            </Muestra>
            <Muestra titulo="Skeleton" archivo="components/Skeleton.tsx">
              <Skeleton filas={3} />
            </Muestra>
            <Muestra titulo="EmptyState" archivo="components/EmptyState.tsx">
              <EmptyState
                icon={FileSearch}
                titulo="Sin resultados"
                descripcion="Mismo bloque en toda la app en vez de un párrafo distinto por pantalla."
              />
            </Muestra>
            <Muestra
              titulo="SelectorEmpresa"
              archivo="components/empresa/SelectorEmpresa.tsx"
              nota="Solo aparece con dos membresías o más. El rol es POR empresa; la que el portal todavía no abre se ofrece deshabilitada en vez de esconderse."
            >
              <DemoSelectorEmpresa />
            </Muestra>
            <Muestra
              titulo="TablaPermisos"
              archivo="components/empresa/TablaPermisos.tsx"
              ancho
              nota="Fase 1 documental: no hay input que tocar. El sello «solo lectura» se mide sobre la matriz recibida (permisos que terminan en .ver), no se escribe. La última fila no tiene ficha en permisosCatalogo.ts y sale igual, con su clave cruda: un permiso nuevo del backend nunca desaparece de la tabla."
            >
              <TablaPermisos
                roles={ROLES_VITRINA}
                grupos={agruparPorDominio(MATRIZ_VITRINA)}
                rolPropio="analista_rrhh"
              />
            </Muestra>
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Pendientes de montar</h2>
          <p className="text-sm text-muted max-w-2xl mb-3">
            Necesitan fixtures del motor (<code className="font-mono text-[12px]">@pv/reglas</code>) para
            mostrarse con datos honestos — al montarlos, usar los comprobantes reales que ya sirven de
            fixture en los tests de cálculo.
          </p>
          <ul className="text-sm text-muted flex flex-col gap-1">
            <li><code className="font-mono text-[12px] text-ink">components/ValidationRow.tsx</code> — una línea del cálculo (pide <code className="font-mono text-[12px]">LineaResultado</code>)</li>
            <li><code className="font-mono text-[12px] text-ink">components/FinancialProgressBar.tsx</code> — pide <code className="font-mono text-[12px]">ResultadoNomina</code> completo</li>
            <li><code className="font-mono text-[12px] text-ink">components/PaycheckCard.tsx</code> y <code className="font-mono text-[12px] text-ink">components/ComprobanteNomina.tsx</code></li>
            <li><code className="font-mono text-[12px] text-ink">components/HeatmapDias.tsx</code></li>
          </ul>
        </div>
      </main>
    </div>
  );
}
