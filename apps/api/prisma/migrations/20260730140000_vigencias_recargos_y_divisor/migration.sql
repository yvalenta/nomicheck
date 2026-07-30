-- Corrección de datos (no de esquema): cierra los huecos de vigencia que
-- hacían fallar o calcular mal las liquidaciones por su FECHA.
--
-- Por qué hace falta una migración y no basta con `pnpm db:seed`: el seed hace
-- upsert por (clave, vigenteDesde). Las filas NUEVAS de la semilla entran
-- solas, pero las dos filas cuya VENTANA cambió quedarían duplicadas — la
-- vieja sobrevive y, al tener un `vigenteDesde` más reciente que el tramo
-- histórico correcto, el resolutor la elegiría a ella. O sea que un re-seed
-- sin esta limpieza deja el bug intacto y encima con datos contradictorios.
--
-- Las dos filas a retirar:
--
--   divisor_hora_ordinaria @ 2021-01-01 (valor 220)
--     Cubría 2021-01-01 → 2026-07-14 con la jornada de 44h, pero la Ley 2101
--     de 2021 bajó la jornada en cuatro escalones (48 → 47 → 46 → 44 → 42),
--     cada uno un 15 de julio. Esa única fila aplicaba 44h a periodos en que
--     la jornada legal era de 48, 47 o 46 horas, subestimando el valor de la
--     hora ordinaria hasta un 9% en retroactivos de 2021 a jul-2025. La
--     semilla ahora trae los cinco escalones, incluido 220 desde 2025-07-15.
--
--   recargo_nocturno @ 2025-12-25 (valor 0.35)
--     Se conserva tal cual — no se toca. Solo se le AGREGA el tramo previo
--     (mismo 35% desde 1991, CST art. 168): la Ley 2466 de 2025 cambió la
--     franja horaria, no el porcentaje. Sin ese tramo, una liquidación
--     anterior al 25-dic-2025 lanzaba por falta de vigencia.
--
-- Idempotente: los DELETE son por (clave, vigenteDesde, valor) exactos y no
-- borran nada si la limpieza ya corrió. Los INSERT usan NOT EXISTS, así que
-- correr esto y después `db:seed` (o al revés) da el mismo resultado.
--
-- Ver sdd/vault/05_Valores_Actualizables.md §3 y §4, y §5 de
-- sdd/vault/07_Trazabilidad_Codigo.md.

-- 1. Retirar la fila del divisor con la ventana equivocada.
DELETE FROM "ReglaLegal"
WHERE "clave" = 'divisor_hora_ordinaria'
  AND "vigenteDesde" = '2021-01-01'
  AND "valor" = 220;

-- 2. Sembrar los escalones de jornada de la Ley 2101 de 2021.
INSERT INTO "ReglaLegal" ("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
SELECT v."clave", v."valor", v."vigenteDesde", v."vigenteHasta", v."fuente"
FROM (VALUES
  ('divisor_hora_ordinaria', 240::double precision, '1991-01-01', '2023-07-14', 'CST art. 161 (jornada de 48 horas, antes de la Ley 2101 de 2021)'),
  ('divisor_hora_ordinaria', 235::double precision, '2023-07-15', '2024-07-14', 'Ley 2101 de 2021, art. 3 (jornada de 47 horas)'),
  ('divisor_hora_ordinaria', 230::double precision, '2024-07-15', '2025-07-14', 'Ley 2101 de 2021, art. 3 (jornada de 46 horas)'),
  ('divisor_hora_ordinaria', 220::double precision, '2025-07-15', '2026-07-14', 'Ley 2101 de 2021, art. 3 (jornada de 44 horas)')
) AS v("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
WHERE NOT EXISTS (
  SELECT 1 FROM "ReglaLegal" r
  WHERE r."clave" = v."clave" AND r."vigenteDesde" = v."vigenteDesde"
);

-- 3. Sembrar los tramos extremos del recargo dominical. Sin el de 2027-07-01,
--    TODA liquidación por turnos fechada desde el 1-jul-2027 lanza excepción
--    (el motor resuelve esta clave antes de mirar si alguien trabajó domingo).
INSERT INTO "ReglaLegal" ("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
SELECT v."clave", v."valor", v."vigenteDesde", v."vigenteHasta", v."fuente"
FROM (VALUES
  ('recargo_dominical', 0.75::double precision, '2003-01-01', '2025-06-30', 'Ley 789 de 2002, art. 26 (CST art. 179)'),
  ('recargo_dominical', 1.00::double precision, '2027-07-01', NULL, 'Ley 2466 de 2025, art. 2')
) AS v("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
WHERE NOT EXISTS (
  SELECT 1 FROM "ReglaLegal" r
  WHERE r."clave" = v."clave" AND r."vigenteDesde" = v."vigenteDesde"
);

-- 4. Sembrar el tramo previo del recargo nocturno (mismo 35%, franja anterior).
INSERT INTO "ReglaLegal" ("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
SELECT v."clave", v."valor", v."vigenteDesde", v."vigenteHasta", v."fuente"
FROM (VALUES
  ('recargo_nocturno', 0.35::double precision, '1991-01-01', '2025-12-24', 'CST art. 168, mod. Ley 50 de 1990, art. 24')
) AS v("clave", "valor", "vigenteDesde", "vigenteHasta", "fuente")
WHERE NOT EXISTS (
  SELECT 1 FROM "ReglaLegal" r
  WHERE r."clave" = v."clave" AND r."vigenteDesde" = v."vigenteDesde"
);
