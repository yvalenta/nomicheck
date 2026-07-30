# 🔗 Trazabilidad: del baúl al código (y de vuelta)

Este archivo es el **puente**. Los archivos 01 a 06 dicen qué manda la ley; este dice **dónde vive eso en el sistema** y **qué tan bien coinciden hoy**.

Existe por una razón concreta: el API vende cálculos de nómina a agentes de Execution Market, y lo que vende no son números —los números son públicos— sino números **con procedencia**. Un comprador que recibe un recibo firmado tiene que poder llegar, sin confiar en nosotros, hasta el artículo del CST que lo justifica. Ese camino es este archivo.

Empezar por [[00_Indice_Nomina]] si lo que se busca es la regla; empezar por acá si lo que se busca es el código.

---

## 1. Las cuatro capas, y quién manda en cada una

| Capa | Dónde | Qué es |
|---|---|---|
| **Regla legal en lenguaje llano** | Este baúl, archivos 01–04 y 06 | La intención. Si el código no coincide, se abre una deuda: no se ignora el baúl ni se le da la razón al código por defecto |
| **Valor con vigencia** | `ReglaLegal` en Postgres, sembrada desde `apps/api/prisma/semillaLegal.ts` | Lo que el motor resuelve en tiempo de cálculo, por `clave` y por fecha. Documentado en [[05_Valores_Actualizables]] |
| **Constante estructural** | `packages/reglas/src/constantes.ts` | Números que solo cambian con una ley (año comercial de 360, divisor 720, tabla del art. 383) |
| **Cálculo** | `packages/reglas/src/` | El motor. No lee este baúl ni ningún markdown: lee `ReglaLegal` y sus constantes |

> ⚠️ **El motor no lee este baúl.** Es texto para humanos, no una fuente de datos en runtime. Por eso editar [[05_Valores_Actualizables]] no cambia ni un peso de lo que el sistema calcula: hay que **sembrar** el valor también. Ver §5.

## 2. De la regla al archivo que la implementa

| Archivo del baúl | Implementado en | Endpoints que lo exponen |
|---|---|---|
| [[01_Ingresos_y_Jornada]] | `recargos.ts`, `auxilio.ts`, `calculadoraTurnos.ts`, `calculadoraSalarioFijo.ts` | `POST /nomina/calcular`, `POST /recargos/calcular`, `POST /batch/liquidar` |
| [[02_Descuentos_al_Trabajador]] | `deducciones.ts` | `POST /nomina/calcular`, `POST /batch/liquidar` |
| [[03_Beneficios_de_Ley]] | `prestaciones.ts` | `POST /prima/calcular`, `POST /cesantias/calcular`, `POST /batch/liquidar` |
| [[04_Fin_del_Contrato]] | `indemnizacion.ts`, `liquidacionFinalService.ts` | `POST /indemnizacion/calcular`, `POST /empresa/empleados/:id/liquidacion-final` |
| [[05_Valores_Actualizables]] | `semillaLegal.ts` (valores), `catalogoReglas.ts` (metadatos), `parametrosSnapshotService.ts` (publicación) | `GET /reglas/parametros`, `GET /batch/parametros`, `GET /reglas/verificadas-al` |
| [[06_Aportes_Patronales_y_Parafiscales]] | `costoEmpleador.ts`, `constantes.ts` | `GET /empresa/costos` |
| **(sin archivo en el baúl)** | `retencionFuente.ts` | `POST /retencion/calcular`, `POST /batch/retencion` — ver §6 |

## 3. Cada `clave` de parámetro y su respaldo en el baúl

Las 25 claves que el motor resuelve de `ReglaLegal`, y la sección del baúl que las justifica. Esta tabla es la que el instrumento de sincronía verifica (§5): si aparece una clave nueva en la semilla y no está acá, el test falla.

