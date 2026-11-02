// FIL-01 (nível 2, ADR 0004): com a setting gearFilter ligada, o Item Browser esconde armas, armaduras,
// consumíveis e loot que não vêm de compêndio do Edgeheart. Setting de mundo, ligada por padrão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub } from "./helpers/foundry-stub.mjs";

const hooks = installFoundryStub();
const registered = {};
game.settings.register = (scope, key, data) => { registered[`${scope}.${key}`] = data; };
const { isForeignGear } = await import("../scripts/edgeheart-browser-filters.js");
for (const h of hooks.filter(h => h.name === "init")) h.fn();

const OURS = "Compendium.edgeheart-cyberpunk.edgeheart-weapons.Item.A";
const SYSTEM = "Compendium.daggerheart.weapons.Item.B";
const EQUIP = ["armor", "weapon", "consumable", "loot"];

test("item de outra fonte some na lista de equipamento (CA8)", () => {
  assert.equal(isForeignGear({ uuid: SYSTEM, types: EQUIP, enabled: true }), true);
  for (const type of EQUIP) assert.equal(isForeignGear({ uuid: SYSTEM, types: [type], enabled: true }), true);
});

test("item do Edgeheart continua na lista (weaponware, veículos)", () => {
  assert.equal(isForeignGear({ uuid: OURS, types: EQUIP, enabled: true }), false);
  assert.equal(isForeignGear({ uuid: "Compendium.edgeheart-cyberpunk.edgeheart-vehicles.Item.V", types: ["loot"], enabled: true }), false);
});

test("setting desligada: nada some (CA10)", () => {
  assert.equal(isForeignGear({ uuid: SYSTEM, types: EQUIP, enabled: false }), false);
});

test("lista que não é de equipamento (cartas, classes) não é filtrada", () => {
  assert.equal(isForeignGear({ uuid: SYSTEM, types: ["domainCard"], enabled: true }), false);
  assert.equal(isForeignGear({ uuid: SYSTEM, types: ["class"], enabled: true }), false);
  assert.equal(isForeignGear({ uuid: SYSTEM, types: undefined, enabled: true }), false);
});

test("uuid ausente conta como de outra fonte só na lista de equipamento", () => {
  assert.equal(isForeignGear({ uuid: undefined, types: ["weapon"], enabled: true }), true);
});

test("setting gearFilter: mundo, visível, Boolean, ligada por padrão, sem recarga", () => {
  const s = registered["edgeheart-cyberpunk.gearFilter"];
  assert.ok(s, "setting gearFilter registrada no init");
  assert.equal(s.scope, "world");
  assert.equal(s.config, true);
  assert.equal(s.type, Boolean);
  assert.equal(s.default, true);
  assert.equal(s.name, "EDGEHEART.Settings.GearFilter.Name");
  assert.equal(s.hint, "EDGEHEART.Settings.GearFilter.Hint");
  assert.ok(!s.requiresReload, "vale sem recarregar (R15)");
  assert.equal(typeof s.onChange, "function");
  assert.doesNotThrow(() => s.onChange(false), "onChange sem Item Browser aberto não quebra");
});

// FIL-02: o filtro só esconde quando o Edgeheart tem equipamento daquele tipo nos compêndios dele.
const { hasModuleGear } = await import("../scripts/edgeheart-browser-filters.js");

test("compêndios vazios: o filtro não esconde nada (FIL-02)", () => {
  assert.equal(hasModuleGear([], ["weapon"]), false);
});

test("há arma do Edgeheart: lista de armas e de equipamento filtram", () => {
  assert.equal(hasModuleGear([{ type: "weapon" }], ["weapon"]), true);
  assert.equal(hasModuleGear([{ type: "weapon" }], EQUIP), true);
});

test("build parado antes do loot: lista de loot não filtra", () => {
  assert.equal(hasModuleGear([{ type: "weapon" }], ["loot"]), false);
});

test("só equipamento conta (cartas e classes não)", () => {
  assert.equal(hasModuleGear([{ type: "domainCard" }, { type: "class" }], EQUIP), false);
});

test("entrada do índice sem type conta como item", () => {
  assert.equal(hasModuleGear([{ name: "x" }], ["weapon"]), true);
});

test("lista que não é de equipamento: false", () => {
  assert.equal(hasModuleGear([{ type: "weapon" }], ["domainCard"]), false);
});
