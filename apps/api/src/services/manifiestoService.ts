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
//
// ── En INGLÉS, claves incluidas (2026-08-31) ───────────────────────────────
//
// Mismo motivo y mismo bump que el quickstart y el pricing.
import { origenPublico } from "../lib/pagosConfig.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

export function construirManifiesto() {
  const base = origenPublico();

  return {
    schemaVersion: "nomicheck-manifiesto/v2",
    canonical: `${base}/api/batch/manifiesto`,

    thesis: "Compute is a commodity. Proof is not.",

    whatWeBelieve: [
      "An output only its author can check is worth nothing. That is why every " +
        "report ships signed and verifies without talking to this server.",
      "A valid signature proves WHO said it, not that it is correct. That is why " +
        "the document declares which catalog it was computed against, and from when.",
      "Charging based on what we find is the incentive a verifier must not have. " +
        "The pre-check is free and the report costs the same with one finding or " +
        "with twenty.",
      "Missing data is `null`, never `0`. A zero is a claim: it says the law " +
        "mandates zero. What has no legal basis is marked as such.",
      "Payment authenticates. No accounts, no API keys, no sign-up.",
      "Validating is not serving: a malformed body is rejected BEFORE charging.",
      "We are not an oracle: we are a source of evidence anyone can recompute " +
        "against the published norms.",
    ],

    // Lo que este servicio NO puede afirmar, dicho antes de que alguien lo
    // asuma. El estado más peligroso de un verificador es el que se lee como
    // más de lo que es.
    whatWeDoNotClaim: [
      "A `correcto` verdict says the line is derivable from the declared catalog " +
        `(verified as of ${REGLAS_VERIFICADAS_AL}), not that that catalog is the one ` +
        "in force today, nor that your case has no particularities.",
      "It is not an accounting opinion or legal advice (Colombian Law 43/1990).",
      "It does not cover bonuses, commissions or extralegal concepts: with no legal " +
        "basis to derive them, they are marked `no_verificable_extralegal` and stay " +
        "out of the net effect.",
      "It does not compute your payroll: it verifies one that already exists.",
      "It stores nothing. There is no history to query afterwards (Law 1581/2012).",
    ],

    // ── La sección que importa ───────────────────────────────────────────
    knownWeaknesses: [
      {
        what: "This project produced 37 false claims in its own documentation, across six rounds.",
        when: "2026-07",
        detail:
          "All with the tests green. The lesson became method: every figure has a " +
          "single place where it is asserted, and an auditor compares it against the " +
          "real world on every run. An `exit 0` does not prove something is right: it " +
          "proves that what the scripts know how to look at is still in place.",
      },
      {
        what: "The executor wallet was burned by an exposed key.",
        when: "2026-07-28",
        detail:
          "The whole identity was rotated and the old key controls nothing. The agent " +
          "card kept publishing the compromised wallet while three auditors stayed " +
          "green, because none of them looked at that field. Today they do.",
      },
      {
        what: "The paywall charged without delivering, once.",
        when: "2026-08-03",
        detail:
          "It took two payments to discover. From it came the rule of charging only " +
          "when we can serve, and the payment settles before executing but after " +
          "validating.",
      },
      {
        what: "The paywall charged before validating: a malformed body paid and got a 400.",
        when: "2026-08-15",
        detail:
          "Fixed. In x402 the payment is final, so a buyer's typo was money lost with " +
          "no refund possible. We found it reading the manifesto of another service " +
          "that publishes this same weakness.",
      },
      {
        what: "The per-IP request cap could be evaded by rotating a header.",
        when: "2026-08-09",
        detail:
          "Forty out of forty passed against a cap of ten. Fixed by using the edge's " +
          "IP. It is only non-forgeable because the origin is not reachable without " +
          "going through the proxy.",
      },
      {
        what: "We served nonexistent routes with a 200 and the site's HTML.",
        when: "2026-08-15",
        detail:
          "The client-side fallback caught everything, so `/llms.txt` answered with a " +
          "200 and the SPA page. A 200 that lies is worse than a 404.",
      },
      {
        what: "Nobody has bought from us yet.",
        when: "today",
        detail:
          "Zero orders on the marketplace where we are listed. The service works end " +
          "to end with real money through the other rail, but hiding this would be " +
          "the manifesto's first lie.",
      },
    ],

    howToCheckAllOfIt: {
      oneClick: `https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo`,
      key: `${base}/api/batch/publickey`,
      pricing: `${base}/api/batch/pricing`,
      start: `${base}/api/batch/quickstart`,
      format: "https://github.com/yvalenta/sobre",
      note:
        "We do not ask you to trust the verdict: we give you the key, the catalog it " +
        "was computed against, and four independent implementations of the verifier " +
        "so you do not even depend on ours.",
    },
  };
}

/** Cuántas debilidades declara. Una lista que se vacía deja de ser honesta. */
export function cantidadDeDebilidades(): number {
  return construirManifiesto().knownWeaknesses.length;
}