| `clave` | Sección del baúl |
|---|---|
| `smlmv` | [[05_Valores_Actualizables]] §1 |
| `auxilio_transporte` | [[05_Valores_Actualizables]] §1 |
| `auxilio_transporte_tope_smlmv` | [[05_Valores_Actualizables]] §1 |
| `uvt` | [[05_Valores_Actualizables]] §2 |
| `divisor_hora_ordinaria` | [[05_Valores_Actualizables]] §3 |
| `recargo_dominical` | [[05_Valores_Actualizables]] §4 |
| `recargo_nocturno` | [[05_Valores_Actualizables]] §5 |
| `hora_extra_diurna` | [[05_Valores_Actualizables]] §5 |
| `hora_extra_nocturna` | [[05_Valores_Actualizables]] §5 |
| `max_horas_extra_dia` | [[05_Valores_Actualizables]] §5 |
| `max_horas_extra_semana` | [[05_Valores_Actualizables]] §5 |
| `aporte_salud_empleado` | [[05_Valores_Actualizables]] §6 |
| `aporte_pension_empleado` | [[05_Valores_Actualizables]] §6 |
| `ibc_tope_smlmv` | [[05_Valores_Actualizables]] §6 |
| `fondo_solidaridad_umbral_smlmv` | [[05_Valores_Actualizables]] §6 |
| `limite_deducciones_salario` | [[05_Valores_Actualizables]] §7 |
| `embargo_ordinario_fraccion_excedente` | [[05_Valores_Actualizables]] §7 |
| `embargo_alimentos_pct_max` | [[05_Valores_Actualizables]] §7 |
| `limite_renta_exenta_laboral_uvt_mes` | [[05_Valores_Actualizables]] §8 |
| `limite_deduccion_dependientes_uvt_mes` | [[05_Valores_Actualizables]] §8 |
| `limite_deduccion_salud_uvt_mes` | [[05_Valores_Actualizables]] §8 |
| `limite_rentas_exentas_porcentaje` | [[05_Valores_Actualizables]] §8 |
| `limite_rentas_exentas_uvt_anual` | [[05_Valores_Actualizables]] §8 |
| `limite_porcentaje_afc` | [[05_Valores_Actualizables]] §8 |
| `limite_anual_uvt_afc` | [[05_Valores_Actualizables]] §8 |
| `pago_onchain_prima_pct` | *no es regla legal — política de producto (SDD §17)* |
| `pago_onchain_ventana_horas` | *no es regla legal — política de producto (SDD §17)* |

## 4. Cada línea del comprobante y la regla que la respalda

`CodigoConcepto` es el identificador estable de cada línea de un resultado: la etiqueta se puede traducir o reescribir, el código no. Es el enganche correcto para que la app decida cómo pintar una línea y para que un comprador correlacione lo que recibió con la regla que lo produjo.

| `CodigoConcepto` | Regla en el baúl |
|---|---|
| `SALARIO_BASE`, `AUXILIO_TRANSPORTE`, `AUXILIO_SOSTENIMIENTO`, `HONORARIOS` | [[01_Ingresos_y_Jornada]] → Valores Base |
| `RECARGO_NOCTURNO`, `RECARGO_DOMINICAL`, `RECARGO_NOCTURNO_DOMINICAL` | [[01_Ingresos_y_Jornada]] → recargos (se paga **solo** el porcentaje) |
| `HORA_EXTRA_DIURNA`, `HORA_EXTRA_NOCTURNA`, `HORA_EXTRA_DOMINICAL_DIURNA`, `HORA_EXTRA_DOMINICAL_NOCTURNA` | [[01_Ingresos_y_Jornada]] → horas extra (se paga **hora completa + porcentaje**) |
| `AJUSTE_AUSENTISMO` | [[01_Ingresos_y_Jornada]] → Ausentismo |
| `SALUD_EMPLEADO`, `PENSION_EMPLEADO`, `FONDO_SOLIDARIDAD` | [[02_Descuentos_al_Trabajador]] → deducciones de ley |
| `APORTE_AFC`, `PRESTAMO`, `AHORRO`, `REPROCESO` | [[02_Descuentos_al_Trabajador]] → deducciones por convenio (tope del 50%) |
| `EMBARGO_JUDICIAL` | [[02_Descuentos_al_Trabajador]] → embargos (tope propio, aparte del 50%) |
| `PROVISION_CESANTIAS`, `PROVISION_INTERESES_CESANTIAS`, `PROVISION_PRIMA`, `PROVISION_VACACIONES` | [[03_Beneficios_de_Ley]] → provisión (**no** entra al neto) |
| `LIQUIDACION_FINAL_CESANTIAS`, `LIQUIDACION_FINAL_INTERESES_CESANTIAS`, `LIQUIDACION_FINAL_PRIMA`, `LIQUIDACION_FINAL_VACACIONES` | [[04_Fin_del_Contrato]] → pago efectivo (**sí** entra al neto) |
| `CONCEPTO_DECLARADO` | *ninguna — es una línea que declaró quien llamó, no una regla del motor* |

