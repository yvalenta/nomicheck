import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";

// La llave del rate limit sale de CF-Connecting-IP, no de req.ip.
//
// El muro x402 hace `app.set("trust proxy", true)` (lo necesita para que
// `req.protocol` sea https y anuncie bien el recurso que se paga). Con eso,
// `req.ip` es el X-Forwarded-For MÁS A LA IZQUIERDA — y ese lo escribe el
// cliente. Rotándolo, cada request cae en un bucket distinto y el tope no
// aplica: medido el 2026-08-09, 40 de 40 pasaron con un tope de 10.
//
// CF-Connecting-IP la escribe Cloudflare con la IP real del cliente y
// SOBRESCRIBE lo que el cliente haya mandado. No es falsificable desde afuera
// mientras el origen solo sea alcanzable por el túnel: el puerto 80 del host da
// timeout, así que nadie llega al origen salteando el borde.
//
// `ipKeyGenerator` normaliza IPv6 a /64 (si no, cada dirección de un mismo
// prefijo sería un bucket, y un /64 es lo que le asignan a UN cliente
// residencial). Fallback a req.ip solo por si una petición no viniera por
// Cloudflare — no debería pasar en producción.
//
// ── Por qué vive acá y no en `routes/index.ts`, que es donde se usa ─────────
//
// Estuvo ahí y rompió el CI. `routes/index.ts` importa el árbol entero de
// routers, y una de esas ramas llega a `supabaseAdmin.ts`, que llama a
// `createClient(process.env.SUPABASE_URL!)` **al cargarse el módulo**. Una
// prueba de esta función no necesita nada de eso, pero importarla arrastraba
// todo y explotaba con "supabaseUrl is required" en un runner sin secretos.
// Local pasaba porque el contenedor sí tiene la variable: el tipo de verde que
// solo vale en la máquina donde se corrió.
export function llavePorIpReal(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  const ip = (typeof cf === "string" && cf.length > 0 ? cf : req.ip) ?? "";
  return ipKeyGenerator(ip);
}
