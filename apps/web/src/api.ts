import type { DatosNominaFija, DatosNominaTurnos, Festivo, ResultadoNomina } from "@pv/reglas";

export async function listarFestivos(): Promise<Festivo[]> {
  const res = await fetch("/api/festivos");
  if (!res.ok) return []; // sin festivos la UI sigue funcionando; el motor los aplica igual
  return res.json();
}

export async function calcularNomina(
  datos: DatosNominaTurnos | DatosNominaFija
): Promise<ResultadoNomina> {
  const res = await fetch("/api/nomina/calcular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? "No se pudo calcular la nómina");
  }
  return body as ResultadoNomina;
}