Cada línea calculada lleva además un campo `ley` con su cita legal (ej. `"Ley 2466 de 2025, art. 2"`). Esa cita y este baúl deben decir lo mismo: son las dos caras del mismo hecho.

## 5. El procedimiento de dos pasos (y el test que lo vigila)

Cambiar un valor legal son **siempre dos pasos**, nunca uno:

1. **Editar [[05_Valores_Actualizables]]** — el número, su norma, su vigencia.
2. **Sembrarlo** en `apps/api/prisma/semillaLegal.ts` como **fila nueva** con su `vigenteDesde`. Nunca editar la fila vieja: una liquidación retroactiva tiene derecho a resolver el valor que estaba vigente en su fecha.
3. Actualizar `REGLAS_VERIFICADAS_AL` en `reglasVerificadasService.ts`, que es la fecha que el API publica como "catálogo verificado al…".

El instrumento que vigila esto es `apps/api/src/services/__tests__/vaultSincronia.test.ts`. Falla si:

*   una `clave` de `REGLAS_SEMILLA` no aparece documentada en el baúl (se sembró un valor sin explicarlo);
*   el baúl documenta una `clave` que no existe en la semilla ni en el catálogo (quedó prosa sobre algo que se borró);
*   un enlace interno del baúl apunta a un archivo que no existe;
*   un archivo del baúl queda huérfano, sin que nadie lo enlace;
*   **una clave deja de resolver en alguna fecha** — ventana cerrada hacia el futuro, hueco entre tramos, o piso posterior a 2021 en las claves que las calculadoras resuelven sin condición.

Es deliberadamente un test y no un linter aparte: corre con `pnpm test`, en el mismo lugar donde ya se verifica que el motor no se rompa.

### El chequeo de vigencias, y por qué es el más importante

`crearResolutorReglas().en()` **lanza excepción** si no encuentra una fila vigente para la fecha pedida. Y `calculadoraTurnos` resuelve cinco claves —`divisor_hora_ordinaria`, `recargo_dominical`, `recargo_nocturno`, `hora_extra_diurna`, `hora_extra_nocturna`— al abrir **cada tramo de días**, antes de saber si el concepto siquiera aplica. Consecuencias de un hueco:

*   No produce un número raro que alguien note revisando: **tumba la liquidación completa**.
*   Falla por la fecha del **periodo liquidado**, no por la de hoy. El bug queda dormido hasta que alguien liquida un mes viejo — o hasta que llega la fecha.

Por eso la utilidad `auditarVigencias(reglas, desde, hasta, claves?)` vive en el motor (`utils.ts`) y no en el test: la usan los dos lados (el fixture de `packages/reglas` y la semilla real en `apps/api`), y un futuro panel admin puede llamarla antes de guardar una fila.

Esto encontró y cerró dos bugs con fecha:

