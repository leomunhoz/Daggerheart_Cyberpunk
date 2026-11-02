// BLD-01 (nível 2, ADR 0004): o gerador (buildPacks) roda uma lista de etapas na ordem de sempre,
// avisa o progresso de cada uma e, se uma falha, diz em qual parou e não roda as seguintes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStub } from "./helpers/foundry-stub.mjs";

installFoundryStub();
const { BUILD_STEPS, runBuildSteps, stepLabel } = await import("../scripts/main.js");

// Ordem da tabela 3.1 da Spec release-1-39.
const EXPECTED = [
  "phase:Clear",
  "weapons,armors",
  "consumables,loot,rolltables",
  "classes,subclasses",
  "ancestries,communities",
  "domains",
  "cyberware",
  "adversaries",
  "environments",
  "journals",
  "phase:Localize"
];
const ALL_PACK_KEYS = ["classes", "subclasses", "weapons", "armors", "adversaries", "environments", "ancestries",
  "communities", "domains", "cyberware", "consumables", "loot", "rolltables", "journals"];

const recorder = () => {
  const calls = { step: [], fail: [] };
  return {
    calls,
    report: {
      step: (step, index, total) => calls.step.push({ step, index, total }),
      fail: (step, index, total, error) => calls.fail.push({ step, index, total, error })
    }
  };
};

test("BUILD_STEPS tem as 11 etapas na ordem de hoje e cada compêndio aparece uma vez", () => {
  assert.equal(BUILD_STEPS.length, 11);
  assert.deepEqual(BUILD_STEPS.map(s => (s.phase ? `phase:${s.phase}` : s.packs.join(","))), EXPECTED);
  for (const step of BUILD_STEPS) assert.equal(typeof step.run, "function");
  const keys = BUILD_STEPS.flatMap(s => s.packs ?? []);
  assert.deepEqual([...keys].sort(), [...ALL_PACK_KEYS].sort());
  assert.equal(new Set(keys).size, keys.length);
});

test("runBuildSteps para na etapa que falha, avisa e relança o mesmo erro", async () => {
  const error = new Error("x");
  const ran = [];
  const steps = [
    { packs: ["a"], run: () => ran.push(0) },
    { packs: ["b"], run: () => ran.push(1) },
    { packs: ["c"], run: async () => { ran.push(2); throw error; } },
    { packs: ["d"], run: () => ran.push(3) }
  ];
  const { calls, report } = recorder();
  await assert.rejects(runBuildSteps(steps, {}, report), e => e === error);
  assert.deepEqual(ran, [0, 1, 2]);
  assert.deepEqual(calls.step.map(c => [c.step, c.index, c.total]), [[steps[0], 0, 4], [steps[1], 1, 4], [steps[2], 2, 4]]);
  assert.equal(calls.fail.length, 1);
  assert.equal(calls.fail[0].step, steps[2]);
  assert.equal(calls.fail[0].index, 2);
  assert.equal(calls.fail[0].total, 4);
  assert.equal(calls.fail[0].error, error);
});

test("runBuildSteps sem erro roda tudo em ordem com o mesmo ctx", async () => {
  const ran = [];
  const ctx = {};
  const steps = [
    { phase: "Clear", run: async c => { ran.push(0); c.a = 42; } },
    { packs: ["b"], run: async c => { ran.push(1); c.b = c.a + 1; } },
    { packs: ["c"], run: c => { ran.push(2); assert.equal(c, ctx); } },
    { phase: "Localize", run: async () => ran.push(3) }
  ];
  const { calls, report } = recorder();
  await runBuildSteps(steps, ctx, report);
  assert.deepEqual(ran, [0, 1, 2, 3]);
  assert.equal(ctx.b, 43);
  assert.deepEqual(calls.step.map(c => c.index), [0, 1, 2, 3]);
  assert.equal(calls.fail.length, 0);
});

test("stepLabel: fase pelo t(), compêndios pelo title ou pelo label do PACKS", () => {
  assert.equal(stepLabel({ phase: "Clear" }), "EDGEHEART.Build.Phase.Clear");
  game.packs = new Map();
  assert.equal(stepLabel({ packs: ["weapons", "armors"] }), "Edgeheart: Armas, Edgeheart: Armaduras");
  game.packs = new Map([["edgeheart-cyberpunk.edgeheart-weapons", { title: "Edgeheart: Weapons" }]]);
  assert.equal(stepLabel({ packs: ["weapons", "armors"] }), "Edgeheart: Weapons, Edgeheart: Armaduras");
  game.packs = new Map();
});
