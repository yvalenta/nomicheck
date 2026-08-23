// La identidad de contacto en UN solo lugar del backend. Vivía escrita dentro
// del `info.contact` del OpenAPI y nada más la citaba; al nacer /contact y las
// páginas de confianza, cada copia a mano sería un lugar más donde
// desincronizarse. El JSON-LD de apps/web/index.html no puede importar esto
// (otro workspace), así que lleva su copia CON guarda: una prueba de la web lee
// este archivo como texto y exige que coincidan.
export const CONTACTO = {
  nombre: "Ynt-labs",
  url: "https://ynt.codes",
  email: "ynt.val@gmail.com",
  github: "https://github.com/yvalenta",
  // Sede coarse a propósito: ciudad y país bastan para que un tercero ubique
  // la operación; una dirección de calle acá sería un dato personal publicado.
  ciudad: "Medellín",
  region: "Antioquia",
  pais: "CO",
} as const;
