// BLD-02 (nível 2, ADR 0004): cloneCompetencyCard copia a carta oficial, aplica o patch e não
// derruba o gerador quando o sistema renomeia uma ação (Blighting Strike na 2.10.12+) ou o patch falha.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub } from "./helpers/foundry-stub.mjs";

installFoundryStub();
const { cloneCompetencyCard, COMPETENCIES } = await import("../scripts/main.js");

const damageAction = (id, name, dice) => ({
  _id: id, name, type: "attack",
  damage: { main: { type: ["magical"], value: { dice, bonus: 1, multiplier: "flat", flatMultiplier: 1 } }, parts: {} }
});
// Blighting Strike no formato 2.12 (src/packs/domains/domainCard_Blighting_Strike_CEOM585jIX8V9PHz.json).
const blighting = () => ({
  name: "Blighting Strike",
  _source: {
    system: {
      actions: {
        roll: { _id: "roll", name: "Spellcast Roll", type: "attack" },
        hope: damageAction("hope", "Damage (With Hope)", "d6"),
        fear: damageAction("fear", "Damage (With Fear)", "d10")
      },
      resource: null
    },
    effects: [{ _id: "fx", name: "Blightning Strike", system: { changes: [{ key: "x", value: 1 }] } }]
  }
});

// Troca o console.warn durante o teste e devolve as mensagens.
function captureWarns(fn) {
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args.join(" "));
  try { return { result: fn(), warns }; } finally { console.warn = original; }
}

const corruptionSpike = () => COMPETENCIES.flatMap(c => c.cards).find(c => c.name === "Corruption Spike");

test("Corruption Spike clona a Blighting Strike da 2.12 com Dano (Esperança)/(Medo) sem bônus", () => {
  const card = corruptionSpike();
  assert.ok(card, "Corruption Spike está nas COMPETENCIES");
  const { result: c, warns } = captureWarns(() => cloneCompetencyCard(card, [blighting()]));
  const names = Object.values(c.actions).map(a => a.name).sort();
  assert.deepEqual(names, ["Dano (Esperança)", "Dano (Medo)", "Rolagem de Interface"]);
  for (const a of Object.values(c.actions)) if (a.damage) assert.equal(a.damage.main.value.bonus, null);
  assert.equal(c.effects[0].name, "Corrompido");
  assert.deepEqual(c.effects[0].system.changes, []);
  assert.deepEqual(warns, []);
});

test("patch que lança: avisa uma vez com o nome da carta e devolve a cópia oficial", () => {
  const card = { name: "Carta Teste", level: 1, clone: "Blighting Strike", patch: () => { throw new Error("boom"); } };
  const { result: c, warns } = captureWarns(() => cloneCompetencyCard(card, [blighting()]));
  assert.equal(warns.length, 1);
  assert.match(warns[0], /Carta Teste/);
  assert.equal(Object.keys(c.actions).length, 3);
  assert.equal(c.actions.hope.damage.main.value.bonus, 1);
});

test("actionNames com chave que não existe na oficial avisa com a chave", () => {
  const card = { name: "Carta Velha", level: 1, clone: "Blighting Strike", actionNames: { "With Hope": "Dano (Esperança)" } };
  const { warns } = captureWarns(() => cloneCompetencyCard(card, [blighting()]));
  assert.equal(warns.length, 1);
  assert.match(warns[0], /With Hope/);
  assert.match(warns[0], /Carta Velha/);
});

test("carta sem clone volta igual", () => {
  const card = { name: "Sem Clone", level: 1, description: "<p>x</p>" };
  const { result: c, warns } = captureWarns(() => cloneCompetencyCard(card, [blighting()]));
  assert.equal(c, card);
  assert.deepEqual(warns, []);
});
