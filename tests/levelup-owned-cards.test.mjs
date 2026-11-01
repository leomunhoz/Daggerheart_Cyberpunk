// LVL-01 (nível 2, ADR 0004): durante o Level Up, o Item Browser esconde as cartas que o personagem
// já tem (no ator ou escolhidas no Level Up em andamento), por uuid de origem ou por nome.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub, fakeActor } from "./helpers/foundry-stub.mjs";

installFoundryStub();
const { ownedCards, isOwnedRow } = await import("../scripts/edgeheart-browser-filters.js");

const PACK = "Compendium.edgeheart-cyberpunk.edgeheart-domains.Item.";
const actor = fakeActor({
  items: [
    { type: "domainCard", name: "Overclock", _stats: { compendiumSource: `${PACK}A` } },
    { type: "weapon", name: "Pistola", _stats: { compendiumSource: `${PACK}W` } } // não é carta
  ]
});
const levelup = {
  levels: {
    2: {
      achievements: { domainCards: { x: { uuid: `${PACK}B` } } },
      choices: { domainCard: { 0: { data: [`${PACK}C`] } } }
    }
  }
};

test("carta do personagem é achada pelo uuid de origem", () => {
  const owned = ownedCards(actor, levelup);
  assert.equal(isOwnedRow({ uuid: `${PACK}A`, name: "Outro nome" }, owned), true);
});

test("carta do personagem é achada pelo nome, mesmo vinda de outro compêndio", () => {
  const owned = ownedCards(actor, levelup);
  assert.equal(isOwnedRow({ uuid: "Compendium.daggerheart.domains.Item.Z", name: "Overclock" }, owned), true);
});

test("cartas escolhidas no Level Up em andamento (achievements e choices) contam", () => {
  const owned = ownedCards(actor, levelup);
  assert.equal(isOwnedRow({ uuid: `${PACK}B`, name: "B" }, owned), true);
  assert.equal(isOwnedRow({ uuid: `${PACK}C`, name: "C" }, owned), true);
});

test("carta que o personagem nunca teve continua na lista (CA6)", () => {
  const owned = ownedCards(actor, levelup);
  assert.equal(isOwnedRow({ uuid: `${PACK}D`, name: "Nova" }, owned), false);
  assert.equal(isOwnedRow({ uuid: `${PACK}W`, name: "Pistola" }, owned), false);
});

test("ator sem cartas e Level Up vazio: conjuntos vazios, sem erro (CA7)", () => {
  for (const lv of [{}, { levels: {} }, undefined]) {
    const owned = ownedCards(fakeActor(), lv);
    assert.equal(owned.uuids.size, 0);
    assert.equal(owned.names.size, 0);
    assert.equal(isOwnedRow({ uuid: `${PACK}A`, name: "Overclock" }, owned), false);
  }
});
