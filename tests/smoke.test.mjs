// Testes de fumaça (nível 2 da ADR 0004): os scripts carregam fora do Foundry e as regras exportadas
// respondem como o PDF diz. Servem também de exemplo para os testes red dos tickets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub, fakeActor } from "./helpers/foundry-stub.mjs";

const MODULE_ID = "edgeheart-cyberpunk";
installFoundryStub();

const fakeItem = (flags = {}, extra = {}) => ({
  ...extra,
  getFlag: (scope, key) => (scope === MODULE_ID ? flags[key] : undefined)
});

test("todos os esmodules do module.json carregam sem o Foundry", async () => {
  for (const file of ["main", "edgeheart-character", "edgeheart-crew", "edgeheart-babele", "edgeheart-localize"]) {
    await assert.doesNotReject(import(`../scripts/${file}.js`), `scripts/${file}.js`);
  }
});

test("Dado de Humanidade começa em d6 (PDF, cap. 3)", async () => {
  const { Humanity } = await import("../scripts/edgeheart-character.js");
  assert.equal(Humanity.die(fakeActor()), 6);
  assert.equal(Humanity.die(fakeActor({ flags: { humanityDie: 10 } })), 10);
});

test("Carga Cibernética soma o Custo Cibernético dos cyberwares instalados", async () => {
  const { Humanity } = await import("../scripts/edgeheart-character.js");
  const actor = fakeActor({
    items: [
      fakeItem({ cyberware: true, cyberCost: 2 }),
      fakeItem({ cyberware: true, cyberCost: 1 }),
      fakeItem({}) // item comum, não conta
    ]
  });
  assert.equal(Humanity.cyberLoad(actor), 3);
});

test("isAction acha a ação pelo _id gravado, mesmo com o nome traduzido", async () => {
  const { isAction } = await import("../scripts/edgeheart-character.js");
  const item = fakeItem({ actionIds: [["Rolar Kill Chain Die", "abc123"]] });
  const traduzida = { id: "abc123", name: "Roll Kill Chain Die", item };
  const outra = { id: "zzz999", name: "Rolar Kill Chain Die", item };
  assert.equal(isAction(traduzida, "Rolar Kill Chain Die"), true);
  assert.equal(isAction(outra, "Rolar Kill Chain Die"), false);
});
