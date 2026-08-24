import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { INFO_SERVIDOR } from "@pv/mcp";
import { PRECIOS_USD } from "../../lib/x402Config.js";
import {
  SKILL_NOMBRE,
  construirAgentCardA2a,
  construirApiCatalog,
  construirArd,
  construirAuthMd,
  construirIndiceSkills,
  construirPrm,
  construirServerCardMcp,
  construirSkillMd,
  enlacesDescubrimiento,
} from "../descubrimientoService.js";

// La capa de descubrimiento es metadata QUE OTROS validan contra su spec
// (RFC 9727, ARD, agent-skills 0.2.0). Lo que se prueba acá es conformidad de
// forma — y las dos decisiones de honestidad: que el digest del skill salga de
// los mismos bytes servidos, y que auth.md diga de frente que no hay OAuth en
// vez de callarlo.

describe("api-catalog (RFC 9727)", () => {
  it("es un linkset con anchor y las relaciones service-desc/service-doc/status", () => {
    const cat = construirApiCatalog() as {
      linkset: Array<Record<string, Array<{ href?: string }> | string>>;
    };
    expect(Array.isArray(cat.linkset)).toBe(true);
    expect(cat.linkset.length).toBeGreaterThanOrEqual(1);
    for (const entrada of cat.linkset) {
      expect(typeof entrada.anchor).toBe("string");
      expect(String(entrada.anchor)).toMatch(/^https:\/\//);
      for (const rel of ["service-desc", "service-doc", "status"] as const) {
        const enlaces = entrada[rel] as Array<{ href?: string }>;
        expect(Array.isArray(enlaces), `falta la relación ${rel}`).toBe(true);
        for (const e of enlaces) expect(e.href).toMatch(/^https:\/\//);
      }
    }
  });
});

describe("manifiesto ARD del origen", () => {
  const ard = construirArd() as {
    specVersion: string;
    host: { displayName: string; identifier: string };
    entries: Array<Record<string, unknown>>;
  };

  it("trae specVersion, host con identidad, y entradas", () => {
    expect(ard.specVersion.length).toBeGreaterThan(0);
    expect(ard.host.displayName).toBe("NomiCheck");
    expect(ard.host.identifier).toMatch(/^https:\/\//);
    expect(ard.entries.length).toBeGreaterThanOrEqual(3);
  });

  it("cada entrada: urn:air del dominio, tipo, y EXACTAMENTE una de url/data", () => {
    for (const e of ard.entries) {
      expect(String(e.identifier)).toMatch(/^urn:air:nomicheck\.ynt\.codes:[a-z]+:[a-z-]+$/);
      expect(String(e.displayName).length).toBeGreaterThan(0);
      expect(String(e.type)).toMatch(/^(application|text)\//);
      // "never both, never neither" — la regla literal del spec.
      const tieneUrl = "url" in e;
      const tieneData = "data" in e;
      expect(tieneUrl !== tieneData, `${e.identifier}: url y data son excluyentes`).toBe(true);
    }
  });

  it("cada entrada trae 2-5 representativeQueries para el índice semántico", () => {
    for (const e of ard.entries) {
      const consultas = e.representativeQueries as string[];
      expect(consultas.length, String(e.identifier)).toBeGreaterThanOrEqual(2);
      expect(consultas.length, String(e.identifier)).toBeLessThanOrEqual(5);
    }
  });

  it("no copia la identidad del apex: APUNTA a su agent card", () => {
    const card = ard.entries.find((e) => String(e.identifier).endsWith(":agent:card"));
    expect(card?.url).toBe("https://ynt.codes/.well-known/agent-card.json");
    // Y no lleva wallet ni llave adentro: eso vive en el card, no acá.
    expect(JSON.stringify(ard)).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });
});

describe("auth.md", () => {
  const doc = construirAuthMd();

  it("abre con el H1 que la convención exige", () => {
    expect(doc.startsWith("# auth.md")).toBe(true);
  });

  it("dice de frente que NO hay registro ni credenciales, y qué hay en su lugar", () => {
    expect(doc).toContain("NO HAY");
    expect(doc).toContain("x402");
    expect(doc).toContain("402");
    expect(doc).toContain("EIP-3009");
  });

  it("explica la postura OAuth: PRM con issuers vacíos, sin issuer inventado", () => {
    expect(doc).toContain("openid-configuration");
    expect(doc).toContain("oauth-protected-resource");
    expect(doc).toContain("authorization_servers");
    expect(doc).toMatch(/issuer inexistente/i);
  });

  it("el precio es el que cobra el muro, no un número escrito", () => {
    expect(doc).toContain(`${PRECIOS_USD["/verificar"]} USD`);
  });

  it("manda a cruzar el payTo contra el agent card antes de firmar", () => {
    expect(doc).toContain("agent-card.json");
    expect(doc).toContain("payTo");
  });
});

describe("el skill y su índice", () => {
  it("el SKILL.md lleva frontmatter con el nombre del índice y el camino completo", () => {
    const skill = construirSkillMd();
    expect(skill.startsWith("---\n")).toBe(true);
    expect(skill).toContain(`name: ${SKILL_NOMBRE}`);
    expect(skill).toMatch(/description: .{40,}/);
    for (const paso of ["/api/batch/quickstart", "prechequeo", "402", "/api/batch/publickey"]) {
      expect(skill).toContain(paso);
    }
  });

  it("el índice cumple el schema 0.2.0 y su digest es el de los bytes servidos", () => {
    const indice = construirIndiceSkills() as {
      $schema: string;
      skills: Array<{ name: string; type: string; description: string; url: string; digest: string }>;
    };
    expect(indice.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    expect(indice.skills.length).toBe(1);
    const s = indice.skills[0];
    expect(s.name).toBe(SKILL_NOMBRE);
    expect(s.name).toMatch(/^[a-z0-9-]+$/);
    expect(s.type).toBe("skill-md");
    expect(s.url.endsWith(`/agent-skills/${SKILL_NOMBRE}/SKILL.md`)).toBe(true);
    const esperado = createHash("sha256").update(construirSkillMd(), "utf8").digest("hex");
    expect(s.digest).toBe(`sha256:${esperado}`);
  });
});

describe("el server card de MCP (SEP-1649)", () => {
  const card = construirServerCardMcp() as {
    serverInfo: { name: string; version: string; description: string };
    transport: { type: string; url: string };
    capabilities: Record<string, unknown>;
  };

  it("la identidad es la MISMA que el servidor declara en el handshake", () => {
    expect(card.serverInfo.name).toBe(INFO_SERVIDOR.name);
    expect(card.serverInfo.version).toBe(INFO_SERVIDOR.version);
  });

  it("el transporte apunta al endpoint real, streamable HTTP", () => {
    expect(card.transport.type).toBe("streamable-http");
    expect(card.transport.url).toBe("https://nomicheck.ynt.codes/api/mcp");
    expect(card.capabilities).toHaveProperty("tools");
  });

  it("y el ARD lo anuncia con su media type propio", () => {
    const ard = construirArd() as { entries: Array<{ identifier: string; type: string; url?: string }> };
    const entrada = ard.entries.find((e) => e.identifier.endsWith(":mcp:server-card"));
    expect(entrada?.type).toBe("application/mcp-server-card+json");
    expect(entrada?.url).toContain("/.well-known/mcp/server-card.json");
  });
});

describe("los Link headers de la portada (RFC 8288)", () => {
  it("cada miembro es <uri>; rel=\"…\" y trae las tres relaciones registradas", () => {
    const link = enlacesDescubrimiento();
    for (const miembro of link.split(", ")) {
      expect(miembro).toMatch(/^<[^>]+>; rel="[a-z-]+"/);
    }
    expect(link).toContain('rel="api-catalog"');
    expect(link).toContain('rel="service-desc"');
    expect(link).toContain('rel="service-doc"');
    expect(link).toContain("/.well-known/api-catalog");
  });
});

describe("oauth-protected-resource (RFC 9728), versión honesta", () => {
  const prm = construirPrm() as Record<string, unknown>;

  it("declara el resource y apunta la documentación a auth.md", () => {
    expect(String(prm.resource)).toMatch(/^https:\/\//);
    expect(String(prm.resource_documentation)).toContain("/auth.md");
  });

  it("las tres listas van VACÍAS: es la verdad, no un placeholder", () => {
    // El día que alguna deje de ser verdad —un issuer real, scopes reales—
    // esta prueba obliga a cambiar el documento junto con el mundo.
    expect(prm.authorization_servers).toEqual([]);
    expect(prm.scopes_supported).toEqual([]);
    expect(prm.bearer_methods_supported).toEqual([]);
  });
});

describe("agent card A2A del origen", () => {
  const card = construirAgentCardA2a() as {
    protocolVersion: string;
    name: string;
    version: string;
    description: string;
    supportedInterfaces: Array<{ transport: string; url: string }>;
    capabilities: Record<string, unknown>;
    skills: Array<{ id?: string; name?: string; description?: string }>;
    provider: { organization: string; url: string };
  };

  it("trae lo que el validador A2A exige: nombre, versión, descripción, interfaces", () => {
    expect(card.name).toBe("NomiCheck");
    expect(card.version.length).toBeGreaterThan(0);
    expect(card.description.length).toBeGreaterThan(0);
    expect(card.supportedInterfaces.length).toBeGreaterThanOrEqual(1);
    for (const i of card.supportedInterfaces) {
      expect(i.url).toMatch(/^https:\/\//);
      expect(i.transport.length).toBeGreaterThan(0);
    }
    expect(card.capabilities).toBeDefined();
  });

  it("cada skill lleva id, name y description", () => {
    expect(card.skills.length).toBeGreaterThanOrEqual(3);
    for (const s of card.skills) {
      expect(s.id?.length).toBeGreaterThan(0);
      expect(s.name?.length).toBeGreaterThan(0);
      expect(s.description?.length).toBeGreaterThan(0);
    }
  });

  it("no copia la identidad on-chain: ni una wallet en el card, provider apunta al apex", () => {
    expect(card.provider.url).toBe("https://ynt.codes");
    expect(JSON.stringify(card)).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });

  it("el precio del informe sale del muro, no de un número escrito", () => {
    expect(JSON.stringify(card)).toContain(`${PRECIOS_USD["/verificar"]} USD`);
  });
});
