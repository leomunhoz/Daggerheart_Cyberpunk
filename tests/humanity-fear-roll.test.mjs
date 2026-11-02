// C212-01 (nível 2, ADR 0004): a Rolagem de Humanidade depois de rolar com Medo dispara no formato
// de config da 2.12 (config.evaluated) e continua disparando no da 2.10/2.11 (config.roll.result).
import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub, fakeActor } from "./helpers/foundry-stub.mjs";

const hooks = installFoundryStub();
const { Humanity } = await import("../scripts/edgeheart-character.js");
const postRollDuality = hooks.find(h => h.name === "daggerheart.postRollDuality").fn;

const edgeheartActor = ({ stress = 6, hope = 2 } = {}) => ({
  ...fakeActor({ flags: { edgeheart: true }, system: { resources: { stress: { value: stress, max: 6 }, hope: { value: hope } } } }),
  isOwner: true
});

let calls;
beforeEach(() => {
  calls = [];
  mock.timers.enable({ apis: ["setTimeout"] });
  mock.method(Humanity, "roll", (...args) => { calls.push(args); });
  mock.method(Humanity, "isCyberpsycho", () => false);
  mock.method(Humanity, "isLost", () => false);
});
afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
  delete globalThis.fromUuidSync;
});

const run = config => {
  postRollDuality(config);
  mock.timers.tick(800);
};

test("2.12: rolagem com Medo e Estresse cheio dispara a Rolagem de Humanidade", () => {
  const actor = edgeheartActor();
  run({ evaluated: { withFear: true }, roll: { type: "trait" }, actor, source: { actor: "Actor.x" }, data: { traits: {}, rules: {} } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], actor);
});

test("2.12: rolagem com Esperança não dispara", () => {
  const actor = edgeheartActor();
  run({ evaluated: { withFear: false }, roll: { type: "trait" }, actor, source: { actor: "Actor.x" }, data: { traits: {}, rules: {} } });
  assert.equal(calls.length, 0);
});

test("2.10/2.11: config.roll.result.duality === -1 com config.data.parent dispara", () => {
  const actor = edgeheartActor();
  run({ roll: { result: { duality: -1 } }, data: { parent: actor } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], actor);
});

test("2.12 sem config.actor: acha o ator por fromUuidSync(config.source.actor)", () => {
  const actor = edgeheartActor();
  globalThis.fromUuidSync = uuid => (uuid === "Actor.x" ? actor : null);
  run({ evaluated: { withFear: true }, roll: { type: "trait" }, source: { actor: "Actor.x" }, data: { traits: {}, rules: {} } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], actor);
});

test("Estresse 3/6 e Esperança 2: rolagem com Medo não dispara", () => {
  const actor = edgeheartActor({ stress: 3, hope: 2 });
  run({ evaluated: { withFear: true }, roll: { type: "trait" }, actor, source: { actor: "Actor.x" }, data: { traits: {}, rules: {} } });
  assert.equal(calls.length, 0);
});
