-- Corrección de datos (no de esquema): siembra la historia 2020-2025 de los
-- tres valores que fija un decreto o resolución cada año.
--
-- Hasta ahora `smlmv`, `auxilio_transporte` y `uvt` tenían UNA sola fila, la
-- de 2026, así que el sistema solo podía liquidar desde 2026: cualquier
-- periodo anterior lanzaba `No hay regla legal vigente` aunque el resto del
-- catálogo lo cubriera de sobra. Verificado contra la BD de dev antes de esta
-- migración: un POST /api/batch/liquidar con periodo de marzo de 2024 fallaba
-- por estas tres claves.
--
-- A diferencia del recargo dominical o del divisor de jornada, esta historia
-- NO se puede deducir de la ley: hace falta el valor concreto que fijó cada
-- norma. Valores y números de decreto verificados el 30-jul-2026 contra dos
-- fuentes independientes (actualicese.com y consultorcontable.com) y, donde
-- discrepaban, contra el Gestor Normativo de Función Pública.
--
-- Tramos CERRADOS de 1-ene a 31-dic: el decreto de diciembre del año N fija el
-- valor del año N+1 y deroga expresamente al anterior. La fila de 2026 se
-- queda abierta (es la vigente) y no se toca — por eso esta migración es solo
-- INSERT, sin DELETE: no modifica ninguna vigencia existente.
--
-- Idempotente: cada INSERT va con NOT EXISTS sobre (clave, vigenteDesde), la
-- misma llave por la que hace upsert `prisma/seed.ts`. Correr esto y después
-- `db:seed`, o al revés, da el mismo resultado.
--
-- Ver sdd/vault/05_Valores_Actualizables.md §1 y §2.

-- Salario mínimo legal mensual vigente.
INSERT INTO "ReglaLegal" ("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
SELECT v."clave", v."valor", v."vigenteDesde", v."vigenteHasta", v."fuente"
FROM (VALUES
  ('smlmv',  877803::double precision, '2020-01-01', '2020-12-31', 'Decreto 2360 del 26 de diciembre de 2019'),
  ('smlmv',  908526::double precision, '2021-01-01', '2021-12-31', 'Decreto 1785 del 29 de diciembre de 2020'),
  ('smlmv', 1000000::double precision, '2022-01-01', '2022-12-31', 'Decreto 1724 del 15 de diciembre de 2021'),
  ('smlmv', 1160000::double precision, '2023-01-01', '2023-12-31', 'Decreto 2613 del 28 de diciembre de 2022'),
  ('smlmv', 1300000::double precision, '2024-01-01', '2024-12-31', 'Decreto 2292 del 29 de diciembre de 2023'),
  ('smlmv', 1423500::double precision, '2025-01-01', '2025-12-31', 'Decreto 1572 del 24 de diciembre de 2024')
) AS v("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
WHERE NOT EXISTS (
  SELECT 1 FROM "ReglaLegal" r
  WHERE r."clave" = v."clave" AND r."vigenteDesde" = v."vigenteDesde"
);

-- Auxilio de transporte. Lo fija un decreto gemelo del de salario mínimo,
-- expedido el mismo día con el número siguiente.
INSERT INTO "ReglaLegal" ("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
SELECT v."clave", v."valor", v."vigenteDesde", v."vigenteHasta", v."fuente"
FROM (VALUES
  ('auxilio_transporte', 102854::double precision, '2020-01-01', '2020-12-31', 'Decreto 2361 del 26 de diciembre de 2019'),
  ('auxilio_transporte', 106454::double precision, '2021-01-01', '2021-12-31', 'Decreto 1786 del 29 de diciembre de 2020'),
  ('auxilio_transporte', 117172::double precision, '2022-01-01', '2022-12-31', 'Decreto 1725 del 15 de diciembre de 2021'),
  ('auxilio_transporte', 140606::double precision, '2023-01-01', '2023-12-31', 'Decreto 2614 del 28 de diciembre de 2022'),
  ('auxilio_transporte', 162000::double precision, '2024-01-01', '2024-12-31', 'Decreto 2293 del 29 de diciembre de 2023'),
  ('auxilio_transporte', 200000::double precision, '2025-01-01', '2025-12-31', 'Decreto 1573 del 24 de diciembre de 2024')
) AS v("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
WHERE NOT EXISTS (
  SELECT 1 FROM "ReglaLegal" r
  WHERE r."clave" = v."clave" AND r."vigenteDesde" = v."vigenteDesde"
);

-- UVT. La fija la DIAN por resolución antes de fin de año, con la variación
-- del IPC entre el 1-oct anterior y el 1-oct del año en curso.
INSERT INTO "ReglaLegal" ("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
SELECT v."clave", v."valor", v."vigenteDesde", v."vigenteHasta", v."fuente"
FROM (VALUES
  ('uvt', 35607::double precision, '2020-01-01', '2020-12-31', 'DIAN, Resolución 000084 de 2019'),
  ('uvt', 36308::double precision, '2021-01-01', '2021-12-31', 'DIAN, Resolución 000111 de 11-12-2020'),
  ('uvt', 38004::double precision, '2022-01-01', '2022-12-31', 'DIAN, Resolución 000140 de 2021'),
  ('uvt', 42412::double precision, '2023-01-01', '2023-12-31', 'DIAN, Resolución 001264 de 18-11-2022'),
  ('uvt', 47065::double precision, '2024-01-01', '2024-12-31', 'DIAN, Resolución 000187 de 2023'),
  ('uvt', 49799::double precision, '2025-01-01', '2025-12-31', 'DIAN, Resolución 000193 de 04-12-2024')
) AS v("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
WHERE NOT EXISTS (
  SELECT 1 FROM "ReglaLegal" r
  WHERE r."clave" = v."clave" AND r."vigenteDesde" = v."vigenteDesde"
);