| Clave | Qué pasaba |
|---|---|
| `recargo_dominical` | Solo estaban sembrados los tramos de 2025-07-01 a 2027-06-30. Toda liquidación por turnos anterior a jul-2025 ya fallaba, y el **1-jul-2027** habría fallado la nómina entera. Cerrado: los cuatro tramos sembrados |
| `divisor_hora_ordinaria` | Una sola fila de 220 cubría 2021-01-01 a 2026-07-14, aplicando la jornada de 44h a periodos en que la jornada legal era de 48, 47 o 46 horas — subestimaba el valor de la hora hasta un 9% en retroactivos de 2021 a jul-2025. Cerrado: los cinco escalones de la Ley 2101 sembrados ([[05_Valores_Actualizables]] §3) |
| `smlmv`, `auxilio_transporte`, `uvt` | Tenían **una sola fila**, la de 2026, así que el sistema solo podía liquidar desde 2026 aunque el resto del catálogo cubriera de sobra los años anteriores. A diferencia de los dos de arriba, esta historia no se deduce de la ley: hace falta el valor concreto de cada decreto. Cerrado: 2020-2025 sembrados y verificados ([[05_Valores_Actualizables]] §1 y §2) |

Ningún golden test del motor cambió al corregir los dos primeros, lo que confirma el diagnóstico: las fechas afectadas eran justamente las que ninguna prueba ejercitaba.

Verificado end-to-end contra `POST /api/batch/liquidar` en el contenedor de dev, un domingo de marzo de cada año con el salario mínimo de ese año:

| Periodo | Auxilio aplicado | Recargo dominical | Divisor efectivo |
|---|---|---|---|
| marzo 2020 | $102.854 | 75% | 240 |
| marzo 2021 | $106.454 | 75% | 240 |
| marzo 2022 | $117.172 | 75% | 240 |
| marzo 2023 | $140.606 | 75% | 240 |
| marzo 2024 | $162.000 | 75% | 235 |
| marzo 2025 | $200.000 | 75% | 230 |
| marzo 2026 | $249.095 | 80% | 220 |
| julio 2027 | $249.095 | **100%** | 210 |

Los ocho periodos fallaban antes de este pase: los siete primeros por falta de valor anual, el último por la ventana cerrada del recargo dominical.

> 🗓️ **Dos fechas distintas, a propósito.** [[05_Valores_Actualizables]] lleva la fecha de la última **verificación legal** de los valores. `REGLAS_VERIFICADAS_AL` lleva la del catálogo **sembrado**. Cuando difieren, el baúl va adelante del catálogo — y eso es información, no un error: significa que hay un paso 2 pendiente.

## 6. Estado real de cobertura

Ser honesto acá es el punto de todo el archivo. Un baúl que finge cubrir todo es peor que uno que dice dónde no llega.

### ✅ Documentado e implementado, coincidiendo
Devengo y recargos, deducciones de ley, tope de deducciones, los dos regímenes de embargo, las cuatro prestaciones (provisión y liquidación final), indemnización por despido, período de prueba, costo del empleador con exoneración, los 25 parámetros con vigencia.

### 🟡 Implementado pero **sin archivo de reglas en el baúl**
| Capacidad | Dónde está | Por qué importa |
|---|---|---|
| **Retención en la fuente por salarios** | `retencionFuente.ts`, `POST /batch/retencion` | Es un listing que se **vende**. Sus topes están en [[05_Valores_Actualizables]] §8, pero no hay archivo que explique la depuración del art. 388 en lenguaje llano. Un comprador que pida el fundamento no tiene a dónde llegar |
| **Contratista independiente** | `calculadoraServicios.ts` | Cubierto de forma parcial en [[06_Aportes_Patronales_y_Parafiscales]] §5, sin archivo propio |
| **Aprendiz SENA** | `constantes.ts`, `advertenciasContrato.ts` | Solo mencionado en [[01_Ingresos_y_Jornada]] y [[02_Descuentos_al_Trabajador]] |
| **Motor de QA / advertencias tipadas** | `qa/index.ts` | Cada `IssueQA` cita una norma, pero ninguna regla del baúl explica el catálogo de issues |
| **Pago on-chain** | `pagosService.ts` | No es regla laboral colombiana; su spec vive en `SDD.md` §17 y ahí debe quedarse |

