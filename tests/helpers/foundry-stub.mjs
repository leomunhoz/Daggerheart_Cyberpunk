// Stub mínimo dos globais do Foundry e do Daggerheart para carregar os scripts do módulo no Node.
// Só o suficiente para importar os arquivos e testar lógica pura (regras, mapeamentos).
// Comportamento de ficha, rolagem e compêndio se confere no Foundry (nível 3, ADR 0004).
//
// Uso num teste:
//   import { installFoundryStub, fakeActor } from "./helpers/foundry-stub.mjs";
//   installFoundryStub();
//   const { Humanity } = await import("../scripts/edgeheart-character.js");

const MODULE_ID = "edgeheart-cyberpunk";

export function installFoundryStub() {
  const hooks = [];
  const register = (name, fn) => { hooks.push({ name, fn }); return hooks.length; };
  globalThis.Hooks = { on: register, once: register, off() {}, call: () => true, callAll: () => true, registered: hooks };
  globalThis.CONFIG = { queries: {}, DH: { id: "daggerheart" } };
  globalThis.foundry = {
    utils: {
      randomID: (n = 16) => "x".repeat(n),
      deepClone: value => structuredClone(value),
      mergeObject: (target, source) => Object.assign(target, source),
      getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj)
    },
    documents: { collections: { Actors: { registerSheet() {} } } },
    applications: { api: {}, apps: {} }
  };
  globalThis.game = {
    i18n: { lang: "en", localize: key => key, format: key => key },
    settings: { register() {}, get: () => undefined },
    user: { id: "user", isGM: true },
    users: { activeGM: null },
    modules: new Map(),
    packs: new Map()
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  return hooks;
}

// Ator falso com flags do módulo. flags: { humanityDie: 8, edgeheart: true, ... }
export function fakeActor({ type = "character", flags = {}, items = [], system = {} } = {}) {
  return {
    type,
    items,
    system,
    getFlag: (scope, key) => (scope === MODULE_ID ? flags[key] : undefined)
  };
}
