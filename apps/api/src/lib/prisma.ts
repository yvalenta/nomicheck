import { PrismaClient } from "@prisma/client";
import type { ClienteAcotado } from "./alcance.js";

const cliente = new PrismaClient();

/**
 * El cliente de la app. Los cuatro modelos sin `empresaId` propio salen
 * ACOTADOS: su `where` no compila sin el ancla que amarra la fila a su dueño
 * (ver `lib/alcance.ts`, que explica por qué y qué clase de bug cierra).
 *
 * El cast es el único de su especie en el repo y va acá a propósito: es la
 * frontera entre "lo que Prisma genera" y "lo que esta app puede consultar".
 *
 * NO hay un `prismaCrudo` exportado al lado. Lo hubo por diez minutos, para
 * "casos que lo necesiten", y no lo necesitaba nadie: la semilla y los
 * fixtures arman su propio cliente porque viven fuera de `src/`. Una escotilla
 * sin usuario no es prudencia, es el gate con la puerta abierta y un cartel
 * pidiendo que no entren. Si algún día hace falta, se agrega con el motivo
 * escrito — que es justo lo que una escotilla preventiva se saltea.
 *
 * El otro camino alrededor —`new PrismaClient()` suelto dentro de `src/`— lo
 * cierra `alcance.test.ts`, porque ese sí no lo puede ver el compilador.
 */
export const prisma = cliente as unknown as ClienteAcotado;
