# Precio para empresas — la decisión, y de dónde sale cada número

**Decidido el 2026-08-15.** Hasta ese día el portal de empresa **no tenía precio de ninguna clase** —ni plan, ni prueba, ni mensualidad— y eso bloqueaba la salida B: se pueden conseguir leads sin precio, pero no ventas.

Este archivo dice **qué se cobra, cuánto, y por qué ese número y no otro**. Distingue en cada renglón lo **medido** de lo **supuesto**, porque un precio construido sobre una cifra inventada se descubre en la primera negociación.

---

## Lo que se cobra

**El portal sigue gratis. Lo que cuesta es la evidencia firmada.**

Una empresa se registra con NIT, carga su gente, liquida sus periodos, revisa discrepancias y exporta PILA **sin pagar nada y sin límite**. Lo que se paga es **cerrar el periodo con evidencia**: la respuesta firmada con Ed25519 sobre el payload completo, con el `reglasHash` del catálogo legal que la produjo y el artículo citado línea por línea — lo que sirve ante una inspección o una demanda, y lo que un tercero puede verificar sin volver a preguntarnos nada.

| Empleados | COP / mes | Qué incluye |
|---|---|---|
| 1 – 10 | **$19.000** | Todos los periodos del mes, cerrados con evidencia firmada |
| 11 – 45 | **$49.000** | ídem |
| 46 – 150 | **$99.000** | ídem |
| más de 150 | **conversación** | El volumen cambia el soporte, no el cómputo |

**Por mes, no por periodo.** Una empresa con nómina quincenal cierra dos veces y paga una: cobrar por cierre castigaría a quien paga más seguido a su gente, que es exactamente al revés de lo que queremos premiar.

**Facturado en COP**, por transferencia o factura. No hay tarjeta ni USDC de por medio: fue el hueco que bloqueó todo el funnel humano, y en B2B no hace falta cruzarlo — una empresa ya sabe pagar una factura.

---

## Por qué se cobra la evidencia y no el cálculo

Tres razones, en orden de peso.

**1. Es lo único escaso.** Alegra, Siigo y Nubox ya calculan nómina, y lo hacen bien. Lo que ninguno entrega es una respuesta **firmada y verificable por un tercero** con el hash del catálogo legal que la produjo. Cobrar el cálculo es cobrar la parte que es commodity; cobrar la evidencia es cobrar la parte que solo tenemos nosotros.

**2. No contradice ninguna promesa ya servida.** `/servicios` publica hoy, y es cierto: *«El mismo endpoint cuesta lo mismo para una empresa que para un agente: lo que cambia no es el precio, es cuánto tiempo humano hace falta para pedirlo.»* Una suscripción por asiento habría vuelto falsa esa frase — pasaría a haber dos precios para el mismo cómputo según quién pregunte. Cobrar el cierre con evidencia es una **línea nueva**, no un segundo precio para lo mismo: los cinco endpoints del muro conservan sus US$0,02 intactos.

**3. Alinea el incentivo con la regla de la casa.** `/api/batch/pricing` publica la regla que este servicio no puede romper: *jamás se cobra según lo que se encuentre*. Un precio plano por mes la respeta en el peor caso — el mes en que la evidencia destapa veinte discrepancias cuesta lo mismo que el mes limpio.

---

## De dónde salen los números

### Lo medido (2026-08-15)

**El ancla de mercado — Alegra Nómina Colombia**, precio de lista mensual sin descuento anual, leído de su página de precios:

| Plan | COP / mes | Empleados | COP por empleado en el techo de la banda |
|---|---|---|---|
| Emprendedor | $29.900 | 1 – 10 | $2.990 |
| Pyme | $69.000 | 11 – 20 | $3.450 |
| Pro | $139.000 | 21 – 45 | $3.089 |
| Plus | $259.000 | 45 – 90 | $2.878 |

Con pago anual anticipado, −25 %. El mercado colombiano de nómina cobra, entonces, del orden de **$3.000 COP por empleado/mes**, con notable consistencia entre bandas.

**Y NomiCheck no compite con eso — lo complementa.** Está escrito en el propio producto, con cita legal y una prueba que lo vigila: la salida **no es documento soporte de pago de nómina electrónica (DIAN Res. 000013 de 2021)**. Una empresa sigue necesitando su suite para cumplirle a la DIAN. Somos la capa de prueba encima, no el reemplazo.

**Eso fija el techo del precio**: un complemento no puede costar como el producto principal. Las tres bandas quedan **por debajo de la banda equivalente de Alegra** —$19.000 vs $29.900, $49.000 vs ~$69.000–139.000, $99.000 vs $139.000–259.000— y se leen como una línea más en el presupuesto, no como una decisión de reemplazo.

**El piso del costo — y por qué no manda.** El hosting cuesta **$12 USD/mes** (bundle Lightsail, afirmado en `nomicheck_ops`), y es **fijo**. Medido el 2026-08-15 sobre 30 días: la zona movió **0,38 GB contra un tope de 3.000 GB — el 0,013 %**. La infraestructura está sobredimensionada unas 7.700 veces para el uso actual, así que **el costo marginal de sumar una empresa es aproximadamente cero**.

