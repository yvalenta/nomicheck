# 🔄 Valores Actualizables (Tabla Maestra 2026)

Este archivo es la **única fuente de verdad** para los valores que cambian cada año o cada vigencia. Ningún otro archivo del baúl debe escribir un número "a mano" — todos deben remitir aquí con la nota `(ver [[05_Valores_Actualizables]])`. Así, cuando el Gobierno expida el decreto de enero, **solo se edita este archivo** y el resto del baúl queda correcto automáticamente.

> 🗓️ **Última verificación:** 21 de julio de 2026.
> ⚠️ Todo valor en este archivo debe llevar su fuente (decreto, ley o resolución) y su fecha de vigencia. Si no tiene fuente, no se usa.

---

## 1. Salario y Auxilio de Transporte 2026

| Concepto | Valor 2026 | Norma |
|---|---|---|
| Salario Mínimo Legal Mensual Vigente (SMLMV) | **$1.750.905** | Decreto 1469 del 29 de diciembre de 2025 |
| Auxilio de Transporte | **$249.095** | Decreto 1470 del 29 de diciembre de 2025 |
| Ingreso mínimo total (SMLMV + Auxilio) | **$2.000.000** | — |
| Auxilio de conectividad digital (teletrabajo) | $249.095 (mismo valor y condiciones del auxilio de transporte) | Art. 53, Ley 2466 de 2025 |

> ⚠️ **Situación jurídica del decreto (importante):** El Decreto 1469 de 2025 estuvo suspendido provisionalmente por el Consejo de Estado entre el 12 de febrero de 2026 y el 17 de julio de 2026, mientras se resolvía una demanda de nulidad por falta de motivación técnica del incremento del 23,7%. El 17 de julio de 2026 el Consejo de Estado **revocó la suspensión** y el decreto volvió a tener plena vigencia. Durante todo el proceso el valor pagado a los trabajadores **nunca cambió** ($1.750.905), porque el Gobierno expidió un decreto transitorio (Decreto 159 de 2026) que mantuvo la misma cifra. El proceso de nulidad de fondo sigue abierto: si el sistema de nómina necesita blindarse contra un fallo definitivo que anule el decreto, este es el punto a vigilar. Fuente: Consejo de Estado, Sección Segunda, auto del 17 de julio de 2026.

**Regla de negocio recomendada para el software:** guardar el SMLMV como un parámetro con vigencia (`fecha_inicio`, `fecha_fin`, `valor`, `fuente`) y no como una constante fija en el código, precisamente porque este valor puede volver a estar en disputa judicial.

---

## 2. UVT (Unidad de Valor Tributario) 2026

| Concepto | Valor |
|---|---|
| UVT 2026 | **$52.374** |
| Norma | Resolución DIAN 000238 del 15 de diciembre de 2025 |
| Uso en nómina | Topes de retención en la fuente por salarios, sanciones mínimas, y otros topes tributarios que dependen de la nómina. |

---

## 3. Jornada Laboral y Horario Nocturno (¡cambió respecto a años anteriores!)

| Concepto | Valor 2026 | Norma |
|---|---|---|
| Jornada máxima semanal | **42 horas** | Ley 2101 de 2021 (reducción gradual: 47h → 46h → 44h → **42h desde el 15 de julio de 2026**) |
| Horario nocturno | **7:00 p.m. a 6:00 a.m.** | Ley 2466 de 2025, vigente desde el **25 de diciembre de 2025** (antes era de 9:00 p.m. a 6:00 a.m.) |

> ✏️ Este es un cambio crítico frente a la versión anterior de este baúl: el horario nocturno **ya no empieza a las 9:00 p.m., sino a las 7:00 p.m.** Cualquier cálculo hecho con el horario viejo subestima el recargo nocturno de los trabajadores.

---

## 4. Recargo por Domingo o Festivo (tabla progresiva — ¡ya no es un valor fijo del 75%!)

La Ley 2466 de 2025 subió el recargo dominical/festivo de forma gradual. **No existe un único porcentaje**: depende de la fecha en la que se trabajó.

| Vigencia | Recargo dominical/festivo |
|---|---|
| Hasta el 30 de junio de 2025 | 75% |
| 1 de julio de 2025 – 30 de junio de 2026 | 80% |
| **1 de julio de 2026 – 30 de junio de 2027 (vigente hoy)** | **90%** |
| Desde el 1 de julio de 2027 | 100% |

> ⚠️ **Regla de bloqueo actualizada:** al liquidar cualquier turno dominical o festivo, el sistema debe verificar la **fecha exacta** del turno y aplicar el porcentaje correspondiente a esa fecha, no solo el porcentaje "actual". Esto es indispensable para liquidaciones retroactivas o correcciones de nómina de meses anteriores.

*Nota: el recargo nocturno ordinario (35%) y la hora extra nocturna (75%) no cambiaron de porcentaje, solo cambió el horario en el que empiezan a contar (ver sección 3).*

---

## 5. Fondo de Solidaridad Pensional (tabla progresiva por rango salarial)

Aplica a quienes devengan un Ingreso Base de Cotización igual o superior a 4 SMLMV (para 2026: **$7.003.620**). El archivo [[02_Descuentos_al_Trabajador]] explicaba solo un tramo del 1%; en realidad la tarifa sube por rangos:

| Rango (en SMLMV) | Aporte adicional al Fondo de Solidaridad |
|---|---|
| De 4 hasta 16 | 1,0% |
| De 16 hasta 17 | 1,2% |
| De 17 hasta 18 | 1,4% |
| De 18 hasta 19 | 1,6% |
| De 19 hasta 20 | 1,8% |
| Más de 20 | 2,0% |

*Fuente: Art. 2.2.14.1.6 del Decreto 1833 de 2016 (compilatorio), vigente a la fecha de esta revisión. Este aporte lo paga en su totalidad el trabajador, sumado a su 4% de pensión.*

> 🔭 **A vigilar:** hay proyectos de reforma pensional en discusión en el Congreso que proponen tarifas más altas para este fondo (hasta 3% en el tramo superior). Mientras no se sancione y publique una ley que las modifique, la tabla vigente es la de arriba.

---

## 6. Checklist de mantenimiento anual

Cada 1 de enero (o cuando se publique el decreto correspondiente), actualizar en este archivo y solo aquí:

- [ ] Nuevo SMLMV (decreto de diciembre del año anterior)
- [ ] Nuevo Auxilio de Transporte (decreto de diciembre del año anterior)
- [ ] Nueva UVT (resolución DIAN de diciembre)
- [ ] Verificar si cambia el tramo de recargo dominical/festivo (próximo salto: 1 julio 2027 → 100%)
- [ ] Verificar litigios pendientes sobre el decreto del salario mínimo
- [ ] Verificar si el Congreso aprobó la reforma pensional (cambiaría la tabla del Fondo de Solidaridad y las tarifas de salud/pensión)
