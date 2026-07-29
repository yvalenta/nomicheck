import type { EstadoPeriodo } from "../../apiEmpresa";

// Estados donde parar el polling — espejo de ESTADOS_TERMINALES_LIQUIDACION
// del backend (apps/api/src/lib/estados.ts). Cambiar aquí Y allá si se agrega
// un estado terminal nuevo; `estadosPeriodo.test.ts` compara las dos listas.
//
// Vive en un módulo propio, y no dentro de `usePeriodoEstado.ts`, por una razón
// que costó una corrida roja de CI: el hook importa `apiEmpresa`, que importa
// `lib/supabase.ts`, que llama a `createClient()` **al cargarse** y revienta si
// no están las variables de Vite. O sea que una prueba que solo quería leer esta
// lista terminaba necesitando credenciales de Supabase. En local no se nota
// porque hay un `.env` que las trae.
//
// El `import type` de arriba se borra al compilar, así que este archivo no
// arrastra nada en runtime. Ese es el punto.
export const TERMINALES: EstadoPeriodo[] = ["liquidado", "liquidado_con_rechazos", "fallido"];
