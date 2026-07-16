import type { DatosNominaFija, DatosNominaTurnos, ResultadoNomina } from "@pv/reglas";

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