Contra ese piso, a una tasa medida de **3.137,74 COP/USD** (2026-08-16) los $12 USD del hosting son **≈ $37.700 COP/mes**:

| Banda | COP/mes | USD | Cubre el hosting |
|---|---|---|---|
| 1 – 10 | $19.000 | $6,06 | 0,50× — hacen falta **dos** empresas |
| 11 – 45 | $49.000 | $15,62 | **1,30× — una sola alcanza** |
| 46 – 150 | $99.000 | $31,55 | 2,63× |

> **Conclusión incómoda pero útil: el costo no puede fijar este precio.** Con **una empresa de la banda media, o dos de la más barata**, el hosting queda cubierto — y a partir de ahí todo lo demás es margen, porque el costo marginal es cero. Si el precio se hubiera derivado del costo habría dado algo absurdo como $2.000 COP/mes. Lo que lo fija es el valor y el ancla de mercado; el costo solo dice que **ninguna banda de esta tabla pierde plata**.
>
> La tasa es un dato de contexto y **caduca**: se cita con fecha justamente para que nadie la lea como fija. El precio está denominado en pesos y no se recalcula cuando el dólar se mueve.

### Lo supuesto, dicho como supuesto

- **Las tres cifras de la tabla son una propuesta, no una medición.** Se anclaron contra Alegra y se decidieron; **nadie las ha pagado todavía**. La primera empresa que negocie es el primer dato real, y hasta entonces esta tabla es una hipótesis con fundamento, no un hecho.
- **Los cortes de banda (10 / 45 / 150)** siguen la forma del mercado, no una medición nuestra de dónde cambia el trabajo.
- **No se supone tipo de cambio.** El precio se fija y se factura en pesos: convertirlo desde dólares lo haría moverse con una tasa que el comprador no controla ni le importa.

---

## Lo que hay que construir para poder cobrarlo

~~El precio está decidido; **el mecanismo no existe**.~~ **Construido el 2026-08-16** (`356a876`). Lo que hay:

1. ~~Contar cierres de periodo con evidencia por empresa y por mes~~ — `services/medidorCierres.ts`, puro y con pruebas. **Es el sitio de afirmación del precio**: la tabla de bandas vive ahí y en ningún otro lado.
2. ~~Banda recalculada al cierre~~ — y la fija el **máximo de empleados del mes**, no la suma: sumar las dos quincenas de la misma gente duplicaba la nómina y empujaba a una banda que no toca.
3. ~~Un estado de cuenta que la empresa pueda ver antes de la factura~~ — `GET /empresa/cuenta`, con el mismo cálculo que producirá el monto, y diciendo qué **no** se cobra y por qué.
4. **La factura en sí — lo único que falta.** Al principio puede ser manual: con las primeras empresas, emitirla a mano cuesta menos que integrar una pasarela, y enseña qué hace falta de verdad.

**Lo que hubo que construir antes y no estaba previsto acá: el portal no firmaba nada.** El servicio de firma existía, pero solo lo usaba la API batch — así que «cobrar la evidencia» no tenía sujeto. Ahora cada cierre terminal deja una `EvidenciaCierre` firmada con Ed25519 sobre el payload canónico, con el `reglasHash` del catálogo que lo produjo.

> **La guarda del mismo tipo que rige el muro x402** (`leyes/cobrar-antes-de-servir`): **no se factura un cierre cuya evidencia no verifique.**
>
> Verificado contra Postgres de verdad, no solo en pruebas: se editó la fila en la base para saltar de banda (`conEvidencia` de 8 a 400), la firma dejó de validar, **ese cierre quedó excluido, la banda se mantuvo en 8 y el estado de cuenta nombró cuál quedó afuera**. La manipulación no compró nada. Cobrar por una prueba que no prueba sería exactamente el error que este producto existe para señalar.

---

## Qué cambia esto en las piezas ya escritas

- **`campanas-meta-ads.md`, campaña 3**: el gancho de cifra estaba tachado con *«no hay cifra que validar»*. Ya la hay. Y la línea de copy tachada —*«Prueba gratis 30 días. Sin tarjeta»*— sigue tachada: no hay prueba de 30 días. **Lo que sí es cierto y es más fuerte: el portal es gratis, sin límite de tiempo, y solo se paga la evidencia.**
- **`/api/batch/pricing`**: hoy publica los cinco precios del muro con su defensa escrita. Cuando el cierre con evidencia se pueda cobrar, entra ahí — generado del código, como todo lo demás, y no escrito a mano.
- **`/servicios`**: la calculadora de ahorro compara «como lo hacés hoy» contra «como empresa» sumando *minutos de portal × costo hora × volumen + llamadas*. Ese modelo queda **incompleto**: le falta el renglón del cierre con evidencia. Actualizarlo antes de que alguien lo use para decidir.

---

**Enlaces:** `posicionamiento.md` · `campanas-meta-ads.md` · `nomicheck_ops/docs/estado/mercado.md`
