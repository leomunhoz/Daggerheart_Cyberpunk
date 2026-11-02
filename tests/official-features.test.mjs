// C212-03 (nível 2, ADR 0004): applyOfficialFeatures grava as features oficiais no campo que o
// schema do item tem: system.itemFeatures (2.11+) ou weaponFeatures/armorFeatures (2.10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub } from "./helpers/foundry-stub.mjs";

installFoundryStub();
const { applyOfficialFeatures } = await import("../scripts/main.js");

// Item criado falso: o schema do system tem só os campos passados; update guarda o que recebeu.
function fakeItem(name, fields) {
  const updates = [];
  const fieldMap = Object.fromEntries(fields.map(f => [f, {}]));
  return { name, updates, system: { schema: { fields: fieldMap } }, update: async data => { updates.push(data); } };
}

test("na 2.11+ (schema com itemFeatures) grava system.itemFeatures como objeto por chave", async () => {
  const gun = fakeItem("Gun", ["itemFeatures"]);
  const vest = fakeItem("Vest", ["itemFeatures"]);
  const plain = fakeItem("Plain", ["itemFeatures"]);
  await applyOfficialFeatures([gun, plain], [{ name: "Gun", official: ["reloading", "brutal"] }, { name: "Plain" }], "weaponFeatures");
  await applyOfficialFeatures([vest], [{ name: "Vest", official: ["heavy"] }], "armorFeatures");
  assert.deepEqual(gun.updates, [{ "system.itemFeatures": { reloading: { value: "reloading" }, brutal: { value: "brutal" } } }]);
  assert.deepEqual(vest.updates, [{ "system.itemFeatures": { heavy: { value: "heavy" } } }]);
  assert.deepEqual(plain.updates, []);
});

test("na 2.10 (schema sem itemFeatures) continua gravando weaponFeatures/armorFeatures em lista", async () => {
  const gun = fakeItem("Gun", ["weaponFeatures"]);
  const vest = fakeItem("Vest", ["armorFeatures"]);
  await applyOfficialFeatures([gun], [{ name: "Gun", official: ["reloading"] }], "weaponFeatures");
  await applyOfficialFeatures([vest], [{ name: "Vest", official: ["heavy"] }], "armorFeatures");
  assert.deepEqual(gun.updates, [{ "system.weaponFeatures": [{ value: "reloading" }] }]);
  assert.deepEqual(vest.updates, [{ "system.armorFeatures": [{ value: "heavy" }] }]);
});
