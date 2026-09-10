# Origen de estos vectores

Vendorizados **tal cual**, byte a byte, sin edición — copia directa de:

- Repo: `sobre` (`~/Developer/sobre` en la casa)
- Commit: `ca011e225cbb83b974df27c5cf10de4c4cd1b84b` (`ca011e2`)
- Ruta origen: `vectores/`
- Licencia: **CC0 1.0 Universal** — dominio público, sin atribución requerida
  (`sobre/LICENSE`; elegida sobre MIT justo para que copiar estos archivos
  dentro de otro repo no genere dudas legales).

Usados por `apps/api/src/lib/__tests__/sobre.test.ts` para comprobar que el
puerto a TypeScript de `sobre.mjs` (`apps/api/src/lib/sobre.ts`) produce los
mismos bytes canónicos, el mismo `publicKeyId` y la misma firma Ed25519 que la
implementación de referencia — ver `SPEC.md` §7 del repo `sobre`.

## sha256 de cada archivo

Recalculables con `shasum -a 256 <archivo>`; si alguno no coincide, el vector
se corrompió al copiarse (o el origen cambió y esta carpeta quedó vieja).

```
a0e3d5f62007b5c254df854db5989bf415d1df21fb8aef49418f604f4f2d910f  canonico-unicode.txt
e636c7bd0fc91fc418239124b0ec365a9083efdb3704840dd5a47437ee59918d  canonico.txt
ac1c6592004f4c4b57d993f4086d376de051112d9adff673bf5dc31af8928413  llave-privada-SOLO-PRUEBAS.pem
b6b3aa455b1826e2e04402d4a695e40fc5bef53b050b9a731c1af10ece0662e5  llave-publica.pem
3f35d4bd3f4f2bff0cfddb3d2bf79d56421400c3614bd894202f2322a1e364ed  sobre-unicode.json
9992f79780a55a3191a7bd249b8722bc14bb6909fa785ffdc0d86310a18338ba  sobre.json
```

## Qué es cada uno

- `llave-privada-SOLO-PRUEBAS.pem` / `llave-publica.pem`: el par Ed25519
  publicado a propósito en la spec para probar implementaciones. **Jamás
  usarla en producción** — es pública desde `sobre/SPEC.md` §7.
- `sobre.json` / `canonico.txt`: el vector ASCII puro — no ejercita las dos
  trampas de JavaScript (ver `sobre.ts`), pero confirma la firma exacta.
- `sobre-unicode.json` / `canonico-unicode.txt`: "el vector que sí prueba lo
  difícil" (spec §7) — trae una clave tipo entero (`"0"`) y el par
  `Ａ`/`🐦` que separa el orden por bytes UTF-8 (este formato) del orden por
  unidades UTF-16 (JCS/RFC 8785).
