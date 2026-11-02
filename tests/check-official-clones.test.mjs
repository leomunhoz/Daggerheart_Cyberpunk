// BLD-03 (nível 2, ADR 0004): núcleo da conferência dos clones (tools/check-official-clones.mjs).
// Com documentos oficiais falsos, lista a oficial que falta, a chave de actionNames/effectNames que não
// casa e o patch que lança; com tudo certo, não lista nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub } from "./helpers/foundry-stub.mjs";

installFoundryStub();
const { cloneCompetencyCard } = await import("../scripts/main.js");
const { findCloneProblems } = await import("../tools/check-official-clones.mjs");

const doc = (name, actions = {}, effects = [], items = []) => ({ name, _source: { name, system: { actions }, effects }, items });
const strike = () => doc("Strike", { a: { _id: "a", name: "Damage (With Hope)" }, b: { _id: "b", name: "Damage (With Fear)" } }, [{ _id: "fx", name: "Burning" }]);
const officials = () => ({
  domains: [strike()], void: [], consumables: [doc("Minor Health Potion")],
  adversaries: [doc("Lackey", {}, [], [{ name: "Minion (3)" }])]
});
const content = (cards, consumables = [], adversaries = []) => ({ competencies: [{ id: "x", cards }], consumables, adversaries });

test("tudo casa: nenhuma falha", () => {
  const card = { name: "Ok", clone: "Strike", actionNames: { "Damage (With Hope)": "Dano (Esperança)" }, effectNames: { Burning: "Queimando" }, patch: () => {} };
  const problems = findCloneProblems(content([card], [{ name: "Patch", clone: "Minor Health Potion" }],
    [{ name: "Gangue", features: [{ name: "Minion (3)", clone: { adversary: "Lackey", feature: "Minion (3)" } }] }]), officials(), cloneCompetencyCard);
  assert.deepEqual(problems, []);
});

test("lista oficial ausente, chaves que não casam e patch que lança", () => {
  const cards = [
    { name: "Sem Oficial", clone: "Nope" },
    { name: "Chave Velha", clone: "Strike", actionNames: { "With Hope": "x" }, effectNames: { Burn: "y" } },
    { name: "Patch Ruim", clone: "Strike", patch: () => { throw new Error("boom"); } }
  ];
  const problems = findCloneProblems(content(cards, [{ name: "Patch", clone: "Big Potion" }],
    [{ name: "Gangue", features: [{ name: "Group Attack", clone: { adversary: "Lackey", feature: "Group Attack" } }] }]), officials(), cloneCompetencyCard);
  const joined = problems.join("\n");
  assert.equal(problems.length, 6, joined);
  for (const s of ["Sem Oficial", "Nope", "With Hope", "Burn", "Patch Ruim", "Big Potion", "Group Attack"]) assert.match(joined, new RegExp(s));
});
