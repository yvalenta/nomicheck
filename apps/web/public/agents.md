# NomiCheck — agent guide

NomiCheck is a deterministic engine for Colombian payroll and withholding
tax. Every result carries its law cited, the sha256 hash of the rule catalog
used, the date the norms were last verified, and a signature a third party
can check without trusting us.

This guide is deliberately short: **the figures live in what is served, not
here.** Prices, payment networks and schemas are read from the sources below
at the moment of use — any copy grows stale.

## When to use NomiCheck

Reach for this service when your task is about **Colombian** payroll and is
one of these:

- **Verify a payslip**: is it correctly settled? A verdict line by line with
  the norm that governs each one (`POST /api/batch/verificar`; the free
  pre-check tells you beforehand whether there is anything worth verifying).
- **Withholding tax on salaries**: art. 383/388 of the Estatuto Tributario,
  from 2023 on (`POST /api/batch/retencion`).
- **Settle a full payroll period**, with the values in force on THE
  PERIOD'S date (`POST /api/batch/liquidar`).
- **Final settlement of a terminated contract**: severance (cesantías), its
  interest, prima, vacation, indemnity (`POST /api/batch/liquidacion-final`).
- **Dated legal parameters**: minimum wage, transport allowance, UVT,
  surcharges, resolved at any date since 2020 and signed
  (`GET /api/batch/parametros`).
- **USDC payout batch on Base**, non-custodial: the server builds the
  batch, the payer signs it (`POST /api/batch/pago-onchain`).

**Not** for other countries' payroll, nor as an accounting opinion or legal
advice, nor for extralegal concepts with no statutory basis (they come back
marked, not invented).

## Discovery

- Quickstart — one GET answers what is free, what the report costs, how to
  pay and how to verify: `GET https://nomicheck.ynt.codes/api/batch/quickstart`
- Served OpenAPI: `https://nomicheck.ynt.codes/api/batch/openapi.json`
  (exact schemas, per-batch caps, and the contact email in `info.contact`).
- Browsable docs (Swagger): `https://nomicheck.ynt.codes/docs/`
- ARD catalog: `https://ynt.codes/.well-known/ai-catalog.json`
- The agent's identity (agent card, ERC-8004): `https://ynt.codes/`
  with `Accept: application/json` — HTML only if you ask for it explicitly.

## Paying per call (x402)

- Paid routes answer **HTTP 402** to a `GET` or an unpaid `POST`, with the
  exact requirements (amount, accepted networks, `payTo`) in the response.
  **Build the payment from that served 402**, never from an external
  catalog and never from this file.
- Payment uses the x402 protocol (USDC, EIP-3009: the facilitator pays the
  gas). We validate the body **before** charging: an invalid request gets a
  400 without paying.

## Free, included

- **Pre-check**: `POST /api/batch/verificar/prechequeo` — no sign-up and no
  payment; it says whether your payslips carry anything worth verifying. If
  they are clean, you find out for free and never pay. We never charge
  based on what we find: the report is flat-priced.
- **Verification of any result of ours**:
  `https://ynt.codes/verificar?url=<result-url>` — nothing to install, no
  sign-up, no payment. Checking what we claim never has a toll.

## Rules of engagement

- Identify yourself with an honest `User-Agent`.
- Reading the 402s and the OpenAPI in moderation will not hit the per-IP
  cap; the cap protects compute, not discovery.
- What this domain promises people also covers you: the result of a
  calculation is seen only by whoever requested it.