### 🔴 Ni documentado ni implementado
| Hueco | Consecuencia |
|---|---|
| **Incapacidades y licencias** (enfermedad general, laboral, maternidad, paternidad) | El motor solo sabe restar días no remunerados. No sabe que la EPS paga desde el día 3 al 66,67%, ni que la licencia de maternidad la paga la EPS al 100%. Es el hueco más grande de todos: aparece en cualquier nómina real de más de 10 personas |
| **Regímenes especiales** | Servicio doméstico, Piso de Protección Social, magisterio, fuerzas armadas. Anotado como fuera de alcance en [[06_Aportes_Patronales_y_Parafiscales]] |

### 🟠 Deudas de coincidencia entre baúl y código
| Deuda | Detalle |
|---|---|
| **Piso de 1 SMLMV en descuentos por convenio** | [[02_Descuentos_al_Trabajador]] documenta la regla legal completa; el motor aplica solo el tope del 50% del devengado, sin el piso. Divergencia conocida y anotada en los dos lados |
| **Aportes patronales como constantes, no como parámetros** | Los porcentajes de [[06_Aportes_Patronales_y_Parafiscales]] viven en `constantes.ts`, sin vigencia. La exoneración del art. 114-1 ya se movió dos veces por ley; cuando se mueva otra vez no habrá forma de liquidar retroactivamente el periodo anterior |
| **Cinco lugares describen los mismos parámetros** | [[05_Valores_Actualizables]], `semillaLegal.ts`, el fixture `__tests__/fixtures.ts` del motor, `catalogoReglas.ts` y el `CATALOGO_PUBLICO` de `parametrosSnapshotService.ts`. El test de §5 cubre el baúl contra la semilla, y audita vigencias en los dos catálogos por separado — pero que el fixture y la semilla tengan los **mismos valores** sigue siendo a mano. El fixture existe por una razón válida (el motor no debe depender de Prisma para testearse), así que la salida no es borrarlo sino generarlo |
| **Piso de la retención en la fuente** | La nómina liquida desde 2020, pero la **retención solo desde 2023**: los topes del art. 336 los cambió la Ley 2277 de 2022 y esa misma ley unificó la tabla de tarifas del art. 383, que vive como constante estructural en `constantes.ts` y no como clave con vigencia. Sembrar los topes viejos sin migrar la tabla daría un número plausible y falso, así que se prefiere que lance. Cerrarlo de verdad exige convertir `TABLA_RETENCION_FUENTE_ART_383` en un valor con vigencia — ver [[05_Valores_Actualizables]] §2 |

## 7. Cómo lo usa la app, y cómo lo usa el API

**La app** (`apps/web`) no muestra este baúl, pero le debe su vocabulario: los agrupadores del recibo (`esRecargoOExtra`, `esIngresoSalarial`, `esDevengoBase` en `conceptos.ts`) son la versión ejecutable de las categorías de [[01_Ingresos_y_Jornada]]. Cuando la app tiene que explicarle a alguien por qué su recibo dice lo que dice, la explicación correcta es la de este baúl, no una redacción nueva.

**El API** cita el baúl en tres lugares hoy:
*   `GET /reglas/verificadas-al` — devuelve fecha, hash del catálogo y el campo `fuente`, que apunta a `sdd/vault/`.
*   `GET /reglas/parametros` y `GET /batch/parametros` — el snapshot firmado de los parámetros, cuyo respaldo humano es [[05_Valores_Actualizables]].
*   El campo `ley` de cada línea de resultado — la cita legal que este baúl desarrolla.

**Para Execution Market**, la cadena completa que un comprador puede recorrer es:

```
recibo firmado
   → campo `ley` de la línea            (cita legal puntual)
   → `reglasHash`                        (qué catálogo la produjo)
   → GET /reglas/verificadas-al          (cuándo se verificó ese catálogo)
   → 07_Trazabilidad_Codigo (este archivo)  (qué regla del baúl la respalda)
   → 01–06 del baúl                      (la regla, en lenguaje llano)
   → artículo del CST / decreto          (la fuente oficial)
```

Cada eslabón es verificable sin confiar en el anterior. Eso es lo que se está vendiendo.
