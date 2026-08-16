-- De dónde vino cada empresa: atribución de campaña de PRIMERA PERSONA, en vez
-- del Meta Pixel — que habría dado lo mismo rompiendo dos promesas ya servidas
-- (el verificador dice que no carga scripts externos ni analítica; el FAQ de la
-- landing promete que nadie más que el trabajador ve su resultado).
--
-- Nullable y sin default a propósito: `null` significa "llegó por su cuenta O se
-- perdió el rastro", y esos dos casos NO se distinguen. Un default tipo
-- 'directo' convertiría la ignorancia en un dato.
ALTER TABLE "Empresa" ADD COLUMN "origen" TEXT;
