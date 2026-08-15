// `/api/batch/manifiesto`: en qué creemos, y **qué sabemos que está flojo**.
//
// ── Por qué se publica lo que falla ────────────────────────────────────────
//
// La idea es prestada de describe.net, cuyo manifiesto tiene una sección de
// vulnerabilidades reconocidas: publican que su defensa contra brigadas falla
// ante un actor individual, y que la mayoría de sus calificaciones vienen de
// una sola campaña. Eso es lo que los vuelve creíbles — no la lista de
// principios, que la escribe cualquiera.
//
// Nosotros teníamos el material —seis rondas de afirmaciones falsas, una
// wallet quemada, un 200 que mentía— y lo teníamos **puertas adentro**, en un
// vault que nadie de afuera lee. Un servicio que vende evidencia verificable y
// esconde sus fallas está pidiendo exactamente la confianza que dice no
// necesitar.
//
// ── La regla de esta lista ─────────────────────────────────────────────────
//
// Solo entra lo que **pasó de verdad y está medido**. Nada de "podría fallar
// si…": eso es humildad de folleto. Cada límite de acá tiene su fecha y, casi
// siempre, la guarda que salió de él.
import { origenPublico } from "../lib/pagosConfig.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

export function construirManifiesto() {
  const base = origenPublico();

  return {
    schemaVersion: "nomicheck-manifiesto/v1",
    canonical: `${base}/api/batch/manifiesto`,

    tesis: "El cálculo es commodity. La prueba no.",

    enQueCreemos: [
      "Una salida que solo su autor puede comprobar no vale nada. Por eso cada " +
        "informe sale firmado y se verifica sin hablar con este servidor.",
      "Una firma válida prueba QUIÉN lo dijo, no que sea correcto. Por eso el " +
        "documento declara contra qué catálogo se calculó y de cuándo es.",
      "Cobrar según lo que se encuentra es el incentivo que un verificador no " +
        "puede tener. El pre-chequeo es gratis y el informe cuesta lo mismo con " +
        "un hallazgo o con veinte.",
      "La ausencia de dato es `null`, nunca `0`. Un cero es una afirmación: dice " +
        "que la ley manda cero. Lo que no tiene base legal se marca como tal.",
      "El pago autentica. Sin cuentas, sin claves de API, sin registro.",
      "Validar no es servir: un cuerpo mal formado se rechaza ANTES de cobrar.",
      "No somos un oráculo: somos una fuente de evidencia que cualquiera puede " +
        "recalcular contra la norma publicada.",
    ],

    // Lo que este servicio NO puede afirmar, dicho antes de que alguien lo
    // asuma. El estado más peligroso de un verificador es el que se lee como
    // más de lo que es.
    loQueNoAfirmamos: [
      "Un veredicto `correcto` dice que la línea es derivable del catálogo " +
        `declarado (verificado al ${REGLAS_VERIFICADAS_AL}), no que ese catálogo ` +
        "sea el vigente hoy ni que tu caso no tenga particularidades.",
      "No es dictamen contable ni asesoría legal (Ley 43/1990).",
      "No cubre bonos, comisiones ni conceptos extralegales: sin base legal para " +
        "derivarlos, se marcan `no_verificable_extralegal` y quedan fuera del neto.",
      "No calcula tu nómina: verifica una que ya existe.",
      "No guarda nada. No hay historial que consultar después (Ley 1581/2012).",
    ],

    // ── La sección que importa ───────────────────────────────────────────
    debilidadesConocidas: [
      {
        que: "Este proyecto produjo 37 afirmaciones falsas en su propia documentación, en seis rondas.",
        cuando: "2026-07",
        detalle:
          "Todas con los tests en verde. La lección quedó como método: cada cifra " +
          "tiene un único lugar donde se afirma, y un auditor la compara contra el " +
          "mundo real en cada corrida. Un `exit 0` no prueba que algo esté bien: " +
          "prueba que lo que los scripts saben mirar sigue en su lugar.",
      },
      {
        que: "La wallet del executor se quemó por una clave expuesta.",
        cuando: "2026-07-28",
        detalle:
          "Se rotó la identidad completa y la clave vieja no controla nada. El " +
          "agent card estuvo publicando la wallet comprometida mientras tres " +
          "auditores daban verde, porque ninguno miraba ese campo. Hoy lo miran.",
      },
      {
        que: "El muro cobró sin entregar, una vez.",
        cuando: "2026-08-03",
        detalle:
          "Costó dos pagos descubrirlo. De ahí salió la regla de cobrar solo " +
          "cuando se puede servir, y el pago se liquida antes de ejecutar pero " +
          "después de validar.",
      },
      {
        que: "El muro cobraba antes de validar: un cuerpo mal formado se pagaba y devolvía 400.",
        cuando: "2026-08-15",
        detalle:
          "Corregido. En x402 el pago es final, así que un typo del comprador era " +
          "plata perdida sin reembolso posible. Lo encontramos leyendo el " +
          "manifiesto de otro servicio que publica esta misma debilidad.",
      },
      {
        que: "El tope de peticiones por IP era evadible rotando un encabezado.",
        cuando: "2026-08-09",
        detalle:
          "Cuarenta de cuarenta pasaron contra un tope de diez. Corregido usando " +
          "la IP del borde. Solo es no-falsificable porque el origen no es " +
          "alcanzable sin pasar por el proxy.",
      },
      {
        que: "Servíamos rutas inexistentes con 200 y el HTML de la web.",
        cuando: "2026-08-15",
        detalle:
          "El fallback del cliente atrapaba todo, así que `/llms.txt` respondía " +
          "una página con éxito. Un 200 que miente es peor que un 404.",
      },
      {
        que: "Nadie nos ha comprado todavía.",
        cuando: "hoy",
        detalle:
          "Cero órdenes en el marketplace donde estamos listados. El servicio " +
          "funciona de punta a punta con dinero real por el otro riel, pero " +
          "esconder esto sería la primera mentira del manifiesto.",
      },
    ],

    comoComprobarloTodo: {
      unClic: `https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo`,
      llave: `${base}/api/batch/publickey`,
      precios: `${base}/api/batch/pricing`,
      empezar: `${base}/api/batch/quickstart`,
      formato: "https://github.com/yvalenta/sobre",
      nota:
        "No te pedimos que confíes en el veredicto: te damos la llave, el " +
        "catálogo con el que se calculó, y cuatro implementaciones " +
        "independientes del verificador para que no dependas ni de la nuestra.",
    },
  };
}

/** Cuántas debilidades declara. Una lista que se vacía deja de ser honesta. */
export function cantidadDeDebilidades(): number {
  return construirManifiesto().debilidadesConocidas.length;
}
