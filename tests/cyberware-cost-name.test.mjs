// ORG-01 (nível 2, ADR 0004): o nome do cyberware no compêndio leva o custo como prefixo "[n] ",
// gravado no último passo do gerador (edgeheart-localize.js), e a pasta de Tier (sorting "a") fica na
// ordem de custo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub } from "./helpers/foundry-stub.mjs";

installFoundryStub();
const { CYBERWARE, cyberCostLabel } = await import("../scripts/main.js");
const { withCostLabel } = await import("../scripts/edgeheart-localize.js");

// Mesmos limites de Tier do main.js (cyberTier): 1-24, 25-36, 37-48, 49-60.
const tierOf = n => (n <= 24 ? 1 : n <= 36 ? 2 : n <= 48 ? 3 : 4);

test("withCostLabel põe o prefixo do custo, só quando há costLabel e sem duplicar", () => {
  assert.equal(withCostLabel("Ocular Overlay", { costLabel: "0" }), "[0] Ocular Overlay");
  assert.equal(withCostLabel("Neural Access", { costLabel: "1–3" }), "[1–3] Neural Access");
  assert.equal(withCostLabel("Ocular Overlay", {}), "Ocular Overlay");
  assert.equal(withCostLabel("Ocular Overlay", undefined), "Ocular Overlay");
  assert.equal(withCostLabel("[0] Ocular Overlay", { costLabel: "0" }), "[0] Ocular Overlay");
});

test("cyberCostLabel dos 60 cyberwares é o custo do texto e tem um dígito (ou 1–3)", () => {
  assert.equal(CYBERWARE.length, 60);
  for (const def of CYBERWARE) {
    const label = cyberCostLabel(def);
    assert.equal(label, def.choice === "competency" ? "1–3" : String(def.cost), def.name);
    assert.match(label, /^\d$|^1–3$/, def.name);
  }
});

test("em cada Tier, os nomes com prefixo em ordem alfabética saem em custo não decrescente", () => {
  for (const tier of [1, 2, 3, 4]) {
    const rows = CYBERWARE.filter(def => tierOf(def.n) === tier)
      .map(def => ({ cost: def.cost, name: withCostLabel(def.name, { costLabel: cyberCostLabel(def) }) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    assert.ok(rows.length, `Tier ${tier} vazio`);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].cost <= rows[i].cost, `Tier ${tier}: ${rows[i - 1].name} antes de ${rows[i].name}`);
    }
  }
});
