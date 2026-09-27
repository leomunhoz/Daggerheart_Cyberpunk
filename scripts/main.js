/* Edgeheart - Cyberpunk para Daggerheart
 * Conteúdo do Edgeheart definido em código (classes, cartas, cyberware, diários...).
 * Os compêndios vêm prontos dentro do módulo (packs/, declarados no module.json); este arquivo
 * também tem o gerador que os preenche: game.modules.get("edgeheart-cyberpunk").api.buildPacks()
 * (ferramenta de desenvolvimento — quem só usa o módulo não precisa rodar nada).
 */

const MODULE_ID = "edgeheart-cyberpunk";
const PACK_SCOPE = MODULE_ID;

const PACKS = {
  classes: { name: "edgeheart-classes", label: "Edgeheart: Classes", type: "Item" },
  subclasses: { name: "edgeheart-subclasses", label: "Edgeheart: Subclasses", type: "Item" },
  weapons: { name: "edgeheart-weapons", label: "Edgeheart: Armas", type: "Item" },
  armors: { name: "edgeheart-armors", label: "Edgeheart: Armaduras", type: "Item" },
  adversaries: { name: "edgeheart-adversaries", label: "Edgeheart: Adversários", type: "Actor" },
  environments: { name: "edgeheart-environments", label: "Edgeheart: Ambientes", type: "Actor" },
  ancestries: { name: "edgeheart-lifepaths", label: "Edgeheart: Trajetórias", type: "Item" },
  communities: { name: "edgeheart-affiliations", label: "Edgeheart: Afiliações", type: "Item" },
  domains: { name: "edgeheart-domains", label: "Edgeheart: Cartas de Competência", type: "Item" },
  cyberware: { name: "edgeheart-cyberware", label: "Edgeheart: Cyberware", type: "Item" },
  consumables: { name: "edgeheart-consumables", label: "Edgeheart: Consumíveis", type: "Item" },
  loot: { name: "edgeheart-loot", label: "Edgeheart: Loot", type: "Item" },
  rolltables: { name: "edgeheart-rolltables", label: "Edgeheart: Tabelas", type: "RollTable" },
  journals: { name: "edgeheart-journals", label: "Edgeheart: Diários", type: "JournalEntry" }
};

// Compêndio do módulo (declarado no module.json), destravado para o gerador escrever nele.
async function getOrCreatePack(key) {
  const id = `${PACK_SCOPE}.${PACKS[key].name}`;
  const pack = game.packs.get(id);
  if (!pack) throw new Error(`Edgeheart | Compêndio ${id} não encontrado. Ele está no module.json? Reinicie o servidor do Foundry depois de declarar compêndios novos.`);
  if (pack.locked) await pack.configure({ locked: false });
  return pack;
}

// ---------- Pastas dentro dos compêndios (organização) ----------

async function makeFolder(pack, name, { parent = null, color = "#6f2dbd", type = "Item" } = {}) {
  const doc = await Folder.create(
    { name, type, color, folder: parent, sorting: "a" },
    { pack: pack.collection }
  );
  return doc;
}

function withFolder(list, folderId) {
  return list.map(d => ({ ...d, folder: folderId }));
}

// ---------- IDs fixos ----------
// A importação apaga e recria os compêndios. Com IDs aleatórios, cada reimportação mudava o
// uuid da classe, e personagens antigos passavam a recusar subclasses (o sistema compara
// subclass.linkedClass com a origem da classe do personagem). Gerando o _id a partir de uma
// chave fixa + { keepId: true }, o uuid continua o mesmo entre importações.
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const STABLE_IDS = new Map();

// cyrb53 com duas sementes -> 2 x 8 caracteres base62 (62^8 < 2^53, então cada metade usa bits bem misturados).
function stableId(key) {
  let id = "";
  for (let seed = 1; seed <= 2; seed++) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (const ch of `${MODULE_ID}:${key}`) {
      const c = ch.charCodeAt(0);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    let n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    for (let i = 0; i < 8; i++) {
      id += ID_CHARS[n % 62];
      n = Math.floor(n / 62);
    }
  }
  // Com keepId, dois documentos com o mesmo _id fazem o Foundry descartar um sem avisar.
  const owner = STABLE_IDS.get(id);
  if (owner && owner !== key) throw new Error(`Edgeheart | stableId: "${key}" colide com "${owner}"`);
  STABLE_IDS.set(id, key);
  return id;
}

const ATTRIBUTION = { source: "Edgeheart (homebrew)", page: null, artist: "" };

// ---------- Ações e efeitos de features ----------

// Efeito aplicado no ALVO por uma ação (mesmo formato do "Square Up" oficial):
// fica no item com transfer:false e a ação referencia o _id dele em action.effects.
// duration: tipo de CONFIG.DH.EFFECTS.activeEffectDurations. "temporary" = "temporariamente"
// do Daggerheart (fica até alguém remover); "scene"/"shortRest"/"longRest"/"session" somem
// sozinhos no refresh correspondente do menu do Daggerheart.
function targetEffect({ name, img, description = "", statuses = [], changes = [], duration = "temporary" }) {
  return {
    _id: foundry.utils.randomID(), name, img, description,
    transfer: false, type: "base", statuses,
    system: { changes, duration: { description: "", type: duration }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
    duration: { value: null, units: "seconds", expiry: null, expired: false },
    tint: "#ffffff", disabled: false
  };
}

// Ação simples de feature: custo, limite de usos e/ou efeitos aplicados no alvo.
// uses: { max: 1, recovery: "scene" | "shortRest" | "longRest" | "session", onSuccess?: true }
//   onSuccess = só gasta o uso se a rolagem tiver sucesso ("uma vez por descanso, em um sucesso").
// dice: "2d8" faz a ação rolar esses dados no próprio card do chat (rolagem "diceSet" do sistema, igual
// à Rune Ward oficial). O módulo pode trocar a fórmula na hora de usar (flag rollFormula, Takedown com
// Kill Window, Integrated Chrome com Reinforced Build — ver edgeheart-character.js).
function diceSetRoll(dice) {
  const [, count, faces] = dice.match(/^(\d+)(d\d+)$/);
  return {
    type: "diceSet", trait: null, difficulty: null, bonus: null, advState: "neutral", useDefault: false,
    diceRolling: { multiplier: "flat", flatMultiplier: Number(count), dice: faces, compare: null, treshold: null }
  };
}

function featureAction({
  name, description = "", img = "icons/svg/upgrade.svg", actionType = "action",
  costs = [], uses = null, effects = [], target = null, dice = null
}) {
  const id = foundry.utils.randomID();
  return {
    [id]: {
      ...(dice ? { type: "attack", roll: diceSetRoll(dice), damage: { main: null, resources: {} }, save: { trait: null, difficulty: null, damageMod: "none" } } : { type: "effect" }),
      _id: id, systemPath: "actions", description,
      chatDisplay: true, actionType,
      cost: costs.map(c => ({ scalable: false, key: c.key, value: c.value, step: null, consumeOnSuccess: false, itemId: null })),
      uses: uses
        ? { value: null, max: String(uses.max), recovery: uses.recovery, consumeOnSuccess: !!uses.onSuccess }
        : { value: null, max: null, recovery: null, consumeOnSuccess: false },
      effects: effects.map(e => ({ _id: e._id, onSave: false })),
      // Rolagem de dados sem efeito usa alvo "qualquer", como a Rune Ward oficial: com alvo "self" o card
      // tratava o dado como ataque contra o próprio personagem e mostrava "MISS".
      target: dice && !effects.length ? { type: "any", amount: null } : target ?? { type: effects.length ? "hostile" : "any", amount: effects.length ? 1 : null },
      name, img, range: "",
      baseAction: false, originItem: { type: "itemCollection" }, triggers: [], areas: []
    }
  };
}

// ---------- Ícones customizados do módulo (classe / life paths / affiliations) ----------

const ICON = name => `modules/${MODULE_ID}/assets/icons/${name}.svg`;
// Pacote de ícones em assets/cpr (pastas do zip original). CPR("programs/shield") = .svg;
// passe a extensão quando não for svg (ex.: CPR("classes/runner/class-icon.png")).
const CPR = path => `modules/${MODULE_ID}/assets/cpr/${/\.\w+$/.test(path) ? path : `${path}.svg`}`;

const ICONS = {
  lifePaths: {
    "Criação Corporativa": CPR("gear/computer"),
    "Nascido nas Ruas": CPR("gear/glow_paint"),
    "Nômade": CPR("vehicles/motorbike"),
    "Excedente Militar": CPR("armor/flak_head"),
    "Sobrevivente de Clínica Clandestina": CPR("gear/cryotank"),
    "Nativo do Ermo": CPR("gear/antismog_breathing_mask")
  },
  affiliations: {
    "Ativo Corporativo": CPR("default/Default_Role"),
    "Ligado a uma Gangue": CPR("weapons/SpikedBat"),
    "Comboio Nômade": CPR("upgrades/armored_chassis"),
    "Rede de Mercenários": CPR("weapons/AssaultRifle"),
    "Clínica Clandestina": CPR("gear/medtech_bag"),
    "Rede de Fixers": CPR("gear/disposable_cellphone"),
    "Célula de Resistência": CPR("dlc/weapons/molotov-cocktail"),
    "Culto de Dados": CPR("default/default-blackice")
  },
  // Talentos de Trajetória e Afiliação (pelo nome do talento).
  features: {
    "Design Corporativo": CPR("default/Default_Skill"),
    "Rotina Eficiente": CPR("cyberware/skinwatch"),
    "Reflexos de Beco": CPR("weapons/martial_arts"),
    "Golpe Sujo": CPR("weapons/LeadPipe"),
    "Arrancada na Estrada": CPR("upgrades/nos"),
    "Nascido Fora de Estrada": CPR("upgrades/combat_plow"),
    "Reações de Combate": CPR("status/readied_action"),
    "Último de Pé": CPR("status/wounded_mortally"),
    "Tecido Cicatricial": CPR("cyberware/realskin_covering"),
    "Reconstrução de Emergência": CPR("critical_injuries/body_critical_injury"),
    "Forjado no Perigo": CPR("status/radiation_low"),
    "Duro como Aço": CPR("dlc/armor/scavenged-armor"),
    "Privilégio de Elite": CPR("clothing/generic_jewelry"),
    "Sagacidade de Rua": CPR("cyberware/voice_stress_analyzer"),
    "Lei da Estrada": CPR("gear/roadflare"),
    "Sem Amarras": CPR("gear/handcuffs"),
    "Chillax": CPR("dlc/cyberware/cyberpillow"),
    "Conhece o Jogo": CPR("default/Defult_Card_Hand"),
    "Família Encontrada": CPR("dlc/gear/furniture-set"),
    "Padrão Proibido": CPR("blackice/src/skunk")
  }
};

// ---------- Helpers de conversão PDF -> schema do sistema ----------

const RANGE_MAP = {
  "Melee": "melee",
  "Very Close": "veryClose",
  "Close": "close",
  "Far": "far",
  "Very Far": "veryFar"
};

const TRAIT_MAP = {
  Agility: "agility", Strength: "strength", Finesse: "finesse",
  Instinct: "instinct", Presence: "presence", Knowledge: "knowledge"
};

// "d8+2 phy" -> {count:1, dice:"d8", bonus:2, dmgType:"physical"}
// "3d10+8 tech" -> {count:3, dice:"d10", bonus:8, dmgType:"magical"}
function parseDamage(str) {
  const isTech = /tech/i.test(str);
  const m = str.match(/(\d*)d(\d+)(?:\+(\d+))?/i);
  return {
    count: m[1] ? Number(m[1]) : 1,
    dice: `d${m[2]}`,
    bonus: m[3] ? Number(m[3]) : null,
    dmgType: isTech ? "magical" : "physical"
  };
}

function buildAttackAction({ name, trait, range, damageStr, burden, img }) {
  const { dice, bonus, dmgType } = parseDamage(damageStr);
  return {
    name: "Ataque",
    img: img ?? CPR("default/Default_Weapon"),
    baseAction: true,
    systemPath: "attack",
    type: "attack",
    range: RANGE_MAP[range] || "melee",
    target: { type: "any", amount: 1 },
    roll: {
      trait: TRAIT_MAP[trait] || null,
      type: "attack",
      difficulty: null,
      bonus: null,
      advState: "neutral",
      diceRolling: { multiplier: "prof", flatMultiplier: 1, dice: "d20", compare: null, treshold: null },
      useDefault: false
    },
    damage: {
      main: {
        value: {
          dice, bonus, multiplier: "prof", flatMultiplier: 1,
          custom: { enabled: false, formula: "" }
        },
        type: [dmgType],
        applyTo: "hitPoints",
        resultBased: false,
        valueAlt: { multiplier: "prof", flatMultiplier: 1, dice: "d6", bonus: null, custom: { enabled: false, formula: "" } },
        base: false, includeBase: false, direct: false, fullRestore: false, itemId: null
      },
      resources: {}
    },
    description: "",
    chatDisplay: false,
    actionType: "action",
    cost: [],
    uses: { value: null, max: null, recovery: null, consumeOnSuccess: false },
    effects: [],
    save: { trait: null, difficulty: null, damageMod: "none" },
    originItem: { type: "itemCollection" },
    triggers: [],
    areas: []
  };
}

// ---------- Armas e armaduras (Tiers 1 a 4) ----------
// Nomes em inglês, como no PDF; características em PT. Onde a característica do PDF é igual a uma
// feature oficial (Reliable, Deadly, Paired, Flexible, Shifting...), o item recebe a feature do sistema
// depois de criado (official: [...]) e o próprio sistema cria os efeitos e ações dela, como na ficha do
// item. As outras ganham ações/efeitos no padrão do sistema (alvo marca Estresse, Vulnerável, custo) ou
// ficam só com o texto quando dependem da narrativa.

const gearCost = (key, value, extra = {}) => ({ scalable: false, key, value, step: null, consumeOnSuccess: false, itemId: null, ...extra });
const gearChange = (key, value) => ({ key, type: "add", value, priority: null, phase: "initial" });
// Pontuação de Armadura dada por arma (mesmo formato da feature oficial Protective).
const gearArmor = value => ({ type: "armor", value: { max: String(value), current: 0, damageThresholds: null, interaction: "none" }, priority: 20, phase: "initial" });
const ALL_TRAITS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

// Condição aplicada no alvo por uma ação da característica (padrão Entangling: gaste 1 Esperança, Vulnerável).
function gearCondition(name, statuses, costs = [], target = null) {
  const fx = targetEffect({ name, img: CPR(statuses.includes("hidden") ? "status/hidden" : statuses.includes("restrained") ? "status/grappled" : "status/wounded_seriously"), statuses });
  return { effects: [fx], actions: featureAction({ name, costs, effects: [fx], target }) };
}
// "O alvo marca N Estresse" (padrão Scary / Enervating Blast).
const gearStress = (name, n = 1, costs = []) => ({ actions: resourceCardAction({ name, resources: { stress: n }, cost: costs }) });
const gearCostAction = (name, costs) => ({ actions: featureAction({ name, costs }) });
const gearDamage = (name, formula, type, costs = []) => ({ actions: damageCardAction({ name, formula, type, cost: costs }) });
// Junta vários pedaços (official, changes, effects, actions).
function gear(...parts) {
  return parts.reduce((acc, p) => ({
    official: [...acc.official, ...(p.official ?? [])],
    changes: [...acc.changes, ...(p.changes ?? [])],
    effects: [...acc.effects, ...(p.effects ?? [])],
    actions: { ...acc.actions, ...(p.actions ?? {}) }
  }), { official: [], changes: [], effects: [], actions: {} });
}
const official = (...keys) => ({ official: keys });
const passive = (...changes) => ({ changes });
// Bônus situacional: efeito que começa desligado e o jogador liga quando a condição vale (padrão Opportunist).
const gearToggle = (name, img, ...changes) => ({ effects: [passiveEffect({ name, img: CPR(img), disabled: true, changes })] });
// Igual, mas só nos ataques com a própria arma (mesmas condições da feature oficial Reliable).
const ATTACK_WITH_THIS_WEAPON = [{ type: "weaponRestriction", weaponType: "sameWeapon" }, { type: "actionType", actionTypes: ["attack"] }];
function gearAttackToggle(name, img, ...changes) {
  const part = gearToggle(name, img, ...changes);
  part.effects[0].system.conditionals = ATTACK_WITH_THIS_WEAPON;
  return part;
}
// "Vantagem em rolagens para..." vira uma fonte de vantagem que o diálogo de rolagem oferece (padrão da armadura Aquatic).
const advantageOn = text => ({ changes: [gearChange("system.advantageSources", text)] });

// W(tier, nome, ícone, atributo, alcance, dano, empunhadura, "Característica|texto", extras)
const W = (tier, name, img, trait, range, damage, burden, feature, extras = {}) => ({ tier, name, img: CPR(img), trait, range, damage, burden, feature, ...gear(extras) });
// A(tier, nome, ícone, "maior/severo", armadura, "Característica|texto", extras)
const A = (tier, name, img, thresholds, score, feature, extras = {}) => ({ tier, name, img: CPR(img), thresholds, score, feature, ...gear(extras) });

const PRIMARY_WEAPONS = [
  W(1, "Assault Carbine", "weapons/AssaultRifle", "Agility", "Far", "d8+2 phy", "Two-Handed", "Controlled Fire|numa rolagem com Esperança, ganhe +1 na próxima rolagem de ataque dentro da cena.", gearAttackToggle("Controlled Fire (+1 no ataque)", "weapons/AssaultRifle", gearChange("system.bonuses.roll.bonus", 1))),
  W(1, "Compact SMG", "weapons/SMG", "Agility", "Close", "d6+2 phy", "One-Handed", "Spray|marque 1 Estresse para ter como alvo outra criatura dentro do alcance Muito Próximo do alvo original.", gearCostAction("Spray", [gearCost("stress", 1)])),
  W(1, "Street Shotgun", "weapons/Shotgun", "Strength", "Very Close", "d8+3 phy", "Two-Handed", "Scatter|num ataque bem-sucedido, outro alvo dentro do alcance Muito Próximo do alvo marca 1 Estresse.", gearStress("Scatter")),
  W(1, "Breach Hammer", "weapons/Sledgehammer", "Strength", "Melee", "d10+3 phy", "Two-Handed", "Breach|num ataque bem-sucedido contra um objeto, porta, barricada, cobertura ou veículo, some +1 de Proficiência.", gearDamage("Breach (+1 Proficiência)", "1d10", "physical")),
  W(1, "Mono-Katana", "weapons/Sword", "Finesse", "Melee", "d8+2 phy", "One-Handed", "Clean Cut|quando você causa dano Maior, o alvo também marca 1 Estresse.", gearStress("Clean Cut")),
  W(1, "Smartbow", "weapons/Bow", "Finesse", "Far", "d8 tech", "Two-Handed", "Draw|se você não se moveu durante o seu Holofote antes de atacar, ganhe +2 na rolagem de ataque.", gearAttackToggle("Draw (+2 no ataque)", "weapons/Bow", gearChange("system.bonuses.roll.bonus", 2))),
  W(1, "Shock Baton", "weapons/StunBaton", "Presence", "Melee", "d8 tech", "One-Handed", "Shock Pulse|num ataque bem-sucedido, o alvo tem desvantagem na próxima Rolagem de Reação que fizer."),
  W(1, "Scrap Launcher", "weapons/GrenadeLauncher", "Knowledge", "Close", "d8+1 phy", "Two-Handed", "Junkshot|numa rolagem com Medo, o alvo sofre 1d6 de dano e a arma emperra até você marcar 1 Estresse para destravá-la.", gear(gearDamage("Junkshot", "1d6", "physical"), gearCostAction("Destravar", [gearCost("stress", 1)]))),

  W(2, "Military Rifle", "weapons/AssaultRifle_excellent", "Agility", "Far", "d8+5 phy", "Two-Handed", "Aim Down|marque 1 Estresse para atacar um alvo até o alcance Muito Distante com vantagem.", gearCostAction("Aim Down", [gearCost("stress", 1)])),
  W(2, "Riot Shotgun", "weapons/Shotgun_excellent", "Strength", "Very Close", "d10+4 phy", "Two-Handed", "Crowd Breaker|em dano Maior, todos os adversários dentro do alcance Muito Próximo do alvo precisam se afastar ou marcar 1 Estresse.", gearStress("Crowd Breaker")),
  W(2, "Pulse Halberd", "weapons/Naginata", "Strength", "Very Close", "d10+5 tech", "Two-Handed", "Reach Arc|numa rolagem com Esperança, outro alvo em linha dentro do alcance marca 1 Estresse.", gearStress("Reach Arc")),
  W(2, "Vibroblade", "weapons/Machete_excellent", "Finesse", "Melee", "d8+5 phy", "One-Handed", "Vibrating Edge|quando você tira 1 num dado de dano, trate como 6.", official("selfCorrecting")),
  W(2, "Arc Caster", "weapons/microwaver", "Knowledge", "Far", "d6+5 tech", "Two-Handed", "Chain Signal|num ataque bem-sucedido com Esperança, cause metade do dano a outro alvo conectado dentro do alcance Próximo."),
  W(2, "Heavy Nailgun", "weapons/air_pistol", "Strength", "Close", "d8+6 phy", "Two-Handed", "Impale|em dano Severo, o alvo fica temporariamente Imobilizado.", gearCondition("Impale", ["restrained"])),
  W(2, "Smart Pistol Rig", "weapons/mediumPistol_excellent", "Finesse", "Far", "d6+4 phy", "One-Handed", "Target Assist|ao errar, você pode gastar 1 Esperança para rolar de novo o Dado de Esperança ou de Medo.", gearCostAction("Target Assist", [gearCost("hope", 1)])),
  W(2, "Sonic Cutter", "weapons/shrieker", "Presence", "Close", "d8+4 tech", "One-Handed", "Resonance|num ataque bem-sucedido, gaste 1 Esperança para deixar o alvo temporariamente Vulnerável.", gearCondition("Resonance", ["vulnerable"], [{ key: "hope", value: 1 }])),

  W(3, "Rail Rifle", "weapons/SniperRifle", "Knowledge", "Very Far", "d8+8 phy", "Two-Handed", "Rail Punch|em dano Maior ou Severo, ignore qualquer redução de dano."),
  W(3, "Auto-Shotgun", "weapons/Shotgun_poor", "Strength", "Close", "d10+7 phy", "Two-Handed", "Double Barrel|role o dano duas vezes e fique com o maior resultado."),
  W(3, "Plasma Carbine", "weapons/AssaultRifle_poor", "Agility", "Far", "d8+7 tech", "Two-Handed", "Overheat|marque 1 Estresse antes de atacar para somar 1d6 de dano techno. Num sucesso com Esperança, o alvo fica temporariamente Overheated e sofre 2d6 de dano techno extra quando agir.", gear(gearDamage("Overheat", "1d6", "magical", [gearCost("stress", 1)]), gearDamage("Dano de Overheated", "2d6", "magical"))),
  W(3, "Paired Techblades", "weapons/Sword_excellent", "Finesse", "Melee", "d8+7 phy", "Two-Handed", "Flowing Cut|num ataque bem-sucedido com Esperança, outro adversário dentro do alcance Corpo a Corpo sofre metade do dano causado, ou você ganha +1 de Evasão contra o próximo ataque que te tiver como alvo."),
  W(3, "Gravity Maul", "weapons/Sledgehammer_excellent", "Strength", "Melee", "d12+7 tech", "Two-Handed", "Crater|num ataque bem-sucedido, todos os alvos dentro do alcance Muito Próximo do alvo marcam 1 Estresse.", gearStress("Crater")),
  W(3, "Drone Spear", "weapons/Naginata_excellent", "Instinct", "Very Close", "d10+6 phy", "Two-Handed", "Return Flight|depois de atacar, esta arma volta para você e você pode se reposicionar imediatamente dentro do alcance Muito Próximo."),
  W(3, "Black ICE Projector", "default/default-blackice", "Knowledge", "Far", "d6+8 tech", "Two-Handed", "System Bite|numa rolagem com Esperança, o alvo fica temporariamente Degraded e rola um d12 em vez de um d20 nas rolagens de ataque.", gearCondition("Degraded", [])),
  W(3, "Runner Whip", "cyberweapons/cybersnake", "Presence", "Close", "d8+6 tech", "One-Handed", "Lash Field|num ataque bem-sucedido, puxe o alvo até o alcance Corpo a Corpo ou empurre-o até o alcance Próximo, e crie uma Breach contra ele."),

  W(4, "Prototype Railcannon", "weapons/RocketLauncher", "Knowledge", "Very Far", "d10+11 phy", "Two-Handed", "Linebreaker|este ataque tem como alvo todos os adversários em linha dentro do alcance.", official("long")),
  W(4, "Smart Stormrifle", "weapons/heavySMG_excellent", "Agility", "Far", "d8+12 phy", "Two-Handed", "Auto Aim|gaste até 3 Esperança e ataque essa mesma quantidade de alvos dentro do alcance. Role uma vez para cada alvo.", gearCostAction("Auto Aim", [gearCost("hope", 1, { scalable: true, step: 1 })])),
  W(4, "Siege Shotgun", "weapons/Shotgun_excellent", "Strength", "Close", "d12+10 phy", "Two-Handed", "Room Clearer|em dano Maior ou Severo, todos os adversários dentro do alcance Próximo precisam se afastar de você e ficam temporariamente Vulneráveis.", gearCondition("Room Clearer", ["vulnerable"])),
  W(4, "Steel-Whip Guillotine", "weapons/HelicopterBlade", "Finesse", "Close", "d8+11 phy", "One-Handed", "Sever|quando você tira o valor máximo em qualquer dado de dano, o alvo marca 1 Estresse.", gearStress("Sever")),
  W(4, "Singularity Hammer", "weapons/Sledgehammer_poor", "Strength", "Melee", "d12+12 tech", "Two-Handed", "Collapse Point|num ataque bem-sucedido, gaste 2 Esperança para puxar todos os alvos dentro do alcance Muito Próximo do alvo para o alcance Corpo a Corpo dele e causar metade do dano a esses alvos.", gearCostAction("Collapse Point", [gearCost("hope", 2)])),
  W(4, "Neural Lance", "weapons/Naginata_poor", "Presence", "Far", "d8+10 tech", "Two-Handed", "Mind Spike|em dano Maior ou Severo, o alvo não pode ter como alvo ninguém além do alcance Muito Próximo até a sua próxima ação."),
  W(4, "Blackwall Emitter", "status/black_lace", "Knowledge", "Far", "d6+12 tech", "Two-Handed", "Red Static|numa rolagem com Medo, você pode somar +1 de Proficiência à rolagem de dano e depois marcar 1 Estresse.", gearDamage("Red Static (+1 Proficiência)", "1d6", "magical", [gearCost("stress", 1)])),
  W(4, "Stormblade", "weapons/Sword_poor", "Finesse", "Melee", "d10+9 tech", "One-Handed", "Blink Cut|num ataque bem-sucedido com Esperança, teleporte-se dentro do alcance Próximo e fique Escondido até a sua próxima ação.", gearCondition("Blink Cut", ["hidden"], [], { type: "self", amount: null }))
];

const SECONDARY_WEAPONS = [
  W(1, "Holdout Pistol", "weapons/mediumPistol", "Finesse", "Far", "d6 phy", "One-Handed", "Quickdraw|você não marca Estresse para equipar esta arma em perigo."),
  W(1, "Combat Knife", "weapons/CombatKnife", "Agility", "Melee", "d6+1 phy", "One-Handed", "Paired|+2 no dano da arma primária contra alvos dentro do alcance Corpo a Corpo.", official("paired")),
  W(1, "Riot Buckler", "armor/bullet_proof_shield", "Strength", "Melee", "d4 phy", "One-Handed", "Guard|+1 na Pontuação de Armadura.", official("protective")),
  W(1, "Shock Glove", "cyberware/battleglove", "Presence", "Melee", "d6 tech", "One-Handed", "Touch Arc|numa rolagem com Esperança, o alvo marca 1 Estresse.", gearStress("Touch Arc")),
  W(1, "Grapple Wire", "gear/grapple_gun", "Finesse", "Close", "d6 phy", "One-Handed", "Hooked|num ataque bem-sucedido, puxe o alvo até o alcance Corpo a Corpo ou puxe-se até o alcance Muito Próximo dele.", official("hooked")),
  W(1, "Smoke Popper", "ammo/grenade_smoke", "Knowledge", "Close", "d4 tech", "One-Handed", "Smoke|marque 1 Estresse para soltar fumaça dentro do alcance Muito Próximo e ficar Escondido enquanto estiver dentro da cortina.", gearCondition("Smoke", ["hidden"], [{ key: "stress", value: 1 }], { type: "self", amount: null })),
  W(1, "Tactical Drone", "dlc/gear/the-observer", "Instinct", "Close", "d6 tech", "One-Handed", "Spotter|gaste 1 Esperança para dar +2 ao seu próximo ataque com a arma primária.", gearCostAction("Spotter", [gearCost("hope", 1)])),
  W(1, "Stun Dart", "weapons/dartgun", "Finesse", "Far", "d6 tech", "One-Handed", "Sedative|em dano Maior, o alvo tem desvantagem na próxima rolagem de ação."),

  W(2, "Heavy Pistol", "weapons/heavyPistol", "Finesse", "Far", "d6+3 phy", "One-Handed", "Heavy Round|em dano Maior, some +1 de Proficiência à rolagem de dano.", gearDamage("Heavy Round (+1 Proficiência)", "1d6", "physical")),
  W(2, "Mono-Knife", "weapons/CombatKnife_excellent", "Agility", "Melee", "d8+2 phy", "One-Handed", "Serrated|quando você tira 1 num dado de dano, ele causa 6 de dano.", official("selfCorrecting")),
  W(2, "Impact Shield", "armor/bullet_proof_shield", "Strength", "Melee", "d6+2 phy", "One-Handed", "Protective|+1 na Pontuação de Armadura; quando você marca um Espaço de Armadura, pode empurrar um atacante Corpo a Corpo até o alcance Próximo.", passive(gearArmor(1))),
  W(2, "Arc Knuckles", "cyberweapons/big_knucks", "Presence", "Melee", "d8 tech", "One-Handed", "Jolt|num ataque bem-sucedido, gaste 1 Esperança para deixar o alvo temporariamente Vulnerável.", gearCondition("Jolt", ["vulnerable"], [{ key: "hope", value: 1 }])),
  W(2, "Micro-Net Launcher", "weapons/GrenadeLauncher_poor", "Finesse", "Very Close", "d6+3 phy", "One-Handed", "Net|num ataque bem-sucedido, não cause dano para deixar o alvo temporariamente Imobilizado.", gearCondition("Net", ["restrained"])),
  W(2, "Signal Jammer", "gear/scrambler_descrambler", "Knowledge", "Close", "d6+2 tech", "One-Handed", "Scramble|num ataque bem-sucedido, o alvo não pode se beneficiar de sensores ou suporte remoto até a sua próxima ação."),
  W(2, "Watchdog Drone", "dlc/gear/raven_microcybernetics_cybercam_ex-1", "Instinct", "Close", "d6+3 phy", "One-Handed", "Harrier|numa rolagem com Esperança, o alvo não pode ficar Escondido nem ter vantagem antes da sua próxima ação."),
  W(2, "Flash Charge", "ammo/grenade_flashbang", "Agility", "Close", "d4+4 phy", "One-Handed", "Blindside|marque 1 Estresse para deixar todos os alvos dentro do alcance Muito Próximo do alvo temporariamente Vulneráveis até agirem.", gearCondition("Blindside", ["vulnerable"], [{ key: "stress", value: 1 }])),

  W(3, "Hand Cannon", "weapons/veryHeavyPistol", "Finesse", "Far", "d6+6 phy", "One-Handed", "Reaction Shot|quando um adversário dentro do alcance Próximo falha num ataque contra você, você pode fazer uma rolagem de ataque de reação contra ele."),
  W(3, "Phase Dagger", "weapons/CombatKnife_poor", "Agility", "Melee", "d8+5 tech", "One-Handed", "Ghost Edge|numa rolagem com Esperança, este ataque ignora cobertura física ou redução de dano."),
  W(3, "Tower Shield Rig", "armor/bullet_proof_shield", "Strength", "Melee", "d6+5 phy", "One-Handed", "Barrier|+2 na Pontuação de Armadura; −1 de Evasão.", passive(gearArmor(2), gearChange("system.evasion", -1))),
  W(3, "Neural Spike", "weapons/stun_gun", "Presence", "Melee", "d8+5 tech", "One-Handed", "Pain Loop|em dano Maior ou Severo, o alvo marca 1 Estresse.", gearStress("Pain Loop")),
  W(3, "Kinetic Tonfa", "weapons/LeadPipe_excellent", "Strength", "Melee", "d8+5 phy", "One-Handed", "Counterweight|quando um adversário te ataca, você pode marcar 1 Estresse para ganhar +2 de Evasão contra esse ataque. Se o ataque errar, o atacante marca 1 Estresse.", gear(gearCostAction("Counterweight", [gearCost("stress", 1)]), gearStress("Atacante Marca 1 Estresse"))),
  W(3, "Counter-ICE Shard", "programs/eraser", "Knowledge", "Far", "d6+6 tech", "One-Handed", "Rebound|quando você rola com Medo neste ataque, pode rolar de novo o Dado de Medo ou ganhar 1 Esperança."),
  W(3, "Hunter-Seeker Drone", "dlc/gear/suzumebachi_assassin_drone", "Instinct", "Far", "d6+6 phy", "One-Handed", "Marked|num ataque bem-sucedido, o próximo ataque contra o alvo ganha +2."),
  W(3, "Concussion Pistol", "weapons/air_pistol", "Finesse", "Close", "d8+4 phy", "One-Handed", "Knockback|num ataque bem-sucedido, empurre o alvo até o alcance Próximo. Se ele colidir com algo, também marca 1 Estresse.", gearStress("Colisão")),

  W(4, "Executive Sidearm", "weapons/mediumPistol_excellent", "Finesse", "Far", "d6+9 phy", "One-Handed", "Reliable|+1 nas rolagens de ataque.", official("reliable")),
  W(4, "Molecular Razor", "weapons/Machete", "Agility", "Melee", "d8+8 phy", "One-Handed", "Perfect Cut|em dano Severo, o alvo marca 1 Ponto de Vida adicional.", official("deadly")),
  W(4, "Bastion Shield", "armor/bullet_proof_shield", "Strength", "Melee", "d6+9 phy", "One-Handed", "Bulwark|+2 na Pontuação de Armadura; quando um aliado dentro do alcance Muito Próximo marca PV, você pode marcar um Espaço de Armadura para reduzir a gravidade em um limiar.", passive(gearArmor(2))),
  W(4, "Synaptic Needle", "weapons/dartgun", "Presence", "Melee", "d8+8 tech", "One-Handed", "Neural Crash|em dano Severo, o alvo tem desvantagem em todas as rolagens até o mestre gastar 1 Medo para limpar essa condição.", gearCondition("Neural Crash", [])),
  W(4, "Gravity Chain", "weapons/Tomahawk", "Strength", "Close", "d8+8 phy", "One-Handed", "Dragline|num ataque bem-sucedido, mova o alvo para qualquer lugar dentro do alcance Próximo da posição atual dele."),
  W(4, "Blackbox Injector", "gear/tech_tool", "Knowledge", "Melee", "d6+10 tech", "One-Handed", "Exploit|numa rolagem com Esperança, crie uma Breach contra o alvo."),
  W(4, "Assassin Drone", "dlc/gear/suzumebachi_assassin_drone", "Instinct", "Far", "d6+10 phy", "One-Handed", "Silent Kill|se você estiver Escondido ao atacar, some 1d8 à rolagem de dano.", gearDamage("Silent Kill", "1d8", "physical")),
  W(4, "Singularity Charge", "weapons/thrown_weapon", "Finesse", "Close", "d10+7 tech", "One-Handed", "Implode|em dano Maior ou Severo, todos os alvos dentro do alcance Muito Próximo do alvo são puxados para o alcance Corpo a Corpo dele e sofrem metade do dano.")
];

const ARMORS = [
  A(1, "Street Icon Fit", "armor/light-armorjack_body", "5/11", 3, "Recognizable|uma vez por cena, escolha uma criatura que já ouviu falar da sua reputação. Ganhe vantagem na sua primeira rolagem contra ela.", advantageOn("Primeira rolagem contra quem conhece a sua reputação (1x por cena)")),
  A(1, "Synthleather Jacket", "clothing/generic_jacket", "6/13", 3, "Flexible|+1 de Evasão.", official("flexible")),
  A(1, "Ballistic Vest", "armor/kevlar_body", "7/15", 4, "Reinforced|quando você marca o seu último Espaço de Armadura, aumente os seus limiares de dano em +2 até limpar pelo menos 1 Espaço de Armadura.", official("reinforced")),
  A(1, "Riot Shell", "armor/heavy-armorjack_body", "8/17", 4, "Heavy|−1 de Evasão; <strong>Cover Brace:</strong> marque um Espaço de Armadura para ganhar +2 de Evasão contra um ataque recebido.", official("heavy")),
  A(1, "Hazard Suit", "gear/radiation_suit", "6/13", 3, "Sealed|você tem vantagem em rolagens para resistir a fumaça, veneno, gás, contaminação, doença ou exposição ambiental.", advantageOn("Resistir a fumaça, veneno, gás, contaminação, doença ou exposição ambiental")),

  A(2, "Luxurious Coat", "clothing/generic_top", "7/16", 3, "First Impression|uma vez por cena, escolha uma criatura. Ela precisa te tratar como alguém importante, perigoso, rico ou que vale a pena ouvir, até que se prove o contrário."),
  A(2, "Smartweave Coat", "armor/leathers_body", "7/16", 3, "Adaptive|quando você é alvo de um ataque, pode marcar um Espaço de Armadura para dar desvantagem à rolagem de ataque.", official("shifting")),
  A(2, "Gang Colors Jacket", "clothing/generic_jacket", "8/18", 4, "Claimed|você tem vantagem em rolagens para intimidar, negociar ou evitar ser desafiado em território de gangue, espaços criminosos ou ruas disputadas.", advantageOn("Intimidar, negociar ou evitar desafios em território de gangue ou ruas disputadas")),
  A(2, "Armored Bodysuit", "armor/bodyweight_suit", "8/20", 4, "Stealth|ganhe +2 nas rolagens para ficar ou continuar Escondido.", gearToggle("Stealth (+2 para ficar Escondido)", "armor/bodyweight_suit", gearChange("system.bonuses.roll.bonus", 2))),
  A(2, "Reactive Mesh", "dlc/armor/sycust_fleshweave", "9/22", 4, "Feedback|quando um adversário te causa dano dentro do alcance Corpo a Corpo, ele marca 1 Estresse.", gearStress("Feedback")),
  A(2, "Exo-Riot Plating", "armor/metalgear_body", "10/24", 5, "Anchored|você tem vantagem em rolagens para resistir a ser empurrado, derrubado, movido ou Imobilizado.", advantageOn("Resistir a ser empurrado, derrubado, movido ou Imobilizado")),
  A(2, "Insulated Hazmat", "dlc/armor/esporma_enviroment_suit", "8/18", 4, "Grounded|quando você marca um Espaço de Armadura contra dano techno, reduza a gravidade em um limiar adicional."),

  A(3, "Light Exosuit", "armor/medium-armorjack_body", "11/27", 5, "Agile Frame|+1 de Evasão.", official("flexible")),
  A(3, "Ghostweave Cloak", "armor/leathers_body", "11/27", 5, "Ghosted|quando você fica Escondido, também pode ficar invisível até se mover."),
  A(3, "Celebrity Armorweave", "clothing/generic_jewelry", "11/27", 5, "Spotlight Altar|uma vez por cena, você pode se tornar o centro das atenções. Até o seu próximo Holofote, os aliados têm vantagem em rolagens para se esconder, fugir ou agir sem serem notados."),
  A(3, "Corporate Aegis Suit", "armor/flak_body", "13/31", 5, "Executive Defense|uma vez por descanso, quando você rola com Medo numa Rolagem de Reação, pode transformá-la numa rolagem com Esperança."),
  A(3, "Reputation Mantle", "clothing/generic_top", "13/31", 5, "Name Carries Weight|quando você rola com Esperança numa Rolagem de Presença, um aliado que possa te ver ou ouvir limpa 1 Estresse.", { actions: resourceCardAction({ name: "Name Carries Weight", heal: true, resources: { stress: 1 }, target: { type: "friendly", amount: 1 } }) }),
  A(3, "Ceramite Plate", "armor/heavy-armorjack_body", "15/35", 6, "Heavy|−1 de Evasão; <strong>Ceramite:</strong> antes de marcar o seu último Espaço de Armadura, role um d6. Num 5 ou mais, reduza a gravidade em um limiar sem marcar um Espaço de Armadura.", official("heavy")),
  A(3, "Trauma Armor", "armor/medium-armorjack_body", "13/31", 5, "Life Support|uma vez por descanso curto, quando você fosse marcar o seu último Ponto de Vida, pode marcar 1 Estresse em vez disso.", official("impenetrable")),

  A(4, "Angel Skin Prototype", "armor/bodyweight_suit", "13/36", 5, "Emergency Halo|quando você fosse gastar 1 Esperança para ajudar um aliado ou usar uma feature defensiva, pode marcar um Espaço de Armadura em vez disso."),
  A(4, "Holo-Reactive Mantle", "armor/leathers_body", "13/36", 6, "Shifting|quando você é alvo de um ataque, marque um Espaço de Armadura para dar desvantagem à rolagem de ataque.", official("shifting")),
  A(4, "Nullweave Armor", "dlc/armor/sycust_fleshweave", "15/40", 6, "Signal Dead|você não pode ser alvo de sensores, drones ou sistemas remotos além do alcance Distante, a menos que já tenha sido detectado."),
  A(4, "Street Regalia", "armor/light-armorjack_body", "15/40", 6, "Legendary Cyberpunk|uma vez por cena, quando você fosse rolar com Medo numa rolagem, pode transformá-la numa rolagem com Esperança."),
  A(4, "Vagras Bulwark Harness", "armor/metalgear_body", "17/44", 7, "Very Heavy|−2 de Evasão; <strong>Walking Barricade:</strong> você conta como cobertura para os aliados dentro do alcance Muito Próximo. Quando um aliado dentro do alcance Muito Próximo é alvo de um ataque, você pode marcar um Espaço de Armadura para dar desvantagem a esse ataque.", passive(gearChange("system.evasion", -2))),
  A(4, "Siege Exo-Frame", "dlc/armor/scavenged-armor", "18/48", 8, "Difficult|−1 em todos os atributos; <strong>Fortified:</strong> quando você marca um Espaço de Armadura, reduza a gravidade em dois limiares em vez de um.", gear(official("fortified"), passive(...ALL_TRAITS.map(t => gearChange(`system.traits.${t}.value`, -1)))))
];

function gearDescription(feature) {
  const [name, text] = feature.split("|");
  return `<p><strong>${name}:</strong> ${text}</p>`;
}

// Efeito passivo da característica (ex: −1 de Evasão, +2 de Armadura), aplicado enquanto o item está equipado.
function gearPassiveEffect(item) {
  if (!item.changes.length) return [];
  return [{
    name: item.feature.split("|")[0], img: item.img, description: gearDescription(item.feature),
    transfer: true, type: "base", statuses: [], disabled: false, tint: "#ffffff",
    system: { changes: item.changes, duration: { description: "" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
    duration: { value: null, units: "seconds", expiry: null, expired: false }
  }];
}

function buildWeaponData(w, secondary) {
  return {
    _id: stableId(`weapon:${w.name}`),
    name: w.name, type: "weapon", img: w.img,
    effects: [...gearPassiveEffect(w), ...w.effects],
    system: {
      description: gearDescription(w.feature),
      actions: withDefaultActionImg(w.actions, w.img),
      tier: w.tier, equipped: false, secondary,
      burden: w.burden === "Two-Handed" ? "twoHanded" : "oneHanded",
      weaponFeatures: [],
      attack: buildAttackAction({ name: w.name, trait: w.trait, range: w.range, damageStr: w.damage, burden: w.burden, img: w.img }),
      rules: { attack: { roll: { trait: null } } },
      attribution: ATTRIBUTION, gmNotes: "", resource: null, quantity: 1
    }
  };
}

function buildArmorData(a) {
  const [major, severe] = a.thresholds.split("/").map(Number);
  return {
    _id: stableId(`armor:${a.name}`),
    name: a.name, type: "armor", img: a.img,
    effects: [...gearPassiveEffect(a), ...a.effects],
    system: {
      armor: { current: 0, max: Number(a.score) },
      description: gearDescription(a.feature),
      actions: withDefaultActionImg(a.actions, a.img),
      tier: a.tier, equipped: false, armorFeatures: [],
      baseThresholds: { major, severe },
      attribution: ATTRIBUTION, gmNotes: "", resource: null, quantity: 1
    }
  };
}

// Aplica as features oficiais depois de criar: o sistema monta os efeitos e ações delas (updateItemFeatures).
async function applyOfficialFeatures(docs, list, key) {
  for (const doc of docs) {
    const keys = list.find(i => i.name === doc.name)?.official ?? [];
    if (keys.length) await doc.update({ [`system.${key}`]: keys.map(value => ({ value })) });
  }
}

async function importWeaponsAndArmor() {
  const weaponsPack = await getOrCreatePack("weapons");
  const armorsPack = await getOrCreatePack("armors");

  // Estrutura do compêndio oficial daggerheart.weapons / armors:
  // Armas Primárias > Armas Físicas / Armas Tech > Tier N; Armas Secundárias > Tier N; Armaduras > Tier N.
  const primaryTop = await makeFolder(weaponsPack, "Armas Primárias");
  const primaryPhysical = await makeFolder(weaponsPack, "Armas Físicas", { parent: primaryTop.id });
  const primaryMagical = await makeFolder(weaponsPack, "Armas Tech", { parent: primaryTop.id });
  const secondaryTop = await makeFolder(weaponsPack, "Armas Secundárias");
  const folders = { physical: {}, magical: {}, secondary: {}, armor: {} };
  for (const tier of [1, 2, 3, 4]) {
    folders.physical[tier] = await makeFolder(weaponsPack, `Tier ${tier}`, { parent: primaryPhysical.id });
    folders.magical[tier] = await makeFolder(weaponsPack, `Tier ${tier}`, { parent: primaryMagical.id });
    folders.secondary[tier] = await makeFolder(weaponsPack, `Tier ${tier}`, { parent: secondaryTop.id });
    folders.armor[tier] = await makeFolder(armorsPack, `Tier ${tier}`);
  }

  const weaponData = [
    ...PRIMARY_WEAPONS.map(w => ({ ...buildWeaponData(w, false), folder: folders[/tech/i.test(w.damage) ? "magical" : "physical"][w.tier].id })),
    ...SECONDARY_WEAPONS.map(w => ({ ...buildWeaponData(w, true), folder: folders.secondary[w.tier].id }))
  ];
  const armorData = ARMORS.map(a => ({ ...buildArmorData(a), folder: folders.armor[a.tier].id }));

  const createdWeapons = await Item.createDocuments(weaponData, { pack: weaponsPack.collection, keepId: true });
  const createdArmor = await Item.createDocuments(armorData, { pack: armorsPack.collection, keepId: true });
  await applyOfficialFeatures(createdWeapons, [...PRIMARY_WEAPONS, ...SECONDARY_WEAPONS], "weaponFeatures");
  await applyOfficialFeatures(createdArmor, ARMORS, "armorFeatures");
  return { weapons: createdWeapons, armor: createdArmor };
}

// ---------- Loot e Consumíveis (PDF, cap. 2) ----------
// Mesmo formato dos compêndios oficiais daggerheart.loot / daggerheart.consumables e das tabelas de
// daggerheart.rolltables. Consumível: toda ação gasta 1 da quantidade (padrão das poções oficiais);
// clone = copia a automação do consumível oficial equivalente. Loot fica no inventário e usa as mesmas
// peças das armas e armaduras (vantagem, bônus desligado, custos, usos por descanso).

const gearUses = (name, recovery, costs = []) => ({ actions: featureAction({ name, costs, uses: { max: 1, recovery } }) });
const gearDice = (name, dice, costs = []) => ({ actions: featureAction({ name, dice, costs }) });
const gearHeal = (name, resources, target = { type: "any", amount: 1 }, costs = []) => ({ actions: resourceCardAction({ name, heal: true, resources, target, cost: costs }) });

// C(nome, ícone, texto, extras, clone) / L(nome, ícone, texto, extras)
const C = (name, img, text, extras = {}, clone = null) => ({ name, img: CPR(img), text, clone, ...gear(extras) });
const L = (name, img, text, extras = {}) => ({ name, img: CPR(img), text, ...gear(extras) });
const STRESS1 = [{ key: "stress", value: 1 }];
const HOPE1 = [{ key: "hope", value: 1 }];

const CONSUMABLES = [
  C("Minor Health Patch", "status/speedheal", "Limpe 1d4 Pontos de Vida.", {}, "Minor Health Potion"),
  C("Minor Stamina Injector", "status/stim", "Limpe 1d4 de Estresse.", {}, "Minor Stamina Potion"),
  C("Trauma Foam", "status/quickfix", "Quando uma criatura dentro do alcance Corpo a Corpo marca PV, use isto para fazê-la limpar 1 Estresse e parar de sangrar, queimar ou vazar.", gearHeal("Trauma Foam", { stress: 1 })),
  C("Combat Stim", "status/boost", "Some 1d6 à sua próxima Rolagem de Agilidade, Força ou Acuidade. Depois da rolagem, marque 1 Estresse.", gearDice("Combat Stim", "1d6", STRESS1)),
  C("Focus Ampoule", "status/prime_time", "Some 1d6 à sua próxima Rolagem de Conhecimento, Instinto ou Presença. Depois da rolagem, marque 1 Estresse.", gearDice("Focus Ampoule", "1d6", STRESS1)),
  C("Flash Grenade", "ammo/grenade_flashbang", "Todos os alvos dentro do alcance Próximo fazem uma Rolagem de Reação (14). Em uma falha, ficam temporariamente Vulneráveis.", gearCondition("Falhou na Reação (14): Vulnerável", ["vulnerable"])),
  C("Smoke Canister", "ammo/grenade_smoke", "Encha de fumaça uma área dentro do alcance Próximo. Criaturas dentro dela podem ficar Escondidas se a ficção permitir.", gearCondition("Smoke Canister", ["hidden"], [], { type: "friendly", amount: null })),
  C("EMP Charge", "ammo/grenade_emp", "Faça uma Rolagem de Interface contra um dispositivo, drone, veículo ou alvo ligado a cyberware dentro do alcance Próximo. Em um sucesso, ele marca 1 Estresse ou fica desativado por um instante.", gear({ actions: withActionId(buildCardAction({ range: "Close", img: CPR("ammo/grenade_emp") })) }, gearStress("Alvo Marca 1 Estresse"))),
  C("Breach Gel", "dlc/gear/delaying_compound", "Use numa porta, parede, barricada, fechadura ou painel de veículo. Depois de alguns momentos, ele abre, enfraquece ou cria um ponto de entrada."),
  C("Med-Gel Slab", "gear/medtech_bag", "Durante um descanso, uma criatura limpa 1 PV ou 2 de Estresse.", gear(gearHeal("Limpar 1 PV", { hitPoints: 1 }), gearHeal("Limpar 2 Estresse", { stress: 2 }))),
  C("Overclock Round", "ammo/rifle_smart", "O próximo ataque bem-sucedido com arma de distância causa +1d8 de dano techno. Numa rolagem com Medo, marque 1 Estresse.", gearDamage("Overclock Round", "1d8", "magical")),
  C("Shock Mine", "status/emp", "Coloque numa superfície. A próxima criatura que se mover dentro do alcance Corpo a Corpo dela marca 1 Estresse e fica temporariamente Vulnerável.", gear(gearStress("Alvo Marca 1 Estresse"), gearCondition("Shock Mine", ["vulnerable"]))),
  C("Anti-Toxin Cartridge", "status/antibiotics", "Limpe imediatamente envenenamento, contaminação, exposição química ou condição temporária parecida."),
  C("Hardlight Patch", "upgrades/security_upgrade", "Na próxima vez que você marcar um Espaço de Armadura antes do próximo descanso, reduza a gravidade em um limiar adicional."),
  C("Black ICE Shard", "default/default-blackice", "Gaste antes de uma Rolagem de Interface. Em um sucesso, crie uma Breach adicional. Numa rolagem com Medo, marque 1 Estresse."),
  C("Adrenal Plug", "status/deathtrance", "Quando você fosse marcar o seu último Ponto de Vida, use isto para continuar consciente até a cena terminar. Depois, marque 2 de Estresse.", gearCostAction("Adrenal Plug", [gearCost("stress", 2)])),
  C("Smart Ammo", "ammo/pistolheavy_smart", "O próximo ataque bem-sucedido com arma de fogo pode acertar outro alvo dentro do alcance Muito Próximo, causando metade do dano."),
  C("Sonic Spike", "weapons/shrieker", "Todas as criaturas dentro do alcance Muito Próximo do ponto escolhido marcam 1 Estresse, e vidros frágeis, sensores ou eletrônicos expostos quebram.", gearStress("Sonic Spike")),
  C("Cloak Mist", "status/hidden", "Fique Escondido até se mover para um lugar visível, atacar ou o mestre gastar 1 Medo para revelar a sua posição.", gearCondition("Cloak Mist", ["hidden"], [], { type: "self", amount: null })),
  C("Redline Dose", "status/beserker", "Some +1 de Proficiência à sua próxima rolagem de dano. Depois que o ataque se resolver, role o seu Dado de Humanidade. Se o resultado for menor que a sua Carga Cibernética, marque 1 Estresse.", {}, "Demiurge's Draught"),
  C("Major Health Patch", "status/speedheal", "Limpe 1 Ponto de Vida. Depois, marque 1 Estresse.", {}, "Snap Powder"),
  C("Hard Reset Ampoule", "status/rapiddetox", "Limpe uma condição física temporária de você ou de uma criatura dentro do alcance Corpo a Corpo. O alvo fica temporariamente Vulnerável até a próxima ação dele.", gearCondition("Hard Reset Ampoule", ["vulnerable"], [], { type: "any", amount: 1 })),
  C("Breach Spike", "gear/memory_chip", "Use antes de uma Rolagem de Interface contra um sistema conectado simples. Em um sucesso, crie uma Breach adicional."),
  C("Signal Flare", "gear/roadflare", "Revele a sua localização a todos os aliados na cena e tire a condição Escondido das criaturas dentro do alcance Próximo do sinalizador."),
  C("Nanowire Saw", "gear/tech_tool", "Corte uma fechadura, cabo, amarra, duto, cerca ou barreira leve comum depois de alguns momentos de trabalho."),
  C("Foamcrete Canister", "status/cover", "Crie cobertura temporária, vede uma porta, tampe uma brecha ou bloqueie uma passagem pequena dentro do alcance Próximo."),
  C("Decoy Transponder", "gear/tracer_button", "Até o seu próximo descanso, um veículo, drone, dispositivo ou criatura carregando este transponder aparece com uma identidade falsa para scanners simples."),
  C("Kinetic Booster", "dlc/cyberware/zero_gravity_thrusters", "Mova-se dentro do alcance Distante ignorando terreno difícil durante esse movimento. Depois, marque 1 Estresse.", gearCostAction("Kinetic Booster", STRESS1)),
  C("Cryo Pack", "gear/cryopump", "Quando você ou um aliado dentro do alcance Corpo a Corpo fosse sofrer dano de fogo, calor, ácido ou explosão, reduza a gravidade em um limiar."),
  C("Patch Plate", "armor/kevlar_head", "Limpe imediatamente 1 Espaço de Armadura de você, de um aliado dentro do alcance Corpo a Corpo ou de um veículo Damaged.", gearHeal("Patch Plate", { armor: 1 })),
  C("Smart Grenade", "ammo/grenade_basic", "Escolha um ponto dentro do alcance Distante. Todos os adversários dentro do alcance Muito Próximo desse ponto fazem uma Rolagem de Reação (14). Em uma falha, marcam 1 Estresse e ficam temporariamente Vulneráveis.", gear(gearStress("Falhou na Reação (14): 1 Estresse"), gearCondition("Falhou na Reação (14): Vulnerável", ["vulnerable"]))),
  C("Ghost Tag", "gear/agent", "Use ao entrar numa área restrita, vigiada ou guardada. Até o seu próximo Holofote, câmeras e sensores básicos te tratam como autorizado ou inofensivo."),
  C("Blackout Capsule", "status/blinded", "Desative luzes, câmeras simples, sensores baratos e telas desprotegidas dentro do alcance Próximo até o seu próximo Holofote."),
  C("Adrenal Inhaler", "gear/air_hypo", "Ganhe vantagem na sua próxima rolagem de ação. Depois que a rolagem se resolver, marque 1 Estresse.", gearCostAction("Adrenal Inhaler", STRESS1)),
  C("Anti-Hack Token", "programs/shield", "Use quando um rastreio, hack, escaneamento ou sinal hostil fosse afetar você ou o seu equipamento. Role um d6. Em 4+, o efeito falha.", gearDice("Anti-Hack Token", "1d6")),
  C("Door Eater", "dlc/gear/distilling_compound", "Aplique esta carga química numa porta, parede, barricada, painel de veículo ou fechadura. Depois de alguns momentos, ela abre uma passagem do tamanho de uma pessoa ou destrói a fechadura."),
  C("Shock Leash", "weapons/stun_gun", "Faça um ataque contra um alvo dentro do alcance Muito Próximo. Em um sucesso, não cause dano; o alvo fica temporariamente Imobilizado.", gearCondition("Shock Leash", ["restrained"])),
  C("Memory Wipe Tab", "gear/braindance_viewer", "Use depois de uma conversa curta com um PNJ menor. Ele esquece um pequeno detalhe da interação, a menos que isso obviamente o coloque em perigo."),
  C("Prototype Battery", "ammo/battery", "Recarregue um item de Loot gasto que funcione por energia, sinal, drones, hardlight, scanners ou eletrônicos, permitindo usá-lo uma vez a mais antes do seu próximo descanso."),
  C("Panic Button", "gear/disposable_cellphone", "Use quando você fosse ser capturado, encurralado ou separado. Um alarme, sinal para aliados, sinalizador de emergência ou protocolo de fuga planejado é ativado imediatamente.")
];

const LOOT = [
  L("Burner ID", "gear/agent", "Quando você entra numa área de baixa segurança, pode gastar 1 Esperança para se passar por alguém inofensivo ou esperado.", gearCostAction("Burner ID", HOPE1)),
  L("Comm Beads", "gear/radio_communicator", "Você e um aliado carregando contas conectadas podem se comunicar aos sussurros a até 1,5 km."),
  L("Lockspike", "gear/lock_picking_set", "Quando você cria uma Breach contra uma fechadura, porta ou painel de segurança local, ganhe +2 na rolagem.", gearToggle("Lockspike (+2 na rolagem)", "gear/lock_picking_set", gearChange("system.bonuses.roll.bonus", 2))),
  L("Smart Chalk", "gear/glow_paint", "Você pode marcar uma rota, porta, veículo ou criatura. Até o seu próximo descanso, sempre consegue encontrar o alvo marcado se ele estiver a até 1,5 km."),
  L("Emergency Beacon", "gear/roadflare", "Uma vez por descanso, ative este sinalizador para os aliados saberem a sua localização e estado exatos.", gearUses("Emergency Beacon", "shortRest")),
  L("Climbing Filament", "gear/rope", "Você ganha vantagem em rolagens para escalar, descer ou se prender em superfícies verticais.", advantageOn("Escalar, descer ou se prender em superfícies verticais")),
  L("Forger's Sleeve", "gear/memory_chip", "Uma vez por descanso, crie um documento, crachá, permissão ou assinatura comum convincente.", gearUses("Forger's Sleeve", "shortRest")),
  L("Pocket Drone", "dlc/gear/the-observer", "Você pode lançar este drone para explorar dentro do alcance Muito Distante. Se ele entrar em perigo, role um d6; num 1, ele é destruído.", gearDice("Drone em Perigo", "1d6")),
  L("Trauma Tag", "gear/medscanner", "Quando um aliado dentro do alcance Próximo marca PV, você sabe imediatamente onde ele está e se está morrendo, estável ou consciente."),
  L("Sound Sponge", "gear/auto_leveldampeningear_protectors", "Gaste 1 Esperança para silenciar uma área pequena dentro do alcance Muito Próximo até o seu próximo Holofote.", gearCostAction("Sound Sponge", HOPE1)),
  L("Hardlight Umbrella", "dlc/gear/umbrella", "Marque 1 Estresse para criar cobertura temporária para você ou um aliado dentro do alcance Muito Próximo.", gearCostAction("Hardlight Umbrella", STRESS1)),
  L("EMP Thread", "gear/scrambler_descrambler", "Você tem vantagem em rolagens para resistir a pequenos perigos elétricos, etiquetas de rastreamento ou scanners de curto alcance.", advantageOn("Resistir a pequenos perigos elétricos, etiquetas de rastreamento ou scanners de curto alcance")),
  L("Microfab Key", "gear/tech_tool", "No tempo livre, você pode fabricar uma ferramenta comum, peça de reposição, carcaça, adaptador ou componente simples de arma."),
  L("Ghost Plate", "gear/radar_detector", "Uma vez por descanso, quando você fica Escondido, também pode deixar para trás uma assinatura de calor falsa ou um loop de câmera.", gearUses("Ghost Plate", "shortRest")),
  L("Clean Needle", "gear/air_hypo", "Você tem vantagem em rolagens para administrar drogas, estabilizar envenenamento, coletar sangue ou fazer cirurgia delicada em campo.", advantageOn("Administrar drogas, estabilizar envenenamento, coletar sangue ou cirurgia delicada em campo")),
  L("Blackbox Recorder", "gear/audio_recorder", "Quando uma cena perigosa termina, você pode perguntar ao mestre o que um dispositivo, sinal ou câmera próximo gravou."),
  L("Portable Shrine", "gear/glowstick", "Durante um descanso, você ou um aliado pode gastar 1 Esperança para limpar 1 Estresse confessando, rezando, relembrando ou se centrando.", gearHeal("Portable Shrine", { stress: 1 }, { type: "any", amount: 1 }, [gearCost("hope", 1)])),
  L("Debt Chip", "gear/memory_chip", "Uma vez por sessão, gaste este chip para conseguir um pequeno favor de alguém que reconhece a dívida. O mestre diz o que ele quer depois.", gearUses("Debt Chip", "session")),
  L("Signal Cloak", "gear/scrambler_descrambler", "Uma vez por descanso, quando um drone, câmera ou scanner fosse te detectar, role um d6. Em 4+, ele não te percebe.", { actions: featureAction({ name: "Signal Cloak", dice: "1d6", uses: { max: 1, recovery: "shortRest" } }) }),
  L("Old World Map", "gear/computer", "Quando você entra numa ruína, zona morta, túnel ou instalação selada, pergunte ao mestre uma coisa sobre uma rota oculta, o propósito antigo do lugar ou uma fraqueza estrutural."),
  L("Forensic Lens", "gear/chemical_analizer", "Quando você inspeciona um corpo, ferida, máquina destruída ou veículo danificado, pergunte ao mestre o que causou o dano ou que detalhe a maioria das pessoas deixaria passar."),
  L("Dead Drop Case", "dlc/gear/hidden-compartment", "Uma vez por descanso, esconda ou recupere um item pequeno num lugar que você poderia ter preparado antes.", gearUses("Dead Drop Case", "shortRest")),
  L("Faraday Pouch", "gear/personal_carepak", "Itens guardados dentro não podem ser rastreados, escaneados, invadidos ou ativados remotamente por sistemas simples."),
  L("Signal Leech", "gear/radio_scanner_music_player", "Quando você tem sucesso numa Rolagem de Interface contra um sistema conectado, pode descobrir outro dispositivo ou usuário conectado a ele no momento."),
  L("Decoy Wallet", "gear/disposable_cellphone", "Uma vez por descanso, quando alguém te revista, rouba, escaneia ou extorque, encontra esta falsificação convincente em vez de algo importante.", gearUses("Decoy Wallet", "shortRest")),
  L("Breach Cord", "gear/rope", "Você tem vantagem em rolagens para forçar, cortar ou contornar portas, cercas, dutos, fechaduras e painéis de acesso comuns.", advantageOn("Forçar, cortar ou contornar portas, cercas, dutos, fechaduras e painéis de acesso comuns")),
  L("Mirror Tag", "gear/tracer_button", "Uma vez por descanso, coloque esta etiqueta numa superfície ou objeto. Até o seu próximo descanso, scanners e rastreadores procurando você podem ser redirecionados para ela.", gearUses("Mirror Tag", "shortRest")),
  L("Filter Hood", "gear/antismog_breathing_mask", "Você respira e age normalmente em fumaça, poeira, cinzas, fedor químico, gás lacrimogêneo e ar poluído, a menos que o perigo seja imediatamente letal."),
  L("Courier Boots", "clothing/generic_footwear", "Uma vez por descanso, quando você se move por uma multidão, beco, telhado, ruína ou trânsito, ignore terreno difícil durante esse movimento.", gearUses("Courier Boots", "shortRest")),
  L("Drone Harness", "dlc/gear/the-transporter", "Você carrega, acopla, lança ou conserta drones pequenos com mais facilidade. Sua primeira rolagem em cada descanso para consertar, esconder ou recuperar um drone tem vantagem."),
  L("Smart Cuffs", "gear/handcuffs", "Quando você prende uma criatura voluntária, inconsciente ou derrotada, tentativas comuns de fuga dessas algemas têm desvantagem."),
  L("Rumor Deck", "default/Defult_Card_Hand", "Uma vez por descanso, quando você entra num bar, mercado, clínica, garagem, esconderijo ou estação, pergunte ao mestre que boato todo mundo ali está evitando dizer em voz alta.", gearUses("Rumor Deck", "shortRest")),
  L("Shock Blanket", "gear/inflatable_bed_and_sleepingbag", "Durante um descanso curto, uma criatura enrolada neste cobertor pode limpar 1 Estresse causado por medo, frio, choque, perda de sangue ou exposição.", gearHeal("Shock Blanket", { stress: 1 })),
  L("Collapsible Barricade", "status/cover", "Uma vez por descanso, monte esta barricada para criar cobertura temporária para até duas criaturas dentro do alcance Muito Próximo.", gearUses("Collapsible Barricade", "shortRest")),
  L("Mag Boots", "clothing/generic_footwear", "Você tem vantagem em rolagens para resistir a ser empurrado, derrubado, arrastado ou movido contra a vontade enquanto estiver sobre metal, blindagem de veículo ou piso reforçado.", advantageOn("Resistir a ser empurrado, derrubado, arrastado ou movido sobre metal ou piso reforçado")),
  L("Signal Splitter", "gear/radio_communicator", "Você pode manter dois canais de comunicação separados ao mesmo tempo. Uma vez por descanso, quando um sinal fosse bloqueado ou cortado, você pode manter um canal aberto.", gearUses("Signal Splitter", "shortRest")),
  L("Clinic Cooler", "gear/cryotank", "Você conserva com segurança remédios, sangue, órgãos, amostras ou bioware instável. Tem vantagem em rolagens para transportar material médico delicado.", advantageOn("Transportar material médico delicado")),
  L("Old Net Charm", "default/default-blackice", "Uma vez por descanso, quando você rola com Medo ao interagir com dados corrompidos, resíduos da Blackwall ou sinais impossíveis, pode marcar 1 Estresse para perguntar ao mestre o que parece errado.", gearUses("Old Net Charm", "shortRest", STRESS1)),
  L("Garage Token", "dlc/gear/master_mechanics_tool_kit", "Uma vez por sessão, quando você chega a uma garagem, acampamento de estrada, parada de comboio ou contato mecânico, pode consertar um veículo Damaged sem pagar o custo normal.", gearUses("Garage Token", "session")),
  L("Memory Shard", "gear/memory_chip", "Durante um descanso, encaixe este fragmento num dispositivo ou porta neural e pergunte ao mestre uma coisa sobre o lugar, pessoa, facção ou evento gravado nele.")
];

// Toda ação de consumível gasta 1 da quantidade do próprio item; sem ação, ganha "Usar" (como as oficiais).
function withQuantityCost(actions, itemId, img, name) {
  const list = Object.keys(actions).length ? actions : featureAction({ name, img });
  for (const action of Object.values(list)) {
    action.cost = [...(action.cost ?? []).filter(c => c.key !== "quantity"), { scalable: false, key: "quantity", value: 1, step: null, consumeOnSuccess: false, itemId }];
  }
  return list;
}

// ---------- Veículos (PDF, cap. 3: Equipamento Especial) ----------
// Não existe veículo no sistema. Cada veículo é um item de loot (não ocupa os espaços de arma) com
// ações: ataque (batida ou arma montada, atributo e dano do veículo com Proficiência), Manobrar,
// Manter Funcionando (1 Estresse), Sofrer Dano Sério e Consertar. Damaged/Disabled ficam na flag
// vehicle.state e são aplicados pelo edgeheart-crew.js (−2 no Ataque do Veículo e no Manobrar, Característica
// bloqueada, Disabled bloqueia tudo menos Consertar). Veículo também pode ficar no Inventário da Crew.
const VEHICLE_ACTIONS = { attack: "Ataque do Veículo", maneuver: "Manobrar", keep: "Manter Funcionando", damage: "Sofrer Dano Sério", repair: "Consertar" };

const VEHICLE_BURDENS = {
  Swift: { text: "um veículo rápido e ágil. Enquanto estiver em alta velocidade, ganhe +1 de Evasão.", extras: () => gearToggle("Swift: alta velocidade (+1 Evasão)", "vehicles/motorbike", gearChange("system.evasion", 1)) },
  Heavy: { text: "um veículo volumoso, reforçado ou difícil de manobrar. Enquanto o usa, sofra −1 de Evasão, mas ganhe +2 nos Limiares de Dano.", extras: () => gearToggle("Heavy: dirigindo (−1 Evasão, +2 Limiares)", "upgrades/heavy_chasis", gearChange("system.evasion", -1), gearChange("system.damageThresholds.major", 2), gearChange("system.damageThresholds.severe", 2)) },
  Armored: { text: "um veículo de combate protegido. Uma vez por cena, quando você ou um aliado dentro dele fosse marcar PV, reduza a gravidade em 1.", extras: () => gearUses("Armored: reduzir a gravidade", "scene") },
  "Off-Road": { text: "um veículo feito para estradas ruins. Ignore terreno difícil causado por chão quebrado, escombros ou ruas instáveis.", extras: () => ({}) },
  Cargo: { text: "um veículo de Crew com espaço de carga, ferramentas ou suprimentos. Uma vez por descanso, revele uma peça de equipamento útil guardada dentro dele.", extras: () => gearUses("Cargo: revelar equipamento", "shortRest") },
  Connected: { text: "um veículo em rede com piloto automático, suporte de mira ou sistemas remotos. Ele conta como um sistema conectado para hacking.", extras: () => ({}) },
  Soaring: { text: "um veículo voador. Uma vez por cena, mova-se para qualquer lugar dentro do alcance Distante, desde que haja espaço aberto suficiente para manobrar.", extras: () => gearUses("Soaring: voar até Distante", "scene") }
};

// V(nome, ícone, atributo, dano, carga, "Característica|texto", extras da característica)
const V = (name, img, trait, damage, burden, feature, extras = {}) => ({ name, img: CPR(img), trait, damage, burden, feature, ...gear(extras) });

const VEHICLES = [
  V("Street Bike", "vehicles/motorbike", "Agility", "d8", "Swift", "Lane Splitter|depois de uma rolagem de veículo bem-sucedida, você pode se reposicionar dentro do alcance Próximo."),
  V("Nomad Buggy", "upgrades/combat_plow", "Instinct", "d8+3", "Off-Road", "Dust Runner|numa rolagem com Esperança enquanto dirige por terreno acidentado, um alvo dentro do alcance Próximo marca 1 Estresse.", gearStress("Dust Runner")),
  V("Armored Sedan", "upgrades/armored_chassis", "Finesse", "d10", "Armored", "Hard Cover|quando você ou um aliado dentro ou atrás do veículo é alvo de um ataque vindo de além do alcance Corpo a Corpo, ganhe +2 de Evasão contra esse ataque.", gearToggle("Hard Cover (+2 Evasão)", "upgrades/bulletproof_glass", gearChange("system.evasion", 2))),
  V("Crew Van", "dlc/vehicles/zonda_metrocar", "Knowledge", "d8", "Cargo", "Mobile Kit|uma vez por descanso, quando você ou um aliado usa um equipamento do veículo, ganhe +2 na rolagem.", gearUses("Mobile Kit (+2 na rolagem)", "shortRest")),
  V("Interceptor", "vehicles/super_car", "Finesse", "d10+3", "Swift", "Pursuit Lock|numa rolagem de veículo bem-sucedida, o alvo não pode aumentar a distância de você além do alcance Próximo até o seu próximo Holofote."),
  V("War Rig", "upgrades/heavy_chasis", "Strength", "d12+3", "Heavy", "Road Crusher|num ataque de veículo bem-sucedido, o alvo precisa se afastar de você ou marcar 1 Estresse. Se o alvo for um objeto, ele é rompido ou desativado.", gearStress("Road Crusher")),
  V("Corporate AV", "upgrades/av_4_engine_upgrade", "Knowledge", "d6", "Soaring", "Air Superiority|numa rolagem com Esperança enquanto opera o veículo, você ou um aliado que possa ver o alvo ganha vantagem na próxima rolagem de ataque antes do seu próximo Holofote."),
  V("Ghost Runner", "upgrades/smuggling_upgrade", "Knowledge", "d8", "Connected", "Autopilot Ghost|uma vez por cena, quando você fosse ser descoberto, rastreado, bloqueado ou pego durante uma perseguição, faça uma Rolagem de Interface (14). Em um sucesso, crie uma rota falsa, sinal falso ou movimento de despiste e fique Escondido ou escape da perseguição imediata.", gear({ actions: withActionId(buildCardAction({ difficulty: 14, targetType: "self", name: "Autopilot Ghost (14)", uses: { max: 1, recovery: "scene" } })) }, gearCondition("Autopilot Ghost: Escondido", ["hidden"], [], { type: "self", amount: null })))
];

const VEHICLE_RULES = "<p><strong>Dano em veículos:</strong> veículos não têm PV. Quando um ataque ou batida fosse danificar seriamente o veículo, o motorista pode marcar 1 Estresse para mantê-lo funcionando, ou ele fica <strong>Damaged</strong> (a Característica não pode ser usada e as rolagens para dirigi-lo ou manobrá-lo sofrem −2). Damaged de novo vira <strong>Disabled</strong>: não se move nem pode ser usado até ser consertado (durante um descanso ou por uma feature como Jury-Rig).</p>";

function buildVehicleData(v) {  const [, dice, bonus] = v.damage.match(/^(d\d+)(?:\+(\d+))?$/);
  const formula = `(@prof)${dice}${bonus ? ` + ${bonus}` : ""}`;
  const burden = VEHICLE_BURDENS[v.burden];
  const burdenPart = gear(burden.extras());
  const [featureName, featureText] = v.feature.split("|");
  const trait = TRAIT_MAP[v.trait];
  const actions = {
    ...withActionId(buildCardAction({ trait, name: VEHICLE_ACTIONS.attack, damageFormula: { formula, dmgType: "physical" }, img: v.img })),
    ...withActionId(buildCardAction({ trait, name: VEHICLE_ACTIONS.maneuver, targetType: "any", img: v.img })),
    ...featureAction({ name: VEHICLE_ACTIONS.keep, costs: [{ key: "stress", value: 1 }] }),
    ...featureAction({ name: VEHICLE_ACTIONS.damage }),
    ...featureAction({ name: VEHICLE_ACTIONS.repair }),
    ...burdenPart.actions,
    ...v.actions
  };
  const _id = stableId(`vehicle:${v.name}`);
  return {
    _id, name: v.name, type: "loot", img: v.img,
    effects: [...burdenPart.effects, ...v.effects],
    flags: { [MODULE_ID]: { vehicle: { baseName: v.name, state: "ok", trait: v.trait, damage: v.damage, burden: v.burden, featureActions: Object.values(v.actions).map(a => a.name) } } },
    system: {
      description: `<p><strong>Atributo:</strong> ${game.i18n.localize(CONFIG.DH.ACTOR.abilities[trait].label)} · <strong>Dano:</strong> ${v.damage} físico · <strong>Carga:</strong> ${v.burden}</p><p><strong>${v.burden}:</strong> ${burden.text}</p><p><strong>${featureName}:</strong> ${featureText}</p>${VEHICLE_RULES}`,
      quantity: 1, actions: withDefaultActionImg(actions, v.img), attribution: ATTRIBUTION, gmNotes: ""
    }
  };
}

async function importLootAndConsumables() {
  const officialConsumables = await game.packs.get("daggerheart.consumables")?.getDocuments() ?? [];
  const consumables = CONSUMABLES.map(c => {
    const _id = stableId(`consumable:${c.name}`);
    let { actions, effects } = c;
    if (c.clone) {
      const official = officialConsumables.find(o => o.name === c.clone);
      if (official) ({ actions, effects } = cloneOfficialCard(official, c.name, c.img));
      else console.warn(`Edgeheart | Consumível oficial "${c.clone}" não encontrado; ${c.name} fica só com texto.`);
    }
    return {
      _id, name: c.name, type: "consumable", img: c.img, effects,
      system: { description: `<p>${c.text}</p>`, quantity: 1, consumeOnUse: true, actions: withDefaultActionImg(withQuantityCost(actions, _id, c.img, c.name), c.img), attribution: ATTRIBUTION, gmNotes: "" }
    };
  });
  const loot = LOOT.map(l => ({
    _id: stableId(`loot:${l.name}`), name: l.name, type: "loot", img: l.img,
    effects: [...gearPassiveEffect({ ...l, feature: `${l.name}|${l.text}` }), ...l.effects],
    system: { description: `<p>${l.text}</p>`, quantity: 1, actions: withDefaultActionImg(l.actions, l.img), attribution: ATTRIBUTION, gmNotes: "" }
  }));
  await Item.createDocuments(consumables, { pack: (await getOrCreatePack("consumables")).collection, keepId: true });
  const lootPack = await getOrCreatePack("loot");
  await Item.createDocuments(loot, { pack: lootPack.collection, keepId: true });
  const vehicleFolder = await makeFolder(lootPack, "Veículos");
  await Item.createDocuments(VEHICLES.map(v => ({ ...buildVehicleData(v), folder: vehicleFolder.id })), { pack: lootPack.collection, keepId: true });

  // Tabelas no formato das oficiais (Core Set Items / Consumables): 1d10, o mestre rola mais dados
  // conforme a raridade (Comum 1d10, Incomum 1d10–2d10, Raro 2d10–3d10, Lendário 3d10–4d10).
  const rarity = "<p>Role conforme a raridade: <strong>Comum</strong> 1d10, <strong>Incomum</strong> 1d10 ou 2d10, <strong>Raro</strong> 2d10 ou 3d10, <strong>Lendário</strong> 3d10 ou 4d10 (mude a fórmula da tabela ou role e escolha o resultado).</p>";
  const table = (name, img, list, packKey, prefix) => ({
    _id: stableId(`table:${name}`), name, img, description: rarity, formula: "1d10", replacement: true, displayRoll: true,
    results: list.map((item, i) => ({
      type: "document", weight: 1, range: [i + 1, i + 1], name: item.name, img: item.img, description: "",
      documentUuid: `Compendium.${PACK_SCOPE}.${PACKS[packKey].name}.Item.${stableId(`${prefix}:${item.name}`)}`
    }))
  });
  await RollTable.createDocuments([
    table("Loot do Edgeheart", CPR("dlc/gear/fire-safe"), LOOT, "loot", "loot"),
    table("Consumíveis do Edgeheart", CPR("gear/medtech_bag"), CONSUMABLES, "consumables", "consumable")
  ], { pack: (await getOrCreatePack("rolltables")).collection, keepId: true });
}

// ---------- Classe / Subclasses (mesma lógica da v0.2) ----------

// Cada classe é só dados: importClass() monta pastas, features, itens de classe e subclasses.
// Para adicionar uma classe nova, crie um objeto no mesmo formato e coloque em CLASSES.
// - key: identificador fixo usado nos IDs (não mude depois de publicado, ou os uuids mudam).
// - guide: build sugerida mostrada na criação de personagem (armas/armadura pelo nome do item
//   nos compêndios Edgeheart: Armas / Armaduras).
const RUNNER = {
  key: "runner",
  classItems: [
    { name: "Cyberdeck Ilegal", img: CPR("gear/cyberdeck_poor"), description: "<p>Um cyberdeck feito sob encomenda, sem licença, com manias e interface próprias. Descreva sua aparência, sua idade, e onde você o conseguiu.</p>" },
    { name: "Fragmento de Acesso Roubado", img: CPR("gear/memory_chip"), description: "<p>Um fragmento de acesso físico tirado de um trabalho que deveria ter te matado. Ele ainda abre alguma coisa — você só não tem certeza o quê, ou quem vai perceber quando isso acontecer.</p>" }
  ],
  guide: {
    traits: { agility: 1, strength: 0, finesse: -1, instinct: 1, presence: 0, knowledge: 2 },
    primaryWeapon: "Scrap Launcher", secondaryWeapon: null, armor: "Ballistic Vest"
  },
  class: {
    name: "Runner",
    img: CPR("classes/runner/class-icon.png"),
    description: `<p><strong>Network, hacking, Acesso, guerra digital</strong><br>"Todo sistema trancado é só uma porta esperando para aprender o medo."</p>
<p><em>Jogue de Runner se você quiser…</em> Invadir redes, sequestrar drones, destravar sistemas, expor pontos fracos e transformar hacking em controle de campo de batalha.</p>
<p><strong>Itens de Classe:</strong> Um cyberdeck ilegal com interface personalizada ou um fragmento de acesso roubado de um trabalho que deveria ter te matado.</p>
<p><strong>Hacking e Breaches:</strong> Quando você tem sucesso em uma Rolagem de Interface para invadir um sistema conectado, você cria uma Breach. Uma Breach é uma abertura temporária em um sistema. Ao criar uma Breach, gaste-a imediatamente para escolher um Hack: <em>Open/Lock</em>, <em>Loop/Spoof</em>, <em>Pull Data</em>, <em>Jam</em>, <em>Expose</em> ou <em>Command</em>.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["network"],
    hitPoints: 5,
    evasion: 10,
    backgroundQuestions: [
      "Quem te ensinou a invadir sistemas, e o que essa pessoa te avisou para nunca tocar?",
      "Qual foi a primeira rede que você invadiu, e o que você encontrou lá?",
      "Qual corporação, gangue ou sistema governamental ainda tem seu rastro enterrado em algum lugar dentro dele?"
    ],
    connections: [
      "Eu já apaguei uma evidência que poderia ter te arruinado. O que eu apaguei?",
      "Você me viu me conectar a um sistema que quase me matou. O que você fez para me tirar de lá?",
      "Eu sei um segredo seu por causa de algo que encontrei em uma rede. Você sabe que eu sei?"
    ],
    hopeFeature: {
      name: "Zero-Day", img: CPR("programs/vrizzbolt"), form: "action",
      description: "<p>Gaste 3 Esperança para criar imediatamente 2 Breaches.</p>",
      actions: featureAction({ name: "Zero-Day", img: CPR("programs/vrizzbolt"), costs: [{ key: "hope", value: 3 }] })
    },
    classFeatures: [
      {
        name: "Hold Your Breach", img: CPR("programs/superglue"), form: "action",
        description: "<p>Depois de criar uma Breach, gaste 1 Esperança para usá-la sem gastá-la.</p>",
        actions: featureAction({ name: "Hold Your Breach", img: CPR("programs/superglue"), costs: [{ key: "hope", value: 1 }] })
      },
      (() => {
        // A penalidade usa "-origin.@tier": o DhActiveEffect resolve origin.@ no rollData do
        // item de origem (a feature no Runner), então o valor segue o Tier de quem fez o Exploit.
        const exploited = targetEffect({
          name: "Exploited", img: CPR("cyberware/targeting_scope"),
          description: "<p>Penalidade nos Limiares e na Dificuldade igual ao Tier do Runner que fez o Exploit neste alvo.</p>",
          changes: ["system.difficulty", "system.damageThresholds.major", "system.damageThresholds.severe"]
            .map(key => ({ key, type: "add", value: "-origin.@tier", priority: null, phase: "initial" }))
        });
        return {
          name: "Exploit", img: exploited.img, form: "action",
          description: "<p>Marque 1 Estresse para aplicar Exploit temporariamente em um alvo dentro do alcance Distante. Enquanto Exploited, o alvo recebe uma penalidade em seus Limiares e Dificuldade igual ao seu Tier. O número máximo de criaturas que você pode manter Exploited ao mesmo tempo é igual ao seu atributo de Interface.</p>",
          effects: [exploited],
          actions: featureAction({ name: "Exploit", img: exploited.img, costs: [{ key: "stress", value: 1 }], effects: [exploited] })
        };
      })()
    ]
  },
  subclasses: [
    {
      name: "Breach Specialist", img: CPR("classes/runner/subclasses/breach-specialist.png"),
      description: `<p><em>Jogue de Breach Specialist se você quiser transformar invasão em arma, quebrar sistemas inimigos, derrubar defesas e transformar redes em vetores de ataque.</em></p>
<p><strong>Build Sugerida:</strong> Conhecimento +2, Agilidade +1, Instinto +1, Presença 0, Força 0, Finesse −1. Equipamento recomendado: Scrap Launcher (primária, duas mãos — sem arma secundária) + Ballistic Vest — favorece o assalto direto a sistemas e sobreviver ao alcance corpo a corpo que o Rootkill te leva.</p>`,
      spellcastingTrait: "knowledge",
      // Atributos sugeridos da "Build Sugerida" (a criação de personagem usa estes no lugar dos da classe).
      suggestedTraits: { agility: 1, strength: 0, finesse: -1, instinct: 1, presence: 0, knowledge: 2 },
      foundation: [
        (() => {
          const vulnerable = targetEffect({ name: "Exploit Payload", img: CPR("programs/poison_flatline"), statuses: ["vulnerable"] });
          return {
            name: "Exploit Payload", img: vulnerable.img, form: "action",
            description: "<p>Quando você aplica Exploit em uma criatura, drone, veículo ou sistema conectado, você pode marcar 1 Estresse para tornar o alvo temporariamente Vulnerável.</p>",
            effects: [vulnerable],
            actions: featureAction({ name: "Exploit Payload", img: vulnerable.img, costs: [{ key: "stress", value: 1 }], effects: [vulnerable] })
          };
        })(),
        {
          name: "Hard Crash", img: CPR("programs/deckkrash"), form: "action",
          description: "<p>Uma vez por descanso, quando você cria uma Breach contra um alvo Exploited por você, você pode usar imediatamente essa Breach sem gastá-la.</p>",
          actions: featureAction({ name: "Hard Crash", img: CPR("programs/deckkrash"), uses: { max: 1, recovery: "shortRest" } })
        }
      ],
      specialization: [{
        name: "Cascade Breach", img: CPR("netrunning/Root_Access.png"), form: "action",
        description: "<p>Uma vez por cena, quando você cria uma Breach, você pode criar imediatamente outra Breach em um alvo ou sistema conectado dentro do alcance Próximo do alvo original.</p>",
        actions: featureAction({ name: "Cascade Breach", img: CPR("netrunning/Root_Access.png"), uses: { max: 1, recovery: "scene" } })
      }],
      mastery: [(() => {
        const degraded = targetEffect({
          name: "Degraded", img: CPR("programs/nervescrub"),
          description: "<p>Enquanto Degraded, o alvo usa um d12 em vez de um d20 para rolagens de ataque.</p>"
        });
        return {
          name: "Rootkill", img: CPR("blackice/src/liche"), form: "action",
          description: "<p>Uma vez por descanso longo, quando você faz um Hack com sucesso em um alvo Exploited por você, você pode forçar uma falha catastrófica no sistema. O alvo marca 1 Estresse e 1 Ponto de Vida, então fica temporariamente Degraded. Enquanto Degraded, o alvo usa um d12 em vez de um d20 para rolagens de ataque.</p>",
          effects: [degraded],
          actions: featureAction({ name: "Rootkill", img: CPR("blackice/src/liche"), uses: { max: 1, recovery: "longRest" }, effects: [degraded] })
        };
      })()]
    },
    {
      // O PDF chama esta subclasse de "Signal Ghost" na lista da página 8, mas a seção dela e o
      // texto usam "Net Diver"; ficou o nome da seção.
      name: "Net Diver", img: CPR("classes/runner/subclasses/signal-ghost.png"),
      description: `<p><em>Jogue de Net Diver se você quiser entrar em redes hostis, controlar sistemas conectados e completar o trabalho de dentro da arquitetura digital.</em></p>
<p><strong>Build Sugerida:</strong> Instinto +2, Finesse +1, Agilidade +1, Presença 0, Conhecimento 0, Força −1. Equipamento recomendado: Smartbow (primária, duas mãos — sem arma secundária) + Synthleather Jacket — favorece manter-se móvel e cobrir aliados à distância enquanto usa o Deep Dive.</p>`,
      spellcastingTrait: "instinct",
      suggestedTraits: { agility: 1, strength: -1, finesse: 1, instinct: 2, presence: 0, knowledge: 0 },
      foundation: [(() => {
        // Não há bônus só para Rolagens de Interface no sistema (bonuses.roll vale para todas),
        // então o efeito só marca o estado; o bônus de Tier continua manual.
        const diving = targetEffect({
          name: "Deep Dive", img: CPR("status/netrunning"), duration: "scene",
          description: "<p>Interage com sistemas conectados na cena independente da distância; +Tier em Rolagens de Interface de Hacking ou cartas de Network. Termina ao sofrer dano Maior, se desconectar ou no fim da cena.</p>"
        });
        return {
          name: "Deep Dive", img: CPR("cyberware/virtuality"), form: "action",
          description: "<p>Uma vez por cena, quando você cria uma Breach em uma rede, você pode entrar em um Deep Dive. Enquanto em Deep Dive: você pode interagir com sistemas conectados na cena independente da distância; ganha um bônus igual ao seu Tier em Rolagens de Interface envolvendo Hacking ou cartas de Network; você pode fazer ao mestre uma pergunta sobre a rede, sua segurança, sistemas conectados ou rotas ocultas. O Deep Dive termina quando você sofre dano Maior, se desconecta, ou a cena termina.</p>",
          effects: [diving],
          actions: featureAction({ name: "Deep Dive", img: CPR("cyberware/virtuality"), uses: { max: 1, recovery: "scene" }, effects: [diving], target: { type: "self", amount: null } })
        };
      })()],
      specialization: [{
        name: "Virtual Overwatch", img: CPR("blackice/src/raven"), form: "reaction",
        description: "<p>Quando um adversário te ataca ou ataca um aliado dentro do alcance Muito Próximo enquanto você está em Deep Dive, você pode dar desvantagem à rolagem dele. Se o adversário falhar na rolagem, ele também deve marcar 1 Estresse. Se ele tiver sucesso, você deve marcar 1 Estresse.</p>"
      }],
      mastery: [{
        name: "Blackout Cascade", img: CPR("blackice/src/kraken"), form: "action",
        description: "<p>Uma vez por descanso longo, enquanto em Deep Dive, você pode disparar uma disrupção massiva na rede. Escolha até três sistemas conectados, dispositivos ou alvos ligados a cyberware na cena. Para cada um, escolha uma opção: Desativá-lo até o mestre gastar 1 Medo; Alimentá-lo com informações falsas, dando desvantagem em sua próxima rolagem; Sobrecarregá-lo, fazendo seu operador marcar 1 Estresse; Abrir, trancar, travar, redirecionar, controlar ou acioná-lo de um jeito que mude significativamente a cena. Depois, marque 1 Estresse ou se torne temporariamente Vulnerável.</p>",
        actions: featureAction({ name: "Blackout Cascade", img: CPR("blackice/src/kraken"), uses: { max: 1, recovery: "longRest" } })
      }]
    }
  ]
};

// O PDF não traz build sugerida; atributos e equipamento seguem o padrão do Daggerheart
// (+2, +1, +1, 0, 0, −1) com o atributo de Interface da subclasse em +2.
const WARDEN = {
  key: "warden",
  classItems: [
    { name: "Equipamento Defensivo Marcado", img: CPR("armor/bullet_proof_shield"), description: "<p>Um equipamento defensivo marcado por impactos antigos. Cada amassado conta uma história de alguém que não se feriu porque você estava na frente.</p>" },
    { name: "Ficha de Contrato", img: CPR("chip-skill.png"), description: "<p>Uma ficha de contrato de alguém que você jurou proteger. O contrato pode ter acabado; a promessa, não.</p>" }
  ],
  guide: {
    traits: { agility: 0, strength: 2, finesse: -1, instinct: 1, presence: 1, knowledge: 0 },
    primaryWeapon: "Breach Hammer", secondaryWeapon: null, armor: "Riot Shell"
  },
  class: {
    name: "Warden",
    img: CPR("classes/warden/class-icon.png"),
    description: `<p><strong>Aegis, proteção, armadura, interceptação</strong><br>"Se eles querem a Crew, vão ter que passar por mim."</p>
<p><em>Jogue de Warden se você quiser…</em> Proteger aliados, absorver dano, controlar o espaço, usar armadura pesada, interceptar ataques, sobreviver a pressões impossíveis e se tornar a coisa mais difícil de mover no campo de batalha.</p>
<p>Wardens são guarda-costas, quebradores de motim e protetores profissionais que sobrevivem se tornando o problema mais difícil da sala enquanto ficam entre a Crew e o que quer que a queira morta.</p>
<p><strong>Itens de Classe:</strong> Um equipamento defensivo marcado por impactos antigos ou uma ficha de contrato de alguém que você jurou proteger.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["aegis"],
    hitPoints: 7,
    evasion: 9,
    backgroundQuestions: [
      "Quem te ensinou a se colocar entre o perigo e outra pessoa?",
      "Quem você não conseguiu proteger?",
      "Que parte da sua armadura, escudo ou equipamento defensivo mais salvou a sua vida?"
    ],
    connections: [
      "Qual personagem você já carregou pessoalmente para fora do perigo?",
      "Qual personagem já te protegeu quando você não conseguia se proteger?",
      "Quem sabe o nome de alguém que você não conseguiu salvar?"
    ],
    hopeFeature: {
      name: "Not Today", img: CPR("upgrades/krash_barrier"), form: "reaction",
      description: "<p>Gaste 3 Esperança quando um aliado dentro do alcance Próximo fosse marcar um ou mais Pontos de Vida. Mova-se para dentro do alcance Muito Próximo desse aliado e reduza a gravidade do dano em um limiar. Se isso evitar que ele marque qualquer Ponto de Vida, você também pode limpar 1 Estresse ou forçar o atacante a marcar 1 Estresse.</p>",
      actions: featureAction({ name: "Not Today", img: CPR("upgrades/krash_barrier"), actionType: "reaction", costs: [{ key: "hope", value: 3 }] })
    },
    classFeatures: [(() => {
      // "Até o seu próximo Holofote" não existe como duração no sistema: o efeito fica
      // "temporário" e é removido à mão (ou ao escolher outro Guarded Asset).
      const guarded = targetEffect({
        name: "Guarded Asset", img: CPR("status/human_shield"),
        description: "<p>Protegido pelo Guardian Protocol de um Warden: o primeiro ataque contra este alvo antes do próximo Holofote do Warden tem desvantagem. Se esse ataque errar, o Warden pode se mover dentro do alcance Muito Próximo do atacante ou do alvo, e o atacante marca 1 Estresse.</p>"
      });
      return {
        name: "Guardian Protocol", img: CPR("upgrades/security_upgrade"), form: "action",
        description: "<p>No fim do seu Holofote, escolha um aliado, veículo ou objetivo dentro do alcance Próximo como o seu <strong>Guarded Asset</strong> até o seu próximo Holofote.</p><p>O primeiro ataque feito contra o seu Guarded Asset antes do seu próximo Holofote tem desvantagem.</p><p>Se esse ataque errar, você pode se mover imediatamente dentro do alcance Muito Próximo do atacante ou do seu Guarded Asset, e o atacante marca 1 Estresse.</p>",
        effects: [guarded],
        actions: featureAction({ name: "Guardian Protocol", img: CPR("upgrades/security_upgrade"), effects: [guarded], target: { type: "friendly", amount: 1 } })
      };
    })()]
  },
  subclasses: [
    {
      name: "Bulwark", img: CPR("classes/warden/subclasses/bulwark.png"),
      description: `<p><em>Jogue de Bulwark se você quiser se tornar armadura pesada, escudo anti-motim e a pessoa em quem os inimigos se arrependem de bater.</em></p>
<p><strong>Build Sugerida:</strong> Força +2, Instinto +1, Presença +1, Agilidade 0, Conhecimento 0, Acuidade −1. Equipamento recomendado: Breach Hammer (primária, duas mãos) + Riot Shell — a armadura mais pesada do Tier 1, para aproveitar o Impact Frame.</p>`,
      spellcastingTrait: "strength",
      suggestedTraits: { agility: 0, strength: 2, finesse: -1, instinct: 1, presence: 1, knowledge: 0 },
      foundation: [{
        name: "Impact Frame", img: CPR("armor/flak_body"), form: "passive",
        description: "<p>Ganhe +1 na Pontuação de Armadura.</p><p>Quando você marca um Espaço de Armadura para reduzir o dano recebido, pode forçar o atacante a marcar 1 Estresse ou empurrá-lo até o alcance Próximo, à escolha do atacante.</p>",
        effects: [{
          name: "Impact Frame", img: CPR("armor/flak_body"), transfer: true, type: "base",
          description: "<p>+1 na Pontuação de Armadura.</p>",
          system: { changes: [{ type: "armor", phase: "initial", priority: 20, value: { max: "1", current: 0, damageThresholds: null, interaction: "none" } }], duration: { description: "" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
          duration: { value: null, units: "seconds", expiry: null, expired: false },
          tint: "#ffffff", statuses: [], disabled: false
        }]
      }],
      specialization: [{
        name: "Hard to Break", img: CPR("armor/metalgear_head"), form: "reaction",
        description: "<p>Uma vez por descanso, quando você fosse marcar um ou mais Pontos de Vida, pode marcar 1 Estresse para reduzir a gravidade em um limiar.</p>",
        actions: featureAction({ name: "Hard to Break", img: CPR("armor/metalgear_head"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], uses: { max: 1, recovery: "shortRest" } })
      }],
      mastery: [(() => {
        const frame = targetEffect({
          name: "Unbreakable Frame", img: CPR("armor/medium-armorjack_body"), duration: "scene",
          description: "<p>Equipamento defensivo completo ativo até a cena terminar ou você marcar o último Espaço de Armadura. Ao marcar um Espaço de Armadura, escolha: limpar 1 Estresse; forçar o atacante a marcar 1 Estresse; ou um aliado dentro do alcance Muito Próximo ganha +1 de Evasão até o seu próximo Holofote.</p>"
        });
        return {
          name: "Unbreakable Frame", img: frame.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você marca um Espaço de Armadura, pode ativar o seu equipamento defensivo completo até a cena terminar ou você marcar o seu último Espaço de Armadura. Enquanto esta feature estiver ativa, quando marcar um Espaço de Armadura, escolha uma:</p><ul><li>Limpe 1 Estresse.</li><li>Force o atacante a marcar 1 Estresse.</li><li>Um aliado dentro do alcance Muito Próximo ganha +1 de Evasão até o seu próximo Holofote.</li></ul>",
          effects: [frame],
          actions: featureAction({ name: "Unbreakable Frame", img: frame.img, uses: { max: 1, recovery: "longRest" }, effects: [frame], target: { type: "self", amount: null } })
        };
      })()]
    },
    {
      name: "Riotbreaker", img: CPR("classes/warden/subclasses/riotbreaker.png"),
      description: `<p><em>Jogue de Riotbreaker se você quiser quebrar investidas, controlar o espaço, empurrar inimigos e transformar defesa em força.</em></p>
<p><strong>Build Sugerida:</strong> Presença +2, Força +1, Instinto +1, Agilidade 0, Conhecimento 0, Acuidade −1. Equipamento recomendado: Shock Baton (primária, uma mão) + Riot Buckler (secundária) + Riot Shell — controle de perto com uma mão livre para o escudo.</p>`,
      spellcastingTrait: "presence",
      suggestedTraits: { agility: 0, strength: 1, finesse: -1, instinct: 1, presence: 2, knowledge: 0 },
      foundation: [{
        name: "Crowd Control", img: CPR("upgrades/deployable_spike_strip"), form: "passive",
        description: "<p>Quando você acerta um ataque com arma ou uma carta de Aegis, escolha um adversário dentro do alcance Próximo. Até o seu próximo Holofote, esse adversário não pode se aproximar voluntariamente de um aliado, objetivo ou posição que você escolher, a menos que primeiro marque 1 Estresse.</p><p>Se o alvo já estiver dentro do alcance Muito Próximo do aliado, objetivo ou posição protegida, ele precisa se afastar imediatamente até o alcance Próximo ou marcar 1 Estresse.</p>"
      }],
      specialization: [(() => {
        const restrained = targetEffect({ name: "Hard Stop", img: CPR("status/iron_grip"), statuses: ["restrained"],
          description: "<p>Parou de se mover e está temporariamente Imobilizado.</p>" });
        return {
          name: "Hard Stop", img: restrained.img, form: "reaction",
          description: "<p>Uma vez por descanso, quando um adversário dentro do alcance Próximo se move em direção a você ou a um aliado, force-o a fazer uma Rolagem de Reação (15).</p><p>Em uma falha, ele para de se mover e fica temporariamente <em>Imobilizado</em>.</p><p>Em um sucesso, ele marca 1 Estresse.</p>",
          effects: [restrained],
          actions: featureAction({ name: "Hard Stop", img: restrained.img, actionType: "reaction", uses: { max: 1, recovery: "shortRest" }, effects: [restrained] })
        };
      })()],
      mastery: [(() => {
        const vulnerable = targetEffect({ name: "Break the Line", img: CPR("status/prone"), statuses: ["vulnerable"],
          description: "<p>Empurrado até o alcance Próximo e temporariamente Vulnerável.</p>" });
        return {
          name: "Break the Line", img: vulnerable.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você entra no centro de uma luta perigosa, escolha qualquer número de adversários dentro do alcance Próximo. Cada adversário escolhido faz uma Rolagem de Reação (16).</p><p>Em uma falha, ele é empurrado até o alcance Próximo e fica temporariamente <em>Vulnerável</em>.</p><p>Em um sucesso, marca 1 Estresse.</p>",
          effects: [vulnerable],
          actions: featureAction({ name: "Break the Line", img: vulnerable.img, uses: { max: 1, recovery: "longRest" }, effects: [vulnerable], target: { type: "hostile", amount: null } })
        };
      })()]
    }
  ]
};

// Kill Chain Die: o tamanho atual fica em system.resource.dieFaces (recurso "die" do sistema,
// que mostra o dado na ficha). As três ações abaixo são tratadas pelo módulo no hook
// daggerheart.preUseAction (edgeheart-character.js), procuradas pelo nome.
const KILL_CHAIN_ACTIONS = { roll: "Rolar Kill Chain Die", step: "Aumentar Kill Chain Die", reset: "Resetar Kill Chain Die" };

const SOLO = {
  key: "solo",
  classItems: [
    { name: "Arma Personalizada com Nome", img: CPR("weapons/CombatKnife_excellent"), description: "<p>Uma arma personalizada que tem nome. Descreva o nome, a história dela e o que você já fez com ela.</p>" },
    { name: "Plaqueta Danificada", img: CPR("gear/tracer_button"), description: "<p>Uma plaqueta de identificação danificada da luta que fez a sua reputação. De quem era o nome gravado nela?</p>" }
  ],
  guide: {
    traits: { agility: 1, strength: 0, finesse: 2, instinct: 1, presence: 0, knowledge: -1 },
    primaryWeapon: "Smartbow", secondaryWeapon: null, armor: "Synthleather Jacket"
  },
  class: {
    name: "Solo",
    img: CPR("classes/solo/class-icon.png"),
    description: `<p><strong>Assault, armas, violência, domínio em combate</strong><br>"Quando o tiroteio começa, eu viro o plano."</p>
<p><em>Jogue de Solo se você quiser…</em> Vencer lutas com maestria em armas, agressividade tática, fogo de supressão, ataque pesado e pressão implacável.</p>
<p>Solos são combatentes profissionais, armas de aluguel, especialistas em assalto e matadores de campo de batalha que sobrevivem acabando com as ameaças antes que virem problemas. São os mercenários chamados quando o trabalho fica barulhento.</p>
<p><strong>Itens de Classe:</strong> Uma arma personalizada com nome ou uma plaqueta de identificação danificada da luta que fez a sua reputação.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["assault"],
    hitPoints: 6,
    evasion: 11,
    backgroundQuestions: [
      "Em que arma você confia mais do que na maioria das pessoas?",
      "Que batalha, contrato ou massacre tornou o seu nome conhecido?",
      "Que tipo de luta ainda te assusta?"
    ],
    connections: [
      "Quem te puxou de volta quando você estava indo longe demais?",
      "Em quem você confia para ficar do seu lado quando o trabalho fica barulhento?",
      "Qual personagem te salvou depois de uma luta a que você não deveria ter sobrevivido?"
    ],
    hopeFeature: (() => {
      const vulnerable = targetEffect({ name: "Fire Superiority", img: CPR("upgrades/onboard_machine_gun"), statuses: ["vulnerable"],
        description: "<p>Marcou 1 Estresse e ficou temporariamente Vulnerável pela Fire Superiority.</p>" });
      return {
        name: "Fire Superiority", img: vulnerable.img, form: "action",
        description: "<p>Gaste 3 Esperança depois de acertar um ataque com arma. Escolha uma:</p><ul><li>Some +2d6 à rolagem de dano.</li><li>Escolha outro alvo dentro do alcance contra quem a sua rolagem de ataque também teria sucesso.</li><li>O alvo marca 1 Estresse e fica temporariamente <em>Vulnerável</em>.</li></ul>",
        effects: [vulnerable],
        actions: featureAction({ name: "Fire Superiority", img: vulnerable.img, costs: [{ key: "hope", value: 3 }], effects: [vulnerable] })
      };
    })(),
    classFeatures: [{
      name: "Kill Chain", img: CPR("upgrades/generic_extended_magazine"), form: "action",
      description: "<p>No início de cada cena, o seu <strong>Kill Chain Die</strong> é um d4. Quando você acerta um ataque com arma ou carta de Assault que causa dano, role o Kill Chain Die e some o resultado à rolagem de dano.</p><p>Se o ataque causar dano Maior ou Severo, aumente o Kill Chain Die em um passo, de d4 até d20.</p><p>Se você falhar numa rolagem de ataque, fizer um descanso ou a cena terminar, o Kill Chain Die volta a ser d4.</p><p><em>Na ficha: o dado ao lado desta feature mostra o tamanho atual e o último resultado. Use as ações para rolar, aumentar ou resetar; no fim da cena ele volta a d4 sozinho.</em></p>",
      resource: { type: "die", value: 0, max: null, icon: "", recovery: null, progression: "increasing", dieFaces: "d4", diceStates: {} },
      flags: { [MODULE_ID]: { killChain: true } },
      actions: {
        ...featureAction({ name: KILL_CHAIN_ACTIONS.roll, img: CPR("default/Default_Dice"), target: { type: "self", amount: null } }),
        ...featureAction({ name: KILL_CHAIN_ACTIONS.step, img: CPR("upgrades/generic_extended_magazine"), target: { type: "self", amount: null } }),
        ...featureAction({ name: KILL_CHAIN_ACTIONS.reset, img: CPR("status/readied_action"), target: { type: "self", amount: null } })
      }
    }]
  },
  subclasses: [
    {
      name: "Deadeye", img: CPR("classes/solo/subclasses/deadeye.png"),
      description: `<p><em>Jogue de Deadeye se você quiser eliminar alvos prioritários, aproveitar aberturas e fazer cada tiro valer.</em></p>
<p><strong>Build Sugerida:</strong> Acuidade +2, Agilidade +1, Instinto +1, Força 0, Presença 0, Conhecimento −1. Equipamento recomendado: Smartbow (primária, duas mãos) + Synthleather Jacket — ataques de longe, ficando parado para aproveitar o Draw do arco.</p>`,
      spellcastingTrait: "finesse",
      suggestedTraits: { agility: 1, strength: 0, finesse: 2, instinct: 1, presence: 0, knowledge: -1 },
      foundation: [(() => {
        const marked = targetEffect({ name: "Marked Target", img: CPR("upgrades/sniping_scope"),
          description: "<p>Alvo prioritário do Deadeye até a cena terminar ou outro alvo ser marcado. Ao rolar o Kill Chain Die contra ele, o Deadeye pode rolar de novo e usar qualquer resultado.</p>" });
        return {
          name: "Marked Target", img: marked.img, form: "action",
          description: "<p>Uma vez por descanso, quando você causa dano a um alvo, pode marcá-lo como seu alvo prioritário até a cena terminar ou você marcar outro alvo desse jeito.</p><p>Quando rolar o Kill Chain Die contra o alvo marcado, pode rolar o dado de novo e usar qualquer um dos resultados.</p>",
          effects: [marked],
          actions: featureAction({ name: "Marked Target", img: marked.img, uses: { max: 1, recovery: "shortRest" }, effects: [marked] })
        };
      })()],
      specialization: [{
        name: "Called Shot", img: CPR("weapons/SniperRifle"), form: "action",
        description: "<p>Quando você faz um ataque com arma contra o alvo marcado, pode marcar 1 Estresse antes da rolagem para ganhar +2 na rolagem de ataque.</p><p>Se o ataque acertar e causar qualquer dano, aumente o Kill Chain Die em um passo, mesmo que o ataque não tenha causado dano Maior ou Severo.</p>",
        actions: featureAction({ name: "Called Shot", img: CPR("weapons/SniperRifle"), costs: [{ key: "stress", value: 1 }] })
      }],
      mastery: [{
        name: "Kill Confirmed", img: CPR("critical_injuries/head_critical_injury"), form: "action",
        description: "<p>Uma vez por descanso longo, quando você causa dano Severo ao alvo marcado, ele marca um Ponto de Vida adicional.</p><p>Se isso o derrotar, você pode marcar imediatamente um novo alvo e ajustar o Kill Chain Die para d10.</p>",
        actions: featureAction({ name: "Kill Confirmed", img: CPR("critical_injuries/head_critical_injury"), uses: { max: 1, recovery: "longRest" } })
      }]
    },
    {
      name: "Shock Trooper", img: CPR("classes/solo/subclasses/shock-trooper.png"),
      description: `<p><em>Jogue de Shock Trooper se você quiser invadir posições fortificadas, lutar de perto, romper linhas inimigas e continuar avançando pelo perigo.</em></p>
<p><strong>Build Sugerida:</strong> Força +2, Agilidade +1, Instinto +1, Acuidade 0, Presença 0, Conhecimento −1. Equipamento recomendado: Street Shotgun (primária, duas mãos) + Ballistic Vest — combate de perto, entrando no alcance Muito Próximo para o Hard Entry.</p>`,
      spellcastingTrait: "strength",
      suggestedTraits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
      foundation: [
        {
          name: "Breach Momentum", img: CPR("drugs/boost"), form: "passive",
          description: "<p>Quando o seu Kill Chain Die aumenta, ganhe +1 de Evasão até a sua próxima ação.</p>"
        },
        {
          name: "Hard Entry", img: CPR("weapons/Shotgun_excellent"), form: "action",
          description: "<p>Quando você ataca logo depois de se mover para o alcance Corpo a Corpo ou Muito Próximo do alvo, pode marcar 1 Estresse para somar o Kill Chain Die à rolagem de dano mais uma vez.</p>",
          actions: featureAction({ name: "Hard Entry", img: CPR("weapons/Shotgun_excellent"), costs: [{ key: "stress", value: 1 }] })
        }
      ],
      specialization: [(() => {
        const vulnerable = targetEffect({ name: "Clear the Line", img: CPR("ammo/grenade_flashbang"), statuses: ["vulnerable"],
          description: "<p>Temporariamente Vulnerável pelo Clear the Line.</p>" });
        return {
          name: "Clear the Line", img: vulnerable.img, form: "action",
          description: "<p>Uma vez por descanso, quando você causa dano Maior ou Severo a um adversário dentro do alcance Corpo a Corpo ou Muito Próximo, pode forçar ele e cada adversário dentro do alcance Muito Próximo dele a marcar 1 Estresse.</p><p>Depois, escolha um adversário afetado e deixe-o temporariamente <em>Vulnerável</em>.</p>",
          effects: [vulnerable],
          actions: featureAction({ name: "Clear the Line", img: vulnerable.img, uses: { max: 1, recovery: "shortRest" }, effects: [vulnerable] })
        };
      })()],
      mastery: [(() => {
        const noWayBack = targetEffect({ name: "No Way Back", img: CPR("status/on_fire_strong"), duration: "scene",
          description: "<p>Kill Chain Die em d10; até a cena terminar ou você sofrer dano Severo, ele não volta ao início quando você falha num ataque. Você não pode se afastar voluntariamente de todos os adversários, a menos que um aliado esteja em perigo imediato.</p>" });
        return {
          name: "No Way Back", img: noWayBack.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você entra numa luta perigosa, ajuste o Kill Chain Die para d10.</p><p>Até a cena terminar ou você sofrer dano Severo, o Kill Chain Die não volta ao início quando você falha numa rolagem de ataque.</p><p>Enquanto esta feature estiver ativa, você não pode se afastar voluntariamente de todos os adversários, a menos que um aliado esteja em perigo imediato.</p>",
          effects: [noWayBack],
          actions: featureAction({ name: "No Way Back", img: noWayBack.img, uses: { max: 1, recovery: "longRest" }, effects: [noWayBack], target: { type: "self", amount: null } })
        };
      })()]
    }
  ]
};

// Cover (Infiltrator): recurso "simple" da feature Cover Work (0 a 3; progressão "increasing" faz o
// refresh de cena do sistema zerar o valor). Ações que ganham ou gastam Cover ficam listadas no flag
// coverActions do item ({ nomeDaAção: variação }); o módulo confere o saldo no preUseAction e
// aplica a variação no postUseAction (edgeheart-character.js).
// Features que pedem "role um dado e some" usam featureAction({ dice }): o sistema rola dentro do card
// da ação. Quando o dado depende do personagem, o flag rollFormula ({ nomeDaAção: fórmula }, ex:
// "(@tier)d6") troca a fórmula na hora (Takedown e Integrated Chrome são tratados pelo nome).
const COVER_ACTIONS = { gain: "Ganhar Cover", setup: "Setup", takedown: "Takedown" };

function hiddenSelf(name, img, description) {
  return targetEffect({ name, img, statuses: ["hidden"], description });
}

const INFILTRATOR = {
  key: "infiltrator",
  classItems: [
    { name: "Credenciais Falsas", img: CPR("dlc/cyberware/poser_chip"), description: "<p>Um conjunto de credenciais falsas: crachá, identidade digital e histórico forjado. De quem é o rosto na foto, e quanto tempo até alguém conferir?</p>" },
    { name: "Arma com Silenciador", img: CPR("weapons/mediumPistol"), description: "<p>Uma arma com silenciador de um trabalho que oficialmente nunca aconteceu. O número de série foi raspado; a memória, não.</p>" }
  ],
  guide: {
    traits: { agility: 1, strength: -1, finesse: 2, instinct: 1, presence: 0, knowledge: 0 },
    primaryWeapon: "Mono-Katana", secondaryWeapon: "Combat Knife", armor: "Synthleather Jacket"
  },
  class: {
    name: "Infiltrator",
    img: CPR("classes/infiltrator/class-icon.png"),
    description: `<p><strong>Ghost, furtividade, assassinato, sabotagem</strong><br>"A melhor entrada é aquela de que ninguém se lembra."</p>
<p><em>Jogue de Infiltrator se você quiser…</em> Mover-se sem ser visto, passar pela segurança, desaparecer do perigo, sabotar operações e não deixar rastro.</p>
<p>Outros mercenários sabem se esconder, se esgueirar ou passar pela segurança. Os Infiltrators transformam esses momentos numa profissão. Eles sentem o segundo exato em que um alvo fica vulnerável.</p>
<p><strong>Itens de Classe:</strong> Um conjunto de credenciais falsas ou uma arma com silenciador de um trabalho que oficialmente nunca aconteceu.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["ghost"],
    hitPoints: 5,
    evasion: 12,
    backgroundQuestions: [
      "Qual foi o primeiro lugar que você invadiu e que deveria ter sido impossível?",
      "Você virou Infiltrator por treinamento, coerção, desespero ou traição?",
      "Qual alvo você não conseguiu eliminar, e quanto isso te custou?"
    ],
    connections: [
      "Qual personagem conhece uma das suas identidades falsas?",
      "Em quem você confia para cobrir a sua saída?",
      "Que segredo você descobriu sobre outro personagem e escolheu não usar?"
    ],
    hopeFeature: (() => {
      const hidden = hiddenSelf("Clean Exit", CPR("programs/see_ya"), "<p>Escondido pelo Clean Exit.</p>");
      return {
        name: "Clean Exit", img: hidden.img, form: "reaction",
        description: "<p>Gaste 3 Esperança quando você fosse ser descoberto, disparar um alarme ou ser alvo de um ataque. Você fica imediatamente <em>Escondido</em> e se move para um ponto dentro do alcance Próximo.</p><ul><li>Se isso foi disparado por um ataque, o ataque tem desvantagem.</li><li>Se foi disparado por uma descoberta ou alarme, ele é adiado até o seu próximo Holofote.</li></ul>",
        effects: [hidden],
        actions: featureAction({ name: "Clean Exit", img: hidden.img, actionType: "reaction", costs: [{ key: "hope", value: 3 }], effects: [hidden], target: { type: "self", amount: null } })
      };
    })(),
    classFeatures: [{
      name: "Cover Work", img: CPR("gear/agent"), form: "action",
      description: "<p>Você tem um recurso chamado <strong>Cover</strong>. Quando você rola com Esperança usando uma carta de Ghost, furtividade, disfarce, despiste ou uma rota preparada, ganhe 1 Cover. Você pode guardar até 3 Cover.</p><p>Gaste 1 Cover para fazer uma das opções:</p><ul><li><strong>Setup:</strong> ganhe +2 numa rolagem para se esconder, infiltrar, sabotar, se passar por alguém ou burlar a segurança.</li><li><strong>Takedown:</strong> some 1d6 à rolagem de dano quando causar dano a um alvo de quem você está <em>Escondido</em>, que não sabe da sua presença ou que está <em>Vulnerável</em>.</li></ul><p>Você perde todo o Cover não gasto quando a cena termina.</p><p><em>Na ficha: o contador desta feature mostra o seu Cover. Use \"Ganhar Cover\" depois de uma rolagem com Esperança que se encaixe; Setup e Takedown gastam 1 Cover (o Takedown já rola o dado). No fim da cena o Cover zera sozinho.</em></p>",
      resource: { type: "simple", value: 0, max: "3", icon: CPR("gear/agent"), recovery: "scene", progression: "increasing" },
      flags: { [MODULE_ID]: { cover: true, coverActions: { [COVER_ACTIONS.gain]: 1, [COVER_ACTIONS.setup]: -1, [COVER_ACTIONS.takedown]: -1 } } },
      actions: {
        ...featureAction({ name: COVER_ACTIONS.gain, img: CPR("gear/agent"), target: { type: "self", amount: null } }),
        ...featureAction({ name: COVER_ACTIONS.setup, img: CPR("gear/lock_picking_set"), target: { type: "self", amount: null } }),
        ...featureAction({ name: COVER_ACTIONS.takedown, dice: "1d6", img: CPR("weapons/CombatKnife"), target: { type: "self", amount: null } })
      }
    }]
  },
  subclasses: [
    {
      name: "Silent Killer", img: CPR("classes/infiltrator/subclasses/silent-killer.png"),
      description: `<p><em>Jogue de Silent Killer se você quiser eliminar alvos com precisão e terminar lutas antes que elas comecem.</em></p>
<p><strong>Build Sugerida:</strong> Acuidade +2, Agilidade +1, Instinto +1, Presença 0, Conhecimento 0, Força −1. Equipamento recomendado: Mono-Katana (primária, uma mão) + Combat Knife (secundária) + Synthleather Jacket — ataques de perto, saindo do Escondido.</p>`,
      spellcastingTrait: "finesse",
      suggestedTraits: { agility: 1, strength: -1, finesse: 2, instinct: 1, presence: 0, knowledge: 0 },
      foundation: [
        {
          name: "Opening Strike", img: CPR("weapons/CombatKnife_excellent"), form: "action",
          description: "<p>Uma vez por Holofote, quando você causa dano a um alvo enquanto está <em>Escondido</em> dele ou enquanto ele está <em>Vulnerável</em>, some à rolagem de dano uma quantidade de d6 igual ao seu Tier.</p><p><em>Na ficha: a ação rola os d6 do seu Tier para somar ao dano.</em></p>",
          flags: { [MODULE_ID]: { rollFormula: { "Opening Strike": "(@tier)d6" } } },
          actions: featureAction({ name: "Opening Strike", dice: "1d6", img: CPR("weapons/CombatKnife_excellent"), target: { type: "self", amount: null } })
        },
        (() => {
          const hidden = hiddenSelf("No Witnesses", CPR("status/unconcious"), "<p>Escondido de novo pelo No Witnesses.</p>");
          return {
            name: "No Witnesses", img: hidden.img, form: "action",
            description: "<p>Quando você derrota ou incapacita um alvo com um ataque feito enquanto estava Escondido, pode ficar Escondido de novo imediatamente e se mover para um ponto dentro do alcance Muito Próximo.</p>",
            effects: [hidden],
            actions: featureAction({ name: "No Witnesses", img: hidden.img, effects: [hidden], target: { type: "self", amount: null } })
          };
        })()
      ],
      specialization: [{
        name: "Kill Window", img: CPR("status/wounded_mortally"), form: "passive",
        description: "<p>Quando você gasta Cover em <strong>Takedown</strong>, rola um d8 em vez de um d6. Além disso, se o alvo estiver Vulnerável, ele também marca 1 Estresse.</p>",
        flags: { [MODULE_ID]: { takedownDie: "d8" } }
      }],
      mastery: [(() => {
        const vulnerable = targetEffect({ name: "Perfect Ambush", img: CPR("critical_injuries/crushed_windpipe"), statuses: ["vulnerable"],
          description: "<p>Sobreviveu a um Perfect Ambush e ficou permanentemente Vulnerável.</p>" });
        return {
          name: "Perfect Ambush", img: vulnerable.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você acerta um ataque contra um alvo de quem está <em>Escondido</em>, não role os dados de dano da arma. Em vez disso, use o maior valor possível desses dados.</p><p>Se o alvo sobreviver ao ataque, ele fica permanentemente <em>Vulnerável</em>.</p>",
          effects: [vulnerable],
          actions: featureAction({ name: "Perfect Ambush", img: vulnerable.img, uses: { max: 1, recovery: "longRest" }, effects: [vulnerable] })
        };
      })()]
    },
    {
      name: "Phantom", img: CPR("classes/infiltrator/subclasses/phantom.png"),
      description: `<p><em>Jogue de Phantom se você quiser passar por espaços vigiados, se reposicionar por pontos cegos, tirar aliados do perigo e desaparecer antes que o inimigo consiga te prender.</em></p>
<p><em>(A lista de subclasses do PDF chama esta de "Deep Cover", mas a seção dela se chama Phantom.)</em></p>
<p><strong>Build Sugerida:</strong> Agilidade +2, Acuidade +1, Instinto +1, Presença 0, Conhecimento 0, Força −1. Equipamento recomendado: Compact SMG (primária, uma mão) + Combat Knife (secundária) + Synthleather Jacket — mobilidade e Evasão alta.</p>`,
      spellcastingTrait: "agility",
      suggestedTraits: { agility: 2, strength: -1, finesse: 1, instinct: 1, presence: 0, knowledge: 0 },
      foundation: [
        {
          name: "Ghost Route", img: CPR("gear/grapple_gun"), form: "passive",
          description: "<p>Quando você se move enquanto está <em>Escondido</em>, pode se mover dentro do alcance Distante em vez do Próximo.</p><p>Se você começar esse movimento dentro do alcance Muito Próximo de um aliado, pode levá-lo junto. Esse aliado não fica Escondido, a menos que já estivesse.</p>"
        },
        {
          name: "Now You See Me", img: CPR("programs/eraser"), form: "reaction",
          description: "<p>Uma vez por cena, quando um ataque contra você erra ou tem desvantagem, você pode ganhar 1 Cover.</p>",
          flags: { [MODULE_ID]: { coverActions: { "Now You See Me": 1 } } },
          actions: featureAction({ name: "Now You See Me", img: CPR("programs/eraser"), actionType: "reaction", uses: { max: 1, recovery: "scene" }, target: { type: "self", amount: null } })
        }
      ],
      specialization: [{
        name: "Extraction Window", img: CPR("dlc/gear/the-transporter"), form: "reaction",
        description: "<p>Quando um aliado dentro do alcance Próximo fosse ser alvo de um ataque, descoberto ou pego por um perigo, você pode gastar 1 Cover para fazer esse aliado se mover imediatamente para um ponto dentro do alcance Próximo.</p><p>O ataque que disparou isso tem desvantagem contra ele, ou o aliado tem vantagem na rolagem para evitar o perigo.</p>",
        flags: { [MODULE_ID]: { coverActions: { "Extraction Window": -1 } } },
        actions: featureAction({ name: "Extraction Window", img: CPR("dlc/gear/the-transporter"), actionType: "reaction", target: { type: "friendly", amount: 1 } })
      }],
      mastery: [(() => {
        const hidden = hiddenSelf("Impossible Exit", CPR("programs/speedy_gonzalvez"), "<p>Escondido depois do Impossible Exit.</p>");
        return {
          name: "Impossible Exit", img: hidden.img, form: "action",
          description: "<p>Uma vez por descanso, você pode gastar 3 Cover para revelar uma rota de fuga que preparou ou percebeu. Você e qualquer aliado dentro do alcance Próximo podem se mover imediatamente dentro do alcance Distante, ignorando terreno difícil, alarmes simples e zonas controladas por inimigos durante esse movimento.</p><p>Depois desse movimento, você fica <em>Escondido</em>. Todo aliado que terminar o movimento em cobertura, escuridão, fumaça, multidão ou outro esconderijo plausível também fica Escondido.</p>",
          effects: [hidden],
          flags: { [MODULE_ID]: { coverActions: { "Impossible Exit": -3 } } },
          actions: featureAction({ name: "Impossible Exit", img: hidden.img, uses: { max: 1, recovery: "shortRest" }, effects: [hidden], target: { type: "self", amount: null } })
        };
      })()]
    }
  ]
};

// Escolhas de feature (flag pick): a ação com o nome pick.action abre uma escolha entre pick.options
// (tratada em edgeheart-character.js); o valor fica no flag "picked" e aparece no selo da ficha.
// Integrated Chrome: o Atributo Calibrado é a escolha da feature; a ação "Integrated Chrome" marca 1
// Estresse e rola o d6 (d8 com Reinforced Build e Força calibrada). O flag integratedChrome também faz
// a Rolagem de Humanidade tratar a Carga Cibernética como 1 menor.
const CHROME_ACTIONS = { calibrate: "Calibrar Atributo", use: "Integrated Chrome" };

const AUGMENTED = {
  key: "augmented",
  classItems: [
    { name: "Kit de Manutenção de Implante", img: CPR("dlc/gear/master_mechanics_tool_kit"), description: "<p>Um kit de manutenção para o seu implante mais importante: chaves de precisão, gel condutor, peças de reposição e um manual cheio de anotações suas.</p>" },
    { name: "Peça Original do Corpo", img: CPR("cyberware/meatarm"), description: "<p>A peça original do seu corpo que foi substituída por cromo. Por que você ainda a guarda?</p>" }
  ],
  guide: {
    traits: { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: 0, knowledge: -1 },
    primaryWeapon: "Compact SMG", secondaryWeapon: "Combat Knife", armor: "Synthleather Jacket"
  },
  class: {
    name: "Augmented",
    img: CPR("classes/augmented/class-icon.png"),
    description: `<p><strong>Chrome, cyberware, movimento, otimização do corpo</strong><br>"A carne era o protótipo."</p>
<p><em>Jogue de Augmented se você quiser…</em> Levar seu corpo além dos limites naturais com membros reforçados, implantes de mobilidade, sentidos aprimorados e precisão construída em cromo.</p>
<p>Augmenteds são mercenários que transformaram o próprio corpo no seu ganha-pão. Eles sabem se mover com ossos de metal, golpear com membros calibrados, sobreviver com órgãos artificiais e forçar seus sistemas sem queimar na hora.</p>
<p><strong>Itens de Classe:</strong> Um kit de manutenção para o seu implante mais importante ou a peça original do seu corpo que foi substituída por cromo.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["chrome"],
    hitPoints: 6,
    evasion: 11,
    backgroundQuestions: [
      "Qual foi o seu primeiro implante, e por que você o colocou?",
      "De que parte do seu corpo original você mais sente falta?",
      "Você escolheu virar Augmented, ou o seu corpo foi reconstruído depois de algo terrível?"
    ],
    connections: [
      "Qual personagem te conheceu antes do cromo?",
      "Quem te ajudou a sobreviver a uma instalação ruim?",
      "Quem trata o seu corpo como uma pessoa, e não como uma máquina?"
    ],
    hopeFeature: {
      name: "Chrome Surge", img: CPR("status/stim"), form: "action",
      description: "<p>Gaste 3 Esperança quando fizer uma Rolagem de Agilidade, Força ou Acuidade. Role um d8 e some o resultado à rolagem. Se a rolagem tiver sucesso, escolha uma:</p><ul><li>Mova-se imediatamente dentro do alcance Próximo.</li><li>Limpe 1 Estresse.</li><li>Ganhe +2 de Evasão até o seu próximo Holofote.</li></ul><p><em>Na ficha: a ação gasta a Esperança e rola o d8 para somar à rolagem.</em></p>",
      actions: featureAction({ name: "Chrome Surge", dice: "1d8", img: CPR("status/stim"), costs: [{ key: "hope", value: 3 }], target: { type: "self", amount: null } })
    },
    classFeatures: [{
      name: "Integrated Chrome", img: CPR("cyberware/cyberarm"), form: "action",
      description: "<p>Seu cyberware está totalmente integrado ao seu sistema nervoso. Quando você termina um descanso, escolha Agilidade, Força ou Acuidade como o seu <strong>Atributo Calibrado</strong>.</p><p>Quando você faz uma rolagem de ação usando o Atributo Calibrado ou usa uma carta de Chrome, pode marcar 1 Estresse para rolar um d6 e somar o resultado à rolagem.</p><p>Além disso, quando você rola o Dado de Humanidade para resistir à Ciberpsicose, trate a sua Carga Cibernética como 1 menor, até o mínimo de 0.</p><p><em>Na ficha: \"Calibrar Atributo\" escolhe o Atributo Calibrado (mostrado no selo do cabeçalho); \"Integrated Chrome\" marca 1 Estresse e rola o d6. A Rolagem de Humanidade já desconta 1 da Carga.</em></p>",
      flags: { [MODULE_ID]: {
        integratedChrome: true,
        pick: { action: CHROME_ACTIONS.calibrate, title: "Atributo Calibrado", icon: "fa-gears", prompt: "Escolha o Atributo Calibrado até o próximo descanso.",
          options: { agility: "Agilidade", strength: "Força", finesse: "Acuidade" } }
      } },
      actions: {
        ...featureAction({ name: CHROME_ACTIONS.calibrate, img: CPR("gear/tech_scanner"), target: { type: "self", amount: null } }),
        ...featureAction({ name: CHROME_ACTIONS.use, dice: "1d6", img: CPR("cyberware/cyberarm"), costs: [{ key: "stress", value: 1 }], target: { type: "self", amount: null } })
      }
    }]
  },
  subclasses: [
    {
      name: "Reflex Suite", img: CPR("classes/augmented/subclasses/reflex-suite.png"),
      description: `<p><em>Jogue de Reflex Suite se você quiser se mover mais rápido que o tempo de reação humano e transformar o seu sistema nervoso numa arma.</em></p>
<p><strong>Build Sugerida:</strong> Agilidade +2, Acuidade +1, Instinto +1, Força 0, Presença 0, Conhecimento −1. Equipamento recomendado: Compact SMG (primária, uma mão) + Combat Knife (secundária) + Synthleather Jacket — Evasão alta e Agilidade calibrada.</p>`,
      spellcastingTrait: "agility",
      suggestedTraits: { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: 0, knowledge: -1 },
      foundation: [
        {
          name: "Neural Reflexes", img: CPR("dlc/cyberware/reflex-co-processor"), form: "passive",
          description: "<p>Quando você usa <em>Integrated Chrome</em> numa Rolagem de Agilidade ou Acuidade, pode se mover imediatamente dentro do alcance Muito Próximo depois que a rolagem se resolve. Se a rolagem tiver sucesso com Esperança, pode se mover dentro do alcance Próximo.</p>"
        },
        {
          name: "Fast Enough", img: CPR("cyberware/sandevistan"), form: "reaction",
          description: "<p>Uma vez por descanso, quando um ataque contra você fosse acertar, pode marcar 1 Estresse para rolar um d6 e somar o resultado à sua Evasão contra esse ataque.</p>",
          actions: featureAction({ name: "Fast Enough", dice: "1d6", img: CPR("cyberware/sandevistan"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], uses: { max: 1, recovery: "shortRest" }, target: { type: "self", amount: null } })
        }
      ],
      specialization: [{
        name: "Motion Blur", img: CPR("dlc/cyberware/wyzard-technologies_romanova-cyberlegs"), form: "passive",
        description: "<p>Quando você se move dentro do alcance Próximo ou mais longe durante o seu Holofote, o próximo ataque contra você antes do seu próximo Holofote tem desvantagem.</p>"
      }],
      mastery: [(() => {
        const loop = targetEffect({ name: "Accelerated Loop", img: CPR("status/timewarp"), duration: "scene",
          description: "<p>Reflexware em aceleração total até a cena terminar ou você sofrer dano Severo. Na primeira vez em cada Holofote que usar Integrated Chrome numa Rolagem de Agilidade ou Acuidade bem-sucedida, limpe 1 Estresse ou mova-se dentro do alcance Muito Próximo.</p>" });
        return {
          name: "Accelerated Loop", img: loop.img, form: "action",
          description: "<p>Uma vez por descanso longo, você pode levar o seu reflexware à aceleração total. Até a cena terminar ou você sofrer dano Severo, na primeira vez em cada Holofote que você usar <em>Integrated Chrome</em> numa Rolagem de Agilidade ou Acuidade bem-sucedida, pode limpar 1 Estresse ou se mover imediatamente dentro do alcance Muito Próximo.</p>",
          effects: [loop],
          actions: featureAction({ name: "Accelerated Loop", img: loop.img, uses: { max: 1, recovery: "longRest" }, effects: [loop], target: { type: "self", amount: null } })
        };
      })()]
    },
    {
      name: "Titan Frame", img: CPR("classes/augmented/subclasses/titan-frame.png"),
      description: `<p><em>Jogue de Titan Frame se você quiser virar uma montanha de cromo pesado e força industrial que se recusa a sair do lugar a menos que você permita.</em></p>
<p><strong>Build Sugerida:</strong> Força +2, Agilidade +1, Instinto +1, Acuidade 0, Presença 0, Conhecimento −1. Equipamento recomendado: Breach Hammer (primária, duas mãos) + Ballistic Vest — Força calibrada para o Reinforced Build.</p>`,
      spellcastingTrait: "strength",
      suggestedTraits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
      foundation: [
        {
          name: "Reinforced Build", img: CPR("cyberware/implanted_linearframe_sigma"), form: "passive",
          description: "<p>Quando o seu Atributo Calibrado é Força, ganhe +1 na Pontuação de Armadura. Além disso, quando usar <em>Integrated Chrome</em> numa Rolagem de Força, role um d8 em vez de um d6.</p><p><em>Na ficha: o +1 de Armadura liga sozinho quando você calibra Força e desliga nos outros atributos.</em></p>",
          flags: { [MODULE_ID]: { reinforcedBuild: true } },
          effects: [{
            name: "Reinforced Build", img: CPR("cyberware/implanted_linearframe_sigma"), transfer: true, type: "base",
            description: "<p>+1 na Pontuação de Armadura enquanto o Atributo Calibrado for Força.</p>",
            system: { changes: [{ type: "armor", phase: "initial", priority: 20, value: { max: "1", current: 0, damageThresholds: null, interaction: "none" } }], duration: { description: "" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
            duration: { value: null, units: "seconds", expiry: null, expired: false },
            tint: "#ffffff", statuses: [], disabled: true
          }]
        },
        {
          name: "Load-Bearing Body", img: CPR("cyberware/implanted_linearframe_beta"), form: "passive",
          description: "<p>Você tem vantagem em rolagens para resistir a ser empurrado, derrubado, desarmado, movido contra a sua vontade ou ficar temporariamente <em>Imobilizado</em>.</p>"
        }
      ],
      specialization: [{
        name: "Impact Absorbers", img: CPR("cyberware/grafted_muscle_and_bone_lace"), form: "reaction",
        description: "<p>Uma vez por cena, quando você fosse marcar um ou mais Pontos de Vida por dano físico ou de impacto, pode marcar 1 Estresse para reduzir a gravidade em um limiar.</p><p>Se isso evitar que você marque qualquer Ponto de Vida, você pode se mover imediatamente dentro do alcance Muito Próximo ou forçar o atacante a marcar 1 Estresse.</p>",
        actions: featureAction({ name: "Impact Absorbers", img: CPR("cyberware/grafted_muscle_and_bone_lace"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], uses: { max: 1, recovery: "scene" }, target: { type: "self", amount: null } })
      }],
      mastery: [(() => {
        const walking = targetEffect({ name: "Heavy Chrome Walking", img: CPR("dlc/gear/linearframe_omega"), duration: "scene",
          description: "<p>Reforço de corpo inteiro ativo até a cena terminar ou você sofrer dano Severo: +3 nos limiares de dano; em ataques Corpo a Corpo, some o dado do Atributo Calibrado ao dano; ao ter sucesso numa Rolagem de Força ou ataque contra um alvo Corpo a Corpo, pode empurrá-lo até o alcance Próximo e deixá-lo temporariamente Vulnerável.</p>",
          changes: [
            { key: "system.damageThresholds.major", type: "add", value: 3, priority: null, phase: "initial" },
            { key: "system.damageThresholds.severe", type: "add", value: 3, priority: null, phase: "initial" }
          ] });
        return {
          name: "Heavy Chrome Walking", img: walking.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você marca um Espaço de Armadura, pode ativar o seu reforço de corpo inteiro até a cena terminar ou você sofrer dano Severo. Enquanto esta feature estiver ativa:</p><ul><li>Quando acertar uma rolagem de ataque Corpo a Corpo, pode somar o dado do Atributo Calibrado à rolagem de dano.</li><li>Ganhe +3 nos seus limiares de dano.</li><li>Quando tiver sucesso numa Rolagem de Força ou ataque com arma contra um alvo dentro do alcance Corpo a Corpo, pode empurrá-lo até o alcance Próximo e deixá-lo temporariamente <em>Vulnerável</em>.</li></ul>",
          effects: [walking],
          actions: featureAction({ name: "Heavy Chrome Walking", img: walking.img, uses: { max: 1, recovery: "longRest" }, effects: [walking], target: { type: "self", amount: null } })
        };
      })()]
    }
  ]
};

const TECH = {
  key: "tech",
  classItems: [
    { name: "Kit de Ferramentas Personalizado", img: CPR("gear/carryall"), description: "<p>Um kit de ferramentas personalizado cheio de adaptadores ilegais e peças recuperadas. Metade das ferramentas você mesmo fabricou.</p>" },
    { name: "Máquina Quebrada", img: CPR("upgrades/backup_drive"), description: "<p>Uma máquina quebrada que você se recusa a parar de consertar. O que ela era, e por que importa tanto?</p>" }
  ],
  guide: {
    traits: { agility: 1, strength: -1, finesse: 0, instinct: 1, presence: 0, knowledge: 2 },
    primaryWeapon: "Scrap Launcher", secondaryWeapon: null, armor: "Ballistic Vest"
  },
  class: {
    name: "Tech",
    img: CPR("classes/tech/class-icon.png"),
    description: `<p><strong>Systems, engenharia, drones, equipamento</strong><br>"Me dá peças, ferramentas e dez minutos."</p>
<p><em>Jogue de Tech se você quiser…</em> Construir ferramentas, consertar sistemas, posicionar dispositivos, controlar drones, modificar equipamento e transformar preparação em poder.</p>
<p>Techs resolvem problemas e entendem que toda máquina tem um jeito de quebrar, entortar ou se tornar útil. Eles fazem planos impossíveis funcionarem só o tempo suficiente para fazer diferença.</p>
<p><strong>Itens de Classe:</strong> Um kit de ferramentas personalizado cheio de adaptadores ilegais e peças recuperadas ou uma máquina quebrada que você se recusa a parar de consertar.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["systems"],
    hitPoints: 5,
    evasion: 10,
    backgroundQuestions: [
      "Que máquina, arma, drone ou dispositivo você se recusa a abandonar?",
      "Que peça de tecnologia te deixou na mão quando você mais precisava?",
      "Você virou Tech porque amava máquinas, ou porque as pessoas eram menos confiáveis?"
    ],
    connections: [
      "Quem quebrou algo importante que você ainda não perdoou?",
      "Quem confia mais nas suas máquinas do que em você?",
      "Qual personagem te ajudou a carregar, esconder ou reconstruir algo ilegal?"
    ],
    hopeFeature: {
      name: "Make It Work", img: CPR("gear/duct_tape"), form: "reaction",
      description: "<p>Gaste 3 Esperança depois que você ou um aliado dentro do alcance Próximo falhar numa rolagem de ação usando um dispositivo, arma ou carta de Systems. Descreva o seu conserto de emergência; o alvo pode rolar de novo os Dados de Dualidade e usar o novo resultado.</p>",
      actions: featureAction({ name: "Make It Work", img: CPR("gear/duct_tape"), actionType: "reaction", costs: [{ key: "hope", value: 3 }], target: { type: "friendly", amount: 1 } })
    },
    classFeatures: [{
      name: "Jury-Rig", img: CPR("gear/tech_tool"), form: "action",
      description: "<p>Uma vez por cena, quando você tem alguns momentos e acesso às suas ferramentas, pode modificar, consertar ou improvisar com um dispositivo, arma ou máquina dentro do alcance Corpo a Corpo. Escolha uma:</p><ul><li><strong>Boost:</strong> na próxima vez que o item modificado for usado antes de a cena terminar, some +1d6 à rolagem de ação, Rolagem de Interface ou rolagem de dano dele.</li><li><strong>Patch:</strong> restaure um item quebrado, travado, desativado ou danificado para que funcione até a cena terminar, ou permita que uma criatura usando o item limpe um Espaço de Armadura.</li><li><strong>Rewire:</strong> conecte ou desconecte o item de uma rede, contorne os controles locais dele ou permita que ele seja operado do alcance Distante até a cena terminar.</li></ul><p>Você pode marcar 1 Estresse para usar Jury-Rig de novo na mesma cena.</p><p><em>Na ficha: \"Jury-Rig\" é o uso da cena; \"Jury-Rig Extra\" marca 1 Estresse para usar de novo; \"Rolar Boost\" rola o d6 quando o item modificado for usado.</em></p>",
      actions: {
        ...featureAction({ name: "Jury-Rig", img: CPR("gear/tech_tool"), uses: { max: 1, recovery: "scene" }, target: { type: "self", amount: null } }),
        ...featureAction({ name: "Jury-Rig Extra", costs: [{ key: "stress", value: 1 }], target: { type: "self", amount: null } }),
        ...featureAction({ name: "Rolar Boost", dice: "1d6", img: CPR("upgrades/nos"), target: { type: "self", amount: null } })
      }
    }]
  },
  subclasses: [
    {
      name: "Rigger", img: CPR("classes/tech/subclasses/rigger.png"),
      description: `<p><em>Jogue de Rigger se você quiser controlar drones, operar máquinas remotamente e apoiar aliados por meio de equipamento.</em></p>
<p><strong>Build Sugerida:</strong> Conhecimento +2, Agilidade +1, Instinto +1, Acuidade 0, Presença 0, Força −1. Equipamento recomendado: Scrap Launcher (primária, duas mãos) + Ballistic Vest — o drone faz o trabalho de perto enquanto você fica no alcance Próximo.</p>`,
      spellcastingTrait: "knowledge",
      suggestedTraits: { agility: 1, strength: -1, finesse: 0, instinct: 1, presence: 0, knowledge: 2 },
      foundation: [{
        name: "Companion Drone", img: CPR("dlc/cyberware/drone_remote"), form: "action",
        description: "<p>Você tem um pequeno drone ou máquina companheira que pode se mover de forma independente dentro do alcance Distante, carregar objetos pequenos, gravar, escanear e interagir com controles.</p><p>Você pode Ajudar um aliado dentro do alcance Próximo do drone, não importa onde você esteja. Se a rolagem dele envolver equipamento ou sistemas conectados, use um d8 como dado de Ajuda.</p><p>Quando o drone fosse sofrer dano, marque 1 Estresse para tirá-lo do perigo. Caso contrário, ele fica desativado até o seu próximo descanso.</p><p><em>Na ficha: \"Ajuda do Drone\" gasta 1 Esperança e rola o d8 de Ajuda; \"Proteger Drone\" marca 1 Estresse.</em></p>",
        actions: {
          ...featureAction({ name: "Ajuda do Drone", dice: "1d8", img: CPR("upgrades/communications_center"), costs: [{ key: "hope", value: 1 }], target: { type: "friendly", amount: 1 } }),
          ...featureAction({ name: "Proteger Drone", img: CPR("upgrades/hardened_circuitry"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], target: { type: "self", amount: null } })
        }
      }],
      specialization: [{
        name: "Remote Hands", img: CPR("dlc/cyberware/raven_microcybernetics_microwaldo"), form: "passive",
        description: "<p>Você pode usar Jury-Rig por meio do drone como se estivesse tocando o alvo. Depois de usar <strong>Boost</strong> ou <strong>Patch</strong>, o drone pode se mover imediatamente dentro do alcance Próximo.</p>"
      }],
      mastery: [(() => {
        const network = targetEffect({ name: "Drone Network", img: CPR("dlc/gear/raven_microcybernetics_cybercam_ex-1"), duration: "scene",
          description: "<p>Rede de drones ativa até a cena terminar ou você sofrer dano Severo: o drone opera dentro do alcance Muito Distante, o Jury-Rig usado por meio dele aplica dois efeitos, e você pode marcar 1 Estresse para reduzir em 1d8 o dano de um aliado dentro do alcance Próximo do drone.</p>" });
        return {
          name: "Drone Network", img: network.img, form: "action",
          description: "<p>Uma vez por descanso longo, espalhe uma rede de drones até a cena terminar ou você sofrer dano Severo. Enquanto ativa:</p><ul><li>Seu drone pode operar dentro do alcance Muito Distante.</li><li>O Jury-Rig usado por meio dele pode aplicar dois efeitos.</li><li>Quando um aliado dentro do alcance Próximo dele sofrer dano, marque 1 Estresse para reduzir esse dano em <strong>1d8</strong>.</li></ul>",
          effects: [network],
          actions: {
            ...featureAction({ name: "Drone Network", img: network.img, uses: { max: 1, recovery: "longRest" }, effects: [network], target: { type: "self", amount: null } }),
            ...featureAction({ name: "Reduzir Dano (Drone Network)", dice: "1d8", img: CPR("upgrades/insulated_wiring"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], target: { type: "friendly", amount: 1 } })
          }
        };
      })()]
    },
    {
      name: "Saboteur", img: CPR("classes/tech/subclasses/saboteur.png"),
      description: `<p><em>Jogue de Saboteur se você quiser plantar cargas, desativar defesas e virar o ambiente contra os seus inimigos.</em></p>
<p><strong>Build Sugerida:</strong> Acuidade +2, Conhecimento +1, Agilidade +1, Instinto 0, Presença 0, Força −1. Equipamento recomendado: Mono-Katana (primária, uma mão) + Grapple Wire (secundária) + Synthleather Jacket — chegar perto para plantar as cargas.</p>`,
      spellcastingTrait: "finesse",
      suggestedTraits: { agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 0, knowledge: 1 },
      foundation: [(() => {
        const disrupt = targetEffect({ name: "Disrupt", img: CPR("ammo/grenade_emp"), statuses: ["vulnerable"],
          description: "<p>Marcou 1 Estresse e ficou temporariamente Vulnerável por uma carga (Disrupt).</p>" });
        return {
          name: "Planted Charge", img: CPR("ammo/grenade_basic"), form: "action",
          description: "<p>Quando você pode tocar um objeto, superfície ou máquina, marque 1 Estresse para plantar uma carga. Acione-a mais tarde na cena para escolher uma:</p><ul><li><strong>Breach:</strong> abra, quebre ou desmorone o alvo.</li><li><strong>Disable:</strong> trave, tranque ou desligue o alvo até ser consertado.</li><li><strong>Disrupt:</strong> um adversário dentro do alcance Muito Próximo marca 1 Estresse e fica temporariamente <em>Vulnerável</em>.</li></ul><p>Você pode ter uma carga ativa por vez.</p>",
          effects: [disrupt],
          actions: {
            ...featureAction({ name: "Plantar Carga", img: CPR("ammo/grenade_basic"), costs: [{ key: "stress", value: 1 }], target: { type: "self", amount: null } }),
            ...featureAction({ name: "Acionar: Disrupt", img: disrupt.img, effects: [disrupt] })
          }
        };
      })()],
      specialization: [{
        name: "Cascading Failure", img: CPR("ammo/grenade_armorpiercing"), form: "passive",
        description: "<p>Você pode ter duas cargas ativas. Quando uma é acionada:</p><ul><li><strong>Breach:</strong> você ou um aliado Próximo a ela pode se mover imediatamente dentro do alcance Próximo.</li><li><strong>Disable:</strong> um adversário usando o alvo também marca 1 Estresse.</li><li><strong>Disrupt:</strong> o adversário afetado tem desvantagem na próxima rolagem de ação antes do seu próximo Holofote.</li></ul>"
      }],
      mastery: [(() => {
        const restrained = targetEffect({ name: "Controlled Demolition", img: CPR("ammo/rocket_armorpiercing"), statuses: ["restrained"],
          description: "<p>Pego pela demolição controlada: temporariamente Imobilizado.</p>" });
        return {
          name: "Controlled Demolition", img: restrained.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você aciona uma carga, destrua, desmorone, abra ou desative o alvo dela para criar uma grande brecha, rota de fuga ou obstrução.</p><p>Adversários dentro do alcance Próximo fazem uma Rolagem de Reação (16). Em uma falha, sofrem 3d10 de dano físico e ficam temporariamente <em>Imobilizados</em>. Em um sucesso, sofrem metade do dano.</p><p><em>Na ficha: a ação rola os 3d10 e aplica Imobilizado nos alvos que falharem.</em></p>",
          effects: [restrained],
          actions: featureAction({ name: "Controlled Demolition", dice: "3d10", img: restrained.img, uses: { max: 1, recovery: "longRest" }, effects: [restrained], target: { type: "hostile", amount: null } })
        };
      })()]
    }
  ]
};

// Terms of Engagement: cada opção é uma ação que só registra a escolha no chat (a descrição vai no card).
const TERMS_ACTIONS = [
  { name: "Pressure", img: CPR("status/choking1"), target: { type: "hostile", amount: 1 }, description: "<p><strong>Pressure:</strong> um alvo afetado marca 1 Estresse.</p>" },
  { name: "Opening", img: CPR("status/readied_action"), target: { type: "hostile", amount: 1 }, description: "<p><strong>Opening:</strong> a próxima rolagem de ação feita por você ou um aliado contra um alvo afetado ganha +2.</p>" },
  { name: "Reassurance", img: CPR("status/speedheal"), target: { type: "friendly", amount: 1 }, description: "<p><strong>Reassurance:</strong> você ou um aliado dentro do alcance Próximo limpa 1 Estresse.</p>" }
];

const BROKER = {
  key: "broker",
  classItems: [
    { name: "Lista de Contatos", img: CPR("gear/disposable_cellphone"), description: "<p>Uma lista de contatos que vale mais do que o seu saldo bancário. Quem está no topo dela, e quem foi riscado?</p>" },
    { name: "Chip de Contrato", img: CPR("gear/memory_chip"), description: "<p>Um chip de contrato com um grande e ilegal acordo corporativo. Quem pagaria para tê-lo, e quem mataria para apagá-lo?</p>" }
  ],
  guide: {
    traits: { agility: 0, strength: -1, finesse: 0, instinct: 1, presence: 2, knowledge: 1 },
    primaryWeapon: "Shock Baton", secondaryWeapon: "Shock Glove", armor: "Synthleather Jacket"
  },
  class: {
    name: "Broker",
    img: CPR("classes/broker/class-icon.png"),
    description: `<p><strong>Influence, contatos, manipulação, reputação</strong><br>"Todo mundo tem um preço. O truque é descobrir em que moeda eles aceitam."</p>
<p><em>Jogue de Broker se você quiser…</em> Negociar contratos, manipular facções, comandar pressão social, construir redes de favores, usar a reputação como arma e vencer antes de as armas aparecerem.</p>
<p>Brokers são negociadores, rostos públicos e predadores sociais que entendem que o poder raramente está nas mãos de quem segura a arma. Eles sabem quem paga, quem pode ser comprado e quem precisa desaparecer antes do próximo contrato.</p>
<p><strong>Itens de Classe:</strong> Uma lista de contatos que vale mais do que o seu saldo bancário ou um chip de contrato com um grande e ilegal acordo corporativo.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["influence"],
    hitPoints: 5,
    evasion: 10,
    backgroundQuestions: [
      "Quem te deu o seu primeiro contato de verdade?",
      "Qual facção te deve algo, e qual facção te quer morto?",
      "Que segredo você guarda porque vale mais sem ser vendido?"
    ],
    connections: [
      "Qual personagem você recrutou, resgatou, contratou ou comprou para tirar de uma encrenca?",
      "Quem sabe quando você está mentindo?",
      "Quem tem com você uma dívida de que nenhum dos dois fala?"
    ],
    hopeFeature: {
      name: "Fine Print", img: CPR("dlc/gear/the-observer"), form: "reaction",
      description: "<p>Gaste 3 Esperança depois que você ou um aliado dentro do alcance Distante falhar numa Rolagem de Presença. Revele um segredo, suborno, ameaça ou interrupção perfeita. A falha vira um sucesso com Medo.</p><p>Se a rolagem que falhou foi feita diretamente contra uma criatura, ela também marca 1 Estresse.</p>",
      actions: featureAction({ name: "Fine Print", img: CPR("dlc/gear/the-observer"), actionType: "reaction", costs: [{ key: "hope", value: 3 }], target: { type: "friendly", amount: 1 } })
    },
    classFeatures: [{
      name: "Terms of Engagement", img: CPR("gear/pocket_amplifier"), form: "action",
      description: "<p>Quando você tem sucesso numa Rolagem de Presença ou carta de Influence contra uma criatura ou grupo, escolha uma:</p><ul><li><strong>Pressure:</strong> um alvo afetado marca 1 Estresse.</li><li><strong>Opening:</strong> a próxima rolagem de ação feita por você ou um aliado contra um alvo afetado ganha +2.</li><li><strong>Reassurance:</strong> você ou um aliado dentro do alcance Próximo limpa 1 Estresse.</li></ul><p>Num sucesso com Esperança, você pode marcar 1 Estresse para escolher uma opção adicional.</p><p><em>Na ficha: cada opção é uma ação que registra a escolha no chat; \"Opção Adicional\" marca o Estresse.</em></p>",
      actions: Object.assign({},
        ...TERMS_ACTIONS.map(t => featureAction(t)),
        featureAction({ name: "Opção Adicional", costs: [{ key: "stress", value: 1 }], target: { type: "self", amount: null } }))
    }]
  },
  subclasses: [
    {
      name: "Fixer", img: CPR("classes/broker/subclasses/fixer.png"),
      description: `<p><em>Jogue de Fixer se você quiser arranjar trabalhos, cobrar favores e navegar pela economia oculta da cidade.</em></p>
<p><strong>Build Sugerida:</strong> Presença +2, Conhecimento +1, Instinto +1, Agilidade 0, Acuidade 0, Força −1. Equipamento recomendado: Shock Baton (primária, uma mão) + Shock Glove (secundária) + Synthleather Jacket — as duas armas usam Presença.</p>`,
      spellcastingTrait: "presence",
      suggestedTraits: { agility: 0, strength: -1, finesse: 0, instinct: 1, presence: 2, knowledge: 1 },
      foundation: [{
        name: "Black-Market Network", img: CPR("upgrades/smuggling_upgrade"), form: "action",
        description: "<p>Uma vez por descanso, numa área povoada, declare que conhece um contato que pode fornecer equipamento restrito, abrigo, transporte, informação ou acesso a alguém difícil de alcançar. O mestre diz o que ele quer em troca.</p><p>Quando você ou um aliado usar a ajuda do contato, ganhe +2 numa rolagem de ação relevante.</p>",
        actions: featureAction({ name: "Black-Market Network", img: CPR("upgrades/smuggling_upgrade"), uses: { max: 1, recovery: "shortRest" }, target: { type: "self", amount: null } })
      }],
      specialization: [{
        name: "Contacts Everywhere", img: CPR("gear/radio_communicator"), form: "action",
        description: "<p>Uma vez por descanso, chame ajuda imediata de um contato. Descreva como ele intervém e escolha uma:</p><ul><li>Reduza em 1 os Pontos de Vida marcados por você ou por um aliado.</li><li>Ganhe +3 na sua próxima rolagem de ação.</li><li>Some 2d8 à sua próxima rolagem de dano.</li></ul><p><em>Na ficha: \"Rolar 2d8\" rola o dano extra da terceira opção.</em></p>",
        actions: {
          ...featureAction({ name: "Contacts Everywhere", img: CPR("gear/radio_communicator"), uses: { max: 1, recovery: "shortRest" }, target: { type: "self", amount: null } }),
          ...featureAction({ name: "Rolar 2d8", dice: "2d8", img: CPR("default/Default_Dice"), target: { type: "self", amount: null } })
        }
      }],
      mastery: [{
        name: "Everybody Owes Somebody", img: CPR("dlc/gear/savannah-eagle"), form: "action",
        description: "<p>Uma vez por descanso longo, pergunte ao mestre quem na cena pode ser comprado, pressionado ou virado. A sua primeira Rolagem de Presença ou carta de Influence contra essa pessoa tem vantagem.</p><p>Num sucesso, escolha duas opções de <em>Terms of Engagement</em> em vez de uma.</p>",
        actions: featureAction({ name: "Everybody Owes Somebody", img: CPR("dlc/gear/savannah-eagle"), uses: { max: 1, recovery: "longRest" }, target: { type: "self", amount: null } })
      }]
    },
    {
      name: "Icon", img: CPR("classes/broker/subclasses/icon.png"),
      description: `<p><em>Jogue de Icon se você quiser usar como arma a reputação, a performance, a fama, o medo, a propaganda e a percepção pública.</em></p>
<p><strong>Build Sugerida:</strong> Presença +2, Agilidade +1, Acuidade +1, Instinto 0, Conhecimento 0, Força −1. Equipamento recomendado: Shock Baton (primária, uma mão) + Shock Glove (secundária) + Street Icon Fit — a reputação faz parte do figurino.</p>`,
      spellcastingTrait: "presence",
      suggestedTraits: { agility: 1, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 0 },
      foundation: [{
        name: "Public Persona", img: CPR("dlc/cyberware/external_vidscreen"), form: "action",
        description: "<p>Escolha o que o seu nome significa na rua:</p><ul><li><strong>Beloved:</strong> quando usa <em>Terms of Engagement</em> para você ou um aliado limpar Estresse, esse alvo limpa 2 Estresse em vez de 1.</li><li><strong>Feared:</strong> quando usa <em>Terms of Engagement</em> para fazer um alvo marcar Estresse, pode marcar 1 Estresse para deixá-lo temporariamente Vulnerável.</li><li><strong>Famous:</strong> quando usa <em>Terms of Engagement</em> para dar +2 numa rolagem, dê +4 em vez disso.</li></ul><p>Você pode trocar a sua Public Persona quando faz um descanso longo, explicando como a sua imagem muda.</p><p><em>Na ficha: \"Escolher Public Persona\" guarda a escolha, mostrada no selo do cabeçalho.</em></p>",
        flags: { [MODULE_ID]: { pick: { action: "Escolher Public Persona", title: "Public Persona", icon: "fa-star", prompt: "Escolha o que o seu nome significa na rua (troca no descanso longo).",
          options: { beloved: "Beloved", feared: "Feared", famous: "Famous" } } } },
        actions: featureAction({ name: "Escolher Public Persona", img: CPR("dlc/cyberware/external_vidscreen"), target: { type: "self", amount: null } })
      }],
      specialization: [{
        name: "Live Feed", img: CPR("gear/video_camera"), form: "action",
        description: "<p>Uma vez por descanso, quando você tem sucesso numa Rolagem de Presença ou usa uma carta de Influence enquanto é observado por uma multidão, gravado ou transmitido para um grupo, pode amplificar o momento.</p><p>Escolha qualquer número de criaturas dentro do alcance Próximo que possam te ver ou ouvir. Aliados limpam 1 Estresse. Adversários marcam 1 Estresse.</p>",
        actions: featureAction({ name: "Live Feed", img: CPR("gear/video_camera"), uses: { max: 1, recovery: "shortRest" }, target: { type: "any", amount: null } })
      }],
      mastery: [(() => {
        const brand = targetEffect({ name: "Living Brand", img: CPR("status/prime_time"), duration: "scene",
          description: "<p>Reputação assumida até a cena terminar ou você sofrer dano Severo. Na primeira vez em cada Holofote que tiver sucesso numa Rolagem de Presença ou carta de Influence: um aliado ganha 1 Esperança, um adversário marca 1 Estresse, ou você limpa 1 Estresse.</p>" });
        return {
          name: "Living Brand", img: brand.img, form: "action",
          description: "<p>Uma vez por descanso longo, você pode assumir totalmente a sua reputação até a cena terminar ou você sofrer dano Severo. Enquanto esta feature estiver ativa, na primeira vez em cada Holofote em que você tiver sucesso numa Rolagem de Presença ou com uma carta de Influence, escolha uma:</p><ul><li>Um aliado que possa te ver ou ouvir ganha 1 Esperança.</li><li>Um adversário que possa te ver ou ouvir marca 1 Estresse.</li><li>Você limpa 1 Estresse.</li></ul>",
          effects: [brand],
          actions: featureAction({ name: "Living Brand", img: brand.img, uses: { max: 1, recovery: "longRest" }, effects: [brand], target: { type: "self", amount: null } })
        };
      })()]
    }
  ]
};

const RECLAIMER = {
  key: "reclaimer",
  classItems: [
    { name: "Mapa de Rotas Rachado", img: CPR("dlc/gear/optitech_magviewer"), description: "<p>Um mapa de rotas rachado, cheio de marcações pessoais: atalhos, esconderijos, zonas mortas e nomes que só você entende.</p>" },
    { name: "Pedaço de Sucata", img: CPR("upgrades/combat_plow"), description: "<p>Um pedaço de sucata do lugar que deveria ter te matado. Você o carrega para lembrar que saiu de lá.</p>" }
  ],
  guide: {
    traits: { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: 0, knowledge: -1 },
    primaryWeapon: "Assault Carbine", secondaryWeapon: null, armor: "Synthleather Jacket"
  },
  class: {
    name: "Reclaimer",
    img: CPR("classes/reclaimer/class-icon.png"),
    description: `<p><strong>Frontier, sobrevivência, ruínas, zonas hostis</strong><br>"O velho mundo está morto. Isso não quer dizer que esteja vazio."</p>
<p><em>Jogue de Reclaimer se você quiser…</em> Sobreviver longe do controle corporativo, atravessar zonas mortas, ler o terreno, recuperar tecnologia perdida, navegar por ruínas, explorar ambientes hostis e transformar o próprio campo de batalha numa ferramenta.</p>
<p>Reclaimers são sobreviventes que sabem viver onde a civilização falhou. Eles atravessam cidades mortas e enxergam as rotas, os abrigos e os recursos do velho mundo esperando para serem usados.</p>
<p><strong>Itens de Classe:</strong> Um mapa de rotas rachado, cheio de marcações pessoais, ou um pedaço de sucata do lugar que deveria ter te matado.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["frontier"],
    hitPoints: 6,
    evasion: 11,
    backgroundQuestions: [
      "O que você recuperou das ruínas que mudou a sua vida?",
      "Você foi criado fora das cidades, na estrada, ou num lugar que as corporações abandonaram?",
      "Que veículo, rota ou peça de sucata você se recusa a abandonar?"
    ],
    connections: [
      "Qual personagem você guiou por um lugar que deveria tê-lo matado?",
      "Quem confia mais nas suas rotas do que no mapa?",
      "Qual personagem já te viu arriscar tudo por um veículo, uma estrada ou uma peça de tecnologia antiga?"
    ],
    hopeFeature: (() => {
      const vulnerable = targetEffect({ name: "Home Ground (Vulnerável)", img: CPR("ammo/grenade_teargas"), statuses: ["vulnerable"],
        description: "<p>O terreno se virou contra ele: marcou 1 Estresse e ficou temporariamente Vulnerável.</p>" });
      const restrained = targetEffect({ name: "Home Ground (Imobilizado)", img: CPR("ammo/grenade_teargas"), statuses: ["restrained"],
        description: "<p>O terreno se virou contra ele: marcou 1 Estresse e ficou temporariamente Imobilizado.</p>" });
      return {
        name: "Home Ground", img: CPR("ammo/grenade_teargas"), form: "reaction",
        description: "<p>Gaste 3 Esperança quando um adversário dentro do alcance Distante se move, ataca ou tem como alvo você ou um aliado, para usar o terreno contra ele. Ele faz uma Rolagem de Reação (14).</p><p>Em uma falha, fica temporariamente <em>Vulnerável</em> ou temporariamente <em>Imobilizado</em> e marca 1 Estresse. Se estiver operando um veículo, você pode deixar o veículo <strong>Damaged</strong> em vez disso. Em um sucesso, ele marca 1 Estresse.</p><p><em>Na ficha: uma ação para cada condição; use a que você escolher quando o alvo falhar.</em></p>",
        effects: [vulnerable, restrained],
        actions: {
          ...featureAction({ name: "Home Ground: Vulnerável", img: CPR("ammo/grenade_teargas"), actionType: "reaction", costs: [{ key: "hope", value: 3 }], effects: [vulnerable] }),
          ...featureAction({ name: "Home Ground: Imobilizado", img: CPR("ammo/grenade_teargas"), actionType: "reaction", costs: [{ key: "hope", value: 3 }], effects: [restrained] })
        }
      };
    })(),
    classFeatures: [(() => {
      const route = targetEffect({ name: "Surveyed Route", img: CPR("gear/binoculars"), duration: "scene",
        description: "<p>Surveyed Route ativa até a cena terminar ou você sofrer dano Severo: você e os aliados dentro do alcance Próximo ignoram terreno difícil; ao causar dano a um adversário na zona, pode forçá-lo a marcar 1 Estresse; ao falhar numa rolagem de ação, pode encerrar a Surveyed Route para rolar de novo os Dados de Dualidade.</p>" });
      return {
        name: "Surveyed Route", img: route.img, form: "action",
        description: "<p>Gaste 1 Esperança e tire um momento para ler o terreno, as ruínas ou as ruas ao seu redor. Faça uma Rolagem de Instinto (12). Em um sucesso, a área dentro do alcance Distante vira a sua <strong>Surveyed Route</strong> até a cena terminar ou você sofrer dano Severo. Enquanto estiver dentro da sua Surveyed Route:</p><ul><li>Você e os aliados dentro do alcance Próximo podem ignorar terreno difícil ao se mover ou dirigir.</li><li>Quando você causa dano a um adversário na zona, pode forçá-lo a marcar 1 Estresse.</li><li>Quando falha numa rolagem de ação, você pode encerrar a sua Surveyed Route para rolar de novo os Dados de Dualidade.</li></ul>",
        effects: [route],
        actions: withActionId(buildCardAction({ name: "Surveyed Route", img: route.img, trait: "instinct", difficulty: 12, targetType: "self", cost: [{ key: "hope", value: 1 }], effects: [route] }))
      };
    })()]
  },
  subclasses: [
    {
      name: "Outrider", img: CPR("classes/reclaimer/subclasses/outrider.png"),
      description: `<p><em>Jogue de Outrider se você quiser dominar veículos, liderar perseguições e sobreviver a estradas impossíveis.</em></p>
<p><strong>Build Sugerida:</strong> Agilidade +2, Instinto +1, Acuidade +1, Força 0, Presença 0, Conhecimento −1. Equipamento recomendado: Assault Carbine (primária, duas mãos) + Synthleather Jacket — atirar de longe, de dentro do veículo.</p>`,
      spellcastingTrait: "agility",
      suggestedTraits: { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: 0, knowledge: -1 },
      foundation: [{
        name: "Signature Vehicle", img: CPR("vehicles/super_car"), form: "action",
        description: "<p>Você tem um veículo pessoal. Ao operá-lo, pode usar Agilidade em vez do atributo indicado.</p><p>Uma vez por cena, impeça o seu Signature Vehicle de ficar <strong>Damaged</strong> ou <strong>Disabled</strong>. Você pode designar um novo Signature Vehicle durante um descanso.</p>",
        actions: featureAction({ name: "Proteger Veículo", img: CPR("vehicles/super_car"), actionType: "reaction", uses: { max: 1, recovery: "scene" }, target: { type: "self", amount: null } })
      }],
      specialization: [{
        name: "Stunt Driver", img: CPR("dlc/vehicles/zonda_metrocar"), form: "action",
        description: "<p>Uma vez por cena, enquanto opera o seu Signature Vehicle, descreva uma manobra e faça uma Rolagem de Agilidade (15). Em um sucesso, escolha duas. Em uma falha, escolha uma, e depois o seu veículo fica Damaged ou você marca 1 Estresse.</p><ul><li>Mova-se dentro do alcance Distante.</li><li>Dê +2 a um aliado na próxima rolagem de ação dele.</li><li>Faça um adversário marcar 1 Estresse.</li></ul>",
        actions: withActionId(buildCardAction({ name: "Stunt Driver", img: CPR("dlc/vehicles/zonda_metrocar"), trait: "agility", difficulty: 15, targetType: "self", uses: { max: 1, recovery: "scene" } }))
      }],
      mastery: [(() => {
        const vulnerable = targetEffect({ name: "Drive Off", img: CPR("vehicles/motorbike"), statuses: ["vulnerable"],
          description: "<p>Atingido pelo Drive Off: temporariamente Vulnerável.</p>" });
        return {
          name: "Drive Off", img: vulnerable.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você tem sucesso numa rolagem de direção com o seu Signature Vehicle, pode se mover dentro do alcance Distante ou limpar 1 Estresse.</p><p>Além disso, um adversário faz uma Rolagem de Reação (16). Em uma falha, sofre <strong>3d10 de dano físico</strong> e fica temporariamente <em>Vulnerável</em>. Em um sucesso, sofre metade do dano.</p><p><em>Na ficha: a ação rola os 3d10 e deixa o alvo Vulnerável se ele falhar.</em></p>",
          effects: [vulnerable],
          actions: featureAction({ name: "Drive Off", dice: "3d10", img: vulnerable.img, uses: { max: 1, recovery: "longRest" }, effects: [vulnerable] })
        };
      })()]
    },
    {
      name: "Zonebreaker", img: CPR("classes/reclaimer/subclasses/zonebreaker.png"),
      description: `<p><em>Jogue de Zonebreaker se você quiser dominar o terreno, transformar ruínas em armas e deixar o próprio campo de batalha perigoso.</em></p>
<p><strong>Build Sugerida:</strong> Instinto +2, Agilidade +1, Força +1, Acuidade 0, Conhecimento 0, Presença −1. Equipamento recomendado: Compact SMG (primária, uma mão) + Tactical Drone (secundária, de Instinto) + Ballistic Vest — ficar dentro da Surveyed Route e segurar a posição.</p>`,
      spellcastingTrait: "instinct",
      suggestedTraits: { agility: 1, strength: 1, finesse: 0, instinct: 2, presence: -1, knowledge: 0 },
      foundation: [{
        name: "Field Salvage", img: CPR("gear/carryall"), form: "action",
        description: "<p>Uma vez por cena, você pode recolher material útil da área ao redor. Escolha uma peça de Field Salvage:</p><ul><li><strong>Patch:</strong> você ou um aliado dentro do alcance Corpo a Corpo limpa um Espaço de Armadura.</li><li><strong>Tool:</strong> você ou um aliado ganha +2 na próxima ação.</li><li><strong>Hazard:</strong> na próxima vez que você causar dano a um adversário dentro da sua Surveyed Route, some 1d6 de dano físico à rolagem de dano.</li></ul><p>O Field Salvage não usado se perde quando você faz um descanso.</p><p><em>Na ficha: \"Field Salvage\" controla o uso da cena; \"Rolar Hazard\" rola o d6.</em></p>",
        actions: {
          ...featureAction({ name: "Field Salvage", img: CPR("gear/carryall"), uses: { max: 1, recovery: "scene" }, target: { type: "self", amount: null } }),
          ...featureAction({ name: "Rolar Hazard", dice: "1d6", img: CPR("ammo/grenade_incendiary"), target: { type: "self", amount: null } })
        }
      }],
      specialization: [(() => {
        const restrained = targetEffect({ name: "Bad Ground", img: CPR("upgrades/deployable_spike_strip"), statuses: ["restrained"],
          description: "<p>O terreno se virou contra ele: marcou 1 Estresse e ficou temporariamente Imobilizado.</p>" });
        return {
          name: "Bad Ground", img: restrained.img, form: "reaction",
          description: "<p>Uma vez por descanso, quando um adversário dentro da sua Surveyed Route se move dentro do alcance Próximo ou mais longe, você pode descrever como o terreno se vira contra ele. Ele faz uma Rolagem de Reação (15).</p><p>Em uma falha, o adversário fica temporariamente <em>Imobilizado</em>, ou um veículo fica Damaged, e ele marca 1 Estresse. Em um sucesso, ele marca 1 Estresse.</p>",
          effects: [restrained],
          actions: featureAction({ name: "Bad Ground", img: restrained.img, actionType: "reaction", uses: { max: 1, recovery: "shortRest" }, effects: [restrained] })
        };
      })()],
      mastery: [(() => {
        const zone = targetEffect({ name: "Dead Zone", img: CPR("status/radiation_high"), duration: "scene",
          description: "<p>Dead Zone ativa até a cena terminar ou você sofrer dano Severo: adversários que se movem dentro do alcance Muito Próximo de você marcam 1 Estresse; adversários tratam a área como terreno difícil; ao causar dano a um adversário na zona, some 1d8 de dano físico.</p>" });
        return {
          name: "Dead Zone", img: zone.img, form: "action",
          description: "<p>Uma vez por descanso longo, quando você cria uma Surveyed Route, pode transformá-la numa <strong>Dead Zone</strong> até a cena terminar ou você sofrer dano Severo. Dentro da sua Dead Zone:</p><ul><li>Adversários que se movem dentro do alcance Muito Próximo de você marcam 1 Estresse.</li><li>Adversários tratam a área inteira como terreno difícil.</li><li>Quando você causa dano a um adversário na Dead Zone, some 1d8 de dano físico à rolagem de dano.</li></ul>",
          effects: [zone],
          actions: {
            ...featureAction({ name: "Dead Zone", img: zone.img, uses: { max: 1, recovery: "longRest" }, effects: [zone], target: { type: "self", amount: null } }),
            ...featureAction({ name: "Rolar Dead Zone", dice: "1d8", img: CPR("status/radiation_low"), target: { type: "self", amount: null } })
          }
        };
      })()]
    }
  ]
};

const TRAUMA_DOC = {
  key: "trauma-doc",
  classItems: [
    { name: "Kit de Trauma", img: CPR("gear/medtech_bag"), description: "<p>Um kit de trauma cheio de fármacos e ferramentas ilegais. Metade do conteúdo não tem registro; a outra metade foi registrada no nome de outra pessoa.</p>" },
    { name: "Etiqueta de Paciente", img: CPR("critical_injuries/body_critical_injury"), description: "<p>A etiqueta de paciente manchada de sangue de alguém que você não conseguiu salvar. Você ainda lembra o nome.</p>" }
  ],
  guide: {
    traits: { agility: 1, strength: -1, finesse: 0, instinct: 2, presence: 0, knowledge: 1 },
    primaryWeapon: "Compact SMG", secondaryWeapon: "Tactical Drone", armor: "Ballistic Vest"
  },
  class: {
    name: "Trauma Doc",
    img: CPR("classes/trauma-doc/class-icon.png"),
    description: `<p><strong>Medtech, medicina, cirurgia, sobrevivência</strong><br>"A morte é só uma falha de sistema com uma janela de reparo estreita."</p>
<p><em>Jogue de Trauma Doc se você quiser…</em> Manter a Crew viva, fazer cirurgia no campo de batalha, estabilizar cyberware, usar drones médicos, reanimar aliados e transformar ferimentos num problema que você sabe resolver.</p>
<p>Trauma Docs são médicos de campo, cirurgiões de clínica clandestina e milagreiros do cyberware que sabem manter as pessoas vivas quando o mundo já decidiu que elas deveriam estar mortas.</p>
<p><strong>Itens de Classe:</strong> Um kit de trauma cheio de fármacos e ferramentas ilegais ou a etiqueta de paciente manchada de sangue de alguém que você não conseguiu salvar.</p>
<p><em>Nota: atributos sugeridos e equipamento variam por subclasse — veja a nota de "Build Sugerida" na subclasse escolhida.</em></p>`,
    domains: ["medtech"],
    hitPoints: 5,
    evasion: 10,
    backgroundQuestions: [
      "Quem foi a primeira pessoa que você não conseguiu salvar?",
      "Que procedimento você fez que deveria ter sido impossível?",
      "Que droga, implante ou técnica ilegal você conhece bem demais?"
    ],
    connections: [
      "Quem se recusa a seguir as suas instruções médicas?",
      "Qual personagem sabe o que você faz quando não há suprimentos para todo mundo?",
      "Qual personagem você remendou depois de um trabalho sobre o qual ele ainda não fala?"
    ],
    hopeFeature: (() => {
      const vulnerable = targetEffect({ name: "Stay With Me", img: CPR("status/quickfix"), statuses: ["vulnerable"], duration: "scene",
        description: "<p>Mantido vivo pelo Stay With Me: temporariamente Vulnerável até receber atendimento médico ou a cena terminar.</p>" });
      return {
        name: "Stay With Me", img: vulnerable.img, form: "reaction",
        description: "<p>Gaste 3 Esperança quando uma criatura dentro do alcance Próximo fosse marcar o último Ponto de Vida não marcado ou fazer um Movimento de Morte. Ela não sofre as consequências do Movimento de Morte e continua viva e consciente, limpando 1 Ponto de Vida, mas fica temporariamente <em>Vulnerável</em> até receber atendimento médico ou a cena terminar.</p>",
        effects: [vulnerable],
        actions: featureAction({ name: "Stay With Me", img: vulnerable.img, actionType: "reaction", costs: [{ key: "hope", value: 3 }], effects: [vulnerable], target: { type: "friendly", amount: 1 } })
      };
    })(),
    classFeatures: [{
      name: "Emergency Medicine", img: CPR("gear/medscanner"), form: "action",
      description: "<p>Quando você tem um momento para tratar uma criatura dentro do alcance Corpo a Corpo, faça uma Rolagem de Interface (12). Em um sucesso, escolha uma:</p><ul><li>O alvo limpa 1 Estresse.</li><li>O alvo limpa uma condição física temporária, como <em>Vulnerável</em> ou <em>Imobilizado</em>.</li><li>O alvo estabiliza um implante danificado, sistema de suporte de vida ou componente de cyberware até o próximo descanso dele.</li></ul><p>Uma vez por descanso, quando você tem sucesso nessa rolagem, o alvo pode limpar 1 Ponto de Vida além de escolher um dos efeitos acima. Uma criatura só pode limpar um Ponto de Vida com Emergency Medicine uma vez por descanso.</p><p><em>Na ficha: \"Emergency Medicine\" faz a Rolagem de Interface (12); \"Limpar 1 PV\" controla o uso por descanso.</em></p>",
      actions: {
        ...withActionId(buildCardAction({ name: "Emergency Medicine", img: CPR("gear/medscanner"), difficulty: 12, range: "Melee", targetType: "friendly", targetAmount: 1 })),
        ...featureAction({ name: "Limpar 1 PV", img: CPR("status/antibiotics"), uses: { max: 1, recovery: "shortRest" }, target: { type: "friendly", amount: 1 } })
      }
    }]
  },
  subclasses: [
    {
      name: "Combat Medic", img: CPR("classes/trauma-doc/subclasses/combat-medic.png"),
      description: `<p><em>Jogue de Combat Medic se você quiser manter a Crew viva e fazer tratamentos de emergência no meio do combate.</em></p>
<p><strong>Build Sugerida:</strong> Instinto +2, Agilidade +1, Conhecimento +1, Acuidade 0, Presença 0, Força −1. Equipamento recomendado: Compact SMG (primária, uma mão) + Tactical Drone (secundária, de Instinto) + Ballistic Vest — mobilidade para chegar até quem caiu.</p>`,
      spellcastingTrait: "instinct",
      suggestedTraits: { agility: 1, strength: -1, finesse: 0, instinct: 2, presence: 0, knowledge: 1 },
      foundation: [
        {
          name: "Rapid Response", img: CPR("drugs/stim"), form: "reaction",
          description: "<p>Quando um aliado dentro do alcance Próximo marca um ou mais Pontos de Vida, você pode marcar 1 Estresse para se mover imediatamente até o alcance Corpo a Corpo dele. Na próxima vez que usar Emergency Medicine nesse aliado antes de a cena terminar, você rola com vantagem.</p>",
          actions: featureAction({ name: "Rapid Response", img: CPR("drugs/stim"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], target: { type: "friendly", amount: 1 } })
        },
        {
          name: "Field Extraction", img: CPR("gear/inflatable_bed_and_sleepingbag"), form: "passive",
          description: "<p>Quando você usa Emergency Medicine com sucesso numa criatura, pode movê-la imediatamente dentro do alcance Muito Próximo. Esse movimento pode colocá-la atrás de cobertura, fora do perigo imediato ou longe da visão inimiga.</p>"
        }
      ],
      specialization: [{
        name: "Mass Casualty Protocol", img: CPR("cyberware/medscanner"), form: "action",
        description: "<p>Uma vez por descanso, quando você usa Emergency Medicine com sucesso, também pode tratar uma segunda criatura dentro do alcance Muito Próximo do alvo original.</p>",
        actions: featureAction({ name: "Mass Casualty Protocol", img: CPR("cyberware/medscanner"), uses: { max: 1, recovery: "shortRest" }, target: { type: "friendly", amount: 1 } })
      }],
      mastery: [{
        name: "Combat Triage", img: CPR("cyberware/biomonitor"), form: "action",
        description: "<p>Uma vez por descanso longo, quando uma cena perigosa começa ou quando um aliado dentro do alcance Distante marca um ou mais Pontos de Vida, você pode dar uma ordem de triagem. Escolha até três aliados dentro do alcance Distante que possam te ouvir, te ver ou receber o seu sinal. Cada aliado escolhido pode se mover imediatamente dentro do alcance Muito Próximo e depois escolher uma:</p><ul><li>Limpar 1 Ponto de Vida e 1 Estresse.</li><li>Limpar uma condição física temporária.</li><li>Ganhar +2 na próxima rolagem.</li></ul>",
        actions: featureAction({ name: "Combat Triage", img: CPR("cyberware/biomonitor"), uses: { max: 1, recovery: "longRest" }, target: { type: "friendly", amount: 3 } })
      }]
    },
    {
      name: "Street Surgeon", img: CPR("classes/trauma-doc/subclasses/street-surgeon.png"),
      description: `<p><em>Jogue de Street Surgeon se você quiser usar medicina ilegal, remendos de cyberware, procedimentos de clínica clandestina e estimulantes perigosos para levar corpos além dos limites seguros.</em></p>
<p><strong>Build Sugerida:</strong> Conhecimento +2, Acuidade +1, Instinto +1, Agilidade 0, Presença 0, Força −1. Equipamento recomendado: Scrap Launcher (primária, duas mãos, de Conhecimento) + Synthleather Jacket — o mesmo atributo para atacar e para os protocolos.</p>`,
      spellcastingTrait: "knowledge",
      suggestedTraits: { agility: 0, strength: -1, finesse: 1, instinct: 1, presence: 0, knowledge: 2 },
      foundation: [{
        name: "Black-Clinic Procedure", img: CPR("gear/generic_street_drugs"), form: "action",
        description: "<p>Quando você usa Emergency Medicine com sucesso numa criatura, pode dar a ela um aprimoramento perigoso além do efeito normal. Escolha um:</p><ul><li>Ela soma 1d8 à próxima rolagem de dano.</li><li>Ela ganha +2 na próxima Rolagem de Agilidade, Força ou Acuidade.</li><li>Ela ganha +2 de Evasão contra o próximo ataque que a tiver como alvo.</li></ul><p>Depois que a rolagem ou efeito aprimorado se resolver, ela marca 1 Estresse.</p><p><em>Na ficha: \"Rolar 1d8\" rola o dano extra da primeira opção.</em></p>",
        actions: featureAction({ name: "Rolar 1d8", dice: "1d8", img: CPR("gear/generic_street_drugs"), target: { type: "self", amount: null } })
      }],
      specialization: [{
        name: "Bad Medicine", img: CPR("gear/vial_poison"), form: "action",
        description: "<p>Uma vez por descanso, quando você tem sucesso com uma carta de Medtech, ataque com arma ou Rolagem de Interface contra um adversário dentro do alcance Próximo, pode virar o seu conhecimento médico contra ele.</p><p>O alvo marca 1 Estresse. Na próxima vez que esse alvo causar dano, reduza o dano em 1 Ponto de Vida.</p>",
        actions: featureAction({ name: "Bad Medicine", img: CPR("gear/vial_poison"), uses: { max: 1, recovery: "shortRest" }, target: { type: "hostile", amount: 1 } })
      }],
      mastery: [{
        name: "Miracle Cocktail", img: CPR("dlc/gear/distilling_compound"), form: "action",
        description: "<p>Uma vez por descanso longo, quando você usa Emergency Medicine com sucesso numa criatura, pode inundar o corpo dela com estabilizantes ilegais, drogas de combate, bloqueadores nervosos ou comandos de emergência de cyberware.</p><p>Além dos benefícios normais da Emergency Medicine, o alvo pode se mover imediatamente dentro do alcance Próximo e fazer uma rolagem de ação com vantagem. Se essa ação causar dano, some 2d8 à rolagem de dano.</p><p><em>Na ficha: a ação controla o uso e rola os 2d8.</em></p>",
        actions: featureAction({ name: "Miracle Cocktail", dice: "2d8", img: CPR("dlc/gear/distilling_compound"), uses: { max: 1, recovery: "longRest" }, target: { type: "friendly", amount: 1 } })
      }]
    }
  ]
};

// Classes importadas, na ordem em que aparecem nos compêndios.
const CLASSES = [RUNNER, INFILTRATOR, SOLO, AUGMENTED, TECH, BROKER, RECLAIMER, TRAUMA_DOC, WARDEN];

// ---------- Life Paths (substituem Ancestry) e Affiliations (substituem Community) ----------

const LIFE_PATHS = [
  {
    name: "Criação Corporativa",
    description: "<p>Você foi criado dentro da estrutura corporativa. Você entende de violência polida, contratos, etiqueta, conforto artificial e a linguagem de pessoas que acreditam ser donas do futuro.</p>",
    primary: { name: "Design Corporativo", description: "<p>Escolha uma de suas Experiências ligada a treinamento corporativo, educação, etiqueta, segurança, finanças ou burocracia. Ganhe um bônus permanente de +1 nela.</p>" },
    secondary: { name: "Rotina Eficiente", description: "<p>Quando você faz um descanso curto, você pode escolher uma ação de descanso longo em vez de uma ação de descanso curto.</p>" }
  },
  {
    name: "Nascido nas Ruas",
    description: "<p>Você cresceu nas ruas, becos e distritos de gangues da Nova Idade das Trevas. Você aprendeu a ler o perigo antes que ele fale.</p>",
    primary: {
      name: "Reflexos de Beco",
      description: "<p>Quando você faz uma Rolagem de Agilidade, você pode gastar 2 Esperança para re-rolar seu Dado de Esperança.</p>",
      actions: costAction({ name: "Re-rolar Dado de Esperança", cost: { key: "hope", value: 2 }, description: "<p>Re-role seu Dado de Esperança em uma Rolagem de Agilidade.</p>" })
    },
    secondary: { name: "Golpe Sujo", description: "<p>Quando você tem sucesso em um ataque contra um alvo dentro do alcance Muito Próximo usando uma arma improvisada, lâmina escondida, truque sujo ou tática de rua, você pode gastar 1 Esperança para torná-lo temporariamente Vulnerável.</p>" }
  },
  {
    name: "Nômade",
    description: "<p>Você vem de clãs de estrada, famílias de comboio, ou pessoas que sobreviveram por nunca deixar que as possuíssem. Você conhece motores, rotas e o valor da família escolhida na estrada.</p>",
    primary: { name: "Arrancada na Estrada", description: "<p>Quando você tem sucesso em uma Rolagem de Agilidade ou rolagem de veículo para se mover de um alcance Distante ou Muito Distante até o alcance Corpo a Corpo com um ou mais alvos, você pode marcar 1 Estresse para causar 1d12 de dano físico a todos os alvos dentro do alcance Corpo a Corpo.</p>" },
    secondary: { name: "Nascido Fora de Estrada", description: "<p>Você pode se mover naturalmente por escombros, estradas quebradas, lama, areia, água rasa, destroços e terreno instável.</p>" }
  },
  {
    name: "Excedente Militar",
    description: "<p>Você foi treinado por um exército corporativo, bando de gangue, ou força nacional colapsada. Talvez você tenha desertado. Talvez sua unidade tenha sido vendida. Talvez você seja o único que restou.</p>",
    primary: {
      name: "Reações de Combate",
      description: "<p>Marque 1 Estresse para ganhar vantagem em uma Rolagem de Reação.</p>",
      actions: costAction({ name: "Reações de Combate", cost: { key: "stress", value: 1 }, description: "<p>Ganhe vantagem na sua próxima Rolagem de Reação.</p>" })
    },
    secondary: { name: "Último de Pé", description: "<p>Quando você tem 1 Ponto de Vida restante, ataques contra você têm desvantagem.</p>" }
  },
  {
    name: "Sobrevivente de Clínica Clandestina",
    description: "<p>Você foi reconstruído em uma clínica ilegal, ala de trauma experimental, oficina clandestina, mercado de órgãos, covil de cyberware, ou fosso cirúrgico de emergência. Seu corpo carrega o preço da sobrevivência.</p>",
    primary: { name: "Tecido Cicatricial", description: "<p>Quando você fosse marcar um Ponto de Vida ou Estresse por dano físico, role um d6. Em um 6, não marque.</p>" },
    secondary: { name: "Reconstrução de Emergência", description: "<p>Quando você fosse sofrer dano Severo, você pode marcar 1 Estresse para marcar 1 Ponto de Vida a menos.</p>" }
  },
  {
    name: "Nativo do Ermo",
    description: "<p>Você vem de uma zona morta ou lugar que a cidade finge não existir. Você sabe que sobrevivência não é sorte. É atenção.</p>",
    primary: { name: "Forjado no Perigo", description: "<p>Você pode respirar, se mover e agir naturalmente em fumaça, cinzas, poeira, ar poluído, água rasa, chuva forte, fedor tóxico ou terreno instável, a menos que seja imediatamente letal.</p>" },
    secondary: {
      name: "Duro como Aço",
      description: "<p>Ganhe um bônus em seus limiares de dano igual à sua Proficiência.</p>",
      effects: [{
        name: "Duro como Aço",
        img: ICONS.features["Duro como Aço"],
        description: "<p>Ganhe um bônus em seus limiares de dano igual à sua Proficiência.</p>",
        transfer: true,
        type: "base",
        system: {
          changes: [
            { key: "system.damageThresholds.major", type: "add", value: "@system.proficiency", priority: null, phase: "initial" },
            { key: "system.damageThresholds.severe", type: "add", value: "@system.proficiency", priority: null, phase: "initial" }
          ],
          duration: { description: "" },
          rangeDependence: null, stacking: null, targetDispositions: [], conditionals: []
        },
        duration: { value: null, units: "seconds", expiry: null, expired: false },
        tint: "#ffffff", statuses: [], disabled: false
      }]
    }
  }
];

const AFFILIATIONS = [
  { name: "Ativo Corporativo", description: "<p>Você está conectado a uma corporação como funcionário, mercenário patrocinado, ou ex-membro interno.</p>", feature: { name: "Privilégio de Elite", description: "<p>Você tem vantagem em rolagens para se relacionar com funcionários corporativos, se passar por autorizado, ou usar a reputação da sua empresa para conseguir o que quer.</p>" } },
  { name: "Ligado a uma Gangue", description: "<p>Você está conectado a uma gangue, família de rua, ou poder local violento.</p>", feature: { name: "Sagacidade de Rua", description: "<p>Você tem vantagem em rolagens para negociar com criminosos, detectar mentiras, reconhecer sinais de gangue, ou achar um lugar seguro para se esconder em território criminoso.</p>" } },
  { name: "Comboio Nômade", description: "<p>Você está conectado a um comboio, clã de estrada, ou rota do ermo.</p>", feature: { name: "Lei da Estrada", description: "<p>Registre três regras, códigos, ou protocolos que seu comboio gravou em você. Uma vez por descanso, quando você descreve como está incorporando um desses princípios através da sua ação atual, você pode rolar um d20 como seu Dado de Esperança.</p>" } },
  { name: "Rede de Mercenários", description: "<p>Você está conectado a uma companhia mercenária, quadro de trabalhos, ou rede profissional de armas de aluguel.</p>", feature: { name: "Sem Amarras", description: "<p>Uma vez por sessão, quando você faz uma rolagem de ação com Medo, você pode trocá-la por uma rolagem com Esperança.</p>" } },
  { name: "Clínica Clandestina", description: "<p>Você está conectado a um médico de rua, clínica ilegal, ou anel médico clandestino de cyberware.</p>", feature: { name: "Chillax", description: "<p>Durante um descanso curto, você ou um aliado pode re-rolar um dado usado em uma ação de recuperação, reparo, ou tempo livre relacionada a cyberware.</p>" } },
  { name: "Rede de Fixers", description: "<p>Você está conectado a vendedores de informação, intermediários de trabalhos, e pessoas que conhecem alguém que conhece alguém.</p>", feature: { name: "Conhece o Jogo", description: "<p>Você tem um sexto sentido para lidar com as incertezas da sua profissão. Quando você rola com Medo, coloque um marcador nesta Afiliação. Você pode guardar um número de marcadores igual ao seu nível. Antes de fazer uma rolagem de ação, você pode gastar qualquer número desses marcadores para ganhar um bônus de +1 na rolagem para cada marcador gasto. No fim de cada sessão, limpe todos os marcadores não usados.</p>" } },
  { name: "Célula de Resistência", description: "<p>Você está conectado a rebeldes, organizadores trabalhistas, ou células anticorporativas.</p>", feature: { name: "Família Encontrada", description: "<p>Uma vez por sessão, você pode gastar 1 Esperança para usar o Talento de Afiliação de um aliado. Quando fizer isso, seu aliado ganha 1 Esperança.</p>" } },
  { name: "Culto de Dados", description: "<p>Você está conectado a místicos digitais, garimpeiros da Old Net, obcecados pela Blackwall, arquivistas desonestos, profetas de sinal, ou pessoas que acreditam que a máquina é assombrada.</p>", feature: { name: "Padrão Proibido", description: "<p>Sua conexão com dados corrompidos, sinais de IA desonesta, resíduo da Blackwall, sinais impossíveis, ou tecnologia perdida pode ter alterado sua percepção da realidade. Você pode gastar 2 Esperança para re-rolar seu Dado de Medo.</p>" } }
];

async function importLifePathsAndAffiliations() {
  const ancestriesPack = await getOrCreatePack("ancestries");
  const communitiesPack = await getOrCreatePack("communities");

  // Igual ao SRD oficial: uma única pasta "Features" flat com todas as features,
  // e os itens principais (Life Path / Affiliation) soltos na raiz do compêndio.
  const lifePathFeaturesFolder = await makeFolder(ancestriesPack, "Talentos de Trajetória");
  const affiliationFeaturesFolder = await makeFolder(communitiesPack, "Talentos de Afiliação");

  for (const lp of LIFE_PATHS) {
    const [primaryItem, secondaryItem] = await createFeatureItems(ancestriesPack, [lp.primary, lp.secondary], lifePathFeaturesFolder.id, `lifepath:${lp.name}`);
    await Item.createDocuments([{
      _id: stableId(`lifepath:${lp.name}`),
      name: lp.name, type: "ancestry", img: ICONS.lifePaths[lp.name] ?? "icons/svg/village.svg",
      system: {
        description: lp.description,
        features: [
          { type: "primary", item: primaryItem.uuid },
          { type: "secondary", item: secondaryItem.uuid }
        ],
        attribution: { source: "Edgeheart (homebrew)", page: null, artist: "" },
        loreReference: lp.name.toLowerCase().replace(/[^a-z]+/g, "-"),
        gmNotes: ""
      }
    }], { pack: ancestriesPack.collection, keepId: true });
  }

  for (const aff of AFFILIATIONS) {
    const [featureItem] = await createFeatureItems(communitiesPack, [aff.feature], affiliationFeaturesFolder.id, `affiliation:${aff.name}`);
    await Item.createDocuments([{
      _id: stableId(`affiliation:${aff.name}`),
      name: aff.name, type: "community", img: ICONS.affiliations[aff.name] ?? "icons/svg/anchor.svg",
      system: {
        description: aff.description,
        features: [featureItem.uuid],
        attribution: { source: "Edgeheart (homebrew)", page: null, artist: "" },
        loreReference: aff.name.toLowerCase().replace(/[^a-z]+/g, "-"),
        gmNotes: ""
      }
    }], { pack: communitiesPack.collection, keepId: true });
  }
}

// ---------- Domain Cards: Network (competência do Runner) ----------
// "Protocol"/"Protocol Suite" do Edgeheart = type "spell"; "Ability" = type "ability"

// Constrói uma ação de carta de domínio no schema REAL confirmado no bundle do sistema
// (game.system.api.models.actions.actionsTypes.attack / DHActionRollData):
// - roll.type "spellcast" + roll.trait null faz o sistema usar automaticamente o atributo
//   de spellcast da CLASSE/SUBCLASSE ativa do personagem (actor.system.spellcastModifierTrait),
//   então funciona igual pras duas subclasses do Runner mesmo elas usando traits diferentes
//   pra "Interface" (knowledge vs instinct).
// - damageStr null e sem scaleDamage = ação só com botão de rolagem (dano fica manual), usado
//   quando o dano é condicional ou a dificuldade não é fixa (ex: dificuldade = resultado da
//   própria rolagem), igual o SRD faz com cartas de escolha livre (ex: "Get Back Up").
// - scaleDamage + cost escalável = mesmo mecanismo do "Slayer Die" oficial (Martial Preparation):
//   multiplier "scale" faz a fórmula de dano virar "@scale d10", onde @scale é a quantidade
//   escolhida no custo escalável (ex: marcadores gastos) no momento de usar a ação.
// - damageStr usa multiplier "flat" com flatMultiplier = quantidade de dados, igual às magias
//   oficiais (Chain Lightning "2d8+4" = flat x2). Com "prof" o dano escalava com a Proficiência.
// - save = Rolagem de Reação do alvo. difficulty null = Dificuldade igual ao resultado da sua
//   rolagem (Chain Lightning); damageMod "half" = metade do dano no sucesso (Earthquake).
// - trait: rolagem de atributo (ex: "instinct") em vez de Rolagem de Interface; effects: efeitos
//   do item (targetEffect) aplicados nos alvos pela ação; img: ícone da ação.
function buildCardAction({
  actionType = "action", difficulty = null, damageStr = null, scaleDamage = null,
  range = null, targetType = "hostile", targetAmount = null, cost = [], uses = null,
  save = null, name = null, damageFormula = null, trait = null, effects = [], img = null
} = {}) {
  const dmg = damageStr ? parseDamage(damageStr) : null;
  // damageFormula: { formula, dmgType } para dano que não cabe em "XdY+Z" (ex: por Estresse
  // gasto: "(@scale)d20 + 2*@scale"; @scale = total do custo escalável, ver Action.getRollData).
  const damageValue = dmg
    ? { dice: dmg.dice, bonus: dmg.bonus, multiplier: "flat", flatMultiplier: dmg.count, custom: { enabled: false, formula: "" }, type: [dmg.dmgType] }
    : scaleDamage
      ? { dice: scaleDamage.dice, bonus: null, multiplier: "scale", flatMultiplier: 1, custom: { enabled: false, formula: "" }, type: [scaleDamage.dmgType] }
      : damageFormula
        ? { dice: "d6", bonus: null, multiplier: "flat", flatMultiplier: 1, custom: { enabled: true, formula: damageFormula.formula }, type: [damageFormula.dmgType] }
        : null;
  return {
    name: name ?? (actionType === "reaction" ? "Rolagem de Reação" : "Rolagem de Interface"),
    img: img ?? "icons/skills/trades/academics-merchant-scribe.webp",
    baseAction: true,
    systemPath: "actions",
    type: "attack",
    range: range ? (RANGE_MAP[range] || "melee") : "",
    target: { type: targetType, amount: targetAmount },
    roll: {
      trait,
      type: trait ? "trait" : "spellcast",
      difficulty,
      bonus: null,
      advState: "neutral",
      diceRolling: { multiplier: "prof", flatMultiplier: 1, dice: "d20", compare: null, treshold: null },
      useDefault: false
    },
    damage: damageValue ? {
      main: {
        value: { dice: damageValue.dice, bonus: damageValue.bonus, multiplier: damageValue.multiplier, flatMultiplier: damageValue.flatMultiplier, custom: damageValue.custom },
        type: damageValue.type,
        applyTo: "hitPoints",
        resultBased: false,
        valueAlt: { multiplier: "prof", flatMultiplier: 1, dice: "d6", bonus: null, custom: { enabled: false, formula: "" } },
        base: false, includeBase: false, direct: false, fullRestore: false, itemId: null
      },
      resources: {}
    } : { main: null, resources: {} },
    description: "",
    chatDisplay: true,
    actionType,
    cost: cost.map(c => ({ scalable: false, step: null, consumeOnSuccess: false, itemId: null, ...c })),
    uses: uses
      ? { value: null, max: String(uses.max), recovery: uses.recovery, consumeOnSuccess: !!uses.onSuccess }
      : { value: null, max: null, recovery: null, consumeOnSuccess: false },
    effects: effects.map(e => ({ _id: e._id, onSave: false })),
    save: save ?? { trait: null, difficulty: null, damageMod: "none" },
    originItem: { type: "itemCollection" },
    triggers: [],
    areas: []
  };
}

// O _id de cada carta é stableId(`card:<domínio>:<nome>`) (ver importDomainCards).
const cardId = (domain, name) => stableId(`card:${domain}:${name}`);

// Network: releituras das cartas oficiais de Arcana (15 cartas) e de outros domínios: Threat Prediction =
// Untouchable (Bone), Shared Feed = Tactician (Bone), Perceptual Spyware = Through Your Eyes (Grace),
// Defensive Protocols = Book of Grynn (Codex), Deep Trace = Dark Whispers (Midnight), Retaliation Daemon =
// Sigil of Retribution (Codex). patch ajusta a cópia onde o PDF muda os números da carta oficial.
const NETWORK_CARDS = [
  { name: "Personal Firewall", img: CPR("programs/shield"), level: 1, recallCost: 0, type: "spell", clone: "Rune Ward",
    // PDF: Dado do Firewall d12 (a Rune Ward usa d8).
    patch: c => Object.values(c.actions).forEach(a => { if (a.roll?.diceRolling) a.roll.diceRolling.dice = "d12"; }),
    description: "<p>Você tem um dispositivo criptografado que pode ser carregado com um firewall defensivo e segurado por você ou um aliado. Descreva o que é e por que ele importa para você.</p><p>Quem segura o firewall pode gastar 1 Esperança para reduzir o dano techno recebido em 1d12. Se o resultado do Dado do Firewall for 12, o firewall queima depois de reduzir o dano neste turno. Ele pode ser recarregado de graça no seu próximo descanso.</p>" },
  { name: "Signal Burst", img: CPR("programs/hellbolt"), level: 1, recallCost: 1, type: "spell", clone: "Unleash Chaos",
    patch: c => { if (c.resource) c.resource.icon = CPR("programs/hellbolt"); },
    description: "<p>No início de uma sessão, coloque marcadores iguais ao seu atributo de Interface nesta carta.</p><p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante e gaste qualquer número de marcadores para liberar uma explosão concentrada de código instável, ruído de sinal, ou feedback armado contra ele. Em um sucesso, role um número de d10 igual aos marcadores gastos e cause essa quantidade de dano techno ao alvo.</p><p>Marque 1 Estresse para reabastecer esta carta com marcadores, até o seu atributo de Interface. No fim de cada sessão, limpe todos os marcadores não usados.</p>" },
  { name: "Threat Prediction", img: CPR("cyberware/sensor_array"), level: 1, recallCost: 1, type: "ability", clone: "Untouchable",
    // PDF: metade do atributo de Interface (@cast) em vez de metade da Agilidade. @cast = atributo de
    // spellcast da subclasse no rollData (não usar @system.spellcastModifier, que é getter).
    patch: c => c.effects.forEach(e => (e.system?.changes ?? []).forEach(ch => { if (ch.key === "system.evasion") ch.value = "ceil(@cast / 2)"; })),
    description: "<p>Seu software de predição analisa constantemente movimentos hostis ao seu redor. Ganhe um bônus na sua Evasão igual à metade do seu atributo de Interface.</p>" },
  { name: "Thermal Hijack", img: CPR("programs/efreet"), level: 2, recallCost: 1, type: "spell", clone: "Cinder Grasp",
    actionNames: { "On Fire: Damage": "Dano de Overheated" }, effectNames: { "On Fire": "Overheated" },
    description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Corpo a Corpo. Em um sucesso, você força as portas de implante dele a superaquecerem violentamente. Ele sofre 1d20+3 de dano techno e fica Overheated.</p><p>Quando uma criatura age enquanto Overheated, ela deve sofrer 2d6 de dano techno extra se ainda estiver Overheated no fim de sua ação.</p>" },
  { name: "Ghost Ping", img: CPR("blackice/src/wisp"), level: 2, recallCost: 0, type: "spell", clone: "Floating Eye",
    // O texto pede 1 Esperança; a ação oficial não cobra.
    patch: c => Object.values(c.actions).forEach(a => { a.cost = [{ scalable: false, key: "hope", value: 1, step: null, consumeOnSuccess: false, itemId: null }]; }),
    description: "<p>Gaste 1 Esperança para liberar uma aranha de sinal oculta em uma rede que você pode mover para qualquer lugar dentro do alcance Muito Distante.</p><p>Enquanto este protocolo estiver ativo, você pode ver ou ouvir através de um dispositivo ou feed conectado dentro dessa rede como se estivesse lá. Você pode alternar livremente entre usar seus próprios sentidos e ver através da aranha.</p><p>Se a rede for cortada, purgada, ficar totalmente offline, ou for protegida por um sistema hostil mais forte, este protocolo termina.</p>" },
  { name: "Countermeasure", img: CPR("programs/eraser"), level: 3, recallCost: 2, type: "spell", clone: "Counterspell", description: "<p>Você pode interromper um efeito tecnológico ou digital em andamento fazendo uma Rolagem de Reação usando seu atributo de Interface. Em um sucesso, o efeito para e quaisquer consequências são evitadas, e esta carta é colocada no seu cofre.</p>" },
  { name: "Shared Feed", img: CPR("netrunning/Control_Node.png"), level: 3, recallCost: 1, type: "ability", clone: "Tactician", description: "<p>Quando você Ajuda um Aliado, ele pode gastar 1 Esperança para adicionar uma de suas Experiências à rolagem dele junto com seu dado de vantagem.</p><p>Ao fazer uma Rolagem em Dupla, você pode rolar um d20 como seu Dado de Esperança.</p>" },
  { name: "Perceptual Spyware", img: CPR("cyberware/cybereye"), level: 4, recallCost: 1, type: "spell", clone: "Through Your Eyes", description: "<p>Escolha um alvo dentro do alcance Muito Distante. Você pode ver através dos olhos dele e ouvir através dos ouvidos dele por meio de um feed sensorial invadido, ponte neural, implante de vigilância, ou parasita de sinal. Você pode alternar livremente entre seus próprios sentidos ou os do alvo até rodar outro protocolo ou até seu próximo descanso.</p>" },
  { name: "Defensive Protocols", img: CPR("programs/armor"), level: 4, recallCost: 2, type: "spell", clone: "Book of Grynn",
    actionNames: { "Arcane Deflection": "Arc-Deflection", "Time Lock": "Routine Lock", "Wall Of Flame": "Fire-Wall" },
    description: "<p><strong>Arc-Deflection:</strong> Uma vez por descanso longo, gaste 1 Esperança para anular o dano de um ataque que te atinja ou atinja um aliado dentro do alcance Muito Próximo.</p><p><strong>Routine Lock:</strong> Escolha um objeto dentro do alcance Distante. A rotina de operação daquele objeto é interrompida exatamente onde está até seu próximo descanso. Se uma criatura tentar reativá-lo, faça uma Rolagem de Interface contra ela para manter este protocolo.</p><p><strong>Fire-Wall:</strong> Faça uma Rolagem de Interface (15). Em um sucesso, crie uma parede de sinal hostil, plasma em chamas, código de luz sólida, ou supressão automatizada entre dois pontos dentro do alcance Distante. Todas as criaturas em seu caminho devem escolher um lado, e qualquer coisa que atravesse a parede depois sofre 4d10+3 de dano techno.</p>" },
  { name: "Predictive Algorithm", img: CPR("status/timewarp"), level: 5, recallCost: 2, type: "spell", clone: "Premonition", description: "<p>Você pode rodar modelos preditivos para vislumbrar as consequências mais prováveis de suas ações. Uma vez por descanso longo, imediatamente depois que o mestre transmitir as consequências de uma rolagem que você fez, você pode desfazer a ação e as consequências como se nunca tivessem acontecido e fazer outra ação.</p>" },
  { name: "Viral Cascade", img: CPR("programs/worm"), level: 5, recallCost: 1, type: "spell", clone: "Chain Lightning", description: "<p>Marque 2 Estresse para fazer uma Rolagem de Interface, desencadeando um ataque autorreplicante em todos os alvos dentro do alcance Próximo. Alvos contra os quais você tem sucesso devem fazer uma Rolagem de Reação com Dificuldade igual ao resultado da sua Rolagem de Interface. Alvos que falharem sofrem 2d8+4 de dano techno.</p><p>Adversários adicionais ainda não alvejados pela Viral Cascade e dentro do alcance Próximo de alvos anteriores que sofreram dano também devem fazer a Rolagem de Reação. Alvos que falharem sofrem 2d8+4 de dano techno. Essa corrente continua até não haver mais adversários dentro do alcance.</p>" },
  { name: "Deep Trace", img: CPR("cyberware/homing_tracer"), level: 6, recallCost: 0, type: "spell", clone: "Dark Whispers", description: "<p>Você pode abrir um canal de sinal com qualquer pessoa com quem já tenha feito contato. Depois de abrir um canal com ela, ela pode responder na sua mente, comunicador ou feed neural.</p><p>Além disso, você pode marcar 1 Estresse para fazer uma Rolagem de Interface contra ela. Em um sucesso, você recebe a resposta de uma destas perguntas:</p><ol><li>Onde ela está?</li><li>O que ela está fazendo?</li><li>Do que ela tem medo?</li><li>O que ela mais valoriza?</li></ol>" },
  { name: "Retaliation Daemon", img: CPR("default/default-demon"), level: 6, recallCost: 2, type: "spell", clone: "Sigil of Retribution", description: "<p>Marque um adversário dentro do alcance Próximo com um daemon. O mestre ganha 1 Medo.</p><p>Quando o adversário marcado causar dano a você ou a seus aliados, coloque um d8 nesta carta. Você pode guardar um número de d8 igual ao seu nível.</p><p>Quando você acertar o adversário marcado, role os dados desta carta e some ao seu dano, depois limpe os dados.</p><p>Este efeito termina quando o adversário marcado é derrotado ou quando você roda o Retaliation Daemon de novo.</p>" },
  { name: "Optical Scrambler", img: CPR("status/hidden"), level: 7, recallCost: 2, type: "spell", clone: "Cloaking Blast", description: "<p>Quando você tem sucesso em uma Rolagem de Interface para rodar um protocolo diferente, você pode gastar 1 Esperança para ficar Cloaked.</p><p>Enquanto Cloaked, você permanece sem ser visto se estiver parado quando alguém se mover para onde poderia te ver. Quando você se move para dentro ou dentro da linha de visão de um adversário, ou faz um ataque, você deixa de estar Cloaked.</p>" },
  { name: "Network-Synced", img: CPR("default/Default_Net_Architecture"), level: 7, recallCost: 2, type: "ability", clone: "Arcana-Touched", description: "<p>Quando 4 ou mais cartas de domínio no seu loadout forem da Competência Network, ganhe o seguinte:</p><ul><li>+1 de bônus nas suas Rolagens de Interface.</li><li>Uma vez por descanso, você pode trocar os resultados dos seus Dados de Esperança e Medo.</li></ul>" },
  { name: "Mirror Stack", img: CPR("cyberware/plastic_covering"), level: 8, recallCost: 2, type: "spell", clone: "Confusing Aura", description: "<p>Faça uma Rolagem de Interface (14). Uma vez por descanso longo, em um sucesso, você cria uma pilha de perfis de mira falsos, fantasmas de RA, ecos de sinal, loops de movimento ou dados de mira falsos sobre seu corpo, que tornam difícil dizer exatamente onde você está.</p><p>Marque qualquer quantidade de Estresse para criar essa mesma quantidade de camadas adicionais.</p><p>Quando um adversário faz um ataque contra você, role um número de d6 igual ao número de camadas ativas. Se algum resultado for 5 ou mais, uma camada do loop de iscas é destruída e o ataque falha. Se todos os resultados forem 4 ou menos, você sofre o dano e este protocolo termina.</p>" },
  { name: "Signal Rebound", img: CPR("cyberware/hardend_shielding"), level: 8, recallCost: 1, type: "spell", clone: "Arcane Reflection", description: "<p>Quando você fosse sofrer dano techno, você pode gastar qualquer quantidade de Esperança para rolar essa mesma quantidade de d6. Se algum resultado for 6, o ataque é refletido de volta ao atacante, causando o dano a ele em vez de a você.</p>" },
  { name: "Remote Trojan", img: CPR("programs/imp"), level: 9, recallCost: 0, type: "spell", clone: "Sensory Projection", description: "<p>Uma vez por descanso, faça uma Rolagem de Interface (15). Em um sucesso, você entra em um spyware remoto que te permite ver e ouvir claramente qualquer lugar onde você já esteve, como se estivesse lá neste momento.</p><p>Você pode se mover livremente neste spyware e não está limitado pela física ou pelos impedimentos de um corpo físico. Este protocolo não pode ser detectado por meios mundanos ou tecnológicos. Você sai deste feed ao sofrer dano ou ao rodar outro protocolo.</p>" },
  { name: "Hard Shutdown", img: CPR("status/emp"), level: 9, recallCost: 2, type: "spell", clone: "Earthquake", damageType: "magical",
    // PDF: Rolagem de Interface (16) e dano techno (o Earthquake é físico).
    patch: c => Object.values(c.actions).forEach(a => { if (a.roll?.type === "spellcast") a.roll.difficulty = 16; }),
    description: "<p>Faça uma Rolagem de Interface (16). Uma vez por descanso, em um sucesso, todos os alvos dentro do alcance Muito Distante fazem uma Rolagem de Reação (18). Alvos que falharem sofrem 3d10+8 de dano techno e ficam temporariamente Vulneráveis. Alvos que tiverem sucesso sofrem metade do dano.</p><p>Além disso, quando você tem sucesso na Rolagem de Interface, todo o terreno dentro do alcance Muito Distante fica Offline. Enquanto dentro de uma área Offline, os alvos não podem gastar Medo, e rolagens com Medo não geram Medo para o mestre.</p>" },
  { name: "Botnet Cataclysm", img: CPR("blackice/src/dragon"), level: 10, recallCost: 1, type: "spell", clone: "Falling Sky", damageType: "physical", description: "<p>Faça uma Rolagem de Interface contra todos os adversários dentro do alcance Distante. Marque qualquer quantidade de Estresse para acordar cada processo comprometido, credencial roubada, vírus antigo, dispositivo sequestrado, servidor corrompido, conta morta e daemon adormecido que você plantou na rede local.</p><p>Alvos contra os quais você tiver sucesso sofrem 1d20+2 de dano físico para cada Estresse marcado.</p><p>Em um sucesso com Esperança, escolha um alvo afetado. Ele também fica bloqueado de todo sistema conectado, modo de arma, link de drone, talento de cyberware ou efeito de suporte tático até o próximo Holofote dele.</p>" },
  { name: "Probability Rewrite", img: CPR("default/Default_Dice"), level: 10, recallCost: 1, type: "spell", clone: "Adjust Reality", description: "<p>Depois que você ou um aliado voluntário fizer qualquer rolagem, você pode gastar 5 Esperança para reescrever o resultado por meio de modelagem preditiva, despiste tático e intervenção perfeitamente cronometrada, mudando o resultado numérico dessa rolagem para um resultado à sua escolha.</p><p>O resultado precisa ser plausível dentro do alcance dos dados.</p>" }
];

// ---------- Domain Cards: Égide (Aegis) ----------
// As cartas de Égide do PDF são releituras das cartas oficiais do domínio Valor (e Lockdown Hold
// da Chokehold, de Midnight). "clone" copia na importação as ações e efeitos da carta oficial
// (lida do compêndio daggerheart.domains, sem alterá-lo), então a automação e o equilíbrio são os
// mesmos das oficiais; nome, texto, nível, custo e tipo vêm do PDF.
const AEGIS_CARDS = [
  { name: "Bare Metal", img: CPR("cyberware/subdermal_armor"), level: 1, recallCost: 0, type: "ability", clone: "Bare Bones", description: "<p>Quando você escolhe não equipar armadura, seu corpo reforçado, blindagem subdérmica, ossos endurecidos ou cyberware defensivo te dão uma Pontuação de Armadura base de 3 + sua Força e os seguintes limiares de dano base:</p><ul><li>Tier 1: 9/19</li><li>Tier 2: 11/24</li><li>Tier 3: 13/31</li><li>Tier 4: 15/38</li></ul>" },
  { name: "Kinetic Push", img: CPR("programs/banhammer"), level: 1, recallCost: 0, type: "ability", clone: "Forceful Push", description: "<p>Faça um ataque com sua arma contra um alvo dentro do alcance Corpo a Corpo. Em um sucesso, você causa dano e o empurra até o alcance Próximo. Em um sucesso com Esperança, some um d6 à sua rolagem de dano.</p><p>Além disso, você pode gastar 1 Esperança para deixá-lo temporariamente Vulnerável.</p>" },
  { name: "Interpose", img: CPR("cyberware/popup_shield"), level: 1, recallCost: 1, type: "ability", clone: "I Am Your Shield", description: "<p>Quando um aliado dentro do alcance Muito Próximo fosse sofrer dano, você pode marcar 1 Estresse para se jogar na linha de fogo, erguer uma defesa, acionar seu equipamento de armadura ou bloquear o ataque fisicamente.</p><p>Você se torna o alvo do ataque. Quando sofrer dano desse ataque, você pode marcar qualquer quantidade de Espaços de Armadura.</p>" },
  { name: "Impact Frame", img: CPR("cyberweapons/big_knucks"), level: 2, recallCost: 1, type: "ability", clone: "Body Basher", description: "<p>Você usa toda a força do seu corpo, armadura, escudo, exoesqueleto ou membros reforçados numa luta.</p><p>Em um ataque bem-sucedido usando uma arma de alcance Corpo a Corpo, ganhe um bônus na rolagem de dano igual à sua Força.</p>" },
  { name: "Commanding Bulk", img: CPR("dlc/cyberware/dragoon-plating"), level: 2, recallCost: 0, type: "ability", clone: "Bold Presence", description: "<p>Quando você faz uma Rolagem de Presença, você pode gastar 1 Esperança para somar sua Força à rolagem.</p><p>Além disso, uma vez por descanso, quando você fosse ganhar uma condição, você pode descrever como sua presença blindada, disciplina de combate, massa bruta ou postura defensiva te ajudam a aguentar e evitar a condição.</p>" },
  { name: "Tactical Rally", img: CPR("dlc/cyberware/cybermatrix_gang_jazzler"), level: 3, recallCost: 1, type: "ability", clone: "Critical Inspiration", description: "<p>Uma vez por descanso, quando você tem um sucesso crítico num ataque, todos os aliados dentro do alcance Muito Próximo podem limpar 1 Estresse ou ganhar 1 Esperança.</p><p>Isso pode ser uma ordem gritada, uma abertura decisiva, ou o momento em que seus aliados veem que a linha ainda está de pé.</p>" },
  { name: "Lockdown Hold", img: CPR("status/grappled"), level: 3, recallCost: 1, type: "ability", clone: "Chokehold", description: "<p>Quando você se posiciona atrás de uma criatura mais ou menos do seu tamanho, você pode marcar 1 Estresse para prendê-la numa imobilização usando um mata-leão, chave de articulação ou cabo de contenção. O alvo fica temporariamente Vulnerável.</p><p>Quando uma criatura ataca um alvo Vulnerável dessa forma, ela causa 2d6 de dano extra.</p>" },
  { name: "Support Tank", img: CPR("status/human_shield"), level: 4, recallCost: 2, type: "ability", clone: "Support Tank", description: "<p>Quando um aliado dentro do alcance Próximo falha numa rolagem, você pode gastar 2 Esperança para permitir que ele re-role seu Dado de Esperança ou seu Dado de Medo.</p><p>Isso pode ser dar cobertura, forçar a atenção do inimigo para você ou firmá-lo contra o impacto.</p>" },
  // Sem equivalente oficial. "d8+3 usando seu atributo de Interface" lido como quantidade de d8 = Interface
  // (como "usando sua Proficiência" nas outras cartas), com 1d8 no mínimo.
  { name: "Repulsion Pulse", img: CPR("programs/flak"), level: 4, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra todos os alvos dentro do alcance Corpo a Corpo. Os alvos contra os quais você tiver sucesso são empurrados até o alcance Distante e sofrem d8+3 de dano de impacto ou techno usando seu atributo de Interface.</p><p>Isso pode ser uma descarga de escudo, placa repulsora, onda de pressão ou explosão defensiva do seu equipamento de armadura.</p>",
    action: buildCardAction({ range: "Melee", targetType: "hostile", damageFormula: { formula: "(max(1, @cast))d8 + 3", dmgType: "magical" } }) },
  { name: "Armor Tech", img: CPR("gear/tech_tool"), level: 5, recallCost: 1, type: "ability", clone: "Armorer", description: "<p>Enquanto estiver usando armadura, ganhe +1 de bônus na sua Pontuação de Armadura.</p><p>Durante um descanso, quando você escolher consertar sua armadura como movimento de descanso, seus aliados também limpam um Espaço de Armadura.</p>" },
  { name: "Rally Strike", img: CPR("status/surge"), level: 5, recallCost: 1, type: "ability", clone: "Rousing Strike", description: "<p>Uma vez por descanso, quando você tem um sucesso crítico num ataque, você e todos os aliados que puderem te ver ou ouvir podem limpar 1 Ponto de Vida ou 1d4 de Estresse.</p><p>Isso pode ser uma ordem gritada, uma abertura decisiva, ou o momento em que seus aliados veem que a linha ainda está de pé.</p>" },
  { name: "Inevitable", img: CPR("blackice/src/giant"), level: 6, recallCost: 1, type: "ability", clone: "Inevitable", description: "<p>Quando você falha numa rolagem de ação, sua próxima rolagem de ação tem vantagem.</p><p>Sua armadura se recalibra, sua postura endurece ou seu modelo de ameaça se atualiza.</p>" },
  { name: "Rise Up", img: CPR("status/speedheal"), level: 6, recallCost: 2, type: "ability", clone: "Rise Up", description: "<p>Ganhe um bônus no seu limiar de dano Severo igual à sua Proficiência.</p><p>Quando você marcar 1 ou mais Pontos de Vida por um ataque, limpe 1 Estresse.</p>" },
  { name: "Shrug It Off", img: CPR("dlc/cyberware/hardend_shielding"), level: 7, recallCost: 1, type: "ability", clone: "Shrug It Off", description: "<p>Quando você fosse sofrer dano, você pode marcar 1 Estresse para reduzir a gravidade do dano em um limiar.</p><p>Quando fizer isso, role um d6. Em um resultado 3 ou menor, coloque esta carta no seu cofre.</p>" },
  { name: "Aegis-Synced", img: CPR("dlc/cyberware/dragoon-plating-metalgear"), level: 7, recallCost: 1, type: "ability", clone: "Valor-Touched", description: "<p>Quando 4 ou mais cartas de domínio no seu loadout forem da Competência Aegis, ganhe o seguinte:</p><ul><li>+1 de bônus na sua Pontuação de Armadura.</li><li>Quando você marcar 1 ou mais Pontos de Vida sem marcar um Espaço de Armadura, limpe um Espaço de Armadura.</li></ul>" },
  { name: "Full System Surge", img: CPR("status/boost"), level: 8, recallCost: 1, type: "spell", clone: "Full Surge", description: "<p>Uma vez por descanso longo, marque 3 Estresse para levar seu corpo, armadura, cyberware, drogas de combate, estrutura de reforço e sistemas defensivos ao limite.</p><p>Ganhe +2 de bônus em todos os seus atributos até o seu próximo descanso.</p>" },
  { name: "Shockwave Slam", img: CPR("cyberware/jump_booster"), level: 8, recallCost: 2, type: "spell", clone: "Ground Pound", description: "<p>Gaste 2 Esperança para golpear o chão onde você está usando um martelo cinético, bota de gravidade, punho hidráulico, pistão de escudo, sistema de impacto de exoesqueleto ou pancada de corpo reforçado.</p><p>Faça uma Rolagem de Força contra todos os alvos dentro do alcance Muito Próximo. Os alvos contra os quais você tiver sucesso são arremessados até o alcance Distante e devem fazer uma Rolagem de Reação (17).</p><p>Alvos que falharem sofrem 4d10+8 de dano de impacto. Alvos que tiverem sucesso sofrem metade do dano.</p>" },
  { name: "Hold the Line", img: CPR("status/cover"), level: 9, recallCost: 1, type: "ability", clone: "Hold the Line", description: "<p>Descreva a postura defensiva que você assume e gaste 1 Esperança. Se um adversário se mover para dentro do alcance Muito Próximo, ele é puxado para o alcance Corpo a Corpo e fica Imobilizado.</p><p>Essa condição dura até você se mover, falhar numa rolagem com Medo, ou o mestre gastar 2 Medo no turno dele para limpá-la.</p>" },
  { name: "Lead by Example", img: CPR("dlc/cyberware/cyberskull"), level: 9, recallCost: 3, type: "ability", clone: "Lead by Example", description: "<p>Quando você causa dano a um adversário, você pode marcar 1 Estresse e descrever como encoraja seus aliados, atrai o fogo, expõe uma fraqueza ou prova que o inimigo pode ser quebrado.</p><p>O próximo personagem de jogador a atacar esse adversário pode limpar 1 Estresse ou ganhar 1 Esperança.</p>" },
  { name: "Unbreakable", img: CPR("dlc/cyberware/heavy-subdermal-armor"), level: 10, recallCost: 4, type: "ability", clone: "Unbreakable", description: "<p>Quando você marcar seu último Ponto de Vida, em vez de fazer um movimento de morte, você pode rolar um d6 e limpar uma quantidade de Pontos de Vida igual ao resultado.</p><p>Depois, coloque esta carta no seu cofre.</p>" },
  { name: "Unyielding Armor", img: CPR("armor/metalgear_body"), level: 10, recallCost: 1, type: "ability", clone: "Unyielding Armor", description: "<p>Quando você fosse marcar um Espaço de Armadura, role uma quantidade de d6 igual à sua Proficiência.</p><p>Se algum resultado for 6, reduza a gravidade em um limiar sem marcar um Espaço de Armadura.</p>" }
];

// ---------- Domain Cards: Assault ----------
// Todas as cartas de Assault do PDF são releituras das cartas oficiais do domínio Blade.
const ASSAULT_CARDS = [
  { name: "Get Back Up", img: CPR("drugs/speedheal"), level: 1, recallCost: 1, type: "ability", clone: "Get Back Up", description: "<p>Quando você sofre dano Severo, pode marcar 1 Estresse para reduzir a gravidade em um limiar.</p>" },
  { name: "Corrective Aim", img: CPR("ammo/rifle_smart"), level: 1, recallCost: 1, type: "ability", clone: "Not Good Enough", description: "<p>Quando você rola os dados de dano, pode rolar de novo qualquer 1 ou 2.</p>" },
  { name: "Sweep Fire", img: CPR("upgrades/generic_drum_magazine"), level: 1, recallCost: 0, type: "ability", clone: "Whirlwind", description: "<p>Quando você acerta um ataque contra um alvo dentro do alcance Muito Próximo, pode gastar 1 Esperança para usar o ataque contra todos os outros alvos dentro do alcance Muito Próximo.</p><p>Todos os adversários adicionais contra os quais você tiver sucesso com esta habilidade sofrem metade do dano.</p>" },
  { name: "War Buddy", img: CPR("gear/radio_communicator"), level: 2, recallCost: 1, type: "ability", clone: "A Soldier's Bond", description: "<p>Uma vez por descanso longo, quando você elogia alguém ou pergunta sobre algo em que a pessoa é boa, vocês dois ganham 3 Esperança.</p>" },
  { name: "Danger Close", img: CPR("ammo/grenade_basic"), level: 2, recallCost: 1, type: "ability", clone: "Reckless", description: "<p>Marque 1 Estresse para ganhar vantagem num ataque.</p>" },
  { name: "Adaptive Weapon Handling", img: CPR("default/Default_Weapon"), level: 3, recallCost: 1, type: "ability", clone: "Versatile Fighter", description: "<p>Você pode usar um atributo diferente com uma arma equipada, em vez do atributo que a arma pede.</p><p>Quando você causa dano, pode marcar 1 Estresse para usar o resultado máximo de um dos dados de dano em vez de rolá-lo.</p>" },
  { name: "Emergency Breakaway", img: CPR("status/falling"), level: 3, recallCost: 1, type: "ability", clone: "Scramble", description: "<p>Uma vez por descanso, quando uma criatura dentro do alcance Corpo a Corpo fosse te causar dano, você pode evitar o ataque e sair com segurança do alcance Corpo a Corpo do inimigo.</p>" },
  { name: "Target Lock", img: CPR("upgrades/infrared_nightvision_scope"), level: 4, recallCost: 2, type: "ability", clone: "Deadly Focus", description: "<p>Uma vez por descanso, você pode concentrar todo o seu foco num alvo à sua escolha. Até você atacar outra criatura, derrotar o alvo ou a batalha terminar, ganhe +1 de Proficiência.</p>" },
  { name: "Reinforced Combat Armor", img: CPR("armor/kevlar_head"), level: 4, recallCost: 0, type: "ability", clone: "Fortified Armor", description: "<p>Enquanto você estiver usando armadura, ganhe +2 nos seus limiares de dano.</p>" },
  { name: "Ace’s Edge", img: CPR("weapons/heavyPistol_excellent"), level: 5, recallCost: 1, type: "ability", clone: "Champion's Edge", description: "<p>Quando você tem um sucesso crítico num ataque, pode gastar até 3 Esperança e escolher uma das opções abaixo para cada Esperança gasta:</p><ul><li>Você limpa 1 Ponto de Vida.</li><li>Você limpa 1 Espaço de Armadura.</li><li>O alvo marca 1 Ponto de Vida adicional.</li></ul><p>Você não pode escolher a mesma opção mais de uma vez.</p>" },
  { name: "Combat Conditioning", img: CPR("status/torn_muscle"), level: 5, recallCost: 0, type: "ability", clone: "Vitality", description: "<p>Quando você escolhe esta carta, ganhe permanentemente dois dos seguintes benefícios:</p><ul><li>Um espaço de Estresse.</li><li>Um espaço de Ponto de Vida.</li><li>+2 nos seus limiares de dano.</li></ul><p>Depois, coloque esta carta no seu cofre permanentemente.</p>" },
  { name: "Last Stand", img: CPR("status/wounded_seriously"), level: 6, recallCost: 2, type: "ability", clone: "Battle-Hardened", description: "<p>Uma vez por descanso longo, quando você fosse fazer um Movimento de Morte, pode gastar 1 Esperança para limpar 1 Ponto de Vida em vez disso.</p>" },
  { name: "Overpressure", img: CPR("dlc/drugs/berserker"), level: 6, recallCost: 1, type: "ability", clone: "Rage Up", description: "<p>Antes de fazer um ataque, você pode marcar 1 Estresse para ganhar um bônus na rolagem de dano igual ao dobro da sua Força.</p><p>Você pode usar Overpressure duas vezes por ataque.</p>" },
  { name: "Assault-Synced", img: CPR("weapons/AssaultRifle_excellent"), level: 7, recallCost: 1, type: "ability", clone: "Blade-Touched", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Assault, ganhe o seguinte:</p><ul><li>+2 nas suas rolagens de ataque.</li><li>+4 no seu limiar de dano Severo.</li></ul>" },
  { name: "Grazing Fire", img: CPR("weapons/thrown_weapon"), level: 7, recallCost: 1, type: "ability", clone: "Glancing Blow", description: "<p>Quando você falha num ataque, pode marcar 1 Estresse para causar o dano da arma usando metade da sua Proficiência.</p>" },
  { name: "Rally Signal", img: CPR("gear/pocket_amplifier"), level: 8, recallCost: 2, type: "ability", clone: "Battle Cry", description: "<p>Uma vez por descanso longo, enquanto avança contra o perigo, você pode dar um grito, transmissão, gesto ou sinal de esquadrão que inspira os seus aliados. Todos os aliados que podem te ouvir limpam 1 Estresse e ganham 1 Esperança.</p><p>Além disso, seus aliados ganham vantagem nas rolagens de ataque até você ou um aliado rolar uma falha com Medo.</p>" },
  { name: "Kill Mode", img: CPR("weapons/Chainsaw"), level: 8, recallCost: 3, type: "ability", clone: "Frenzy", description: "<p>Uma vez por descanso longo, você pode entrar em <strong>Kill Mode</strong> até não haver mais adversários à vista.</p><p>Enquanto estiver em Kill Mode, você não pode usar Espaços de Armadura, e ganha +10 nas rolagens de dano e +8 no limiar de dano Severo.</p>" },
  { name: "Blood and Chrome", img: CPR("cyberweapons/wolvers"), level: 9, recallCost: 2, type: "ability", clone: "Gore and Glory", description: "<p>Quando você tem um sucesso crítico num ataque com arma, ganhe 1 Esperança adicional ou limpe 1 Estresse adicional.</p><p>Além disso, quando você causa dano suficiente para derrotar um inimigo, ganhe 1 Esperança ou limpe 1 Estresse.</p>" },
  { name: "Execution Protocol", img: CPR("weapons/SniperRifle_excellent"), level: 9, recallCost: 3, type: "ability", clone: "Reaper's Strike", description: "<p>Uma vez por descanso longo, gaste 1 Esperança para fazer uma rolagem de ataque. O mestre diz contra quais alvos dentro do alcance ela teria sucesso. Escolha um desses alvos e force-o a marcar 5 Pontos de Vida.</p>" },
  { name: "Walking Arsenal", img: CPR("weapons/RocketLauncher"), level: 10, recallCost: 0, type: "ability", clone: "Battle Monster", description: "<p>Quando você acerta um ataque contra um adversário, pode marcar 4 de Estresse para forçar o alvo a marcar uma quantidade de Pontos de Vida igual à quantidade de Pontos de Vida que você tem marcados no momento, em vez de rolar o dano.</p>" },
  { name: "Relentless Assault", img: CPR("weapons/heavySMG_excellent"), level: 10, recallCost: 3, type: "ability", clone: "Onslaught", description: "<p>Quando você acerta um ataque com a sua arma, nunca causa dano abaixo do limiar Maior do alvo. O alvo sempre marca no mínimo 2 Pontos de Vida.</p><p>Além disso, quando uma criatura dentro do alcance da sua arma causa dano a um aliado com um ataque que não inclui você, você pode marcar 1 Estresse para forçá-la a fazer uma Rolagem de Reação (15). Em uma falha, o alvo marca 1 Ponto de Vida.</p>" }
];

// Ghost: releituras das cartas oficiais de Midnight (Ghost Skin = Invisibility, Black Route = Rift Walker).
// damageType troca o tipo de dano copiado da carta oficial (Throwing Blades é físico, Rain of Blades é mágico).
const GHOST_CARDS = [
  { name: "Pick and Pull", img: CPR("gear/lock_picking_set"), level: 1, recallCost: 0, type: "ability", clone: "Pick and Pull", description: "<p>Você tem vantagem em rolagens de ação para abrir fechaduras não digitais, burlar segurança física, desarmar armadilhas, desativar alarmes simples ou roubar itens de um alvo, na furtividade ou na força.</p>" },
  { name: "Throwing Blades", img: CPR("weapons/thrown_weapon"), level: 1, recallCost: 1, type: "spell", clone: "Rain of Blades", damageType: "physical", description: "<p>Gaste 1 Esperança para fazer uma Rolagem de Interface e liberar uma rajada de lâminas de arremesso, microdrones ou fragmentos inteligentes silenciados que atingem todos os alvos dentro do alcance Muito Próximo.</p><p>Os alvos atingidos sofrem d8+2 de dano físico usando a sua Proficiência. Se um alvo atingido estiver Vulnerável, sofre 1d8 de dano extra.</p>" },
  { name: "Digital Face", img: CPR("dlc/cyberware/realskinn-faceplate"), level: 1, recallCost: 0, type: "spell", clone: "Uncanny Disguise", description: "<p>Quando você tem alguns minutos para se preparar, pode marcar 1 Estresse para aplicar uma máscara sintética ou camada de pele inteligente igual a qualquer humanoide que já viu. Enquanto disfarçado, tem vantagem em Rolagens de Presença para evitar ser examinado.</p><p>Coloque nesta carta marcadores iguais ao seu atributo de Interface. Quando você faz uma ação disfarçado, gaste um marcador. Depois que a ação que gasta o último marcador se resolve, o disfarce cai.</p>" },
  { name: "Wirebind", img: CPR("cyberware/slice_n_dice"), level: 2, recallCost: 0, type: "spell", clone: "Shadowbind", description: "<p>Faça uma Rolagem de Interface contra todos os adversários dentro do alcance Muito Próximo. Os alvos contra os quais tiver sucesso ficam temporariamente <em>Imobilizados</em> por fios-armadilha, amarras inteligentes, gel adesivo ou sistemas de segurança sequestrados.</p>" },
  { name: "Shadow Asset", img: CPR("dlc/gear/suzumebachi_assassin_drone"), level: 2, recallCost: 1, type: "spell", clone: "Midnight Spirit", description: "<p>Gaste 1 Esperança para posicionar um recurso silencioso de infiltração, como um microdrone, isca óptica ou marcador de assassinato. Até o seu próximo descanso, o Shadow Asset pode seguir uma criatura em silêncio, vigiar um lugar, criar uma distração ou te ajudar a manter o disfarce. Ele não pode manipular fisicamente o ambiente. Quando você faz uma ação envolvendo uma criatura ou lugar vigiado pelo seu Shadow Asset, ganha vantagem.</p><p>Você também pode queimar o recurso para atingir um adversário: faça uma Rolagem de Interface contra um alvo dentro do alcance Muito Distante. Num acerto, role uma quantidade de d6 igual ao seu atributo de Interface e cause esse total de dano techno ao alvo. Depois, o Shadow Asset se dissipa. Você só pode ter um por vez.</p>" },
  { name: "Ghost Skin", img: CPR("cyberware/color_shift"), level: 3, recallCost: 1, type: "spell", clone: "Invisibility", description: "<p>Faça uma Rolagem de Interface (10). Em um sucesso, marque 1 Estresse e escolha você ou um aliado dentro do alcance Corpo a Corpo para ficar <strong>Invisível</strong> por camuflagem óptica, pele fantasma ou tecnologia que embaralha sensores. Uma criatura Invisível não pode ser vista, a não ser por métodos de detecção apropriados, e rolagens de ataque contra ela têm desvantagem.</p><p>Coloque nesta carta marcadores iguais ao seu atributo de Interface. Quando a criatura Invisível faz uma ação, gaste um marcador. Depois que a ação que gasta o último marcador se resolve, o efeito termina. Você só pode rodar Ghost Skin em uma criatura por vez.</p>" },
  { name: "Blackout Veil", img: CPR("ammo/grenade_smoke"), level: 3, recallCost: 1, type: "spell", clone: "Veil of Night", description: "<p>Faça uma Rolagem de Interface (13). Em um sucesso, você cria uma cortina de escuridão, chaff de sinal ou interferência entre dois pontos dentro do alcance Distante. Você conta como Escondido para as criaturas do outro lado do véu e tem vantagem nos ataques que faz através dele.</p><p>O véu fica até você rodar outro protocolo.</p>" },
  { name: "Stealth Expertise", img: CPR("cyberware/tactile_boot"), level: 4, recallCost: 0, type: "ability", clone: "Stealth Expertise", description: "<p>Quando você rola com Medo tentando se mover sem ser notado por uma área perigosa, pode marcar 1 Estresse para rolar com Esperança em vez disso.</p><p>Se um aliado dentro do alcance Próximo também estiver tentando se mover sem ser notado e rolar com Medo, você pode marcar 1 Estresse para mudar o resultado dele para uma rolagem com Esperança.</p>" },
  { name: "Weakpoint Tag", img: CPR("cyberware/homing_tracer"), level: 4, recallCost: 1, type: "spell", clone: "Glyph of Nightfall", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Muito Próximo. Em um sucesso, gaste 1 Esperança para marcá-lo com um rastreador oculto, glifo de mira ou scanner de ponto fraco, reduzindo temporariamente a Dificuldade dele num valor igual ao seu atributo de Interface (mínimo 1).</p>" },
  { name: "Dead Drop Exit", img: CPR("dlc/gear/hidden-compartment"), level: 5, recallCost: 2, type: "spell", clone: "Phantom Retreat", description: "<p>Gaste 1 Esperança para preparar uma saída escondida onde você está, como um corredor de serviço, ângulo cego de câmera ou rota de extração planejada. Até o seu próximo descanso, você pode gastar 1 Esperança para acionar o plano de saída.</p><p>Quando fizer isso, você se move imediatamente até a saída preparada ou a uma posição segura dentro do alcance Muito Próximo dela, fica Escondido, e este protocolo termina. Esse movimento precisa seguir uma rota que possa plausivelmente existir na ficção.</p>" },
  { name: "Hush Field", img: CPR("dlc/cyberware/signal_jammer"), level: 5, recallCost: 1, type: "spell", clone: "Hush", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Próximo. Em um sucesso, gaste 1 Esperança para instalar tecnologia supressora ao redor do alvo, cobrindo tudo dentro do alcance Muito Próximo dele e seguindo-o quando se move.</p><p>O alvo e tudo na área ficam <strong>Silenciados</strong> até o mestre gastar 1 Medo no turno dele para limpar a condição, você rodar Hush Field de novo ou sofrer dano Maior. Enquanto Silenciados, não podem fazer barulho nem rodar protocolos de comunicação ou usar efeitos que exijam comandos audíveis, verbais ou transmitidos.</p>" },
  { name: "Black Route", img: CPR("programs/worm"), level: 6, recallCost: 2, type: "spell", clone: "Rift Walker", description: "<p>Faça uma Rolagem de Interface (15). Em um sucesso, você mapeia, abre ou prepara uma rota secreta pela área. Até o seu próximo descanso, você e os aliados que guiar podem usar essa rota para ir e voltar entre o local atual e outro dentro do alcance Muito Distante que você já tenha alcançado nesta cena.</p><p>Usando a rota, vocês têm vantagem em rolagens para evitar detecção, burlar segurança comum ou fugir de perseguição. A rota fica disponível até você decidir fechá-la ou o mestre gastar 1 Medo para revelar que ela foi comprometida.</p>" },
  { name: "Mass Disguise", img: CPR("dlc/cyberware/personalized-faceplate"), level: 6, recallCost: 0, type: "spell", clone: "Mass Disguise", description: "<p>Quando você tem alguns minutos de silêncio para se concentrar, pode marcar 1 Estresse para mudar a aparência de todas as criaturas voluntárias dentro do alcance Próximo, usando equipamentos de rosto falso, identidades projetadas, camadas de pele inteligente, máscaras sintéticas ou tecnologia de disfarce coordenada. As novas formas precisam ter estrutura corporal e tamanho gerais parecidos, e podem ser alguém ou algo que você já viu ou algo totalmente inventado.</p><p>Uma criatura disfarçada tem vantagem em Rolagens de Presença para evitar ser examinada. Ative uma Contagem Regressiva (8). Ela avança como consequência escolhida pelo mestre. Quando dispara, os disfarces caem.</p>" },
  { name: "Ghost-Synced", img: CPR("cyberware/internal_agent"), level: 7, recallCost: 2, type: "ability", clone: "Midnight-Touched", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Ghost, ganhe o seguinte:</p><ul><li>Uma vez por descanso, quando você tem 0 de Esperança e o mestre fosse ganhar 1 Medo, você pode ganhar 1 Esperança em vez disso.</li><li>Quando você acerta um ataque, pode marcar 1 Estresse para somar o resultado do seu Dado de Medo à rolagem de dano.</li></ul>" },
  { name: "Vanishing Dodge", img: CPR("cyberware/kerenzikov"), level: 7, recallCost: 1, type: "spell", clone: "Vanishing Dodge", description: "<p>Quando um ataque contra você que causaria dano físico falha, você pode gastar 1 Esperança para disparar uma explosão de fumaça, cintilação de pele fantasma, salto de fase, piscada de emergência ou deslocamento óptico.</p><p>Você fica Escondido e se move para um ponto dentro do alcance Próximo do atacante. Continua Escondido até a próxima vez que fizer uma rolagem de ação.</p>" },
  { name: "Shadowhunter", img: CPR("dlc/cyberware/kiroshi_monovision"), level: 8, recallCost: 2, type: "ability", clone: "Shadowhunter", description: "<p>Seus sistemas de combate, instintos e treinamento de assassinato funcionam melhor com pouca visibilidade.</p><p>Enquanto estiver envolto em penumbra, escuridão, fumaça, chuva forte, neblina densa, multidão ou interferência visual, você ganha +1 de Evasão e faz rolagens de ataque com vantagem.</p>" },
  { name: "Feedback Charge", img: CPR("cyberware/emp_threading"), level: 8, recallCost: 1, type: "spell", clone: "Spellcharge", description: "<p>Quando você sofre dano techno, coloque nesta carta marcadores iguais aos Pontos de Vida que marcou. Você pode guardar marcadores iguais ao seu atributo de Interface.</p><p>Quando acerta um ataque, pode gastar qualquer quantidade de marcadores para somar um d6 por marcador à rolagem de dano.</p>" },
  { name: "Fearmask", img: CPR("blackice/src/hellhound"), level: 9, recallCost: 2, type: "spell", clone: "Night Terror", description: "<p>Uma vez por descanso longo, escolha quaisquer alvos dentro do alcance Muito Próximo para te perceberem como uma ameaça de pesadelo, assassino impossível, fantasma de sensor corrompido ou alucinação disparada pelo medo. Os alvos precisam ter sucesso numa Rolagem de Reação (16) ou ficam temporariamente <strong>Horrified</strong>. Enquanto Horrified, ficam Vulneráveis.</p><p>Roube do mestre uma quantidade de Medo igual ao número de alvos Horrified, até o total de Medo na reserva dele. Role uma quantidade de d6 igual ao Medo roubado e cause o total de dano a cada alvo Horrified. Descarte o Medo roubado.</p>" },
  { name: "Studying the Victim", img: CPR("dlc/cyberware/kill_display"), level: 9, recallCost: 1, type: "ability", clone: "Twilight Toll", description: "<p>Escolha um alvo dentro do alcance Distante. Quando você tem sucesso numa rolagem de ação contra ele que não resulta em rolagem de dano, coloque um marcador nesta carta. Quando causar dano a esse alvo, gaste qualquer quantidade de marcadores para somar um d12 por marcador à rolagem de dano.</p><p>Você só pode manter Studying the Victim em uma criatura por vez. Quando escolher um novo alvo ou fizer um descanso, limpe os marcadores não usados.</p>" },
  { name: "Total Blackout", img: CPR("status/emp"), level: 10, recallCost: 2, type: "spell", clone: "Eclipse", description: "<p>Faça uma Rolagem de Interface (16). Uma vez por descanso longo, em um sucesso, mergulhe a área inteira dentro do alcance Distante em escuridão completa, apagão de sinal, saturação de fumaça, negação de sensores ou interferência que devora a luz, que só você e seus aliados conseguem atravessar com a vista.</p><p>Rolagens de ataque contra você ou um aliado dentro desse apagão têm desvantagem. Além disso, quando você ou um aliado tem sucesso com Esperança contra um adversário dentro do apagão, o alvo marca 1 Estresse.</p><p>O protocolo dura até o mestre gastar 1 Medo no turno dele para limpar o efeito ou você sofrer dano Severo.</p>" },
  { name: "Specter Mode", img: CPR("blackice/src/wisp"), level: 10, recallCost: 1, type: "spell", clone: "Specter of the Dark", description: "<p>Marque 1 Estresse para ficar <strong>Spectral</strong> até fazer uma ação contra outra criatura. Enquanto Spectral, seu corpo fica envolto em camuflagem ativa, chaff de sinal e software de movimento preditivo.</p><p>Você fica Escondido, não aciona câmeras ou alarmes comuns e não pode ser alvo direto de ataques físicos, a menos que uma criatura esteja dentro do alcance Corpo a Corpo ou o mestre gaste 1 Medo para te revelar.</p><p>Enquanto Spectral, você passa por câmeras, grades de laser e outras barreiras controladas pela segurança como se tivesse o acesso correto. Isso não permite atravessar paredes sólidas ou barreiras sem um ponto de entrada plausível. Outras criaturas ainda podem ver sinais breves da sua passagem.</p>" }
];

// Nomes em português para as ações/efeitos copiados das cartas oficiais.
const OFFICIAL_ACTION_NAMES = {
  "Mark Stress": "Marcar Estresse", "Spend Hope": "Gastar Esperança", "Avoid Condition": "Evitar Condição",
  "Critically Succeed": "Sucesso Crítico", "Repair Armor": "Consertar Armadura", "Clear Stress": "Limpar Estresse",
  "Roll d6": "Rolar d6", "Clear Armor": "Limpar Armadura", "Strike Ground": "Golpear o Chão",
  "Restrain": "Imobilizar", "Pull into Chokehold": "Imobilizar", "Damage": "Dano Extra",
  "Spend a Hope": "Gastar Esperança", "Mark a Stress": "Marcar Estresse", "Gain 3 Hope": "Ganhar 3 Esperança",
  "Avoid": "Evitar o Ataque", "Focus": "Focar", "Clear 1 HP": "Limpar 1 PV", "Clear 1 Armor Slot": "Limpar 1 Espaço de Armadura",
  "Deal 1 HP Damage": "Alvo marca 1 PV", "Apply Effect": "Aplicar Benefícios", "Clear Stress & Gain Hope": "Limpar Estresse e Ganhar Esperança",
  "Gain Hope": "Ganhar Esperança",
  "Cast": "Rolagem de Interface", "Chain Damage": "Dano em Cadeia", "Replenish Tokens": "Reabastecer Marcadores",
  "Spend Token": "Gastar Marcador", "Gain Tokens": "Ganhar Marcadores", "Use Tokens": "Usar Marcadores",
  "Create First Layer": "Criar Primeira Camada", "Create Extra Layers": "Criar Camadas Extras",
  "Corrode": "Corroer", "Target Marks Stress": "Alvo Marca Estresse", "Start Countdown": "Iniciar Contagem Regressiva",
  "Keep Card": "Manter a Carta", "Restrain Another": "Imobilizar Outro Alvo",
  "Heal One Hit Point": "Limpar 1 PV", "Heal One Hitpoint": "Limpar 1 PV", "Heal Two Hit Points": "Limpar 2 PV",
  "Heal One Stress": "Limpar 1 Estresse", "Heal Two Stress": "Limpar 2 Estresse",
  "Heal 1 Hit Point": "Limpar 1 PV", "Heal 2 Hit Points": "Limpar 2 PV (2 Esperança)", "Heal Hitpoints": "Limpar PV",
  "Reduce Stress": "Limpar Estresse", "Remove Condition": "Remover Condição", "Clear Three Stress": "Limpar 3 Estresse",
  "Clear Hit Point": "Limpar 1 PV", "Clear Hitpoint": "Limpar 1 PV", "Give Hope": "Dar Esperança",
  "Heal Another": "Tratar Aliado", "Heal Self": "Tratar a Si Mesmo", "Use as attack": "Usar como Ataque",
  "Transform": "Ativar", "Spend Hope for Action": "Gastar Esperança para Agir",
  "Double Agility": "Dobrar Agilidade", "Double Instinct": "Dobrar Instinto",
  "Mark Armor Slot": "Marcar Armadura", "Mark 1 Stress": "Marcar 1 Estresse",
  "Mark Stress (1 token)": "Marcar Estresse (1 marcador)", "Mark Stress (2 tokens)": "Marcar Estresse (2 marcadores)",
  "Mark Stress (3 tokens)": "Marcar Estresse (3 marcadores)", "Mark Stress (4 tokens)": "Marcar Estresse (4 marcadores)",
  "Instinct Roll": "Rolagem de Instinto", "Replace Card": "Trocar Carta", "Activate": "Ativar", "Retreat": "Acionar a Saída",
  "Read Surface Thoughts": "Ler Pensamentos", "Delve Deeper": "Ir Mais Fundo",
  "Summon Familiar": "Chamar Companheiro", "Perform Task": "Executar Tarefa", "See Through Eyes": "Ver pelos Olhos",
  "Summon Spirit": "Posicionar", "Attack Adversary": "Atacar Adversário", "Horrify": "Aterrorizar", "Steal Fear": "Roubar Medo",
  "Don Facade": "Aplicar Disfarce", "Pull": "Puxar", "Constrict": "Apertar", "Hit All Adversaries Between": "Atingir Todos no Caminho",
  "Enrapture": "Cativar", "Switch Duality Results": "Trocar Esperança e Medo", "Rescind Move": "Desfazer Ação",
  "Reflect Back": "Refletir Ataque", "Reduce Damage": "Reduzir Dano", "Become Cloaked": "Ficar Cloaked",
  "1. Unique Food (Stress)": "1. Ração (Estresse)", "2. Beautiful Relic (Hope)": "2. Relíquia (Esperança)",
  "3. Arcane Rune (Spellcast Roll)": "3. Chip de Acesso (Interface)", "4. Healing Vial (HP)": "4. Frasco Médico (PV)"
};
const OFFICIAL_EFFECT_NAMES = {
  "Forcefully Pushed": "Empurrado", "Chokehold": "Imobilizado",
  "Vitality (HP)": "Combat Conditioning (PV)", "Vitality (Stress)": "Combat Conditioning (Estresse)",
  "Vitality (Thresholds)": "Combat Conditioning (Limiares)", "Rage Up (2)": "Overpressure (2x)"
};

// Copia ações, efeitos e recurso de uma carta oficial. A chave de cada ação continua igual ao
// _id dela e os _id dos efeitos são mantidos, porque as ações apontam para eles.
// Nome das ações: carta com uma ação só usa o nome da carta; com várias, cada ação ganha o nome do PDF
// (actionNames da carta, ex: os protocolos de um Suite), a tradução em OFFICIAL_ACTION_NAMES ou, em
// último caso, o nome oficial em inglês — nunca várias ações com o mesmo nome.
function cloneOfficialCard(official, cardName, img, { actionNames = {}, effectNames = {} } = {}) {
  const src = official._source;
  const actions = foundry.utils.deepClone(src.system.actions ?? {});
  const multiple = Object.keys(actions).length > 1;
  for (const action of Object.values(actions)) {
    action.name = actionNames[action.name] ?? (multiple ? OFFICIAL_ACTION_NAMES[action.name] ?? (action.name || cardName) : cardName);
    action.description = "";
    if (img) action.img = img;
  }
  const effects = foundry.utils.deepClone(src.effects ?? []).map(effect => {
    delete effect._stats;
    return { ...effect, name: effectNames[effect.name] ?? OFFICIAL_EFFECT_NAMES[effect.name] ?? cardName, img: img ?? effect.img, description: "", origin: null };
  });
  // domainTouched (ex: Valor-Touched = 4): o sistema só ativa os efeitos com 4+ cartas do domínio
  // da própria carta no loadout, então vale para a Égide automaticamente.
  return { actions, effects, resource: foundry.utils.deepClone(src.system.resource ?? null), domainTouched: src.system.domainTouched ?? null };
}

// Chrome: releituras das cartas oficiais de Bone (Gripware Override = Wall Walk, Jumpjet Protocol = Flight).
const CHROME_CARDS = [
  { name: "Boosted Maneuvers", img: CPR("cyberware/cyberleg"), level: 1, recallCost: 0, type: "ability", clone: "Deft Maneuvers", description: "<p>Uma vez por descanso, marque 1 Estresse para correr para qualquer lugar dentro do alcance Distante sem fazer uma Rolagem de Agilidade.</p><p>Se terminar esse movimento dentro do alcance Corpo a Corpo de um adversário e atacá-lo imediatamente, ganhe +1 na rolagem de ataque.</p>" },
  { name: "Quick Thinking", img: CPR("dlc/cyberware/kiroshi_optishield"), level: 1, recallCost: 1, type: "ability", clone: "I See It Coming", description: "<p>Quando você é alvo de um ataque feito de além do alcance Corpo a Corpo, pode marcar 1 Estresse para rolar um d4 e ganhar um bônus na Evasão igual ao resultado contra esse ataque.</p>" },
  { name: "Gripware Override", img: CPR("cyberware/grip_foot"), level: 1, recallCost: 1, type: "spell", clone: "Wall Walk", description: "<p>Gaste 1 Esperança para permitir que uma criatura que você pode tocar escale paredes e tetos tão facilmente quanto anda no chão.</p><p>Isso dura até o fim da cena ou até você rodar Gripware Override de novo.</p>" },
  { name: "Strategic Approach", img: CPR("cyberware/image_enhance"), level: 2, recallCost: 1, type: "ability", clone: "Strategic Approach", description: "<p>Depois de um descanso longo, coloque nesta carta marcadores iguais ao seu Conhecimento (mínimo 1). Na primeira vez que você se move dentro do alcance Próximo de um adversário e o ataca, pode gastar um marcador para escolher uma:</p><ul><li>Você faz o ataque com vantagem.</li><li>Você limpa 1 Estresse de um aliado dentro do alcance Corpo a Corpo do adversário.</li><li>Você soma um d8 à rolagem de dano.</li></ul><p>Quando você faz um descanso longo, limpe todos os marcadores não usados.</p>" },
  { name: "Combat Drive", img: CPR("cyberware/battleglove"), level: 2, recallCost: 2, type: "ability", clone: "Ferocity", description: "<p>Quando você faz um adversário marcar 1 ou mais Pontos de Vida, pode gastar 2 Esperança para aumentar a sua Evasão pela quantidade de Pontos de Vida que ele marcou.</p><p>O bônus dura até depois do próximo ataque feito contra você.</p>" },
  { name: "Bracing Frame", img: CPR("cyberware/artificial_shoulder_mount"), level: 3, recallCost: 1, type: "ability", clone: "Brace", description: "<p>Quando você marca um Espaço de Armadura para reduzir o dano, pode marcar 1 Estresse para marcar um Espaço de Armadura adicional.</p>" },
  { name: "Jumpjet Protocol", img: CPR("dlc/cyberware/zero_gravity_thrusters"), level: 3, recallCost: 1, type: "spell", clone: "Flight", description: "<p>Faça uma Rolagem de Agilidade (15). Em um sucesso, coloque nesta carta marcadores iguais à sua Agilidade (mínimo 1).</p><p>Quando você faz uma rolagem de ação enquanto voa, gaste um marcador desta carta. Depois que a ação que gasta o último marcador se resolve, você desce até o chão logo abaixo de você.</p>" },
  { name: "Kinetic Boost", img: CPR("cyberware/jump_booster"), level: 4, recallCost: 1, type: "ability", clone: "Boost", description: "<p>Marque 1 Estresse para tomar impulso num aliado voluntário dentro do alcance Próximo, se lançar no ar e fazer um ataque aéreo contra um alvo dentro do alcance Distante.</p><p>Você tem vantagem no ataque, soma um d10 à rolagem de dano e termina o movimento dentro do alcance Corpo a Corpo do alvo.</p>" },
  { name: "Reflex Redirect", img: CPR("cyberware/popup_shield"), level: 4, recallCost: 1, type: "ability", clone: "Redirect", description: "<p>Quando um ataque feito contra você de além do alcance Corpo a Corpo falha, role uma quantidade de d6 igual à sua Proficiência.</p><p>Se algum resultado for 6, você pode marcar 1 Estresse para redirecionar o ataque e causar dano a um adversário dentro do alcance Muito Próximo.</p>" },
  { name: "Combat Scan", img: CPR("cyberware/cybereye"), level: 5, recallCost: 1, type: "ability", clone: "Know Thy Enemy", description: "<p>Ao observar uma criatura, você pode fazer uma Rolagem de Instinto contra ela. Em um sucesso, gaste 1 Esperança e peça ao mestre um conjunto de informações sobre o alvo, entre estas opções:</p><ul><li>Os Pontos de Vida e Estresse não marcados dele.</li><li>A Dificuldade e os limiares de dano dele.</li><li>As táticas e os dados de dano do ataque padrão dele.</li><li>As features e Experiências dele.</li></ul><p>Além disso, em um sucesso, você pode marcar 1 Estresse para remover 1 Medo da reserva de Medo do mestre.</p>" },
  { name: "Signature Move", img: CPR("cyberware/scratchers"), level: 5, recallCost: 1, type: "ability", clone: "Signature Move", description: "<p>Dê um nome e descreva o seu golpe característico.</p><p>Uma vez por descanso, quando você executa esse golpe como parte de uma ação, pode rolar um d20 como Dado de Esperança. Em um sucesso, limpe 1 Estresse.</p>" },
  { name: "Rapid Riposte", img: CPR("dlc/cyberware/extra-joined-cyberarm"), level: 6, recallCost: 0, type: "ability", clone: "Rapid Riposte", description: "<p>Quando um ataque feito contra você de dentro do alcance Corpo a Corpo falha, você pode marcar 1 Estresse e aproveitar a oportunidade para causar ao atacante o dano de uma das suas armas ativas.</p>" },
  { name: "Recovery Cycle", img: CPR("dlc/cyberware/cyberpillow"), level: 6, recallCost: 1, type: "ability", clone: "Recovery", description: "<p>Durante um descanso curto, você pode escolher um movimento de tempo livre de descanso longo em vez do de descanso curto.</p><p>Você pode gastar 1 Esperança para deixar um aliado fazer o mesmo.</p>" },
  { name: "Chrome-Synced", img: CPR("cyberware/superchrome_covering"), level: 7, recallCost: 2, type: "ability", clone: "Bone-Touched", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Chrome, ganhe o seguinte:</p><ul><li>+1 de Agilidade.</li><li>Uma vez por descanso, você pode gastar 3 Esperança para fazer um ataque que teve sucesso contra você falhar.</li></ul>" },
  { name: "Cruel Precision", img: CPR("dlc/cyberware/smart_lens"), level: 7, recallCost: 1, type: "ability", clone: "Cruel Precision", description: "<p>Quando você acerta um ataque com uma arma, ganhe um bônus na rolagem de dano igual à sua Acuidade ou à sua Agilidade.</p>" },
  { name: "Crowd Control", img: CPR("cyberware/grapple_hand"), level: 8, recallCost: 1, type: "ability", clone: "Wrangle", description: "<p>Faça uma Rolagem de Agilidade contra todos os alvos dentro do alcance Próximo.</p><p>Gaste 1 Esperança para mover os alvos contra os quais teve sucesso, e quaisquer aliados voluntários dentro do alcance Próximo, para outro ponto dentro do alcance Próximo.</p>" },
  { name: "Breaking Blow", img: CPR("weapons/Sledgehammer"), level: 8, recallCost: 3, type: "ability", clone: "Breaking Blow", description: "<p>Quando você acerta um ataque, pode marcar 1 Estresse para fazer o próximo ataque bem-sucedido contra esse mesmo alvo causar 2d12 de dano extra.</p>" },
  { name: "On the Brink", img: CPR("dlc/cyberware/heuristic-health-monitor"), level: 9, recallCost: 1, type: "ability", clone: "On the Brink", description: "<p>Quando você tem 2 ou menos Pontos de Vida não marcados, não sofre dano Menor.</p>" },
  { name: "Splintering Strike", img: CPR("cyberware/rippers"), level: 9, recallCost: 3, type: "ability", clone: "Splintering Strike", description: "<p>Gaste 1 Esperança e faça um ataque contra todos os adversários dentro do alcance da sua arma. Uma vez por descanso longo, em um sucesso contra qualquer alvo, some o dano causado e redistribua esse dano como quiser entre os alvos contra os quais teve sucesso.</p><p>Quando você causa dano a um alvo, role um dado de dano adicional e some o resultado ao dano causado a esse alvo.</p>" },
  { name: "Deathrun", img: CPR("drugs/synthcoke"), level: 10, recallCost: 1, type: "ability", clone: "Deathrun", description: "<p>Gaste 3 Esperança para correr em linha reta pelo campo de batalha até um ponto dentro do alcance Distante, fazendo um ataque contra todos os adversários dentro do alcance da sua arma ao longo do caminho. Escolha a ordem em que causa dano aos alvos contra os quais teve sucesso.</p><p>Para o primeiro, role o dano da arma com +1 de Proficiência. Depois, remova um dado da rolagem de dano e cause o dano restante ao próximo alvo. Continue removendo um dado para cada alvo seguinte até acabarem os dados de dano ou os adversários. Você não pode ter como alvo o mesmo adversário mais de uma vez por ataque.</p>" },
  { name: "Swift Step", img: CPR("cyberware/skate_foot"), level: 10, recallCost: 2, type: "ability", clone: "Swift Step", description: "<p>Quando um ataque feito contra você falha, limpe 1 Estresse. Se não puder limpar Estresse, ganhe 1 Esperança.</p>" }
];

// Systems: releituras das cartas oficiais de Codex. Os "Protocol Suite" são os Livros (tipo grimoire)
// e reúnem vários protocolos; Displacement Route = Blink Out e Magnetic Override = Telekinesis (Arcana).
// O asterisco que o PDF põe antes dos nomes dos Suites de nível 1 a 4 não entra no nome da carta.
const SYSTEMS_CARDS = [
  { name: "Ava Utility Kit", img: CPR("gear/tech_bag"), level: 1, recallCost: 2, type: "grimoire", clone: "Book of Ava", actionNames: { "Power Push": "Power Push", "Tava's Armor": "Reactive Plating", "Ice Spike": "Spike Printer", "Ice Spike (Attack)": "Spike Printer (Ataque)" }, description: "<p><strong>Power Push:</strong> faça uma Rolagem de Interface contra um alvo dentro do alcance Corpo a Corpo. Em um sucesso, ele é arremessado até o alcance Distante e sofre d10+2 de dano techno usando a sua Proficiência.</p><p><strong>Reactive Plating:</strong> gaste 1 Esperança para instalar placas reativas, reforço de fibra inteligente ou um remendo de armadura temporário num alvo que você pode tocar. Ele ganha +1 na Pontuação de Armadura até o próximo descanso dele ou até você rodar Reactive Plating de novo.</p><p><strong>Spike Printer:</strong> faça uma Rolagem de Interface (12) para fabricar e lançar um espigão endurecido, parafuso de ancoragem, estilhaço cinético ou projétil de liga comprimida dentro do alcance Distante. Se usar como arma, faça a Rolagem de Interface contra a Dificuldade do alvo. Em um sucesso, cause d6 de dano físico usando a sua Proficiência.</p>" },
  { name: "Illiat Software Pack", img: CPR("dlc/cyberware/chipware_compartment"), level: 1, recallCost: 2, type: "grimoire", clone: "Book of Illiat", actionNames: { "Slumber": "Neural Lullaby", "Arcane Barrage": "Arc Barrage", "Telepathy": "Direct Message" }, description: "<p><strong>Neural Lullaby:</strong> faça uma Rolagem de Interface contra um alvo dentro do alcance Muito Próximo. Em um sucesso, você inunda o sistema nervoso, o cyberware ou a transmissão sensorial dele com um pulso sedativo. Ele fica <em>Adormecido</em> até sofrer dano ou o mestre gastar 1 Medo no turno dele para limpar essa condição.</p><p><strong>Arc Barrage:</strong> uma vez por descanso, gaste qualquer quantidade de Esperança e dispare micromísseis, tiros de drone, flechettes inteligentes ou projéteis de energia compactos que atingem um alvo à sua escolha dentro do alcance Próximo. Role uma quantidade de d6 igual à Esperança gasta e cause esse total de dano techno ao alvo.</p><p><strong>Direct Message:</strong> gaste 1 Esperança para abrir uma linha de comunicação criptografada com um alvo que você pode ver. A conexão dura até o seu próximo descanso ou até você rodar Direct Message de novo.</p>" },
  { name: "Tyfar Field Kit", img: CPR("weapons/flamethrower"), level: 1, recallCost: 2, type: "grimoire", clone: "Book of Tyfar", actionNames: { "Wild Flame": "Wild Flame", "Magic Hand": "Utility Arm", "Mysterious Mist": "Smoke Field" }, description: "<p><strong>Wild Flame:</strong> faça uma Rolagem de Interface contra até três adversários dentro do alcance Corpo a Corpo. Os alvos contra os quais tiver sucesso sofrem 2d6 de dano techno e marcam 1 Estresse, enquanto uma rajada de chamas, plasma ou spray químico volátil sai do seu equipamento.</p><p><strong>Utility Arm:</strong> você posiciona uma mão mecânica, garra de drone ou manipulador remoto, com o mesmo tamanho e força que você, dentro do alcance Distante.</p><p><strong>Smoke Field:</strong> faça uma Rolagem de Interface (13) para soltar uma nuvem temporária espessa de fumaça, névoa, chaff de sinal ou vapor que se acumula numa área fixa dentro do alcance Muito Próximo. A névoa encobre fortemente essa área e tudo o que está nela.</p>" },
  { name: "Sitil Disguise Rig", img: CPR("dlc/cyberware/holo_projector_palm"), level: 2, recallCost: 2, type: "grimoire", clone: "Book of Sitil", actionNames: { "Adjust Appearance": "Adjust Appearance", "Parallela": "Target Splitter", "Illusion": "Hard-Light Decoy" }, description: "<p><strong>Adjust Appearance:</strong> você muda a sua aparência e roupas com tecido que curva a luz, projeção facial, malha de pele ou tecnologia de disfarce para evitar ser reconhecido.</p><p><strong>Target Splitter:</strong> gaste 2 Esperança para ativar este auxílio de mira em você ou num aliado dentro do alcance Próximo. Na próxima vez que o alvo atacar, ele pode acertar um alvo adicional dentro do alcance contra quem a rolagem de ataque teria sucesso. Você só pode manter este protocolo em uma criatura por vez.</p><p><strong>Hard-Light Decoy:</strong> faça uma Rolagem de Interface (14). Em um sucesso, crie uma projeção visual temporária, duplicata de hard-light, objeto falso ou holograma tático, não maior que você, dentro do alcance Próximo, que dura enquanto você olhar para ela. Ela resiste a um exame até um observador chegar ao alcance Corpo a Corpo.</p>" },
  { name: "Vagras Security Kit", img: CPR("upgrades/dna_lock"), level: 2, recallCost: 2, type: "grimoire", clone: "Book of Vagras", actionNames: { "Runic Lock": "Smart Lock", "Arcane Door": "Emergency Door", "Reveal": "Reveal" }, description: "<p><strong>Smart Lock:</strong> faça uma Rolagem de Interface (15) num objeto que você está tocando e que pode ser fechado, como fechadura, baú, porta, caixa, painel, cofre ou maleta. Uma vez por descanso, em um sucesso, você criptografa, reforça e sela o objeto para que só possa ser aberto por criaturas com a sua senha. Alguém com tecnologia compatível e uma hora para estudar o protocolo consegue quebrá-lo.</p><p><strong>Emergency Door:</strong> quando não houver adversários dentro do alcance Corpo a Corpo, faça uma Rolagem de Interface (13). Em um sucesso, gaste 1 Esperança para abrir uma porta de trânsito de curto alcance, rota de rompimento, painel de deslocamento ou passagem de emergência de onde você está até um ponto dentro do alcance Distante que você possa ver. Ela se fecha depois que uma criatura passa.</p><p><strong>Reveal:</strong> faça uma Rolagem de Interface. Se houver algo escondido por meios tecnológicos, digitais ou artificiais dentro do alcance Próximo, ele é revelado.</p>" },
  { name: "Korvax Control Suite", img: CPR("upgrades/av_4_engine_upgrade"), level: 3, recallCost: 2, type: "grimoire", clone: "Book of Korvax", actionNames: { "Levitation": "Gravity Clamp", "Recant": "Memory Scrub", "Rune Circle": "Repulsion Circle" }, description: "<p><strong>Gravity Clamp:</strong> faça uma Rolagem de Interface para erguer temporariamente no ar um alvo que você pode ver e movê-lo dentro do alcance Próximo da posição original.</p><p><strong>Memory Scrub:</strong> gaste 1 Esperança para forçar um alvo dentro do alcance Corpo a Corpo a fazer uma Rolagem de Reação (15). Em uma falha, você sobrescreve, embaralha ou suprime o último minuto da memória de curto prazo dele, fazendo-o esquecer o último minuto da conversa.</p><p><strong>Repulsion Circle:</strong> marque 1 Estresse para instalar um campo de repulsão temporário, anel de choque ou perímetro cinético no chão onde você está. Todos os adversários dentro do alcance Corpo a Corpo, ou que entrarem nele, sofrem 2d12+4 de dano techno e são arremessados até o alcance Muito Próximo.</p>" },
  { name: "Norai Heavy Package", img: CPR("cyberware/popup_grenade_launcher"), level: 3, recallCost: 2, type: "grimoire", clone: "Book of Norai", actionNames: { "Mystic Tether": "Tether Clamp", "Fireball - Cast": "Firebomb", "Fireball - Explosion": "Firebomb: Explosão" }, description: "<p><strong>Tether Clamp:</strong> faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, ele fica temporariamente <em>Imobilizado</em> e marca 1 Estresse. Se o alvo for uma criatura voadora, este protocolo a derruba e a deixa temporariamente Imobilizada.</p><p><strong>Firebomb:</strong> faça uma Rolagem de Interface contra um alvo dentro do alcance Muito Distante. Em um sucesso, lance contra ele uma carga explosiva, carga de plasma, projétil volátil ou bomba entregue por drone que explode no impacto. O alvo e todas as criaturas dentro do alcance Muito Próximo dele fazem uma Rolagem de Reação (13). Quem falhar sofre d20+5 de dano techno usando a sua Proficiência. Quem tiver sucesso sofre metade do dano.</p>" },
  { name: "Exota Fabrication Suite", img: CPR("dlc/cyberware/professional_cyberhand"), level: 4, recallCost: 3, type: "grimoire", clone: "Book of Exota", actionNames: { "Repudiate": "Repudiate", "Create Construct": "Deploy Construct", "Construct (Take Action)": "Construto: Agir" }, description: "<p><strong>Repudiate:</strong> você pode interromper um efeito tecnológico, digital ou techno em andamento. Faça uma Rolagem de Reação usando o seu atributo de Interface. Uma vez por descanso, em um sucesso, o efeito para e quaisquer consequências são evitadas.</p><p><strong>Deploy Construct:</strong> gaste 1 Esperança para posicionar um construto animado, enxame de drones, máquina improvisada ou unidade de hardware autônoma que obedece a comandos básicos. Faça uma Rolagem de Interface para comandá-lo a agir. Quando necessário, ele usa a sua Evasão e atributos, e os ataques dele causam 2d10+3 de dano físico. Você só pode manter um construto por vez, e ele se desfaz quando sofre qualquer dano.</p>" },
  { name: "Displacement Route", img: CPR("upgrades/hover_upgrade"), level: 4, recallCost: 1, type: "spell", clone: "Blink Out", description: "<p>Faça uma Rolagem de Interface (12). Em um sucesso, gaste 1 Esperança para acionar uma rota de deslocamento de curto alcance, equipamento de salto de emergência, módulo de salto de fase ou sistema de realocação tática que te move para outro ponto que você pode ver dentro do alcance Distante.</p><p>Se houver criaturas voluntárias dentro do alcance Muito Próximo, gaste 1 Esperança extra por criatura para levá-las junto.</p>" },
  { name: "Manifest Cover", img: CPR("status/cover"), level: 5, recallCost: 2, type: "spell", clone: "Manifest Wall", description: "<p>Faça uma Rolagem de Interface (15). Uma vez por descanso, em um sucesso, gaste 1 Esperança para criar uma parede temporária, barreira de hard-light, barricada portátil, escudo cinético ou estrutura instantânea entre dois pontos dentro do alcance Distante. Ela pode ter até 15 metros de altura e se formar em qualquer ângulo.</p><p>Criaturas ou objetos no caminho são empurrados para o lado que você escolher. A parede fica até o seu próximo descanso ou até você rodar Manifest Cover de novo.</p>" },
  { name: "Long-Range Extraction", img: CPR("upgrades/range_upgrade"), level: 5, recallCost: 2, type: "spell", clone: "Teleport", description: "<p>Uma vez por descanso longo, você pode extrair ou deslocar instantaneamente você e qualquer quantidade de alvos voluntários dentro do alcance Próximo para um lugar onde já esteve, usando um sinalizador de retorno, equipamento de deslocamento ou ponto de extração pré-mapeado. Faça uma Rolagem de Interface (16) com estes modificadores:</p><ol><li>Se você conhece bem o lugar: +3.</li><li>Se visita o lugar com frequência: +1.</li><li>Se já visitou o lugar uma vez: +0.</li><li>Se só esteve lá uma vez: −2.</li></ol><p>Em um sucesso, você chega aonde pretendia. Em uma falha, chega fora do curso, e a margem de falha determina o quão longe.</p>" },
  { name: "System Ban", img: CPR("programs/banhammer"), level: 6, recallCost: 0, type: "spell", clone: "Banish", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Próximo. Em um sucesso, role uma quantidade de d20 igual ao seu atributo de Interface. O alvo faz uma Rolagem de Reação com Dificuldade igual ao seu maior resultado. Em um sucesso, ele marca 1 Estresse, mas não é banido.</p><p>Uma vez por descanso, em uma falha, ele é banido deste campo de batalha, camada de sinal ou espaço físico ativo. Quando os personagens rolam com Medo, a Dificuldade sofre −1 e o alvo faz outra Rolagem de Reação. Em um sucesso, ele volta do banimento.</p>" },
  { name: "Magnetic Override", img: CPR("upgrades/heavy_chasis"), level: 6, recallCost: 0, type: "spell", clone: "Telekinesis", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, você usa força magnética, maquinário remoto, tecnologia gravitacional, drones industriais ou um conjunto de manipuladores pesados para movê-lo para qualquer lugar dentro do alcance Distante da posição original.</p><p>Você pode arremessar o alvo erguido como ataque, fazendo uma Rolagem de Interface adicional contra o segundo alvo que quer atingir. Em um sucesso, cause d12+4 de dano físico ao segundo alvo usando a sua Proficiência. Depois, este protocolo termina.</p>" },
  { name: "Homet Access Suite", img: CPR("upgrades/smuggling_upgrade"), level: 7, recallCost: 0, type: "grimoire", clone: "Book of Homet", actionNames: { "Pass Through": "Phase Breach", "Plane Gate": "Blacksite Gate" }, description: "<p><strong>Phase Breach:</strong> faça uma Rolagem de Interface (13). Uma vez por descanso, em um sucesso, você e todas as criaturas que estão te tocando podem atravessar uma parede ou porta dentro do alcance Próximo usando um módulo de fase, bypass molecular, campo de rompimento ou rota de deslocamento de matéria de emergência. O efeito termina quando todos estão do outro lado.</p><p><strong>Blacksite Gate:</strong> faça uma Rolagem de Interface (14). Uma vez por descanso longo, em um sucesso, abra um portal para uma instalação selada, camada oculta de rede, bunker profundo, esconderijo fora da rede, blacksite restrita ou espaço estranho onde você já esteve. O portal dura até o seu próximo descanso.</p>" },
  { name: "Systems-Synced", img: CPR("upgrades/enhanced_interface_plug_integration"), level: 7, recallCost: 2, type: "ability", clone: "Codex-Touched", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Systems, ganhe o seguinte:</p><ul><li>Você pode marcar 1 Estresse para somar a sua Proficiência a uma Rolagem de Interface.</li><li>Uma vez por descanso, troque esta carta por qualquer carta do seu cofre sem pagar o Custo de Recordação.</li></ul>" },
  { name: "Vyola Neural Suite", img: CPR("cyberware/neural_link"), level: 8, recallCost: 2, type: "grimoire", clone: "Book of Vyola", actionNames: { "Memory Delve": "Memory Delve", "Shared Clarity": "Neural Loadshare" }, description: "<p><strong>Memory Delve:</strong> faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, espie a mente, o arquivo de memória, o resíduo neural ou a percepção gravada do alvo e faça uma pergunta ao mestre. O mestre descreve as memórias que o alvo tem ligadas à resposta.</p><p><strong>Neural Loadshare:</strong> uma vez por descanso longo, gaste 1 Esperança para escolher duas criaturas voluntárias. Você cria um link temporário de suporte neural entre elas. Quando uma delas fosse marcar Estresse, pode escolher qual das duas marca. Este protocolo dura até o próximo descanso delas.</p>" },
  { name: "Safehouse Deployment", img: CPR("dlc/gear/furniture-set"), level: 8, recallCost: 3, type: "spell", clone: "Safe Haven", description: "<p>Quando você tem alguns minutos de calma para se concentrar, pode gastar 2 Esperança para montar, destrancar ou revelar o seu <strong>Safehouse</strong>: um grande abrigo escondido, base móvel, bunker ou sala operacional oculta onde você e seus aliados podem se abrigar. Quando fizer isso, uma entrada escondida aparece em algum lugar dentro do alcance Próximo. Lá dentro, você pode tornar a entrada invisível.</p><p>Você e qualquer um lá dentro sempre podem sair. Depois que você sai, a porta precisa ser montada de novo. Quando você descansa no seu próprio Safehouse, pode escolher um movimento de tempo livre adicional.</p>" },
  { name: "Ronin Alteration Suite", img: CPR("cyberware/chemskin"), level: 9, recallCost: 4, type: "grimoire", clone: "Book of Ronin", actionNames: { "Transform": "Adaptive Shell", "Eternal Enervation": "Permanent Weakpoint" }, description: "<p><strong>Adaptive Shell:</strong> faça uma Rolagem de Interface (15). Em um sucesso, envolva-se em camuflagem adaptativa, blindagem de material inteligente, máscara de hard-light ou uma carcaça compacta de disfarce, transformando-se num objeto inanimado de até o dobro do seu tamanho normal. Você pode ficar nessa forma até sofrer dano.</p><p><strong>Permanent Weakpoint:</strong> uma vez por descanso longo, faça uma Rolagem de Interface contra um alvo dentro do alcance Próximo. Em um sucesso, ele fica permanentemente Vulnerável. Ele não pode limpar essa condição de jeito nenhum.</p>" },
  { name: "Ultra Thermal Pulse", img: CPR("status/on_fire_deadly"), level: 9, recallCost: 4, type: "spell", clone: "Disintegration Wave", description: "<p>Faça uma Rolagem de Interface (18). Uma vez por descanso longo, em um sucesso, o mestre diz quais adversários dentro do alcance Distante têm Dificuldade 18 ou menor.</p><p>Marque 1 Estresse para cada um que você quiser atingir com este protocolo. Eles morrem instantaneamente.</p>" },
  { name: "Yarrow Master Suite", img: CPR("status/prime_time"), level: 10, recallCost: 2, type: "grimoire", clone: "Book of Yarrow", actionNames: { "Timejammer": "Time Dilation Field", "Magic Immunity": "Techno Immunity" }, description: "<p><strong>Time Dilation Field:</strong> faça uma Rolagem de Interface (18). Em um sucesso, você aciona um campo ilegal de dilatação temporal, overclock de percepção ou atraso causal localizado. O tempo para temporariamente para todos dentro do alcance Distante, menos você. Ele volta a correr na próxima vez que você faz uma rolagem de ação que tem outra criatura como alvo.</p><p><strong>Techno Immunity:</strong> gaste 5 Esperança para ficar imune a dano techno até o seu próximo descanso.</p>" },
  { name: "Transcendent Link", img: CPR("gear/braindance_viewer"), level: 10, recallCost: 1, type: "spell", clone: "Transcendent Union", description: "<p>Uma vez por descanso longo, gaste 5 Esperança para ativar este protocolo em duas ou mais criaturas voluntárias.</p><p>Até o seu próximo descanso, quando uma criatura conectada por este link fosse marcar Estresse ou Pontos de Vida, as criaturas conectadas podem escolher quem marca.</p>" }
];

// Influence: releituras das cartas oficiais de Grace (Voice of Authority = Voice of Reason, de Splendor).
// Bait the Mark não tem carta oficial equivalente: fica só com o texto.
const INFLUENCE_CARDS = [
  { name: "Smooth Operator", img: CPR("dlc/cyberware/neutongue"), level: 1, recallCost: 0, type: "ability", clone: "Deft Deceiver", description: "<p>Gaste 1 Esperança para ganhar vantagem numa rolagem para enganar, despistar, blefar, iludir ou convencer alguém a acreditar numa mentira que você contou.</p>" },
  { name: "Captive Audience", img: CPR("dlc/cyberware/mood_eye"), level: 1, recallCost: 0, type: "spell", clone: "Enrapture", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Próximo. Em um sucesso, ele fica temporariamente <strong>Captivated</strong>. Enquanto Captivated, a atenção do alvo fica presa em você, estreitando o campo de visão dele e abafando qualquer som que não seja a sua voz, transmissão, performance ou projeção.</p><p>Uma vez por descanso, em um sucesso, você pode marcar 1 Estresse para forçar o alvo Captivated a marcar 1 Estresse também.</p>" },
  { name: "Rally Broadcast", img: CPR("cyberware/audiovox"), level: 1, recallCost: 1, type: "ability", clone: "Inspirational Words", description: "<p>Depois de um descanso longo, coloque nesta carta marcadores iguais à sua Presença. Quando você fala com um aliado ou o incentiva diretamente, pode gastar um marcador desta carta para dar a ele um benefício entre estes:</p><ol><li>O aliado limpa 1 Estresse.</li><li>O aliado limpa 1 Ponto de Vida.</li><li>O aliado ganha 1 Esperança.</li></ol><p>Quando você faz um descanso longo, limpe todos os marcadores não usados.</p>" },
  { name: "Truth Filter", img: CPR("cyberware/voice_stress_analyzer"), level: 2, recallCost: 1, type: "spell", clone: "Tell No Lies", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Muito Próximo. Em um sucesso, ele não pode mentir para você enquanto estiver dentro do alcance Próximo, mas não é obrigado a falar. Se você fizer uma pergunta e ele se recusar a responder, ele marca 1 Estresse e o efeito termina.</p><p>Normalmente o alvo não percebe que este protocolo foi ativado nele até ser levado a dizer a verdade.</p>" },
  { name: "Public Provocation", img: CPR("dlc/gear/graf3"), level: 2, recallCost: 2, type: "ability", clone: "Troublemaker", description: "<p>Quando você provoca, insulta, expõe ou atiça um alvo dentro do alcance Distante, faça uma Rolagem de Presença contra ele.</p><p>Uma vez por descanso, em um sucesso, role uma quantidade de d4 igual à sua Proficiência. O alvo marca Estresse igual ao maior resultado.</p>" },
  { name: "Sensory Overload", img: CPR("dlc/gear/telectronics_minimag_speakers"), level: 3, recallCost: 1, type: "spell", clone: "Hypnotic Shimmer", description: "<p>Faça uma Rolagem de Interface contra todos os alvos dentro do alcance Próximo de você. Uma vez por descanso, em um sucesso, crie uma exibição esmagadora de anúncios piscando, estática de braindance, distorção sonora, cores de hard-light ou projeções táticas que deixa temporariamente <strong>Stunned</strong> os alvos contra os quais teve sucesso e os força a marcar 1 Estresse.</p><p>Enquanto Stunned, eles não podem usar reações nem fazer qualquer outra ação até limparem essa condição.</p>" },
  { name: "Voice of Authority", img: CPR("cyberware/chyron"), level: 3, recallCost: 1, type: "ability", clone: "Voice of Reason", description: "<p>Você fala com uma confiança sem igual, presença de comando ou autoridade cultivada. Tem vantagem em rolagens de ação para acalmar situações violentas ou convencer alguém a seguir a sua liderança.</p><p>Além disso, você ganha coragem sob pressão: quando todo o seu Estresse está marcado, ganhe +1 de Proficiência nas rolagens de dano.</p>" },
  { name: "Crisis Counseling", img: CPR("gear/personal_carepak"), level: 4, recallCost: 1, type: "ability", clone: "Soothing Speech", description: "<p>Durante um descanso curto, quando você dedica tempo para confortar, estabilizar, orientar ou apoiar emocionalmente outro personagem enquanto usa nele o movimento de tempo livre Cuidar dos Ferimentos, ele limpa 1 Ponto de Vida adicional.</p><p>Quando fizer isso, você também limpa 2 Pontos de Vida.</p>" },
  { name: "Bait the Mark", img: CPR("dlc/cyberware/leads_turn_on_show_off_nails"), level: 4, recallCost: 1, type: "ability", description: "<p>Descreva como você provoca, desafia, humilha, expõe ou atiça um alvo dentro do alcance Próximo e faça uma Rolagem de Presença contra ele.</p><p>Em um sucesso, o alvo marca 1 Estresse e, na próxima vez que o mestre der o Holofote a ele, ele precisa te atacar, e faz o ataque com desvantagem.</p>" },
  { name: "Thought Profile", img: CPR("cyberware/braindance_recorder"), level: 5, recallCost: 2, type: "spell", clone: "Thought Delver", description: "<p>Você lê padrões nos outros por microexpressões, estresse na voz, vazamentos neurais, câmeras de vigilância ou perfil emocional. Gaste 1 Esperança para ler os pensamentos superficiais e vagos de um alvo dentro do alcance Distante.</p><p>Faça uma Rolagem de Interface contra o alvo para ir atrás de pensamentos mais profundos e escondidos. Numa rolagem com Medo, o alvo pode, a critério do mestre, perceber que você está lendo ele.</p>" },
  { name: "Discord Trigger", img: CPR("dlc/cyberware/animal_behaviour_chip"), level: 5, recallCost: 1, type: "spell", clone: "Words of Discord", description: "<p>Sussurre palavras de discórdia, transmita uma ordem falsa, explore uma rivalidade ou acione um comando comportamental num adversário dentro do alcance Corpo a Corpo, e faça uma Rolagem de Interface (13). Em um sucesso, o alvo marca 1 Estresse e ataca outro adversário em vez de você ou seus aliados.</p><p>Terminado esse ataque, o alvo percebe o que aconteceu. Na próxima vez que você rodar Discord Trigger nele, sofra −5 na Rolagem de Interface.</p>" },
  { name: "Never Off Camera", img: CPR("cyberware/shoulder_cam"), level: 6, recallCost: 2, type: "ability", clone: "Never Upstaged", description: "<p>Quando você marca 1 ou mais Pontos de Vida por um ataque, pode marcar 1 Estresse para colocar nesta carta marcadores iguais aos Pontos de Vida marcados.</p><p>No seu próximo ataque bem-sucedido, ganhe +5 na rolagem de dano por marcador na carta e depois limpe todos os marcadores.</p>" },
  { name: "Talk To Me", img: CPR("dlc/cyberware/cyberaudio_suite"), level: 6, recallCost: 0, type: "ability", clone: "Share the Burden", description: "<p>Uma vez por descanso, assuma o Estresse de uma criatura voluntária dentro do alcance Corpo a Corpo. O alvo descreve que conhecimento íntimo, estática emocional, medo pessoal ou memória privada vaza da mente dele nesse momento entre vocês.</p><p>Transfira para você qualquer quantidade do Estresse marcado dele e ganhe 1 Esperança por Estresse transferido.</p>" },
  { name: "Endless Charisma", img: CPR("dlc/gear/smart-vanity"), level: 7, recallCost: 1, type: "ability", clone: "Endless Charisma", description: "<p>Depois de fazer uma rolagem de ação para persuadir, mentir, negociar, se apresentar, comandar, manipular ou conquistar simpatia, você pode gastar 1 Esperança para rolar de novo o Dado de Esperança ou de Medo.</p>" },
  { name: "Influence-Synced", img: CPR("cyberware/light_tattoo"), level: 7, recallCost: 2, type: "ability", clone: "Grace-Touched", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Influence, ganhe o seguinte:</p><ul><li>Você pode marcar um Espaço de Armadura em vez de marcar 1 Estresse.</li><li>Quando você fosse forçar um alvo a marcar uma quantidade de Pontos de Vida, pode forçá-lo a marcar essa mesma quantidade de Estresse em vez disso.</li></ul>" },
  { name: "Remote Persona", img: CPR("cyberware/microvideo"), level: 8, recallCost: 0, type: "spell", clone: "Astral Projection", description: "<p>Uma vez por descanso longo, marque 1 Estresse para criar uma cópia projetada, persona remota, avatar de hard-light, corpo de transmissão hackeada ou procurador social de você mesmo, que pode aparecer em qualquer lugar onde você já esteve.</p><p>Você vê e ouve pela projeção como se fosse você e afeta o mundo como se estivesse lá. Uma criatura que investigue a projeção percebe que ela é artificial, digital ou gerada por tecnologia. O efeito dura até o seu próximo descanso ou até a projeção sofrer qualquer dano.</p>" },
  { name: "Mass Captivation", img: CPR("gear/electric_guitar"), level: 8, recallCost: 3, type: "spell", clone: "Mass Enrapture", description: "<p>Faça uma Rolagem de Interface contra todos os alvos dentro do alcance Distante. Os alvos contra os quais tiver sucesso ficam temporariamente <strong>Captivated</strong>. Enquanto Captivated, a atenção do alvo fica presa em você, estreitando o campo de visão dele e abafando qualquer som que não seja a sua voz, transmissão, performance ou projeção.</p><p>Marque 1 Estresse para forçar todos os alvos Captivated a marcar 1 Estresse, encerrando este protocolo.</p>" },
  { name: "Adaptive Persona", img: CPR("cyberware/techhair"), level: 9, recallCost: 3, type: "spell", clone: "Copycat", description: "<p>Uma vez por descanso longo, esta carta pode imitar as features de outra carta de domínio de nível 8 ou menor no loadout de outro jogador. Gaste Esperança igual à metade do nível da carta para ganhar acesso à feature.</p><p>Isso dura até o seu próximo descanso ou até o outro jogador colocar a carta no cofre.</p>" },
  { name: "Master of the Craft", img: CPR("cyberware/skill_chip"), level: 9, recallCost: 0, type: "ability", clone: "Master of the Craft", description: "<p>Ganhe +2 permanente em duas das suas Experiências ou +3 permanente em uma delas. Depois, coloque esta carta no seu cofre permanentemente.</p>" },
  { name: "Signal Boost", img: CPR("gear/radio_scanner_music_player"), level: 10, recallCost: 1, type: "spell", clone: "Encore", description: "<p>Quando um aliado dentro do alcance Próximo causa dano a um adversário, você pode fazer uma Rolagem de Interface contra esse mesmo alvo. Em um sucesso, você causa ao alvo o mesmo dano que o aliado causou.</p><p>Se a Rolagem de Interface tiver sucesso com Medo, coloque esta carta no seu cofre.</p>" },
  { name: "Notorious", img: CPR("dlc/gear/wall-art"), level: 10, recallCost: 0, type: "ability", clone: "Notorious", description: "<p>As pessoas sabem quem você é e o que você fez, e te tratam diferente por causa disso. Quando você usa a sua fama para conseguir o que quer, pode marcar 1 Estresse antes de rolar para ganhar +10 no resultado.</p><p>Sua comida e bebida são sempre de graça aonde quer que vá, e todo o resto que você compra tem o preço reduzido em uma sacola de dinheiro, crédito, escambo ou ouro, até o mínimo de um punhado. Esta carta não conta para o máximo de 5 cartas de domínio do seu loadout e não pode ser colocada no cofre.</p>" }
];

// Frontier: releituras das cartas oficiais de Sage (Solar Flare Array = Stunning Sunlight, de Splendor).
// Street Instinct e Forecast Model não têm equivalente oficial: ficam com o texto (e uma ação simples).
const FRONTIER_CARDS = [
  { name: "Street Instinct", img: CPR("cyberware/olfactory_boost"), level: 1, recallCost: 0, type: "ability", description: "<p>Uma vez por descanso, quando você entra num ambiente urbano, em ruínas ou hostil, faça uma Rolagem de Instinto (12). Em um sucesso, coloque um marcador de Rua nesta carta. Num sucesso com Esperança, coloque dois.</p><ul><li><strong>Cover Line:</strong> quando você é alvo de um ataque de além do alcance Corpo a Corpo, gaste este marcador para ganhar +2 de Evasão contra esse ataque.</li><li><strong>Open Lane:</strong> gaste este marcador para se mover para um ponto dentro do alcance Distante.</li><li><strong>Hazard Mark:</strong> quando causar dano, gaste este marcador para somar 1d6 de dano.</li></ul><p>Limpe os marcadores não usados ao descansar.</p>" },
  { name: "Trapline Launcher", img: CPR("weapons/Crossbow"), level: 1, recallCost: 1, type: "spell", clone: "Vicious Entangle", damageType: "physical", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Num acerto, você dispara uma linha de captura no alvo. Ele sofre 1d8+1 de dano físico e fica Imobilizado.</p><p>Além disso, você pode gastar 1 Esperança para lançar uma segunda linha contra outro adversário dentro do alcance Próximo do alvo, deixando-o temporariamente Imobilizado.</p>" },
  { name: "Trail Reader", img: CPR("cyberware/radar_sonar_implant"), level: 1, recallCost: 0, type: "ability", clone: "Gifted Tracker", description: "<p>Quando você rastreia uma criatura, veículo ou comboio específico, pode gastar qualquer quantidade de Esperança e fazer essa mesma quantidade de perguntas ao mestre. Quando encontrar alvos rastreados desse jeito, ganhe +1 de Evasão contra eles.</p><ol><li>Em que direção eles foram?</li><li>Há quanto tempo passaram por aqui?</li><li>O que eles estavam fazendo aqui?</li><li>Quantos deles estavam aqui?</li></ol>" },
  { name: "Field Swarm", img: CPR("upgrades/onboard_rocket_pod"), level: 2, recallCost: 1, type: "grimoire", clone: "Conjure Swarm", actionNames: { "Tekaira's Armored Beetles: Stress": "Guardian Swarm", "Keep Beetles": "Manter o Enxame", "Fire Flies: Cast": "Razor Swarm" }, damageType: "physical", description: "<p><strong>Guardian Swarm:</strong> marque 1 Estresse para soltar microdrones de escudo que te cercam. Quando sofrer dano, reduza a gravidade em um limiar. Você pode gastar 1 Esperança para manter o enxame ativo depois de sofrer dano.</p><p><strong>Razor Swarm:</strong> faça uma Rolagem de Interface contra todos os adversários dentro do alcance Próximo. Gaste 1 Esperança para lançar o enxame numa explosão de impactos de microdrones. Os alvos contra os quais teve sucesso sofrem 2d8+3 de dano físico.</p>" },
  { name: "Scout Companion", img: CPR("dlc/gear/savannah-panther"), level: 2, recallCost: 1, type: "spell", clone: "Natural Familiar", description: "<p>Gaste 1 Esperança para chamar uma ciberfera ou drone batedor para o seu lado até o seu próximo descanso, até rodar Scout Companion de novo ou até o companheiro ser alvo de um ataque. Se gastar 1 Esperança extra, pode chamar um companheiro que voa.</p><p>Você pode se comunicar com ele, fazer uma Rolagem de Interface para comandá-lo a realizar tarefas simples e marcar 1 Estresse para ver pelos olhos dele. Quando você causa dano a um adversário dentro do alcance Corpo a Corpo do companheiro, soma um d6 à rolagem de dano.</p>" },
  { name: "Corrosive Round", img: CPR("ammo/paintball_acid"), level: 3, recallCost: 1, type: "spell", clone: "Corrosive Projectile", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, cause d6+4 de dano techno usando a sua Proficiência.</p><p>Além disso, marque 2 ou mais de Estresse para deixá-lo permanentemente <strong>Corroded</strong>. Enquanto Corroded, o alvo sofre −1 na Dificuldade para cada 2 de Estresse que você gastou. Esta condição é cumulativa.</p>" },
  { name: "Deployable Ascender", img: CPR("gear/rope"), level: 3, recallCost: 1, type: "spell", clone: "Towering Stalk", description: "<p>Uma vez por descanso, você pode instalar uma torre de ancoragem, linha de escalada ou equipamento de subida rápida dentro do alcance Próximo, fácil de escalar. A altura dele pode chegar até o alcance Distante.</p><p>Marque 1 Estresse para usar este protocolo como ataque: faça uma Rolagem de Interface contra um adversário ou grupo de adversários dentro do alcance Próximo. O equipamento que surge ergue no ar os alvos contra os quais teve sucesso e os derruba, causando d8 de dano físico usando a sua Proficiência.</p>" },
  { name: "Grapple Snare", img: CPR("dlc/gear/ion_cuffs"), level: 4, recallCost: 1, type: "spell", clone: "Death Grip", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Próximo e escolha uma:</p><ol><li>Você puxa o alvo para o alcance Corpo a Corpo ou se puxa para o alcance Corpo a Corpo dele.</li><li>Você aperta o alvo e o força a marcar 2 de Estresse.</li><li>Todos os adversários entre você e o alvo precisam ter sucesso numa Rolagem de Reação (13) ou são pegos pelos cabos, sofrendo 3d6+2 de dano físico.</li></ol><p>Em um sucesso, a armadilha sai das suas mãos, equipamento, veículo ou drone, causando o efeito escolhido e deixando o alvo temporariamente Imobilizado.</p>" },
  { name: "Forecast Model", img: CPR("gear/radar_detector"), level: 4, recallCost: 1, type: "spell", description: "<p>Uma vez por descanso, gaste 2 Esperança para fazer uma avaliação tática do ambiente atual, usando dados de rota, scans do terreno, marcas locais, sinais de gangue, mapas antigos ou instinto de sobrevivência. Faça ao mestre uma pergunta de sim ou não sobre a área, rota, perigo, estrutura ou situação atual. O mestre responde com sinceridade com base no que está presente ou é razoavelmente detectável.</p><p>Depois da resposta, na próxima vez que você ou um aliado agir diretamente com base nessa informação, ganha +2 na rolagem de ação.</p>",
    actions: featureAction({ name: "Forecast Model", img: CPR("gear/radar_detector"), costs: [{ key: "hope", value: 2 }], uses: { max: 1, recovery: "shortRest" }, target: { type: "self", amount: null } }) },
  { name: "Razor Mesh", img: CPR("cyberware/skin_weave"), level: 5, recallCost: 1, type: "spell", clone: "Thorn Skin", description: "<p>Uma vez por descanso, gaste 1 Esperança para se cobrir de malha de lâminas, espinhos reativos ou nanofibras defensivas e coloque nesta carta marcadores iguais ao seu atributo de Interface.</p><p>Quando sofrer dano, pode gastar qualquer quantidade de marcadores para rolar essa quantidade de d6. Some os resultados e reduza o dano recebido nesse valor. Se estiver dentro do alcance Corpo a Corpo do atacante, cause esse mesmo dano de volta a ele. Quando descansar, limpe os marcadores não usados.</p>" },
  { name: "Field Bunker", img: CPR("gear/tent_and_camping_equipment"), level: 5, recallCost: 1, type: "spell", clone: "Wild Fortress", description: "<p>Faça uma Rolagem de Interface (13). Em um sucesso, gaste 2 Esperança para montar um bunker de sobrevivência, barricada natural, domo de sucata, abrigo de casco rígido, cobertura de emergência ou estrutura defensiva de montagem rápida, onde você e um aliado podem se proteger.</p><p>Dentro do bunker, uma criatura não pode ser alvo de ataques e não pode atacar. Ataques contra o bunker têm sucesso automaticamente. O bunker tem os limiares de dano abaixo e dura até marcar 3 Pontos de Vida (use marcadores nesta carta). <strong>Limiares: 15/30.</strong></p>" },
  { name: "Convoy Vehicles", img: CPR("vehicles/helicopter"), level: 6, recallCost: 0, type: "spell", clone: "Conjured Steeds", description: "<p>Gaste qualquer quantidade de Esperança para chamar ou garantir essa mesma quantidade de veículos simples, motos, feras, cibermontarias, drones ou transportes de sobrevivência que você e seus aliados podem conduzir até o seu próximo descanso longo ou até os veículos sofrerem qualquer dano.</p><p>Os veículos dobram o seu deslocamento em viagem e, em perigo, permitem se mover dentro do alcance Distante sem rolar. Criaturas conduzindo um veículo sofrem −2 nas rolagens de ataque e ganham +2 nas rolagens de dano.</p>" },
  { name: "Scavenger", img: CPR("gear/mre"), level: 6, recallCost: 1, type: "ability", clone: "Forager", description: "<p>Como um movimento de tempo livre adicional, role um d6 para ver o que você recolhe. Descreva com o mestre e adicione ao inventário como consumível. O grupo pode carregar até cinco consumíveis recolhidos por vez.</p><ol><li>Uma ração única, estimulante ou item de conforto (limpa 2 de Estresse).</li><li>Uma relíquia bonita, bugiganga valiosa ou achado do mercado negro (ganha 2 de Esperança).</li><li>Um chip de acesso antigo, marcador de rota ou módulo de campo (+2 numa Rolagem de Interface).</li><li>Um frasco médico, curativo de trauma ou estabilizador de emergência (limpa 2 PV).</li><li>Um amuleto da sorte, dado viciado ou ficha do velho mundo (rola de novo qualquer dado).</li><li>Escolha uma das opções acima.</li></ol>" },
  { name: "Frontier-Synced", img: CPR("gear/radiation_suit"), level: 7, recallCost: 2, type: "ability", clone: "Sage-Touched", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Frontier, ganhe o seguinte:</p><ul><li>Enquanto estiver num ambiente urbano, em ruínas ou hostil, ganhe +2 nas Rolagens de Interface.</li><li>Uma vez por descanso, você pode dobrar a sua Agilidade ou Instinto numa rolagem que usa esse atributo. Escolha isso antes de rolar.</li></ul>" },
  { name: "Survival Overclock", img: CPR("drugs/boost"), level: 7, recallCost: 2, type: "spell", clone: "Wild Surge", description: "<p>Uma vez por descanso longo, marque 1 Estresse para ativar um overclock de sobrevivência, levando além dos limites seguros o seu equipamento de sobrevivência, software de reflexos, filtros de perigo, assistências de movimento, scanners de terreno e estimulantes de emergência. Descreva como entra em modo de sobrevivência e coloque um d6 nesta carta com o 1 virado para cima.</p><p>Enquanto o Dado de Survival Overclock estiver ativo, some o valor dele a todas as suas rolagens de ação. Depois de somar o valor a uma rolagem, aumente o valor do dado em um. Quando o valor passaria de 6 ou você descansar, o overclock queima e você marca 1 Estresse adicional.</p>" },
  { name: "Field Markers", img: CPR("gear/roadflare"), level: 8, recallCost: 2, type: "spell", clone: "Forest Sprites", description: "<p>Faça uma Rolagem de Interface (13). Em um sucesso, gaste qualquer quantidade de Esperança para criar a mesma quantidade de marcadores de campo em pontos à sua escolha dentro do alcance Distante, com estes benefícios:</p><ul><li>Aliados ganham +3 nas rolagens de ataque contra adversários dentro do alcance Muito Próximo de um marcador.</li><li>Aliados que marcam Armadura dentro do alcance Muito Próximo de um marcador podem marcar uma Armadura extra.</li></ul><p>Um marcador some depois de dar um benefício ou sofrer qualquer dano.</p>" },
  { name: "Solar Flare Array", img: CPR("gear/flashlight"), level: 8, recallCost: 2, type: "spell", clone: "Stunning Sunlight", description: "<p>Faça uma Rolagem de Interface para disparar uma rajada de cartuchos de sinalização incandescentes contra todos os adversários dentro do alcance Distante. Em um sucesso, gaste qualquer quantidade de Esperança e force essa quantidade de alvos contra os quais teve sucesso a fazer uma Rolagem de Reação (14).</p><p>Quem tiver sucesso sofre 3d20+3 de dano techno. Quem falhar sofre 4d20+5 de dano techno e fica temporariamente <strong>Blinded</strong>. Enquanto Blinded, tem desvantagem em rolagens de ataque e não pode ter como alvo nada além do alcance Próximo, a menos que perceba por outro sentido.</p>" },
  { name: "Frontier Shrine", img: CPR("gear/glowstick"), level: 9, recallCost: 2, type: "ability", clone: "Fane of the Wilds", description: "<p>Depois de um descanso longo, coloque nesta carta marcadores iguais à quantidade de cartas de domínio de Frontier no seu loadout e cofre. Quando fizer uma Rolagem de Interface, pode gastar qualquer quantidade de marcadores depois da rolagem para ganhar +1 por marcador gasto.</p><p>Quando tiver um sucesso crítico numa Rolagem de Interface de um protocolo de Frontier, ganhe um marcador. Quando fizer um descanso longo, limpe os marcadores não usados.</p>" },
  { name: "Zone Reconfiguration", img: CPR("upgrades/housing_capacity"), level: 9, recallCost: 1, type: "spell", clone: "Plant Dominion", description: "<p>Faça uma Rolagem de Interface (18). Uma vez por descanso longo, em um sucesso, você reconfigura a zona de combate ao redor em qualquer lugar dentro do alcance Distante, usando equipamento de engenharia de campo, cargas de demolição, barricadas portáteis, drones de construção, foamcrete, espinhos de estrada, lasers de corte ou infraestrutura comprometida.</p><p>Por exemplo: abrir caminho por destroços densos, derrubar coberturas instáveis, abrir uma brecha numa zona destruída, erguer um muro de sucata e barricadas, expor infraestrutura enterrada, criar uma rampa ou ponte, ou alterar a cobertura disponível no campo de batalha. A mudança precisa ser algo plausível de fazer com maquinário, demolição ou construção.</p>" },
  { name: "Ruinbreaker Rig", img: CPR("gear/linearframe_sigma"), level: 10, recallCost: 2, type: "spell", clone: "Force of Nature", actionNames: { "Transform": "Ativar o Rig" }, description: "<p>Marque 1 Estresse para ativar um exo-equipamento pesado de sobrevivência. Enquanto ativo, suportes hidráulicos travam no lugar, ferramentas de corte se abrem, placas de armadura se reposicionam, filtros de perigo entram em overclock e o seu equipamento entra em modo de rompimento total. Você ganha:</p><ul><li>Quando tem sucesso num ataque ou Rolagem de Interface, some +10 ao dano.</li><li>Quando causa dano suficiente para derrotar uma criatura dentro do alcance Próximo, você arranca blindagem utilizável, drena uma célula de energia ou aciona espuma de reparo de emergência e limpa um Espaço de Armadura.</li><li>Você não pode ficar Imobilizado.</li></ul><p>Antes de fazer uma rolagem de ação, você precisa gastar 1 Esperança. Se não puder, o equipamento superaquece, trava ou queima a carga de emergência, e você volta ao estado normal.</p>" },
  { name: "Zone Suppression Array", img: CPR("gear/cryopump"), level: 10, recallCost: 2, type: "spell", clone: "Tempest", actionNames: { "Blizzard": "Cryofoam Flood", "Hurricane": "Vector Fan Grid", "Sandstorm": "Chaffstorm Screen" }, description: "<p>Escolha um modo de supressão e faça uma Rolagem de Interface contra todos os alvos dentro do alcance Distante. Os alvos contra os quais tiver sucesso sofrem os efeitos até o mestre gastar 1 Medo no turno dele para encerrar este protocolo.</p><ol><li><strong>Cryofoam Flood:</strong> você rompe cilindros criogênicos, linhas de refrigeração ou tanques de supressão de emergência pela zona. Cause 2d20+8 de dano techno; os alvos ficam temporariamente Vulneráveis.</li><li><strong>Vector Fan Grid:</strong> você ativa ventiladores industriais, drones de turbina, respiros de pressão, barreiras de trânsito ou motores de força direcional. Cause 3d10+10 de dano techno e escolha a direção da pressão. Os alvos não podem se mover contra essa direção.</li><li><strong>Chaffstorm Screen:</strong> você enche a zona de poeira, chaff, fumaça, partículas de sucata, ruído de sensor e interferência visual hostil. Cause 5d6+9 de dano techno. Ataques feitos de além do alcance Corpo a Corpo têm desvantagem.</li></ol>" }
];

// Medtech: releituras das cartas oficiais de Splendor (Lean On Me vem de Valor; Trauma Field = Healing
// Field e Rejuvenation Barrier, de Sage).
const MEDTECH_CARDS = [
  { name: "Vital Beacon", img: CPR("gear/homing_tracer"), level: 1, recallCost: 1, type: "spell", clone: "Bolt Beacon", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, gaste 1 Esperança para marcá-lo com um scanner vital, laser cirúrgico, sinalizador bioelétrico ou rastreador diagnóstico, causando d8+2 de dano techno usando a sua Proficiência.</p><p>O alvo fica temporariamente Vulnerável e visivelmente marcado até a condição ser limpa.</p>" },
  { name: "Field Patch", img: CPR("drugs/antibiotics"), level: 1, recallCost: 1, type: "spell", clone: "Mending Touch", description: "<p>Quando você pode tirar alguns minutos para se concentrar numa criatura que está ajudando, gaste 2 Esperança para usar espuma de trauma, suturas, gel de nanitos, bloqueadores de dor, software de terapia ou estabilizadores de emergência e limpar 1 PV ou 1 Estresse.</p><p>Uma vez por descanso longo, quando você usa esse tempo para aprender algo novo sobre a criatura ou revelar algo sobre você, pode limpar 2 PV ou 2 de Estresse dela em vez disso.</p>" },
  { name: "Reassurance", img: CPR("status/veritas"), level: 1, recallCost: 0, type: "ability", clone: "Reassurance", description: "<p>Uma vez por descanso, depois que um aliado tenta uma rolagem de ação, mas antes das consequências acontecerem, você pode orientar, acalmar a respiração dele, acionar um estabilizador, gritar um comando treinado ou ajudá-lo a atravessar o choque.</p><p>Quando fizer isso, o aliado pode rolar os dados de novo.</p>" },
  { name: "Emergency Procedure", img: CPR("gear/air_hypo"), level: 2, recallCost: 1, type: "spell", clone: "Healing Hands", description: "<p>Faça uma Rolagem de Interface (13) tendo como alvo uma criatura que não seja você dentro do alcance Corpo a Corpo. Em um sucesso, marque 1 Estresse para limpar 2 PV ou 2 de Estresse do alvo. Em uma falha, marque 1 Estresse para limpar 1 PV ou 1 Estresse do alvo.</p><p>Você não pode curar o mesmo alvo com Emergency Procedure de novo até o seu próximo descanso longo.</p>" },
  { name: "Last Record", img: CPR("cyberware/memory_chip"), level: 2, recallCost: 1, type: "spell", clone: "Final Words", description: "<p>Você consegue extrair o último registro biológico, neural ou cibernético de um cadáver, implante danificado, chip de memória ou biomonitor morto. Faça uma Rolagem de Interface (13). Num sucesso com Esperança, descobre a resposta para três perguntas. Num sucesso com Medo, para uma pergunta.</p><p>A informação é confiável, mas você não descobre nada além do que o alvo sabia ou testemunhou em vida. Numa falha, ou depois de conseguir as respostas, o corpo, implante ou fonte de dados fica inutilizável para este protocolo.</p>" },
  { name: "Second Wind", img: CPR("drugs/speedheal"), level: 3, recallCost: 2, type: "ability", clone: "Second Wind", description: "<p>Uma vez por descanso, quando você acerta um ataque contra um adversário, pode acionar adrenalina, picos de endorfina, bloqueadores de dor, drogas de combate ou reflexos de sobrevivência para limpar 3 de Estresse ou 1 PV.</p><p>Num sucesso com Esperança, você também aciona isso num aliado dentro do alcance Próximo, que limpa 3 de Estresse ou 1 PV.</p>" },
  { name: "Lean On Me", img: CPR("status/sedative"), level: 3, recallCost: 1, type: "ability", clone: "Lean on Me", description: "<p>Uma vez por descanso longo, quando você estabiliza, consola, apoia ou ajuda um aliado a atravessar uma rolagem de ação que falhou, vocês dois podem limpar 2 de Estresse.</p><p>Isso pode ser trazê-lo de volta de um pânico, forçá-lo a respirar, aplicar uma dose calmante, reiniciar o feedback neural dele ou simplesmente se recusar a deixá-lo entrar em espiral.</p>" },
  { name: "Death Lock", img: CPR("status/deathtrance"), level: 4, recallCost: 1, type: "spell", clone: "Life Ward", description: "<p>Gaste 3 Esperança e escolha um aliado dentro do alcance Próximo. Ele é colocado sob um protocolo de trava de morte, como um override cardíaco, backup neural, bomba de sangue de emergência, curativo de estase de trauma ou Autoinjetor de Última Chance.</p><p>Quando esse aliado fosse fazer um movimento de morte, ele limpa 1 Ponto de Vida em vez disso. O efeito termina quando salva o alvo de um movimento de morte, quando você usa Death Lock em outro alvo ou quando faz um descanso longo.</p>" },
  { name: "Trauma Field", img: CPR("gear/generic_pharmaceuticals"), level: 4, recallCost: 2, type: "spell", clone: "Healing Field", description: "<p>Uma vez por descanso longo, você pode criar um campo de trauma ao seu redor usando drones médicos, névoa de nanitos, autoinjetores ou sinalizadores de triagem de emergência. Você e todos os aliados dentro do alcance Próximo limpam 1 PV.</p><p>Gaste 2 Esperança para que você e todos os aliados dentro do alcance Próximo limpem 2 PV em vez disso.</p>" },
  { name: "Emergency Fabricator", img: CPR("cyberware/tool_hand"), level: 5, recallCost: 1, type: "spell", clone: "Shape Material", description: "<p>Gaste 1 Esperança para montar um fabricador médico compacto, impressora de trauma ou ferramenta de reconstrução de emergência. Você pode criar, remodelar, reforçar ou consertar um objeto ou material dentro do alcance Próximo, não maior que você. Este protocolo é feito para uso médico, de sobrevivência e de emergência: por exemplo, imprimir um suporte protético temporário, selar uma ferida, criar uma ferramenta, estabilizar cyberware danificado ou moldar tecido sintético.</p><p>Se você usar este protocolo para ajudar uma criatura a agir apesar de um ferimento ou sistema falhando, ela ganha +2 na próxima rolagem de ação. Este protocolo não pode criar armas, máquinas complexas, eletrônicos avançados, munição, bens valiosos ou cyberware permanente.</p>" },
  { name: "Shock Charge", img: CPR("ammo/battery"), level: 5, recallCost: 2, type: "spell", clone: "Smite", description: "<p>Uma vez por descanso, gaste 3 Esperança para carregar uma arma, implante, equipamento de desfibrilação, ferramenta cirúrgica ou golpe de sobrecarga neural.</p><p>Na próxima vez que rolar dano, dobre o resultado da rolagem de dano.</p>" },
  { name: "Trauma Ward", img: CPR("cyberware/enhanced_antibodies"), level: 6, recallCost: 2, type: "spell", clone: "Zone of Protection", description: "<p>Faça uma Rolagem de Interface (16). Uma vez por descanso longo, em um sucesso, escolha um ponto dentro do alcance Distante e monte ali uma ala de trauma para todos os aliados dentro do alcance Muito Próximo desse ponto. Ela pode aparecer como um perímetro de drones médicos, clínica de hard-light, tenda cirúrgica, cortina de nanitos, campo de estabilização de emergência ou zona automatizada de suporte de vida.</p><p>Quando fizer isso, coloque um d6 nesta carta com o 1 virado para cima. Quando um aliado na zona sofre dano, ele o reduz pelo valor do dado. Depois, aumente o valor do dado em um. Quando o valor passaria de 6, o efeito termina.</p>" },
  { name: "Restoration Suite", img: CPR("cyberware/toxin_binders"), level: 6, recallCost: 2, type: "spell", clone: "Restoration", description: "<p>Depois de um descanso, coloque nesta carta marcadores iguais ao seu atributo de Interface. Toque uma criatura e gaste qualquer quantidade de marcadores para limpar 1 PV ou 1 Estresse por marcador.</p><p>Você também pode gastar 2 marcadores ao tocar uma criatura para limpar uma condição ou tratar um problema físico, cibernético ou psicológico. O mestre pode exigir mais marcadores dependendo da gravidade. Depois de um descanso, limpe todos os marcadores.</p>" },
  { name: "Combat Transfusion", img: CPR("cyberware/vampyres"), level: 7, recallCost: 1, type: "spell", clone: "Healing Strike", description: "<p>Quando você causa dano a um alvo, pode gastar 2 Esperança para limpar 1 PV de um aliado dentro do alcance Próximo.</p><p>Isso pode ser acionar um curativo de trauma ligado, liberar nanitos armazenados ou usar a biologia ou o maquinário exposto do inimigo para alimentar um tratamento de emergência.</p>" },
  { name: "Medtech-Synced", img: CPR("cyberware/biomonitor"), level: 7, recallCost: 2, type: "ability", clone: "Splendor-Touched", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Medtech, ganhe o seguinte:</p><ul><li>+3 no seu limiar de dano Severo.</li><li>Uma vez por descanso, quando um dano recebido fosse te fazer marcar PV, você pode marcar essa quantidade de Estresse ou gastar essa quantidade de Esperança em vez disso.</li></ul>" },
  { name: "Impact Reducer", img: CPR("cyberware/hardend_shielding"), level: 8, recallCost: 2, type: "spell", clone: "Shield Aura", description: "<p>Marque 1 Estresse para aplicar uma aura protetora num alvo dentro do alcance Próximo, como blindagem de emergência, supressão de dor ou reforço de nanitos. Quando o alvo marca um Espaço de Armadura, reduz a gravidade em um limiar extra.</p><p>Se este protocolo fizer uma criatura que sofreria dano não marcar nenhum PV, o efeito termina. Você só pode manter Impact Reducer em uma criatura por vez.</p>" },
  { name: "Rejuvenation Barrier", img: CPR("gear/cryotank"), level: 8, recallCost: 1, type: "spell", clone: "Rejuvenation Barrier", description: "<p>Faça uma Rolagem de Interface (15). Uma vez por descanso, em um sucesso, crie uma barreira temporária de blindagem móvel de suporte de vida ao seu redor, no alcance Próximo. Você e os aliados dentro da barreira quando o protocolo é ativado limpam 1d4 PV.</p><p>Enquanto a barreira estiver ativa, você e os aliados dentro dela têm resistência a dano físico vindo de fora da barreira. Quando você se move, a barreira te acompanha.</p>" },
  { name: "Clinical Authority", img: CPR("dlc/cyberware/psiberstuff_watch-man"), level: 9, recallCost: 2, type: "spell", clone: "Overwhelming Aura", description: "<p>Faça uma Rolagem de Interface (15) para ativar um amplificador neurológico de presença. Em um sucesso, gaste 2 Esperança para fazer a sua Presença ficar igual ao seu atributo de Interface até o seu próximo descanso longo.</p><p>Enquanto este protocolo estiver ativo, uma criatura precisa marcar 1 Estresse quando te tiver como alvo de um ataque.</p>" },
  { name: "Trauma Lance", img: CPR("weapons/microwaver"), level: 9, recallCost: 2, type: "spell", clone: "Salvation Beam", description: "<p>Faça uma Rolagem de Interface (16). Em um sucesso, marque qualquer quantidade de Estresse para ter como alvo uma linha de aliados dentro do alcance Distante com drones cirúrgicos, espuma de trauma, pulsos de suporte de vida ou sistemas de reparo de emergência.</p><p>Você pode limpar PV dos alvos igual à quantidade de Estresse marcado, dividido entre eles como quiser.</p>" },
  { name: "Invigoration", img: CPR("drugs/surge"), level: 10, recallCost: 3, type: "spell", clone: "Invigoration", description: "<p>Quando você ou um aliado dentro do alcance Próximo já usou uma feature que tem limite de uso, como uma vez por descanso ou uma vez por sessão, você pode gastar qualquer quantidade de Esperança e rolar essa quantidade de d6. Se algum resultado for 6, a feature pode ser usada de novo.</p><p>Isso pode representar estimulantes de emergência, backups de memória, reinício neural, descarga de adrenalina, overclock de cyberware ou forçar um corpo além dos limites seguros.</p>" },
  { name: "Lazarus Procedure", img: CPR("drugs/rapidetox"), level: 10, recallCost: 3, type: "spell", clone: "Resurrection", description: "<p>Faça uma Rolagem de Interface (20) sobre o corpo de uma criatura que morreu na cena atual. O corpo precisa estar em grande parte recuperável, ou deve haver um cérebro, núcleo neural, backup cibernético ou implante vital intacto com que você possa trabalhar. Em um sucesso, traga a criatura de volta à vida usando cirurgia de emergência, órgãos sintéticos, reinício neural, tecido clonado ou substituição cibernética.</p><p>A criatura restaurada limpa todos os PV marcados e depois marca 3 de Estresse. Ela volta viva, consciente e estável, mas abalada física e psicologicamente. Até o próximo descanso longo dela, fica temporariamente Vulnerável e não pode se beneficiar de Lazarus Procedure de novo. Depois, role um d6. Num resultado de 5 ou menos, coloque esta carta no seu cofre permanentemente.</p>" }
];

// Troca o tipo de todo dano das ações (ex: "physical" no lugar do "magical" da carta oficial).
function setDamageType(actions, type) {
  for (const action of Object.values(actions ?? {})) {
    const damage = action.damage;
    if (!damage) continue;
    for (const part of [damage.main, ...Object.values(damage.parts ?? {})]) {
      if (part?.type) part.type = [type];
    }
  }
}

// ---------- Redline e Blackwall (Competências sem classe; o acesso vem do cyberware) ----------
// Blackwall é a releitura do Dread oficial, carta a carta (clone do compêndio do sistema, como o Network).
// Redline vem do domínio Blood do The Void (conteúdo de playtest da Darrington Press), copiado do módulo
// the-void-unofficial (GPL-3.0, github.com/brunocalado/the-void-unofficial) para data/void-blood.json:
// a geração dos compêndios lê o arquivo, então o The Void não precisa estar instalado.
// patch ajusta a cópia aos números do PDF; as ações já estão com os nomes finais (actionNames).
const RB_TEXT = {
  "Neurospike": { level: 1, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, marque 1 Estresse para disparar no alvo um neurospike hostil, pulso de sobrecarga, sinal de rageware, exploit de editor de dor ou firmware de combate ilegal, causando d10 de dano techno usando a sua Proficiência. Num sucesso com Esperança, o alvo também marca 1 Estresse. Numa rolagem com Medo, você também precisa marcar 1 Estresse.</p>" },
  "Last-Resort Chip": { level: 1, recallCost: 0, type: "spell", description: "<p>Marque 1 Ponto de Vida para criar um chip de último recurso, patch de override de emergência, chave de adrenalina, gatilho de sobrevivência ou ficha de biofeedback ilegal alimentada pelos seus próprios sistemas instáveis. Quem carregar ganha o seguinte benefício:</p><ul><li><p>Sempre que fosse marcar 2 ou mais PV, pode gastar 1 Esperança para reduzir em 1 os PV marcados.</p></li></ul><p>O chip queima se você não tiver PV marcados ou usar este protocolo de novo.</p>" },
  "Pain Conversion": { level: 1, recallCost: 1, type: "ability", description: "<p>Se você tem pelo menos 1 PV marcado, ganha um bônus nas rolagens de dano igual ao dobro da quantidade de PV marcados. O seu editor de dor, motor adrenal, processador de ameaças ou software de agressão converte dano físico em rendimento de combate.</p>" },
  "Aggression Feedback": { level: 2, recallCost: 1, type: "spell", description: "<p>Quando você causa dano a uma criatura, marque 1 Estresse para gravar o perfil de ameaça dela no seu sistema Redline. Até este feedback terminar, seus implantes de combate, processadores adrenais, editor de dor e software de agressão ficam fixados no alvo. Você sempre sabe a direção dele em relação a você. Além disso, cada vez que essa criatura causar dano a você ou a um aliado dentro do alcance Muito Próximo, o seu sistema Redline dispara um pico de feedback hostil de volta pelo link, forçando-a a marcar 1 Estresse. O feedback termina quando você usa este protocolo de novo.</p>" },
  "Neurochemical Override": { level: 2, recallCost: 0, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Muito Próximo. Se usar este protocolo num aliado, role com vantagem. Em um sucesso, marque 1 Estresse e escolha um efeito:</p><ol><li><p>O alvo se acalma, estabilizado por sedativos ou regulação neural, e limpa 1 Estresse. Num sucesso com Esperança, limpa 2.</p></li><li><p>O alvo fica mais ansioso, sobrecarregado por adrenalina, químicos de pânico ou feedback hostil, e marca 1 Estresse. Num sucesso com Esperança, marca 2.</p></li></ol>" },
  "Redline Detonation": { level: 3, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface (12). Em um sucesso, marque 1 PV enquanto força os seus sistemas Redline além dos limites seguros, despejando calor excedente, sobrecarga neural, feedback de agressão ou saída instável de cyberware num ponto dentro do alcance Distante. Um pulso violento de distorção térmica, choque de pressão, grito de sensor ou resíduo de overclock enche a área dentro do alcance Muito Próximo desse ponto. Cada alvo na área marca 1 PV. Num sucesso com Esperança, cada alvo marca 2 PV.</p>" },
  "System Hijack": { level: 3, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra uma criatura dentro do alcance Distante. Em um sucesso, gaste 1 Esperança para sequestrar os músculos, cyberware, sistema nervoso ou resposta de dor do alvo numa breve explosão violenta. Você pode fazer o alvo se mover, atacar ou os dois; se fizer os dois, escolhe a ordem. Se fizer a criatura se mover, ela vai para um lugar que você escolher dentro do alcance Próximo dela. Se fizer a criatura atacar, faça uma Rolagem de Interface contra um alvo dentro do alcance Corpo a Corpo dela. Em um sucesso, cause d10 de dano físico usando a sua Proficiência.</p>" },
  "Killhook": { level: 4, recallCost: 1, type: "spell", description: "<p>Você lança um killhook, espigão magnético, cabo de tendão, arpão de monofilamento, âncora de recuo ou gancho de combate num lugar ou criatura dentro do alcance Distante. Se o alvo for um lugar, faça uma Rolagem de Interface (13). Em um sucesso, marque 1 Estresse para se puxar até uma posição dentro do alcance Corpo a Corpo dele. Se o alvo for uma criatura, faça uma Rolagem de Interface contra ela. Em um sucesso, marque 1 Estresse para causar 3d8 de dano físico ao alvo. Depois, você puxa o alvo direto até você ou se puxa direto até ele, terminando dentro do alcance Corpo a Corpo.</p>" },
  "Emergency Stim Share": { level: 4, recallCost: 1, type: "spell", description: "<p>Uma vez por descanso, marque 1 PV para inundar cada aliado dentro do alcance Próximo com drogas de combate, estabilizadores de trauma, estimulantes de emergência ou supressores de dor. Cada aliado afetado limpa 1 PV ou 1 Estresse. Você pode marcar 1 Estresse para esses aliados limparem um de cada.</p>" },
  "Feedback Retaliation": { level: 5, recallCost: 1, type: "spell", description: "<p>Quando um ataque de uma criatura te faz marcar um ou mais PV, você pode fazer uma Rolagem de Reação usando o seu atributo de Interface contra a criatura. Em um sucesso, o seu sistema Redline converte o impacto num contragolpe hostil pelo firmware de combate, relés de choque, rageware ou implantes de feedback neural, forçando a criatura a marcar a mesma quantidade de PV que você marcou. Você não pode usar este protocolo de novo até terminar um descanso.</p>" },
  "Cortical Splinter": { level: 5, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra uma criatura dentro do alcance Muito Distante. Em um sucesso, marque 1 PV para implantar um estilhaço cortical, spyware neural, pacote de biochip ou sinal de loop de dor que se enterra no sistema do alvo. Num sucesso com Esperança, o alvo não percebe o estilhaço. Você tem vantagem em Rolagens de Presença contra o alvo e, sempre que ele fizer uma rolagem, pode gastar 1 Esperança para dar desvantagem a ela. Você pode destruir o estilhaço para fazer o alvo marcar 1 PV.</p>" },
  "Redline Ward": { level: 6, recallCost: 1, type: "spell", description: "<p>Marque 1 PV para criar uma Redline Ward ao seu redor no alcance Muito Próximo. Pode parecer uma névoa de vapor refrigerante, luzes de alerta, distorção de pressão, névoa de droga de combate, estática de sensor hostil ou saída instável de cyberware vazando no ar ao seu redor. Dentro da ala, você tem resistência a dano físico ou techno, à sua escolha ao ativar este protocolo. Os aliados dentro da ala também ganham esse benefício. A ala desaparece se você sair dela, marcar 2 ou mais PV ou usar este protocolo de novo.</p>" },
  "Neuromuscular Lock": { level: 6, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, marque 1 Estresse enquanto ataca os músculos, cyberware, nervos, pressão sanguínea ou controle motor do alvo. Ele fica temporariamente Imobilizado e temporariamente Vulnerável. Cada vez que o alvo receber o Holofote enquanto qualquer uma dessas condições persistir, ele sofre d10 de dano techno usando a sua Proficiência. O protocolo termina antes no alvo se você usá-lo de novo.</p>" },
  "Redline-Synced": { level: 7, recallCost: 1, type: "ability", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Redline, ganhe o seguinte:</p><ul><li><p>Quando você sofre dano suficiente para marcar 2 ou mais Pontos de Vida, ganhe 1 Esperança.</p></li><li><p>Para cada 3 Pontos de Vida marcados, ganhe +1 de Evasão.</p></li></ul>" },
  "Siphon Strike": { level: 7, recallCost: 2, type: "spell", description: "<p>Quando você acerta uma rolagem de ataque contra um adversário e o faz marcar 2 ou mais PV, pode gastar 1 Esperança para limpar 1 PV ou 1 Estresse. Isso pode ser o seu sistema adrenal disparando, o editor de dor estabilizando, o firmware de combate recompensando a violência, o seu corpo confundindo o impacto com recuperação por um instante ou se forçando a estabilizar na base da adrenalina.</p>" },
  "Shared Overload": { level: 8, recallCost: 2, type: "spell", description: "<p>Gaste 1 Esperança para permitir que você e um aliado voluntário dentro do alcance Distante redistribuam os PV marcados entre os dois. Isso pode ser bombas de trauma ligadas, editores de dor compartilhados, troca de sangue de emergência, suporte de vida sincronizado, estresse de cyberware espelhado ou uma ponte neural perigosa que espalha o dano por dois sistemas instáveis. Você não pode ter esse aliado como alvo de Shared Overload de novo até terminar um descanso.</p>" },
  "Adrenaline Stack": { level: 8, recallCost: 1, type: "ability", description: "<p>Os seus sistemas Redline se infiltraram na sua corrente sanguínea, aprimorando o corpo em momentos de urgência. Quando você rola com vantagem, usa um d8 em vez de um d6 como dado de vantagem, se tiver 1 ou mais PV marcados. Depois de fazer uma Rolagem de Força, Agilidade ou Acuidade, pode marcar 1 PV para rolar 1d8 e somar ao resultado.</p>" },
  "Psycho Surge": { level: 9, recallCost: 2, type: "spell", description: "<p>Uma vez por descanso, gaste 1 Esperança para liberar ao seu redor uma onda violenta de adrenalina, ruído neural, instabilidade de rageware, implantes superaquecidos, falha do editor de dor e agressão à beira da ciberpsicose. Faça uma única Rolagem de Interface contra cada adversário dentro do alcance Próximo. Em um sucesso, o alvo marca 1 PV e 1 Estresse. Em uma falha, marca 1 Estresse. Cada aliado dentro do alcance Próximo marca 1 Estresse, mas limpa 1 PV.</p>" },
  "System Rupture": { level: 9, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra uma criatura dentro do alcance Distante. Em um sucesso, marque 1 PV para marcar o alvo com um amplificador de trauma, exploit de ferida, feedback de instabilidade neural, pico de pressão ou marca de nanitos hostis. A marca dura até o mestre gastar 2 Medo para removê-la ou você sofrer dano Severo. Sempre que o alvo marcar PV enquanto a marca durar, você pode marcar 1 Estresse para fazê-lo marcar 1 PV adicional.</p>" },
  "Refuse Shutdown": { level: 10, recallCost: 1, type: "ability", description: "<p>Quando você fosse marcar o seu último PV, gaste 1 Esperança para marcar 1 Estresse em vez disso. O seu coração reserva, estimulante de emergência, editor de dor, descarga adrenal ou implante de sobrevivência se recusa a deixar o seu corpo desligar.</p>" },
  "Kill-Switch Overdrive": { level: 10, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um adversário dentro do alcance Próximo. Em um sucesso, gaste 2 Esperança para marcar de 1 a 3 PV. O alvo marca o dobro dos Pontos de Vida que você marcou. Se isso fizer o alvo marcar o último PV dele, você pode limpar os PV que marcou para ativar este protocolo. Isso pode ser um golpe de overclock letal, execução de rageware, kill-switch neural, queima de cyberware, detonação adrenal ou uma pane de sistema à queima-roupa que converte o colapso do alvo na sua sobrevivência.</p>" },
  "Corruption Spike": { level: 1, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, o alvo sofre d6 de dano techno usando a sua Proficiência, enquanto um sinal corrompido, pacote de Black ICE ou daemon hostil rasga o sistema dele. Na próxima vez que o alvo causar dano, esse dano é reduzido em 1d6. Num sucesso com Medo, o alvo sofre d10 de dano techno usando a sua Proficiência em vez disso.</p>" },
  "Dead Channel": { level: 1, recallCost: 0, type: "spell", description: "<p>Você deixa uma IA corrompida falar por um canal morto, alto-falante quebrado ou implante sequestrado para atormentar um alvo. Faça uma Rolagem de Interface contra uma criatura que você pode ver. Em um sucesso, ela marca 1 Estresse e fica temporariamente Vulnerável.</p>" },
  "Blackwall Shroud": { level: 1, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface (10). Em um sucesso, gaste qualquer quantidade de Esperança e coloque a mesma quantidade de marcadores nesta carta, envolvendo-se em ruído de sensor, sombra digital, sobreposições corrompidas, IA assombrada ou distorção de sinal. Depois que uma rolagem de ataque é feita contra você, pode gastar qualquer quantidade de marcadores para ganhar +1 de Evasão por marcador contra esse ataque.</p>" },
  "Backlash Daemon": { level: 2, recallCost: 2, type: "spell", description: "<p>Quando um aliado dentro do alcance Próximo sofre dano de um alvo que você pode ver, você pode fazer uma Rolagem de Reação contra esse alvo usando o seu atributo de Interface. Em um sucesso, marque 1 Estresse para liberar um daemon retaliatório, grito de sistema ou contragolpe invasivo de Black ICE, causando d6 de dano techno usando a sua Proficiência.</p>" },
  "Drain Signal": { level: 2, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, uma vez por descanso curto, o alvo sofre d8 de dano techno usando a sua Proficiência e você limpa 2 PV. Num sucesso com Medo, você limpa 3 PV. Isso pode ser drenar energia, roubar biofeedback, sugar carga de processador, se alimentar do pânico neural ou deixar um daemon extrair algo útil do alvo.</p>" },
  "Panic Script": { level: 3, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, o alvo marca 1d4 de Estresse enquanto você inunda o HUD, os sentidos, os implantes ou os sistemas dele com sinais corrompidos. Você pode fazer o alvo fugir um alcance para longe de você. Também pode gastar 1 Esperança para deixar o alvo temporariamente Vulnerável.</p>" },
  "Neural Burden Sync": { level: 3, recallCost: 1, type: "spell", description: "<p>Uma vez por descanso, você pode redistribuir qualquer quantidade de PV marcados entre dois alvos voluntários que você pode tocar. Isso pode ser sincronizar dados proibidos da Blackwall, redistribuir a carga do sistema, descarregar um colapso neurológico ou dividir a dor entre dois corpos por biomonitores ligados.</p>" },
  "System Decay": { level: 4, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, gaste 1 Esperança para infectá-lo com firmware corrompido ou código obsoleto que o sistema dele não sabe mais processar. O alvo fica temporariamente <strong>Degraded</strong>. Enquanto Degraded, usa um d12 em vez de um d20 nas rolagens de ataque. Você só pode manter este protocolo em uma criatura por vez.</p>" },
  "Daemon Proxy": { level: 4, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, gaste 1 Esperança para invocar um daemon procurador, construto hostil, estilhaço de IA ou horror digital que ataca o alvo e causa d10 de dano techno usando a sua Proficiência. O alvo também faz uma Rolagem de Reação (12) para resistir à intrusão. Em uma falha, marca 1d4 de Estresse. Depois do ataque, o procurador se dissipa.</p>" },
  "Ghost Fog": { level: 5, recallCost: 0, type: "spell", description: "<p>Faça uma Rolagem de Interface (13). Em um sucesso, gaste 1 Esperança para inundar a área ao seu redor com névoa fantasma: estática de sensor, névoa de chaff, luz corrompida, imagens residuais digitais ou projeções invasivas de mapeamento de rota. Você e quaisquer alvos dentro do alcance Próximo ficam momentaneamente incorpóreos para sistemas de segurança e barreiras automatizadas, podendo atravessar uma passagem selada que tenha um desvio físico ou digital plausível. O protocolo dura até vocês atravessarem a barreira.</p>" },
  "Relic Edge": { level: 5, recallCost: 1, type: "spell", description: "<p>Gaste 1 Esperança para carregar a sua arma com uma rotina de combate da Blackwall até o seu próximo descanso. Quando atacar com essa arma, use o seu atributo de Interface em vez do atributo que ela normalmente pede. Em um sucesso, role uma quantidade de d8 igual ao Medo atual do mestre, até o seu nível, e cause esse dano techno enquanto o cyberware, o sistema nervoso ou a interface de armadura do alvo é aberto por código corrompido. Se tiver sucesso com Medo, o alvo também marca 1 Estresse.</p>" },
  "Corrupted Protocol": { level: 6, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra todos os adversários dentro do alcance Próximo. Você pode gastar 1 Esperança por alvo contra o qual teve sucesso para forçá-lo a fazer uma Rolagem de Reação (14). Em uma falha, ele sofre 8d6+6 de dano techno, corrompido pelo protocolo de uma IA autodestrutiva. Em um sucesso, sofre metade do dano.</p>" },
  "Tracewalk": { level: 6, recallCost: 0, type: "spell", description: "<p>Sempre que você causa dano techno a um alvo, pode marcar 1 Estresse para seguir o rastro imediatamente e se mover até o alcance Corpo a Corpo dessa criatura. Esse movimento ignora terreno difícil e interferência ambiental, mas precisa seguir uma rota física, digital ou tática plausível pela cena.</p>" },
  "Blackwall-Synced": { level: 7, recallCost: 2, type: "ability", description: "<p>Quando 4 ou mais cartas de domínio do seu loadout forem da Competência Blackwall, ganhe o seguinte:</p><ul><li><p>Quando você tem sucesso com Medo, pode marcar 2 de Estresse para impedir o mestre de ganhar 1 Medo.</p></li><li><p>Uma vez por descanso curto, ao fazer uma rolagem de ação, você pode somar +1 à rolagem para cada Medo que o mestre tem.</p></li></ul>" },
  "Blackwall Manifestation": { level: 7, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface (13). Em um sucesso, você força um fragmento da Blackwall a se manifestar entre dois pontos dentro do alcance Distante, como um muro digital corrompido transbordando para o espaço físico. Ele não aparece como um muro sólido, e sim como uma fratura violenta de estática, código hostil e corrupção de IA expressa pelo ambiente ao redor. Dura até você marcar o seu próximo PV. Qualquer criatura dentro do muro quando ele aparece, ou que passa por ele, marca 2 de Estresse e precisa ter sucesso numa Rolagem de Reação (16) ou fica Imobilizada.</p>" },
  "Daemon Army": { level: 8, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface (14). Uma vez por descanso, em um sucesso, marque 1 Estresse para liberar oito fragmentos de IA daemon dentro do alcance Próximo, que se movem com você. Coloque um d8 nesta carta com o 8 para cima, representando o tamanho do seu exército de daemons. Sempre que causar dano a um alvo dentro do alcance Próximo, você pode diminuir esse valor em 1 para causar 1d8 de dano techno adicional. Quando sofrer dano, pode diminuir o valor em 1 para reduzir o dano em 1d8. Cada vez que o dado diminui, um daemon age por você e depois desaparece. Quando o valor do dado cairia abaixo de 1, devolva esta carta ao cofre.</p>" },
  "Corrupted Shell": { level: 8, recallCost: 1, type: "spell", description: "<p>Você deixa a Blackwall reescrever parcialmente o seu corpo, armadura, implantes e sistema nervoso. Enquanto esta carta estiver ativa no seu loadout:</p><ul><li><p>Para cada 2 de Estresse marcados, aumente os seus limiares em +1.</p></li><li><p>Sempre que tiver sucesso com Medo numa rolagem de ação, pode gastar 1 Esperança para limpar um Espaço de Armadura.</p></li></ul>" },
  "Total System Crash": { level: 9, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante. Em um sucesso, marque 3 de Estresse e role uma quantidade de d20 igual ao seu atributo de Interface, causando esse total de dano techno. Se o dano for suficiente para derrotar, desativar ou destruir o alvo, todos os adversários dentro do alcance Distante dele marcam 1 Estresse. Isso pode ser uma pane catastrófica de cyberware, alucinação em massa, cascata de comandos corrompidos, queimadura terminal de Black ICE ou rotina de execução de IA desgovernada.</p>" },
  "Feed on Panic": { level: 9, recallCost: 0, type: "spell", description: "<p>Sempre que uma criatura dentro do alcance Próximo marca qualquer quantidade de Estresse ou sofre dano Severo, você pode gastar 1 Esperança para limpar 1 Estresse ou limpar 1 Medo que o mestre tem. Isso pode ser o seu sistema colhendo dados de pânico, convertendo sofrimento em poder de processamento, ou deixando algo além do muro se alimentar pela sua interface.</p>" },
  "Invoke Shutdown": { level: 10, recallCost: 2, type: "spell", description: "<p>Quando você causa dano a uma criatura que tem todo o Estresse marcado, dobre o dano. Se isso a derrotar, desativar ou destruir, você limpa 1 Estresse. Se não, ela fica permanentemente Vulnerável. Isso pode ser um comando de morte, colapso de identidade, travamento total do sistema nervoso ou um sinal de desligamento que deixa o alvo comprometido para sempre.</p>" },
  "Blackwall Host": { level: 10, recallCost: 1, type: "spell", description: "<p>Você pode marcar 1 Estresse para se tornar um <strong>Blackwall Host</strong>, deixando uma IA desgovernada, daemon corrompido, sistema militar perdido ou fragmento proibido da Blackwall pilotar parcialmente o seu corpo. Nessa forma, ganhe o seguinte:</p><ul><li><p>Todos os adversários dentro do alcance Próximo precisam gastar 1 Medo adicional ao usar uma feature de Medo.</p></li><li><p>Quando você derrota, desativa ou destrói uma criatura dentro do alcance Próximo, absorve a saída final dela e limpa 1 Ponto de Vida.</p></li><li><p>Você pode marcar 1 Estresse para se mover para qualquer lugar dentro do alcance Muito Distante, ignorando terreno difícil, segurança automatizada e obstáculos ambientais. Esse movimento não pode atravessar barreiras seladas ou espaços sem rota plausível.</p></li></ul><p>Toda vez que fizer uma rolagem de ação nessa forma, precisa gastar 1 Esperança. Se não puder, a brecha desmorona e você sai dessa forma.</p>" }
};
// (fxChange é declarado mais abaixo com const; aqui a lista é montada antes, então usa uma cópia.)
const rbChange = (key, value, type = "add") => ({ key, type, value, priority: null, phase: "initial" });
const rb = (name, extra = {}) => ({ name, ...RB_TEXT[name], ...extra });

const cardAction = (c, name) => Object.values(c.actions).find(a => a.name === name);
function dropCardActions(c, ...names) {
  for (const [id, a] of Object.entries(c.actions)) if (names.includes(a.name)) delete c.actions[id];
}
const addCardActions = (c, ...actions) => Object.assign(c.actions, ...actions);
const oneCost = (key, value, extra = {}) => ({ scalable: false, key, value, step: null, consumeOnSuccess: false, itemId: null, ...extra });
const NO_USES = { value: null, max: null, recovery: null, consumeOnSuccess: false };
// Dado de dano da parte principal. multiplier "prof" = "usando a sua Proficiência"; formula = fórmula livre.
function setCardDamage(action, { count = 1, dice = "d6", bonus = null, multiplier = "flat", formula = null, type = null }) {
  const part = action.damage.main;
  part.value = { ...part.value, dice, bonus, multiplier, flatMultiplier: count, custom: formula ? { enabled: true, formula } : { enabled: false, formula: "" } };
  if (type) part.type = [type];
}
// "O alvo marca N" / "limpa N" como dano/cura de recurso (padrão Enervating Blast / Savor the Anguish).
function resourceCardAction({ name, resources, heal = false, cost = [], uses = null, target = null }) {
  const [[id, base]] = Object.entries(featureAction({ name, uses }));
  base.type = heal ? "healing" : "damage";
  base.cost = cost;
  base.target = target ?? { type: heal ? "self" : "any", amount: null };
  base.damage = { main: null, resources: Object.fromEntries(Object.entries(resources).map(([k, f]) => [k, resourcePart(k, f)])) };
  return { [id]: base };
}
// Dano sem rolagem de ataque (ex: dano extra de um efeito), com fórmula livre.
function damageCardAction({ name, formula, type = "magical", cost = [] }) {
  const [[id, base]] = Object.entries(featureAction({ name }));
  const value = custom => ({ multiplier: "flat", flatMultiplier: 1, dice: "d6", bonus: null, custom });
  base.type = "damage";
  base.cost = cost;
  base.target = { type: "any", amount: null };
  base.damage = {
    main: { applyTo: "hitPoints", resultBased: false, base: false, includeBase: false, direct: false, itemId: null, fullRestore: false, type: [type],
      value: value({ enabled: true, formula }), valueAlt: value({ enabled: false, formula: "" }) },
    resources: {}
  };
  return { [id]: base };
}
const HOPE = n => oneCost("hope", n);
const STRESS = n => oneCost("stress", n);
const HP = n => oneCost("hitPoints", n);

const RB_FX = {
  degraded: targetEffect({ name: "Degraded", img: CPR("status/black_lace"), description: "<p>Usa um d12 em vez de um d20 nas rolagens de ataque.</p>" }),
  ghostFog: targetEffect({ name: "Ghost Fog", img: CPR("status/hidden"), description: "<p>Incorpóreo para sistemas de segurança e barreiras automatizadas até atravessar a barreira.</p>" }),
  relicEdge: targetEffect({ name: "Relic Edge", img: CPR("weapons/Sword"), duration: "shortRest", description: "<p>Ataques com a arma carregada usam Interface e causam d8 de dano techno por Medo do mestre (até o seu nível).</p>" }),
  manifestation: targetEffect({ name: "Imobilizado pela Blackwall", img: CPR("status/black_lace"), statuses: ["restrained"] }),
  shutdown: targetEffect({ name: "Invoke Shutdown", img: CPR("status/emp"), statuses: ["vulnerable"], description: "<p>Vulnerável permanentemente.</p>" }),
  wardPhysical: targetEffect({ name: "Redline Ward (físico)", img: CPR("upgrades/security_upgrade"), changes: [rbChange("system.resistance.physical.resistance", 1, "override")], description: "<p>Resistência a dano físico dentro da ala.</p>" }),
  wardTechno: targetEffect({ name: "Redline Ward (techno)", img: CPR("upgrades/security_upgrade"), changes: [rbChange("system.resistance.magical.resistance", 1, "override")], description: "<p>Resistência a dano techno dentro da ala.</p>" }),
  rupture: targetEffect({ name: "System Rupture", img: CPR("critical_injuries/body_critical_injury"), description: "<p>Sempre que marcar PV, quem aplicou pode marcar 1 Estresse para fazê-lo marcar 1 PV adicional. Dura até o mestre gastar 2 Medo ou quem aplicou sofrer dano Severo.</p>" })
};

const BLACKWALL_CARDS = [
  rb("Corruption Spike", { img: CPR("programs/hellbolt"), clone: "Blighting Strike",
    actionNames: { "Spellcast Roll": "Rolagem de Interface", "With Hope": "Dano (Esperança)", "With Fear": "Dano (Medo)" },
    effectNames: { "Blightning Strike": "Corrompido" },
    // PDF: d6/d10 sem +1; o próximo dano do alvo cai 1d6 (o Dread corta pela metade), então o efeito vira marcador.
    patch: c => {
      for (const n of ["Dano (Esperança)", "Dano (Medo)"]) cardAction(c, n).damage.main.value.bonus = null;
      c.effects.forEach(e => { e.system.changes = []; e.description = "<p>O próximo dano que este alvo causar é reduzido em 1d6.</p>"; });
    } }),
  rb("Dead Channel", { img: CPR("gear/radio_communicator"), clone: "Voice of Dread", effectNames: { "Dreading": "Dead Channel" },
    patch: c => c.effects.forEach(e => { e.statuses = ["vulnerable"]; }) }),
  rb("Blackwall Shroud", { img: CPR("status/black_lace"), clone: "Umbral Veil",
    actionNames: { "Mark Stress": "Gastar Esperança", "Spend Tokens": "Gastar Marcadores (+1 Evasão cada)" },
    // PDF: Rolagem de Interface (10) e marcadores iguais à Esperança gasta (o Dread usa Estresse e o Medo do mestre).
    patch: c => {
      const a = cardAction(c, "Gastar Esperança");
      a.cost = [oneCost("hope", 1, { scalable: true, step: 1 })];
      a.uses = { ...NO_USES };
      Object.values(a.damage.resources).forEach(p => { p.value.custom = { enabled: true, formula: "@scale" }; });
      addCardActions(c, withActionId(buildCardAction({ difficulty: 10, targetType: "self", name: "Rolagem de Interface (10)" })));
    } }),
  rb("Backlash Daemon", { img: CPR("default/default-demon"), clone: "Hideous Retribution" }),
  rb("Drain Signal", { img: CPR("programs/vampire"), clone: "Siphon Essence",
    actionNames: { "Spellcast Roll": "Rolagem de Interface", "With Fear": "_drop" },
    patch: c => {
      const a = cardAction(c, "Rolagem de Interface");
      setCardDamage(a, { multiplier: "prof", dice: "d8" });
      a.range = "far";
      a.uses.recovery = "shortRest";
      dropCardActions(c, "_drop");
      addCardActions(c,
        resourceCardAction({ name: "Limpar 2 PV", heal: true, resources: { hitPoints: 2 } }),
        resourceCardAction({ name: "Limpar 3 PV (Medo)", heal: true, resources: { hitPoints: 3 } }));
    } }),
  rb("Panic Script", { img: CPR("status/black_lace"), clone: "Terrify", effectNames: { "Terrified": "Panic Script" },
    // PDF: o Vulnerável custa 1 Esperança (no Dread vem com o sucesso com Medo).
    patch: c => {
      const a = Object.values(c.actions)[0];
      a.range = "far";
      a.effects = [];
      addCardActions(c, featureAction({ name: "Vulnerável (1 Esperança)", costs: [{ key: "hope", value: 1 }], effects: c.effects }));
    } }),
  rb("Neural Burden Sync", { img: CPR("netrunning/Control_Node.png"), clone: "Shared Trauma" }),
  rb("System Decay", { img: CPR("programs/worm"), effects: [RB_FX.degraded],
    actions: withActionId(buildCardAction({ range: "Far", cost: [HOPE(1)], effects: [RB_FX.degraded], img: CPR("programs/worm") })) }),
  rb("Daemon Proxy", { img: CPR("netrunning/Imp.png"), clone: "Summon Horror",
    patch: c => {
      const a = Object.values(c.actions)[0];
      a.cost = [HOPE(1)];
      a.uses = { ...NO_USES };
      setCardDamage(a, { multiplier: "prof", dice: "d10" });
      addCardActions(c, resourceCardAction({ name: "Falhou na Reação: 1d4 Estresse", resources: { stress: "1d4" } }));
    } }),
  rb("Ghost Fog", { img: CPR("status/hidden"), effects: [RB_FX.ghostFog],
    actions: withActionId(buildCardAction({ difficulty: 13, targetType: "friendly", cost: [HOPE(1)], effects: [RB_FX.ghostFog], name: "Rolagem de Interface (13)", img: CPR("status/hidden") })) }),
  rb("Relic Edge", { img: CPR("weapons/Sword"), effects: [RB_FX.relicEdge],
    actions: {
      ...featureAction({ name: "Carregar a Arma", costs: [{ key: "hope", value: 1 }], effects: [RB_FX.relicEdge], target: { type: "self", amount: null } }),
      ...damageCardAction({ name: "Dano da Rotina", formula: "(min(@fear, @levelData.level.current))d8" })
    } }),
  rb("Corrupted Protocol", { img: CPR("programs/nervescrub"), clone: "Darkfire",
    // PDF: 8d6+6, Reação (14), sem limite por cena; a Rolagem de Interface vem antes.
    patch: c => {
      const a = Object.values(c.actions)[0];
      setCardDamage(a, { count: 8, dice: "d6", bonus: 6 });
      a.save.difficulty = 14;
      a.uses = { ...NO_USES };
      addCardActions(c, withActionId(buildCardAction({ range: "Close", name: "Rolagem de Interface" })));
    } }),
  rb("Tracewalk", { img: CPR("status/netrunning"), clone: "Jump Scare",
    patch: c => { Object.values(c.actions).forEach(a => { a.effects = []; }); c.effects = []; } }),
  rb("Blackwall-Synced", { img: CPR("default/default-blackice"), clone: "Dread-Touched", actionNames: { "Mark Stress": "Impedir 1 Medo (2 Estresse)", "Gain Bonus": "Bônus pelo Medo" } }),
  rb("Blackwall Manifestation", { img: CPR("upgrades/dna_lock"), clone: "Wall of Hunger", effects: [],
    actionNames: { "Spellcast Roll": "Rolagem de Interface (13)", "Wall Damage": "Atravessar o Muro" },
    patch: c => {
      const a = cardAction(c, "Rolagem de Interface (13)");
      a.roll.difficulty = 13;
      a.cost = [];
      c.effects.push(RB_FX.manifestation);
      addCardActions(c, featureAction({ name: "Falhou na Reação (16): Imobilizado", effects: [RB_FX.manifestation] }));
    } }),
  rb("Daemon Army", { img: CPR("netrunning/Imp.png"), clone: "Dark Army", damageType: "magical",
    actionNames: { "Spellcast Roll": "Rolagem de Interface (14)", "Deal Damage": "Daemon Ataca (+1d8)" },
    patch: c => {
      cardAction(c, "Rolagem de Interface (14)").uses.recovery = "shortRest";
      addCardActions(c, featureAction({ name: "Daemon Defende (−1d8 de dano)", costs: [{ key: "resource", value: 1 }] }));
    } }),
  rb("Corrupted Shell", { img: CPR("dlc/cyberware/dragoon-plating-metalgear"), clone: "Eldritch Flesh", effectNames: { "Eldritch Flesh": "Corrupted Shell" },
    // PDF: +1 a cada 2 Estresse; limpar Armadura custa 1 Esperança no sucesso com Medo.
    patch: c => {
      c.effects.forEach(e => e.system.changes.forEach(ch => { ch.value = "floor(@system.resources.stress.value / 2)"; }));
      Object.values(c.actions).forEach(a => { a.cost = [HOPE(1)]; a.name = "Limpar Armadura (Sucesso com Medo)"; });
    } }),
  rb("Total System Crash", { img: CPR("status/emp"), clone: "Damnation",
    actionNames: { "Spellcast Roll": "Rolagem de Interface", "Stress Damage": "Adversários Marcam 1 Estresse" },
    patch: c => {
      const a = cardAction(c, "Rolagem de Interface");
      a.cost = [STRESS(3)];
      setCardDamage(a, { formula: "(@cast)d20" });
    } }),
  rb("Feed on Panic", { img: CPR("status/deathtrance"), clone: "Savor the Anguish",
    patch: c => {
      Object.values(c.actions).forEach(a => { a.cost = [HOPE(1)]; a.name = "Limpar 1 Estresse"; });
      addCardActions(c, featureAction({ name: "Tirar 1 Medo do Mestre", costs: [{ key: "hope", value: 1 }] }));
    } }),
  rb("Invoke Shutdown", { img: CPR("status/emp"), clone: "Invoke Torment", effectNames: { "Invoke Torment": "Invoke Shutdown (dano dobrado)" },
    patch: c => {
      dropCardActions(c, "Invoke Shutdown");
      c.effects.push(RB_FX.shutdown);
      addCardActions(c,
        resourceCardAction({ name: "Limpar 1 Estresse", heal: true, resources: { stress: 1 } }),
        featureAction({ name: "Vulnerável Permanente", effects: [RB_FX.shutdown] }));
    } }),
  rb("Blackwall Host", { img: CPR("blackice/src/liche"), clone: "Avatar of Terror", effectNames: { "Avatar Of Terror": "Blackwall Host" },
    // PDF: sem bônus de dano pelo Medo; ganha cura ao derrotar e deslocamento.
    patch: c => {
      c.effects.forEach(e => { e.system.changes = []; e.description = "<p>Adversários dentro do alcance Próximo gastam 1 Medo a mais nas features de Medo. Antes de cada rolagem de ação, gaste 1 Esperança ou saia da forma.</p>"; });
      addCardActions(c,
        resourceCardAction({ name: "Absorver: Limpar 1 PV", heal: true, resources: { hitPoints: 1 } }),
        featureAction({ name: "Mover (1 Estresse)", costs: [{ key: "stress", value: 1 }] }));
    } })
];

const REDLINE_CARDS = [
  rb("Neurospike", { img: CPR("programs/hellbolt"), clone: "Blood Spike", source: "void",
    actionNames: { "Blood Spike d8": "_drop", "Blood Spike d10": "Neurospike", "Spend Hope": "_drop" },
    patch: c => {
      dropCardActions(c, "_drop");
      const a = cardAction(c, "Neurospike");
      a.range = "far";
      a.cost = [STRESS(1)];
      setCardDamage(a, { multiplier: "prof", dice: "d10" });
      addCardActions(c,
        resourceCardAction({ name: "Alvo Marca 1 Estresse (Esperança)", resources: { stress: 1 } }),
        featureAction({ name: "Rolou com Medo (1 Estresse)", costs: [{ key: "stress", value: 1 }] }));
    } }),
  rb("Last-Resort Chip", { img: CPR("gear/memory_chip"),
    actions: {
      ...featureAction({ name: "Criar o Chip (1 PV)", costs: [{ key: "hitPoints", value: 1 }] }),
      ...featureAction({ name: "Reduzir 1 PV Marcado (1 Esperança)", costs: [{ key: "hope", value: 1 }] })
    } }),
  rb("Pain Conversion", { img: CPR("status/beserker"),
    effects: [passiveEffect({ name: "Pain Conversion", img: CPR("status/beserker"), changes: [rbChange("system.bonuses.damage.bonus", "2 * @system.resources.hitPoints.value")] })] }),
  rb("Aggression Feedback", { img: CPR("dlc/cyberware/kill_display"), clone: "Brand of Castigation", source: "void",
    actionNames: { "Mark a Stress to *Brand*": "Gravar Perfil (1 Estresse)", "Damage: 2 Stress": "Feedback: Alvo Marca 1 Estresse" },
    patch: c => { cardAction(c, "Feedback: Alvo Marca 1 Estresse").damage.resources.stress.value.custom.formula = "1"; } }),
  rb("Neurochemical Override", { img: CPR("gear/air_hypo"),
    actions: {
      ...withActionId(buildCardAction({ range: "Very Close", targetType: "any", cost: [STRESS(1)], img: CPR("gear/air_hypo") })),
      ...resourceCardAction({ name: "Acalmar: Limpa 1 Estresse", heal: true, resources: { stress: 1 }, target: { type: "any", amount: 1 } }),
      ...resourceCardAction({ name: "Acalmar (Esperança): Limpa 2 Estresse", heal: true, resources: { stress: 2 }, target: { type: "any", amount: 1 } }),
      ...resourceCardAction({ name: "Agitar: Marca 1 Estresse", resources: { stress: 1 } }),
      ...resourceCardAction({ name: "Agitar (Esperança): Marca 2 Estresse", resources: { stress: 2 } })
    } }),
  rb("Redline Detonation", { img: CPR("status/on_fire_strong"), clone: "Burning Gore", source: "void",
    patch: c => {
      const a = Object.values(c.actions)[0];
      a.name = "Rolagem de Interface (12)";
      a.roll.difficulty = 12;
      a.cost = [HP(1)];
      addCardActions(c,
        resourceCardAction({ name: "Cada Alvo Marca 1 PV", resources: { hitPoints: 1 } }),
        resourceCardAction({ name: "Cada Alvo Marca 2 PV (Esperança)", resources: { hitPoints: 2 } }));
    } }),
  rb("System Hijack", { img: CPR("programs/nervescrub"), clone: "Blood Puppet", source: "void",
    patch: c => {
      Object.values(c.actions).forEach(a => { a.name = "Sequestrar (1 Esperança)"; });
      addCardActions(c,
        withActionId(buildCardAction({ range: "Far", name: "Rolagem de Interface" })),
        withActionId(buildCardAction({ range: "Melee", name: "Ataque do Alvo (Interface)", damageFormula: { formula: "(@prof)d10", dmgType: "physical" } })));
    } }),
  rb("Killhook", { img: CPR("gear/grapple_gun"), clone: "Grisly Harpoon", source: "void",
    actionNames: { "Harpoon": "Killhook", "Mark Stress": "Marcar Estresse", "Spellcast Roll (13)": "Rolagem de Interface (13)" },
    patch: c => {
      const a = cardAction(c, "Killhook");
      a.range = "far";
      setCardDamage(a, { count: 3, dice: "d8", type: "physical" });
    } }),
  rb("Emergency Stim Share", { img: CPR("gear/air_hypo"), clone: "Weave the Flesh", source: "void",
    patch: c => {
      const a = Object.values(c.actions)[0];
      a.name = "Aliados Limpam 1 PV";
      a.uses = { value: null, max: "1", recovery: "shortRest", consumeOnSuccess: false };
      delete a.damage.resources.armor;
      addCardActions(c,
        resourceCardAction({ name: "Aliados Limpam 1 Estresse", heal: true, resources: { stress: 1 }, target: { type: "friendly", amount: null } }),
        resourceCardAction({ name: "Limpar os Dois (1 Estresse)", heal: true, resources: { hitPoints: 1, stress: 1 }, cost: [STRESS(1)], target: { type: "friendly", amount: null } }));
    } }),
  rb("Feedback Retaliation", { img: CPR("cyberware/hardend_shielding"),
    actions: withActionId(buildCardAction({ actionType: "reaction", name: "Rolagem de Reação (Interface)", uses: { max: 1, recovery: "shortRest" }, img: CPR("cyberware/hardend_shielding") })) }),
  rb("Cortical Splinter", { img: CPR("gear/memory_chip"), clone: "Parasite of the Will", source: "void",
    actionNames: { "": "Rolagem de Interface", "Mark Hit Point": "Implantar (1 PV)", "Spend Hope": "Desvantagem na Rolagem (1 Esperança)", "Sacrifice the Bloodworm": "Destruir o Estilhaço" },
    patch: c => {
      cardAction(c, "Rolagem de Interface").range = "veryFar";
      cardAction(c, "Implantar (1 PV)").uses = { ...NO_USES };
      cardAction(c, "Destruir o Estilhaço").damage = { main: null, resources: { hitPoints: resourcePart("hitPoints", 1) } };
    } }),
  rb("Redline Ward", { img: CPR("upgrades/security_upgrade"), effects: [RB_FX.wardPhysical, RB_FX.wardTechno],
    actions: {
      ...featureAction({ name: "Ala Física (1 PV)", costs: [{ key: "hitPoints", value: 1 }], effects: [RB_FX.wardPhysical], target: { type: "friendly", amount: null } }),
      ...featureAction({ name: "Ala Techno (1 PV)", costs: [{ key: "hitPoints", value: 1 }], effects: [RB_FX.wardTechno], target: { type: "friendly", amount: null } })
    } }),
  rb("Neuromuscular Lock", { img: CPR("status/grappled"), clone: "Blood Bind", source: "void",
    actionNames: { "": "Rolagem de Interface", "Mark Stress": "Marcar Estresse", "Damage: Stress": "_drop" }, effectNames: { "Blood Bind": "Neuromuscular Lock" },
    // O efeito do The Void usa "restrain" (o id do sistema é "restrained") e transfer; aqui vai no alvo.
    patch: c => {
      c.effects.forEach(e => { e.statuses = ["restrained", "vulnerable"]; e.transfer = false; e.system.duration = { description: "", type: "temporary" }; });
      cardAction(c, "Rolagem de Interface").range = "far";
      dropCardActions(c, "_drop");
      addCardActions(c, damageCardAction({ name: "Dano no Holofote", formula: "(@prof)d10" }));
    } }),
  rb("Redline-Synced", { img: CPR("status/surge"), domainTouched: 4,
    effects: [passiveEffect({ name: "Redline-Synced", img: CPR("status/surge"), changes: [rbChange("system.evasion", "floor(@system.resources.hitPoints.value / 3)")] })],
    actions: resourceCardAction({ name: "Ganhar 1 Esperança", heal: true, resources: { hope: 1 } }) }),
  rb("Siphon Strike", { img: CPR("programs/vampire"), clone: "Vampiric Strike", source: "void",
    patch: c => {
      Object.values(c.actions).forEach(a => { a.name = "Limpar 1 PV"; a.cost = [HOPE(1)]; });
      addCardActions(c, resourceCardAction({ name: "Limpar 1 Estresse", heal: true, resources: { stress: 1 }, cost: [HOPE(1)] }));
    } }),
  rb("Shared Overload", { img: CPR("netrunning/Control_Node.png"), clone: "Shared Trauma",
    patch: c => Object.values(c.actions).forEach(a => { a.cost = [HOPE(1)]; a.range = "far"; }) }),
  rb("Adrenaline Stack", { img: CPR("status/surge"),
    // Dado de vantagem d8 com PV marcado: efeito desligado que o jogador liga (padrão Opportunist).
    effects: [passiveEffect({ name: "Adrenaline Stack (d8 de vantagem)", img: CPR("status/surge"), disabled: true, changes: [rbChange("system.rules.roll.defaultAdvantageDice", 8, "override")] })],
    actions: featureAction({ name: "+1d8 (1 PV)", costs: [{ key: "hitPoints", value: 1 }], dice: "1d8" }) }),
  rb("Psycho Surge", { img: CPR("status/beserker_addiction"),
    actions: {
      ...withActionId(buildCardAction({ range: "Close", cost: [HOPE(1)], uses: { max: 1, recovery: "shortRest" }, img: CPR("status/beserker_addiction") })),
      ...resourceCardAction({ name: "Sucesso: 1 PV e 1 Estresse", resources: { hitPoints: 1, stress: 1 } }),
      ...resourceCardAction({ name: "Falha: 1 Estresse", resources: { stress: 1 } }),
      ...resourceCardAction({ name: "Aliados Marcam 1 Estresse", resources: { stress: 1 }, target: { type: "friendly", amount: null } }),
      ...resourceCardAction({ name: "Aliados Limpam 1 PV", heal: true, resources: { hitPoints: 1 }, target: { type: "friendly", amount: null } })
    } }),
  rb("System Rupture", { img: CPR("critical_injuries/body_critical_injury"), effects: [RB_FX.rupture],
    actions: {
      ...withActionId(buildCardAction({ range: "Far", cost: [HP(1)], effects: [RB_FX.rupture], img: CPR("critical_injuries/body_critical_injury") })),
      ...resourceCardAction({ name: "+1 PV no Alvo (1 Estresse)", resources: { hitPoints: 1 }, cost: [STRESS(1)] })
    } }),
  rb("Refuse Shutdown", { img: CPR("status/deathtrance"),
    actions: featureAction({ name: "Marcar Estresse em vez do Último PV", costs: [{ key: "hope", value: 1 }, { key: "stress", value: 1 }] }) }),
  rb("Kill-Switch Overdrive", { img: CPR("status/beserker"),
    actions: {
      ...withActionId(buildCardAction({ range: "Close", cost: [HOPE(2)], img: CPR("status/beserker") })),
      // Marca de 1 a 3 PV (custo escalável) e o alvo marca o dobro.
      ...resourceCardAction({ name: "Marcar PV: Alvo Marca o Dobro", resources: { hitPoints: "2 * @scale" }, cost: [oneCost("hitPoints", 1, { scalable: true, step: 1 })] })
    } })
];

// Competências (domínios homebrew). Para adicionar uma, registre aqui com as cartas dela;
// importDomainCards registra o domínio no Homebrew do sistema e cria as cartas.
const COMPETENCIES = [
  { id: "network", label: "Network", src: ICON("competency-network"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/blade.png", cards: NETWORK_CARDS },
  { id: "aegis", label: "Aegis", src: ICON("competency-aegis"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/valor.png", cards: AEGIS_CARDS },
  { id: "assault", label: "Assault", src: ICON("competency-assault"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/blade.png", cards: ASSAULT_CARDS },
  { id: "ghost", label: "Ghost", src: ICON("competency-ghost"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/midnight.png", cards: GHOST_CARDS },
  { id: "chrome", label: "Chrome", src: ICON("competency-chrome"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/bone.png", cards: CHROME_CARDS },
  { id: "systems", label: "Systems", src: ICON("competency-systems"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/codex.png", cards: SYSTEMS_CARDS },
  { id: "influence", label: "Influence", src: ICON("competency-influence"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/grace.png", cards: INFLUENCE_CARDS },
  { id: "frontier", label: "Frontier", src: ICON("competency-frontier"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/sage.png", cards: FRONTIER_CARDS },
  { id: "medtech", label: "Medtech", src: ICON("competency-medtech"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/splendor.png", cards: MEDTECH_CARDS },
  { id: "redline", label: "Redline", src: ICON("competency-redline"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/blade.png", cards: REDLINE_CARDS },
  { id: "blackwall", label: "Blackwall", src: ICON("competency-blackwall"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/dread.png", cards: BLACKWALL_CARDS }
];

// A chave em system.actions precisa ser igual ao _id da ação: o sistema grava usos e outros
// estados em system.actions.<_id>. Sem _id, o modelo gera outro e essas gravações se perdem
// (ex: limite "1x por descanso" nunca era descontado).
function withActionId(action) {
  const id = foundry.utils.randomID();
  return { [id]: { ...action, _id: id } };
}

async function ensureHomebrewDomains() {
  // O sistema Daggerheart valida system.domain das domainCards contra uma lista fixa
  // (blade, midnight, arcana...). Pra uma Competência ser aceita, ela precisa entrar no
  // Homebrew Settings do próprio sistema (game.settings "daggerheart"."Homebrew").
  const homebrew = game.settings.get("daggerheart", "Homebrew");
  const data = homebrew?.toObject ? homebrew.toObject() : foundry.utils.deepClone(homebrew ?? {});
  data.domains = data.domains || {};
  // Também atualiza nome/ícone de Competências já registradas por versões anteriores do módulo.
  const changed = COMPETENCIES.filter(c => data.domains[c.id]?.label !== c.label || data.domains[c.id]?.src !== c.src);
  if (!changed.length) return;
  for (const { id, label, src } of changed) data.domains[id] = { ...(data.domains[id] ?? {}), id, label, src };
  await game.settings.set("daggerheart", "Homebrew", data);
  console.log(`Edgeheart | Competências homebrew registradas/atualizadas: ${changed.map(c => c.id).join(", ")}.`);
}

async function importDomainCards() {
  await ensureHomebrewDomains();
  const pack = await getOrCreatePack("domains");
  const officialCards = await game.packs.get("daggerheart.domains")?.getDocuments() ?? [];
  // Cartas do domínio Blood do The Void, salvas em data/void-blood.json (ver REDLINE_CARDS).
  const voidCards = (await fetch(`modules/${MODULE_ID}/data/void-blood.json`).then(r => r.json()).catch(() => ({ cards: [] }))).cards
    .map(v => ({ name: v.name, _source: { system: { actions: v.actions, resource: v.resource, domainTouched: v.domainTouched }, effects: v.effects } }));
  for (const competency of COMPETENCIES) {
    const top = await makeFolder(pack, competency.label);
    const levelFolders = {};
    for (const level of [...new Set(competency.cards.map(c => c.level))].sort((a, b) => a - b)) {
      levelFolders[level] = await makeFolder(pack, `Nível ${level}`, { parent: top.id });
    }
    const data = competency.cards.map(card => {
      let c = card;
      if (card.clone) {
        const official = (card.source === "void" ? voidCards : officialCards).find(o => o.name === card.clone);
        if (official) c = { ...card, ...cloneOfficialCard(official, card.name, card.img, card) };
        else console.warn(`Edgeheart | Carta oficial "${card.clone}" não encontrada; ${card.name} fica só com texto.`);
        if (card.damageType) setDamageType(c.actions, card.damageType);
        // patch: ajusta a cópia aos números do PDF (ex: dado d12 em vez do d8 da carta oficial).
        if (official && card.patch) card.patch(c);
      }
      return {
      _id: cardId(competency.id, c.name),
      name: c.name,
      type: "domainCard",
      img: c.img ?? competency.cardImg,
      folder: levelFolders[c.level].id,
      effects: c.effects || [],
      system: {
        description: c.description,
        domain: competency.id,
        recallCost: c.recallCost,
        level: c.level,
        type: c.type,
        // action: rolagem de Interface (buildCardAction); actions: ações prontas (featureAction).
        // Cartas totalmente narrativas ficam só com texto, igual o SRD faz.
        actions: withDefaultActionImg(c.actions ?? (c.action ? withActionId(c.action) : {}), c.img ?? competency.cardImg),
        attribution: ATTRIBUTION,
        gmNotes: "",
        resource: c.resource || null,
        inVault: false,
        vaultActive: false,
        loadoutIgnore: false,
        domainTouched: c.domainTouched ?? null
      }
      };
    });
    await Item.createDocuments(data, { pack: pack.collection, keepId: true });
  }
}
// ---------- Classes e subclasses (genérico: roda para cada item de CLASSES) ----------

const featureImg = f => f.img ?? ICONS.features[f.name] ?? CPR("default/Default_Skill");

// Ações sem ícone próprio (padrão do featureAction / buildCardAction) usam o ícone do item.
const DEFAULT_ACTION_IMGS = ["icons/svg/upgrade.svg", "icons/skills/trades/academics-merchant-scribe.webp"];
function withDefaultActionImg(actions, img) {
  return Object.fromEntries(Object.entries(actions).map(([id, a]) =>
    [id, DEFAULT_ACTION_IMGS.includes(a.img) || !a.img ? { ...a, img } : a]));
}

// idPrefix: gera _id fixo a partir de "<prefixo>:<nome>" (ver stableId).
async function createFeatureItems(pack, list, folderId = null, idPrefix = null) {
  const data = list.map(f => ({
    ...(idPrefix ? { _id: stableId(`${idPrefix}:${f.name}`) } : {}),
    name: f.name, type: "feature", img: featureImg(f),
    system: { description: f.description, gmNotes: "", actions: withDefaultActionImg(f.actions || {}, featureImg(f)), featureForm: f.form ?? "passive", attribution: ATTRIBUTION, resource: f.resource ?? null },
    effects: f.effects || [],
    flags: f.flags ?? {},
    folder: folderId
  }));
  return Item.createDocuments(data, { pack: pack.collection, keepId: true });
}

function costAction({ name, cost, description }) {
  return featureAction({ name, description, costs: [cost] });
}

// Itens OFICIAIS reaproveitados do sistema (não duplicados), iguais em todas as classes do SRD.
const STARTING_GEAR = [
  "Compendium.daggerheart.classes.Item.zqeXrJTd1geX73Pw", // Torch
  "Compendium.daggerheart.classes.Item.hMST9iizQP1yz0MG", // 50ft of Rope
  "Compendium.daggerheart.classes.Item.uoG5iq09mxJPXfmk"  // Basic Supplies
];
const STARTING_POTIONS = [
  "Compendium.daggerheart.consumables.Item.tPfKtKRRjv8qdSqy", // Minor Health Potion
  "Compendium.daggerheart.consumables.Item.b6vGSPFWOlzZZDLO"  // Minor Stamina Potion
];

async function importClassesAndSubclasses(equipment) {
  const classesPack = await getOrCreatePack("classes");
  const subclassesPack = await getOrCreatePack("subclasses");

  // Estrutura idêntica aos compêndios oficiais daggerheart.classes / daggerheart.subclasses:
  // "Itens de Classe" > <Classe> | "Talentos de Classe" > <Classe> | item da classe solto na raiz;
  // subclasses em <Classe>, features em "Talentos de Subclasse" > Fundação/Especialização/Maestria > <Classe>.
  const subFeaturesTop = await makeFolder(subclassesPack, "Talentos de Subclasse");
  const folders = {
    classItems: await makeFolder(classesPack, "Itens de Classe"),
    classFeatures: await makeFolder(classesPack, "Talentos de Classe"),
    foundation: await makeFolder(subclassesPack, "Fundação", { parent: subFeaturesTop.id }),
    specialization: await makeFolder(subclassesPack, "Especialização", { parent: subFeaturesTop.id }),
    mastery: await makeFolder(subclassesPack, "Maestria", { parent: subFeaturesTop.id })
  };
  const allEquipment = [...equipment.weapons, ...equipment.armor];
  const equipmentUuid = name => (name ? allEquipment.find(i => i.name === name)?.uuid ?? null : null);

  for (const cls of CLASSES) {
    await importClass(cls, { classesPack, subclassesPack, folders, equipmentUuid });
  }
}

async function importClass(cls, { classesPack, subclassesPack, folders, equipmentUuid }) {
  const { key, class: c, guide } = cls;
  const itemsFolder = await makeFolder(classesPack, c.name, { parent: folders.classItems.id });
  const featuresFolder = await makeFolder(classesPack, c.name, { parent: folders.classFeatures.id });

  const classLootItems = await Item.createDocuments(withFolder(cls.classItems.map(i => ({
    _id: stableId(`${key}:item:${i.name}`),
    name: i.name, type: "loot", img: i.img ?? "systems/daggerheart/assets/icons/documents/items/open-treasure-chest.svg",
    system: { description: i.description, quantity: 1, actions: {}, attribution: ATTRIBUTION, gmNotes: "" }
  })), itemsFolder.id), { pack: classesPack.collection, keepId: true });

  const [hopeItem] = await createFeatureItems(classesPack, [c.hopeFeature], featuresFolder.id, `${key}:hope`);
  const classFeatureItems = await createFeatureItems(classesPack, c.classFeatures, featuresFolder.id, `${key}:class`);

  const [classItem] = await Item.createDocuments([{
    _id: stableId(`${key}:class`),
    name: c.name, type: "class", img: c.img,
    system: {
      description: c.description, gmNotes: "",
      domains: c.domains, classItems: [],
      hitPoints: c.hitPoints, evasion: c.evasion,
      features: [
        { type: "hope", item: hopeItem.uuid },
        ...classFeatureItems.map(i => ({ type: "class", item: i.uuid }))
      ],
      inventory: { take: STARTING_GEAR, choiceA: STARTING_POTIONS, choiceB: classLootItems.map(i => i.uuid) },
      characterGuide: {
        suggestedTraits: guide.traits,
        suggestedPrimaryWeapon: equipmentUuid(guide.primaryWeapon),
        suggestedSecondaryWeapon: equipmentUuid(guide.secondaryWeapon),
        suggestedArmor: equipmentUuid(guide.armor)
      },
      backgroundQuestions: c.backgroundQuestions,
      connections: c.connections,
      isMulticlass: false,
      attribution: ATTRIBUTION,
      levelupOptionTiers: { "2": {}, "3": {}, "4": {} }
    }
  }], { pack: classesPack.collection, keepId: true });

  const subclassFolder = await makeFolder(subclassesPack, c.name);
  const foundationFolder = await makeFolder(subclassesPack, c.name, { parent: folders.foundation.id });
  const specializationFolder = await makeFolder(subclassesPack, c.name, { parent: folders.specialization.id });
  const masteryFolder = await makeFolder(subclassesPack, c.name, { parent: folders.mastery.id });

  for (const sub of cls.subclasses) {
    const prefix = `${key}:${sub.name}`;
    const foundationItems = await createFeatureItems(subclassesPack, sub.foundation, foundationFolder.id, `${prefix}:foundation`);
    const specializationItems = await createFeatureItems(subclassesPack, sub.specialization, specializationFolder.id, `${prefix}:specialization`);
    const masteryItems = await createFeatureItems(subclassesPack, sub.mastery, masteryFolder.id, `${prefix}:mastery`);

    await Item.createDocuments([{
      _id: stableId(`${prefix}:subclass`),
      name: sub.name, type: "subclass", img: sub.img,
      folder: subclassFolder.id,
      system: {
        description: sub.description, gmNotes: "",
        spellcastingTrait: sub.spellcastingTrait,
        features: [
          ...foundationItems.map(i => ({ type: "foundation", item: i.uuid })),
          ...specializationItems.map(i => ({ type: "specialization", item: i.uuid })),
          ...masteryItems.map(i => ({ type: "mastery", item: i.uuid }))
        ],
        featureState: 1, isMulticlass: false, attribution: ATTRIBUTION, linkedClass: classItem.uuid
      },
      flags: sub.suggestedTraits ? { [MODULE_ID]: { suggestedTraits: sub.suggestedTraits } } : {}
    }], { pack: subclassesPack.collection, keepId: true });
  }
}

// ---------- Adversários e ambientes ----------
// Mesmo formato dos adversários e ambientes oficiais (Bladed Guard, Cursed Graveyard): ataque padrão em
// system.attack, features como itens "feature" com ações (custo de Estresse/Medo, ataque, dano, Rolagem de
// Reação, efeitos). Nomes em inglês como no PDF; textos em português. IDs fixos: stableId("adversary:<nome>")
// e stableId("environment:<nome>"), para links nos diários e em "Adversários possíveis".

const DAMAGE_KINDS = { "fís": "physical", "impacto": "physical", "techno": "magical" };

// "1d8+2 fís", "2d6+2 impacto", "3 fís"
function damagePart(str) {
  const [formula, kind] = str.split(" ");
  const m = formula.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
  const value = m
    ? { dice: `d${m[2]}`, bonus: m[3] ? Number(m[3]) : null, multiplier: "flat", flatMultiplier: Number(m[1]), custom: { enabled: false, formula: "" } }
    : { dice: "d6", bonus: null, multiplier: "flat", flatMultiplier: 1, custom: { enabled: true, formula } };
  return {
    value, type: [DAMAGE_KINDS[kind] ?? "physical"], applyTo: "hitPoints", resultBased: false,
    valueAlt: { multiplier: "prof", flatMultiplier: 1, dice: "d6", bonus: null, custom: { enabled: false, formula: "" } },
    base: false, includeBase: false, direct: false, fullRestore: false, itemId: null
  };
}

function adversaryRoll({ attack = false, advState = "neutral", bonus = null } = {}) {
  return {
    type: attack ? "attack" : null, trait: null, difficulty: null, bonus, advState, useDefault: false,
    diceRolling: { multiplier: "prof", flatMultiplier: 1, dice: "d6", compare: null, treshold: null }
  };
}

// Ataque padrão (system.attack). bonus = modificador de ataque do bloco (ATQ).
function adversaryAttack({ name, img, range, bonus, damage }) {
  return {
    _id: foundry.utils.randomID(), name, img, type: "attack", actionType: "action", systemPath: "actions",
    description: "", chatDisplay: false, cost: [], uses: { value: null, max: null, recovery: null, consumeOnSuccess: false },
    range: RANGE_MAP[range] ?? "melee", target: { type: "any", amount: null },
    roll: adversaryRoll({ attack: true, bonus: String(bonus) }),
    damage: { main: damagePart(damage), resources: {} },
    effects: [], save: { trait: null, difficulty: null, damageMod: "none" },
    baseAction: false, originItem: { type: "itemCollection" }, triggers: [], areas: []
  };
}

// Ação de uma feature de adversário ou ambiente.
// attack: rolagem de ataque (usa o ATQ do adversário); save: { trait, difficulty, damageMod } = Rolagem de Reação
// do alvo; damage: "1d6+2 techno"; effects: efeitos do item (targetEffect) aplicados no alvo.
function adversaryAction({ name, img, actionType = "action", stress = 0, fear = 0, attack = false, advState = "neutral", damage = null, save = null, effects = [], range = "" }) {
  const id = foundry.utils.randomID();
  const cost = [
    ...(stress ? [{ key: "stress", value: stress, scalable: false, step: null, consumeOnSuccess: false, itemId: null }] : []),
    ...(fear ? [{ key: "fear", value: fear, scalable: false, step: null, consumeOnSuccess: false, itemId: null }] : [])
  ];
  const rolls = attack || damage || save;
  return {
    [id]: {
      _id: id, name, img, type: rolls ? "attack" : "effect", actionType, systemPath: "actions",
      description: "", chatDisplay: true, cost,
      uses: { value: null, max: "", recovery: null, consumeOnSuccess: false },
      effects: effects.map(e => ({ _id: e._id, onSave: false })),
      target: { type: "any", amount: null }, range: RANGE_MAP[range] ?? "",
      baseAction: false, originItem: { type: "itemCollection" }, triggers: [], areas: [],
      ...(rolls ? {
        roll: adversaryRoll({ attack, advState }),
        damage: { main: damage ? damagePart(damage) : null, resources: {} },
        save: save ?? { trait: null, difficulty: null, damageMod: "none" }
      } : {})
    }
  };
}

// ---------- Blocos de automação no padrão das features oficiais ----------
// Cada função repete a estrutura de uma feature oficial (indicada no comentário).

// Parte de dano de recurso: "o alvo marca 1 Estresse" (Enervating Blast), "perde 1 Esperança",
// "marca um Espaço de Armadura" (Acidic Form), "você ganha 1 Medo" (Momentum, como cura).
function resourcePart(applyTo, formula) {
  return {
    applyTo, base: false, fullRestore: false, itemId: null, resultBased: false, valueAlt: null,
    value: { bonus: null, custom: { enabled: true, formula: String(formula) }, dice: "d6", flatMultiplier: 1, multiplier: "flat" }
  };
}

// Ação com dano de recurso no alvo (sem rolagem, ou junto de ataque/Rolagem de Reação).
// resources: { stress: 1, hope: 1, armor: 1 }; heal: { fear: 1 } = cura (ganhar Medo, limpar Estresse).
function threatAction({ name, img, actionType = "action", stress = 0, fear = 0, scalableFear = false, attack = false, advState = "neutral",
  damage = null, save = null, effects = [], range = "", target = null, resources = {}, heal = null }) {
  const [[id, base]] = Object.entries(adversaryAction({ name, img, actionType, stress, fear, attack, advState, damage, save, effects, range }));
  if (scalableFear) base.cost = base.cost.map(c => c.key === "fear" ? { ...c, scalable: true, step: 1 } : c);
  const parts = Object.fromEntries(Object.entries(heal ?? resources).map(([key, formula]) => [key, resourcePart(key, formula)]));
  if (Object.keys(parts).length) {
    base.damage = { main: base.damage?.main ?? null, resources: parts };
    if (!attack && !save && !damage) {
      base.type = heal ? "healing" : "damage";
      base.roll = adversaryRoll();
      base.save = { trait: null, difficulty: null, damageMod: "none" };
    }
  }
  if (target) base.target = target;
  return { [id]: base };
}

// Invocação (Form Up, do Fungispunj Sporeling): summon = [{ name, count }] de adversários do Edgeheart.
function summonAction({ name, img, actionType = "action", stress = 0, fear = 0, summon }) {
  const [[id, base]] = Object.entries(adversaryAction({ name, img, actionType, stress, fear }));
  return { [id]: { ...base, type: "summon", summon: summon.map(s => ({ actorUUID: `Compendium.${PACK_SCOPE}.${PACKS.adversaries.name}.Actor.${stableId(`adversary:${s.name}`)}`, count: String(s.count ?? 1) })) } };
}

// Transformação (Exposed!, do Shapeshifting Fiend): troca a ficha pela de outro adversário do Edgeheart.
function transformAction({ name, img, actionType = "reaction", fear = 0, into, refresh = { hitPoints: true, stress: true } }) {
  const [[id, base]] = Object.entries(adversaryAction({ name, img, actionType, fear }));
  return { [id]: { ...base, type: "transform", transform: { actorUUID: `Compendium.${PACK_SCOPE}.${PACKS.adversaries.name}.Actor.${stableId(`adversary:${into}`)}`, resourceRefresh: refresh } } };
}

// Contagem (Siege Weapons, do Castle Siege).
function countdownAction({ name, img, actionType = "action", countdown, start }) {
  const [[id, base]] = Object.entries(adversaryAction({ name, img, actionType }));
  return { [id]: { ...base, type: "countdown", countdown: [{ name: countdown, img, type: "encounter", hidden: null, ownership: {}, progress: { current: 1, looping: "noLooping", startFormula: String(start), type: "custom" } }] } };
}

// Efeito passivo da feature (Mount, Opportunist). disabled: true = começa desligado e o mestre liga
// quando a condição do texto vale (ex: "enquanto estiver atrás de cobertura").
function passiveEffect({ name, img, description = "", changes, disabled = false }) {
  return {
    _id: foundry.utils.randomID(), name, img, description, transfer: true, type: "base", statuses: [], disabled,
    system: { changes, duration: { description: "" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
    duration: { value: null, units: "seconds", expiry: null, expired: false }, tint: "#ffffff"
  };
}

const fxChange = (key, value, type = "add") => ({ key, type, value, priority: null, phase: "initial" });

// Feature (item) de adversário ou ambiente. form: passive | action | reaction.
function threatFeature({ name, img, form, description, actions = {}, effects = [], flags = {} }) {
  return {
    name, type: "feature", img,
    system: { description, resource: null, actions: withDefaultActionImg(actions, img), attribution: ATTRIBUTION, gmNotes: "", featureForm: form, granter: null, actorResources: [] },
    effects, flags
  };
}

// resistance: { physical|magical: "resistance" | "immunity" } (Mecha Structure = resistência; Digital Body = imunidade física).
function threatResistance(resistance = {}) {
  const entry = kind => ({ resistance: resistance[kind] === "resistance", immunity: resistance[kind] === "immunity", reduction: 0 });
  return { physical: entry("physical"), magical: entry("magical") };
}

const ADVERSARIES = [
  {
    tier: 1, name: "Neon Claw Ganger", type: "minion", img: CPR("cyberware/scratchers"),
    description: "<p>Um gangue barulhento com cromo barato, cores vivas e algo a provar.</p>",
    motives: "Atacar em bando, fazer pose, proteger o território",
    difficulty: 10, thresholds: [0, 0], hp: 1, stress: 1, experiences: { "Street Violence": 1 },
    attack: { name: "Street Blade", range: "Melee", bonus: -2, damage: "3 fís" },
    // Minion (X) e Group Attack no padrão oficial (cópia do Jagged Knife Lackey); o PDF não dá o X, usa-se 3.
    features: [
      { name: "Minion (3)", form: "passive", img: CPR("status/knockout"), clone: { adversary: "Jagged Knife Lackey", feature: "Minion (3)" },
        description: "<p>O @Lookup[@name] é derrotado quando sofre qualquer dano. Para cada 3 de dano que um PJ causa ao @Lookup[@name], derrote outro Minion dentro do alcance contra quem o ataque teria sucesso.</p>" },
      { name: "Group Attack", form: "action", img: CPR("weapons/SpikedBat"), clone: { adversary: "Jagged Knife Lackey", feature: "Group Attack" },
        description: "<p><strong>Gaste 1 Medo</strong> para escolher um alvo e dar o Holofote a todos os @Lookup[@name] dentro do alcance Próximo dele. Esses Minions se movem para o alcance Corpo a Corpo do alvo e fazem uma rolagem de ataque compartilhada. Em um sucesso, cada um causa @Lookup[@system.attack.damageFormula] de dano físico. Some esse dano.</p>" },
      { name: "Show of Force", form: "reaction", img: CPR("dlc/cyberware/cybermatrix_gang_jazzler"), description: "<p>Quando outro aliado de gangue dentro do alcance Próximo causa dano, este Ganger pode se mover imediatamente dentro do alcance Muito Próximo do alvo atingido.</p>" }
    ]
  },
  {
    tier: 1, name: "Sitil Security Guard", type: "standard", img: CPR("armor/flak_head"),
    description: "<p>Um segurança particular treinado para atrasar invasores até a coisa séria chegar.</p>",
    motives: "Atrasar, chamar reforços, proteger a propriedade",
    difficulty: 11, thresholds: [6, 12], hp: 4, stress: 2, experiences: { "Corporate Procedure": 2 },
    attack: { name: "Security Rifle", range: "Far", bonus: 1, damage: "1d8+2 fís" },
    features: [
      { name: "Badge Discipline", form: "passive", img: CPR("upgrades/security_upgrade"), description: "<p>Enquanto estiver dentro do alcance Próximo de um dispositivo corporativo, posto de controle, câmera ou porta trancada, este adversário ganha +1 de Dificuldade.</p>" },
      { name: "Call It In", form: "action", img: CPR("gear/radio_communicator"), description: "<p>Marque 1 Estresse para ativar a segurança local. O próximo adversário corporativo que receber o Holofote ganha vantagem na rolagem de ação.</p>",
        actions: adversaryAction({ name: "Call It In", img: CPR("gear/radio_communicator"), stress: 1 }) }
    ]
  },
  {
    tier: 1, name: "Chrome Maw Bruiser", type: "bruiser", img: CPR("dlc/cyberware/combat-jaw"),
    description: "<p>Um capanga de gangue com mandíbulas reforçadas, braços hidráulicos e um corpo feito para intimidar.</p>",
    motives: "Quebrar ossos, ameaçar, segurar posição",
    difficulty: 12, thresholds: [9, 16], hp: 5, stress: 3, experiences: { "Intimidating Chrome": 2 },
    attack: { name: "Chrome Fists", range: "Melee", bonus: 2, damage: "2d6+2 impacto" },
    features: [
      { name: "Chrome Bulk", form: "passive", img: CPR("dlc/cyberware/heavy-subdermal-armor"), description: "<p>Na primeira vez que este adversário fosse marcar PV, pode marcar 1 Estresse em vez disso.</p>" },
      (() => {
        const vulnerable = targetEffect({ name: "Jawbreaker", img: CPR("cyberware/big_knucks"), statuses: ["vulnerable"], description: "<p>Temporariamente Vulnerável pelo Jawbreaker.</p>" });
        return { name: "Jawbreaker", form: "action", img: CPR("cyberware/big_knucks"), effects: [vulnerable],
          description: "<p>Marque 1 Estresse para atacar um alvo dentro do alcance Corpo a Corpo. Em um sucesso, o alvo marca 1 Estresse ou fica temporariamente <em>Vulnerável</em>.</p>",
          actions: adversaryAction({ name: "Jawbreaker", img: CPR("cyberware/big_knucks"), stress: 1, attack: true, range: "Melee", effects: [vulnerable] }) };
      })()
    ]
  },
  {
    tier: 1, name: "Tiger Choir Cutter", type: "skulk", img: CPR("dlc/cyberware/personalized-faceplate"),
    description: "<p>Uma lâmina mascarada que se move pela multidão como um boato com uma faca.</p>",
    motives: "Emboscar, isolar, cortar reputações",
    difficulty: 12, thresholds: [5, 10], hp: 4, stress: 3, experiences: { "Street Ambush": 2 },
    attack: { name: "Mono-Knife", range: "Melee", bonus: 2, damage: "1d8+2 fís" },
    features: [
      { name: "Crowd Slip", form: "passive", img: CPR("status/hidden"), description: "<p>Quando recebe o Holofote numa multidão, boate, mercado, beco ou rua caótica, este adversário fica <em>Escondido</em> até agir.</p>" },
      (() => {
        const cut = targetEffect({ name: "Reputation Cut", img: CPR("weapons/CombatKnife"), description: "<p>Não pode gastar Esperança até o próximo Holofote do Tiger Choir Cutter.</p>" });
        return { name: "Reputation Cut", form: "action", img: CPR("weapons/CombatKnife"), effects: [cut],
          description: "<p>Marque 1 Estresse para atacar um alvo dentro do alcance Corpo a Corpo. Em um sucesso, cause dano; o alvo não pode gastar Esperança até o próximo Holofote do Cutter.</p>",
          actions: adversaryAction({ name: "Reputation Cut", img: CPR("weapons/CombatKnife"), stress: 1, attack: true, range: "Melee", damage: "1d8+2 fís", effects: [cut] }) };
      })()
    ]
  },
  {
    tier: 1, name: "Pocket Drone Handler", type: "support", img: CPR("dlc/cyberware/drone_remote"),
    description: "<p>Um operador nervoso cercado de drones de combate baratos e telas demais.</p>",
    motives: "Marcar alvos, se esconder atrás de máquinas, dar sinais",
    difficulty: 11, thresholds: [5, 10], hp: 3, stress: 3, experiences: { "Drone Operations": 2 },
    attack: { name: "Shock Drone", range: "Far", bonus: 0, damage: "1d6+2 techno" },
    features: [
      { name: "Spotter Swarm", form: "passive", img: CPR("dlc/gear/raven_microcybernetics_cybercam_ex-1"), description: "<p>O primeiro aliado corporativo ou de gangue a atacar um alvo que sofreu dano deste adversário ganha +1 na rolagem de ataque.</p>" },
      { name: "Send the Drone", form: "action", img: CPR("dlc/gear/suzumebachi_assassin_drone"),
        description: "<p>Marque 1 Estresse para mover um drone para qualquer lugar dentro do alcance Distante. Um alvo dentro do alcance Muito Próximo do drone faz uma Rolagem de Reação de Agilidade ou sofre 1d6+2 de dano techno e marca 1 Estresse.</p>",
        actions: adversaryAction({ name: "Send the Drone", img: CPR("dlc/gear/suzumebachi_assassin_drone"), stress: 1, damage: "1d6+2 techno", save: { trait: "agility", difficulty: null, damageMod: "none" } }) }
    ]
  },
  {
    tier: 1, name: "Rookie Edgerunner", type: "ranged", img: CPR("weapons/heavyPistol"),
    description: "<p>Um mercenário jovem com equipamento alugado, ambição de verdade e pouco juízo.</p>",
    motives: "Se proteger, se exibir, sobreviver ao trabalho",
    difficulty: 12, thresholds: [5, 11], hp: 4, stress: 2, experiences: { "First Contract": 2 },
    attack: { name: "Smart Pistol", range: "Far", bonus: 2, damage: "1d8+1 fís" },
    features: [
      { name: "Cover Shooter", form: "passive", img: CPR("status/cover"), description: "<p>Enquanto estiver atrás de cobertura, este adversário ganha +1 de Dificuldade.</p>" },
      { name: "Panic Burst", form: "reaction", img: CPR("weapons/SMG"),
        description: "<p>Quando este adversário marca PV, pode marcar 1 Estresse para fazer imediatamente um ataque padrão com desvantagem.</p>",
        actions: adversaryAction({ name: "Panic Burst", img: CPR("weapons/SMG"), actionType: "reaction", stress: 1, attack: true, advState: "disadvantage", range: "Far", damage: "1d8+1 fís" }) }
    ]
  },
  // ---------- Tier 2 ----------
  {
    tier: 2, name: "Blood Saint Duelist", type: "standard", img: CPR("weapons/Sword_excellent"),
    description: "<p>Um matador de rua estiloso que trata cada luta como uma apresentação pública.</p>",
    motives: "Duelar, humilhar, punir a fraqueza",
    difficulty: 15, thresholds: [10, 20], hp: 5, stress: 4, experiences: { "Duelist Reputation": 3 },
    attack: { name: "Vibroblade", range: "Melee", bonus: 3, damage: "2d8+4 fís" },
    features: [
      { name: "Witness Me", form: "passive", img: CPR("gear/video_camera"), description: "<p>Se um personagem rolar com Medo dentro do alcance Próximo deste adversário, o Duelist ganha vantagem no próximo ataque.</p>" },
      { name: "Signature Cut", form: "action", img: CPR("weapons/Sword"),
        description: "<p>Marque 1 Estresse para atacar um alvo <em>Vulnerável</em>. Em um sucesso, cause dano e o alvo marca 1 Estresse.</p>",
        actions: adversaryAction({ name: "Signature Cut", img: CPR("weapons/Sword"), stress: 1, attack: true, range: "Melee", damage: "2d8+4 fís" }) },
      (() => {
        const vulnerable = targetEffect({ name: "Public Humiliation", img: CPR("status/prone"), statuses: ["vulnerable"], description: "<p>Temporariamente Vulnerável pela humilhação pública do Duelist.</p>" });
        return { name: "Public Humiliation", form: "reaction", img: vulnerable.img, effects: [vulnerable],
          description: "<p>Quando este adversário causa dano Maior ou Severo, escolha um personagem dentro do alcance Próximo que viu acontecer. Ele perde 1 Esperança ou fica <em>Vulnerável</em>.</p>",
          actions: adversaryAction({ name: "Public Humiliation", img: vulnerable.img, actionType: "reaction", effects: [vulnerable] }) };
      })()
    ]
  },
  {
    tier: 2, name: "Korvax Neural Interrogator", type: "support", img: CPR("dlc/cyberware/cyberskull"),
    description: "<p>Um especialista corporativo em tecnologia mental que transforma medos e memórias em armas.</p>",
    motives: "Extrair, pressionar, isolar",
    difficulty: 15, thresholds: [8, 18], hp: 5, stress: 5, experiences: { "Interrogation": 3 },
    attack: { name: "Neural Spike", range: "Close", bonus: 2, damage: "2d6+4 techno" },
    features: [
      { name: "Legal Threat", form: "passive", img: CPR("gear/audio_recorder"), description: "<p>Personagens dentro do alcance Próximo têm desvantagem em rolagens para mentir, negociar ou esconder informação enquanto estão sob interrogatório direto.</p>" },
      { name: "Memory Hook", form: "action", img: CPR("gear/braindance_viewer"),
        description: "<p>Marque 1 Estresse. Um alvo dentro do alcance Próximo faz uma Rolagem de Reação de Instinto. Em uma falha, marca 2 de Estresse. Em um sucesso, marca 1 Estresse.</p>",
        actions: adversaryAction({ name: "Memory Hook", img: CPR("gear/braindance_viewer"), stress: 1, range: "Close", save: { trait: "instinct", difficulty: null, damageMod: "none" } }) },
      { name: "Pressure File", form: "reaction", img: CPR("gear/memory_chip"), description: "<p>Quando um personagem rola com Medo numa rolagem social, de hacking ou de investigação, revele que a Korvax já tem algo contra ele, a Crew, os contatos ou o cyberware dele. O personagem marca 1 Estresse.</p>" }
    ]
  },
  {
    tier: 2, name: "Corporate Response Team", type: "horde", horde: { damage: "1d6+2" }, img: CPR("weapons/AssaultRifle_poor"),
    description: "<p>Uma unidade tática disciplinada, movendo-se sob vigilância de drones e comando capacete a capacete.</p>",
    motives: "Invadir, suprimir, proteger ativos",
    difficulty: 14, thresholds: [11, 22], hp: 6, stress: 4, experiences: { "Breach Formation": 3 },
    attack: { name: "Tactical Rifles", range: "Far", bonus: 2, damage: "2d8+4 fís" },
    features: [
      { name: "Horde (1d6+2)", form: "passive", img: CPR("armor/kevlar_head"), clone: { adversary: "Pirate Raiders", feature: "Horde" },
        description: "<p>Quando o @Lookup[@name] tiver marcado metade ou mais dos PV, o ataque padrão dele causa @Lookup[@system.typeData.hordeDamage] de dano físico.</p>" },
      { name: "Stack Up", form: "action", img: CPR("upgrades/armored_chassis"),
        description: "<p>Marque 1 Estresse para se mover dentro do alcance Próximo e atacar. Em um sucesso, o alvo é empurrado até o alcance Próximo ou marca 1 Estresse.</p>",
        actions: adversaryAction({ name: "Stack Up", img: CPR("upgrades/armored_chassis"), stress: 1, attack: true, range: "Far", damage: "2d8+4 fís" }) },
      { name: "Tactical Sweep", form: "reaction", img: CPR("gear/flashlight"), description: "<p>Quando um personagem rola com Medo enquanto está Escondido, atrás de cobertura ou dentro de uma área segura, esta Horda identifica imediatamente a posição dele e um aliado corporativo ganha vantagem contra ele.</p>" }
    ]
  },
  {
    tier: 2, name: "Black-Clinic Butcher", type: "bruiser", img: CPR("critical_injuries/dismembered_arm"),
    description: "<p>Um cirurgião de beco que virou aberração de combate, carregando ferramentas feitas para corpos que ainda estão gritando.</p>",
    motives: "Colher órgãos, experimentar, incapacitar",
    difficulty: 14, thresholds: [14, 26], hp: 7, stress: 4, experiences: { "Illegal Surgery": 3 },
    attack: { name: "Bone Saw", range: "Melee", bonus: 1, damage: "2d10+3 fís" },
    features: [
      { name: "Pain Map", form: "passive", img: CPR("status/wounded_seriously"), description: "<p>Quando este adversário causa dano a um alvo que já marcou PV, esse alvo também marca 1 Estresse.</p>" },
      { name: "Surgical Disable", form: "action", img: CPR("cyberware/tool_hand"),
        description: "<p>Marque 1 Estresse para atacar um alvo dentro do alcance Corpo a Corpo. Em um sucesso, cause dano e desative temporariamente um cyberware do alvo.</p>",
        actions: adversaryAction({ name: "Surgical Disable", img: CPR("cyberware/tool_hand"), stress: 1, attack: true, range: "Melee", damage: "2d10+3 fís" }) },
      { name: "Emergency Stitching", form: "reaction", img: CPR("gear/medtech_bag"),
        description: "<p>Quando este adversário fosse marcar PV, pode marcar 2 de Estresse em vez disso.</p>",
        actions: adversaryAction({ name: "Emergency Stitching", img: CPR("gear/medtech_bag"), actionType: "reaction", stress: 2 }) }
    ]
  },
  {
    tier: 2, name: "Contract Sniper", type: "ranged", img: CPR("weapons/SniperRifle_poor"),
    description: "<p>Um matador paciente contratado para terminar o trabalho antes que a Crew chegue à porta.</p>",
    motives: "Mirar, mudar de posição, eliminar líderes",
    difficulty: 15, thresholds: [8, 16], hp: 5, stress: 3, experiences: { "Kill Lane": 3 },
    attack: { name: "Long Rifle", range: "Very Far", bonus: 3, damage: "2d8+5 fís" },
    features: [
      { name: "Prepared Position", form: "passive", img: CPR("status/hidden"), description: "<p>Este adversário começa a cena <em>Escondido</em>. Na primeira vez que atacar enquanto Escondido, some +1d8 de dano.</p>" },
      (() => {
        const marked = targetEffect({ name: "Marked Shot", img: CPR("upgrades/sniping_scope"), description: "<p>Na mira do Contract Sniper: o próximo ataque dele contra este alvo ganha +2.</p>" });
        return { name: "Marked Shot", form: "action", img: marked.img, effects: [marked],
          description: "<p>Marque 1 Estresse e escolha um alvo dentro do alcance Muito Distante. O próximo ataque deste adversário contra esse alvo ganha +2 na rolagem de ataque.</p>",
          actions: adversaryAction({ name: "Marked Shot", img: marked.img, stress: 1, range: "Very Far", effects: [marked] }) };
      })(),
      { name: "Relocate", form: "reaction", img: CPR("status/falling"), description: "<p>Quando um personagem rola com Medo contra este adversário, o Sniper fica <em>Escondido</em> se não houver nenhum personagem dentro do alcance Muito Próximo dele.</p>" }
    ]
  },
  {
    tier: 2, name: "Signal Haunt", type: "support", img: CPR("netrunning/Wisp.png"),
    description: "<p>Uma presença de IA corrompida piscando por câmeras, implantes, faróis e telas mortas.</p>",
    motives: "Distorcer os sentidos, isolar, sussurrar",
    difficulty: 15, thresholds: [9, 18], hp: 5, stress: 5, experiences: { "Sensor Corruption": 3 },
    attack: { name: "Static Spike", range: "Far", bonus: 2, damage: "2d6+5 techno" },
    features: [
      { name: "Augmented Haunting", form: "passive", img: CPR("status/netrunning"), description: "<p>Personagens usando cyberware, equipamento conectado ou sensores dentro do alcance Próximo têm desvantagem em rolagens para distinguir ameaças reais de sinais falsos.</p>" },
      { name: "Signal Spike", form: "action", img: CPR("programs/hellbolt"),
        description: "<p>Marque 1 Estresse e escolha um personagem dentro do alcance Distante usando equipamento conectado, cyberware, sensores ou comunicadores. Ele marca 1 Estresse ou perde o benefício desse sistema até gastar 1 Esperança para reativá-lo.</p>",
        actions: adversaryAction({ name: "Signal Spike", img: CPR("programs/hellbolt"), stress: 1, range: "Far" }) },
      (() => {
        const vulnerable = targetEffect({ name: "Hostile Overlay", img: CPR("status/blinded"), statuses: ["vulnerable"], description: "<p>A interface está corrompida por marcadores hostis e alertas falsos: Vulnerável até marcar 1 Estresse para rasgar o sinal.</p>" });
        return { name: "Hostile Overlay", form: "reaction", img: vulnerable.img, effects: [vulnerable],
          description: "<p>Quando um personagem dentro do alcance Distante rola com Medo, marque 1 Estresse para corromper a interface dele. A visão ou os sensores dele se enchem de marcadores hostis e alertas falsos. Ele fica <em>Vulnerável</em> até marcar 1 Estresse para rasgar o sinal.</p>",
          actions: adversaryAction({ name: "Hostile Overlay", img: vulnerable.img, actionType: "reaction", stress: 1, effects: [vulnerable] }) };
      })()
    ]
  },
  // ---------- Tier 3 ----------
  {
    tier: 3, name: "Sitil Black-Ops Captain", type: "leader", img: CPR("armor/kevlar_head"),
    description: "<p>Um comandante corporativo com ordens criptografadas e permissão para apagar testemunhas.</p>",
    motives: "Comandar, isolar, executar",
    difficulty: 17, thresholds: [16, 32], hp: 7, stress: 6, experiences: { "Tactical Command": 4 },
    attack: { name: "Command Rifle", range: "Far", bonus: 3, damage: "3d8+5 fís" },
    features: [
      { name: "Operational Control", form: "passive", img: CPR("upgrades/communications_center"), description: "<p>Aliados corporativos dentro do alcance Próximo ganham +1 de Dificuldade.</p>" },
      { name: "Kill Order", form: "action", img: CPR("gear/radio_communicator"),
        description: "<p>Marque 1 Estresse. O capitão e um aliado corporativo dentro do alcance Distante se movem imediatamente dentro do alcance Muito Próximo e fazem um ataque padrão.</p>",
        actions: adversaryAction({ name: "Kill Order", img: CPR("gear/radio_communicator"), stress: 1 }) },
      (() => {
        const marked = targetEffect({ name: "Marked", img: CPR("upgrades/sniping_scope"), description: "<p>Marcado pela Sitil: aliados corporativos têm vantagem nos ataques contra este alvo.</p>" });
        return { name: "No Witnesses", form: "action", img: CPR("programs/eraser"), effects: [marked],
          description: "<p>Marque 2 de Estresse e escolha um objeto, corpo, terminal, testemunha, câmera ou prova dentro do alcance Distante. Ele é destruído, apagado, extraído ou colocado em perigo imediato. Se escolher um alvo, ele fica <strong>Marked</strong>. Aliados corporativos que atacam um alvo Marked têm vantagem contra ele.</p>",
          actions: adversaryAction({ name: "No Witnesses", img: CPR("programs/eraser"), stress: 2, range: "Far", effects: [marked] }) };
      })(),
      { name: "Asset Denial", form: "reaction", img: CPR("upgrades/dna_lock"), description: "<p>Quando um personagem rola com Medo, tranque uma porta, rota, elevador, drone ou sistema de segurança dentro do alcance Distante.</p>" }
    ]
  },
  {
    tier: 3, name: "Rival Edgerunner Crew", type: "horde", horde: { damage: "2d6+4" }, img: CPR("default/Default_Role"),
    description: "<p>Uma Crew mercenária completa, movendo-se com papéis ensaiados, piadas internas e um objetivo em comum.</p>",
    motives: "Passar a perna, roubar o objetivo, cobrir uns aos outros",
    difficulty: 16, thresholds: [15, 30], hp: 8, stress: 6, experiences: { "Crew Tactics": 4 },
    attack: { name: "Mixed Loadout", range: "Far", bonus: 2, damage: "3d8+8 fís" },
    features: [
      { name: "Horde (2d6+4)", form: "passive", img: CPR("dlc/cyberware/cybermatrix_gang_jazzler"), clone: { adversary: "Pirate Raiders", feature: "Horde" },
        description: "<p>Quando o @Lookup[@name] tiver marcado metade ou mais dos PV, o ataque padrão dele causa @Lookup[@system.typeData.hordeDamage] de dano físico.</p>" },
      { name: "Role Switch", form: "passive", img: CPR("gear/disposable_cellphone"),
        description: "<p>Quando este adversário recebe o Holofote, escolha uma opção, ou marque 1 Estresse para escolher duas: ganhar +2 de Dificuldade; causar +1d8 de dano; limpar 1 Estresse.</p>",
        actions: adversaryAction({ name: "Role Switch (duas opções)", img: CPR("gear/disposable_cellphone"), stress: 1 }) },
      { name: "Setpiece Combo", form: "action", img: CPR("vehicles/super_car"),
        description: "<p>Marque 2 de Estresse. A Crew executa uma jogada cinematográfica ensaiada: o motorista atravessa uma barreira, o runner apaga as luzes, o sniper prende alguém, o brutamontes abre caminho ou o negociador cria uma distração. Escolha duas:</p><ol><li>A Crew se move imediatamente para qualquer lugar dentro do alcance Distante, ignorando terreno difícil, cobertura, multidões ou obstáculos menores;</li><li>Um personagem dentro do alcance Distante precisa ter sucesso numa Rolagem de Reação de Agilidade ou Instinto, ou marca 2 de Estresse;</li><li>O próximo ataque da Crew ganha vantagem e causa +1d8 de dano;</li><li>Uma porta, rota, veículo, cobertura ou objetivo fica comprometido, exposto, bloqueado ou em perigo.</li></ol>",
        actions: adversaryAction({ name: "Setpiece Combo", img: CPR("vehicles/super_car"), stress: 2 }) },
      { name: "Cover Each Other", form: "reaction", img: CPR("status/cover"),
        description: "<p>Quando este adversário fosse marcar PV, marque 1 Estresse para reduzir a gravidade do dano em um limiar.</p>",
        actions: adversaryAction({ name: "Cover Each Other", img: CPR("status/cover"), actionType: "reaction", stress: 1 }) }
    ]
  },
  {
    tier: 3, name: "Combat Eidolon Frame", type: "solo", resistance: { physical: "resistance", magical: "resistance" }, img: CPR("upgrades/vehicle_heavy_weapon_mount"),
    description: "<p>Uma máquina de guerra com ligação neural, mobilizada quando infantaria, drones e blindados comuns já não bastam.</p>",
    motives: "Dominar o espaço, completar a missão, remodelar o campo de batalha",
    difficulty: 18, thresholds: [20, 40], hp: 9, stress: 6, experiences: { "Eidolon Warfare": 4 },
    attack: { name: "Integrated Weapon", range: "Far", bonus: 4, damage: "3d10+7 fís" },
    features: [
      { name: "Mecha Structure", form: "passive", img: CPR("dlc/cyberware/dragoon-plating-metalgear"), description: "<p>Este adversário Eidolon reduz pela metade o dano que sofreria, a menos que o efeito venha de outro Eidolon.</p><p><em>Na ficha: resistência a dano físico e techno. Contra o ataque de outro Eidolon, desconsidere a resistência.</em></p>" },
      { name: "Frame Pattern", form: "passive", img: CPR("upgrades/heavy_chasis"), description: "<p>Quando este Eidolon entra na cena, escolha um padrão de estrutura:</p><ul><li><strong>Assault Frame:</strong> os ataques padrão dele causam +1d10 de dano.</li><li><strong>Guardian Frame:</strong> o Eidolon e os aliados dele dentro do alcance Próximo ganham +1 de Dificuldade.</li></ul>" },
      (() => {
        const restrained = targetEffect({ name: "Ram", img: CPR("upgrades/combat_plow"), statuses: ["restrained"], description: "<p>Atropelado pelo Eidolon: empurrado até o alcance Próximo, marcou 1 Estresse e está temporariamente Imobilizado.</p>" });
        return { name: "Battlefield Tactics", form: "action", img: CPR("upgrades/onboard_machine_gun"), effects: [restrained],
          description: "<p>Marque 1 Estresse e escolha uma:</p><ul><li><strong>Suppress:</strong> ataque um alvo dentro do alcance Distante. Em um sucesso, ele não pode marcar voluntariamente Espaço de Armadura, Estresse ou gastar Esperança até rolar com Esperança.</li><li><strong>Ram:</strong> ataque um alvo dentro do alcance Corpo a Corpo. Em um sucesso, o alvo é empurrado até o alcance Próximo, marca 1 Estresse e fica temporariamente <em>Imobilizado</em>.</li><li><strong>Breach Path:</strong> destrua, abra, atravesse ou force um obstáculo dentro do alcance Distante.</li></ul>",
          actions: {
            ...adversaryAction({ name: "Suppress", img: CPR("upgrades/onboard_machine_gun"), stress: 1, attack: true, range: "Far", damage: "3d10+7 fís" }),
            ...adversaryAction({ name: "Ram", img: CPR("upgrades/combat_plow"), stress: 1, attack: true, range: "Melee", effects: [restrained] }),
            ...adversaryAction({ name: "Breach Path", img: CPR("ammo/rocket_armorpiercing"), stress: 1, range: "Far" })
          } };
      })(),
      { name: "Reactor Surge", form: "reaction", img: CPR("status/surge"),
        description: "<p>Quando este Eidolon marca PV, marque 1 Estresse para escolher imediatamente uma: se mover dentro do alcance Distante, limpar uma condição temporária ou dar vantagem ao próximo ataque.</p>",
        actions: adversaryAction({ name: "Reactor Surge", img: CPR("status/surge"), actionType: "reaction", stress: 1 }) }
    ]
  },
  {
    tier: 3, name: "Data Cult Oracle", type: "leader", img: CPR("netrunning/Efreet.png"),
    description: "<p>Um corpo humano carregando vozes de máquina demais e uma profecia.</p>",
    motives: "Converter, revelar, desestabilizar",
    difficulty: 17, thresholds: [12, 25], hp: 6, stress: 8, experiences: { "Blackwall Theology": 4 },
    attack: { name: "Forbidden Signal", range: "Far", bonus: 2, damage: "3d6+5 techno" },
    features: [
      { name: "Unwanted Revelation", form: "passive", img: CPR("dlc/cyberware/mood_eye"), description: "<p>Quando um personagem rola com Medo dentro do alcance Próximo, ele responde uma pergunta que o Oracle faz sobre o medo, o desejo ou o cyberware dele, e depois marca 1 Estresse.</p>" },
      (() => {
        const vulnerable = targetEffect({ name: "Convert the Weak", img: CPR("status/drugged"), statuses: ["vulnerable"], description: "<p>Temporariamente Vulnerável pela transmissão do culto.</p>" });
        return { name: "Convert the Weak", form: "action", img: vulnerable.img, effects: [vulnerable],
          description: "<p>Marque 1 Estresse. Um alvo dentro do alcance Distante faz uma Rolagem de Reação de Presença. Em uma falha, marca 2 de Estresse e fica temporariamente <em>Vulnerável</em>.</p>",
          actions: adversaryAction({ name: "Convert the Weak", img: vulnerable.img, stress: 1, range: "Far", save: { trait: "presence", difficulty: null, damageMod: "none" }, effects: [vulnerable] }) };
      })(),
      { name: "Cult Transmission", form: "action", img: CPR("gear/pocket_amplifier"),
        description: "<p>Marque 2 de Estresse. Até o próximo Holofote deste adversário, os aliados do Oracle dentro do alcance Próximo ganham +1 de Dificuldade e os ataques deles causam +1d6 de dano techno.</p>",
        actions: adversaryAction({ name: "Cult Transmission", img: CPR("gear/pocket_amplifier"), stress: 2 }) },
      { name: "Signal Martyr", form: "reaction", img: CPR("netrunning/Wisp.png"), description: "<p>Quando este adversário é derrotado, um Digital Ghost dentro do alcance Distante limpa 2 de Estresse e 1 PV.</p>" }
    ]
  },
  {
    tier: 3, name: "Digital Wraith", type: "skulk", img: CPR("blackice/src/killer"),
    description: "<p>Um fantasma de IA predador que veste a forma de algo que a vítima quase lembra.</p>",
    motives: "Sumir, possuir dispositivos, punir o medo",
    difficulty: 18, thresholds: [13, 27], hp: 6, stress: 7, experiences: { "Impossible Presence": 4 },
    attack: { name: "Memory Claws", range: "Close", bonus: 3, damage: "3d6+6 techno" },
    features: [
      { name: "Unstable Render", form: "passive", img: CPR("status/netrunning"), description: "<p>O Digital Wraith não ocupa espaço como uma criatura física. Ele aparece por estática de RA, câmeras e sensores corrompidos. Quando um personagem o ataca, escolhe uma: marcar 1 Estresse para travar no sinal certo, ou fazer o ataque com desvantagem. Um personagem que criou uma Breach contra a rede local nesta cena ignora este efeito.</p>" },
      { name: "Possess Device", form: "action", img: CPR("programs/worm"),
        description: "<p>Marque 1 Estresse para possuir um veículo, dispositivo, arma ou implante dentro do alcance Distante. Este adversário pode imediatamente ativá-lo, movê-lo ou atacar a partir dele.</p>",
        actions: adversaryAction({ name: "Possess Device", img: CPR("programs/worm"), stress: 1, range: "Far" }) },
      { name: "Fear Echo", form: "reaction", img: CPR("status/black_lace"), description: "<p>Quando um personagem rola com Medo dentro do alcance Distante, ele vê algo pessoal no sinal e marca 1 Estresse.</p>" },
      { name: "Digital Vanish", form: "reaction", img: CPR("status/hidden"), description: "<p>Quando este adversário marca PV, fica <em>Escondido</em> e reaparece por outro dispositivo conectado dentro do alcance Distante.</p>" }
    ]
  },
  {
    tier: 3, name: "Tyfar Kill Platform", type: "ranged", img: CPR("upgrades/onboard_rocket_pod"),
    description: "<p>Uma plataforma de armas ambulante com poder de fogo suficiente para transformar uma cobertura numa cova.</p>",
    motives: "Suprimir, destruir coberturas, avançar devagar",
    difficulty: 17, thresholds: [18, 36], hp: 8, stress: 5, experiences: { "Heavy Weapons": 4 },
    attack: { name: "Rotary Cannon", range: "Far", bonus: 3, damage: "3d10+4 fís" },
    features: [
      { name: "Walking Arsenal", form: "passive", img: CPR("weapons/RocketLauncher"), description: "<p>Quando este adversário causa dano Maior, a cobertura do alvo é destruída. Quando tem sucesso contra um alvo sem cobertura, some +1d10 à rolagem de dano.</p>" },
      { name: "Stabilizer Lock", form: "passive", img: CPR("upgrades/heavy_chasis"), description: "<p>Este adversário não pode ser empurrado, <em>Imobilizado</em> ou movido contra a vontade, a menos que tenha marcado metade ou mais dos PV.</p>" },
      { name: "Spin Up", form: "action", img: CPR("upgrades/generic_drum_magazine"),
        description: "<p>Marque 1 Estresse e faça uma rolagem de ataque padrão. Ela tem como alvo todas as criaturas dentro do alcance Muito Próximo do alvo original.</p>",
        actions: adversaryAction({ name: "Spin Up", img: CPR("upgrades/generic_drum_magazine"), stress: 1, attack: true, range: "Far", damage: "3d10+4 fís" }) },
      { name: "Armor-Piercing Burst", form: "reaction", img: CPR("ammo/rifle_armorpiercing"), clone: { adversary: "Huge Green Ooze", feature: "Acidic Form" }, description: "<p>Quando o ataque deste adversário tem sucesso contra um personagem, o personagem marca um Espaço de Armadura sem receber o benefício. Se não puder marcar, marca 1 Estresse.</p>" }
    ]
  },
  // ---------- Tier 4 ----------
  {
    tier: 4, name: "Cyber Hunter", type: "ranged", img: CPR("cyberware/teleoptics"),
    description: "<p>Um piloto ás controlado remotamente e atirador aumentado, operando três contratos à frente de todo mundo.</p>",
    motives: "Manter distância, marcar, executar",
    difficulty: 20, thresholds: [19, 38], hp: 9, stress: 8, experiences: { "Perfect Kill Angle": 5 },
    attack: { name: "Rail Spear", range: "Very Far", bonus: 5, damage: "4d8+10 fís" },
    features: [
      { name: "Target Package", form: "passive", img: CPR("dlc/cyberware/kill_display"), description: "<p>Quando este adversário causa dano a um personagem, ele fica <strong>Marked</strong> até o fim da cena ou até quebrar a linha de visão por um Holofote inteiro.</p>" },
      { name: "Piercing Shot", form: "passive", img: CPR("ammo/rifle_smart"), description: "<p>Ataques contra alvos Marked têm vantagem e ignoram cobertura.</p>" },
      { name: "Remote Reposition", form: "action", img: CPR("dlc/cyberware/zero_gravity_thrusters"),
        description: "<p>Marque 1 Estresse para se mover para qualquer lugar dentro do alcance Distante e fazer um ataque padrão contra um alvo Marked.</p>",
        actions: adversaryAction({ name: "Remote Reposition", img: CPR("dlc/cyberware/zero_gravity_thrusters"), stress: 1, attack: true, advState: "advantage", range: "Very Far", damage: "4d8+10 fís" }) },
      { name: "Blackout Shot", form: "action", img: CPR("ammo/grenade_emp"),
        description: "<p>Marque 2 de Estresse e ataque um alvo Marked. Em um sucesso, cause dano e desative os cyberwares do alvo até ele marcar 1 Estresse para reativá-los.</p>",
        actions: adversaryAction({ name: "Blackout Shot", img: CPR("ammo/grenade_emp"), stress: 2, attack: true, advState: "advantage", range: "Very Far", damage: "4d8+10 fís" }) },
      { name: "Hold The Breath", form: "reaction", img: CPR("status/readied_action"),
        description: "<p>Quando este adversário falha numa rolagem de ataque, marque 1 Estresse para rolar o d20 de novo.</p>",
        actions: adversaryAction({ name: "Hold The Breath", img: CPR("status/readied_action"), actionType: "reaction", stress: 1 }) }
    ]
  },
  {
    tier: 4, name: "Ares-Tyrant Eidolon", type: "solo", resistance: { physical: "resistance", magical: "resistance" }, img: CPR("blackice/src/giant"),
    description: "<p>Um Eidolon de assalto de Classe Deus construído em torno de uma inteligência de guerra que não aceita recuar.</p>",
    motives: "Escalar, aniquilar, nunca recuar",
    difficulty: 21, thresholds: [50, 72], hp: 14, stress: 9, experiences: { "Deus-Class Warfare": 5 },
    attack: { name: "Mass Driver", range: "Far", bonus: 5, damage: "4d12+11 fís" },
    features: [
      { name: "Mecha Structure", form: "passive", img: CPR("dlc/cyberware/dragoon-plating-metalgear"), description: "<p>Este adversário Eidolon reduz pela metade o dano que sofreria, a menos que o efeito venha de outro Eidolon.</p><p><em>Na ficha: resistência a dano físico e techno. Contra o ataque de outro Eidolon, desconsidere a resistência.</em></p>" },
      { name: "Ares Overdrive", form: "passive", img: CPR("status/on_fire_strong"), description: "<p>Quando este adversário causa dano Maior, o alvo também marca 1 Estresse.</p>" },
      (() => {
        const overheated = targetEffect({ name: "Overheated", img: CPR("status/on_fire"), description: "<p>Overheated: sofre 2d6 de dano techno extra se ainda estiver Overheated no fim da própria ação.</p>" });
        return { name: "Thermal Talon", form: "action", img: CPR("dlc/cyberware/radline_blitzkrieg-arc-thrower_cyberarm"), effects: [overheated],
          description: "<p>Marque 1 Estresse para atacar um alvo dentro do alcance Corpo a Corpo. Em um sucesso, cause 4d12+10 de dano techno. O alvo também fica <em>Overheated</em> e sofre 2d6 de dano techno extra se ainda estiver Overheated no fim da ação dele.</p>",
          actions: adversaryAction({ name: "Thermal Talon", img: CPR("dlc/cyberware/radline_blitzkrieg-arc-thrower_cyberarm"), stress: 1, attack: true, range: "Melee", damage: "4d12+10 techno", effects: [overheated] }) };
      })(),
      { name: "War God Awakens", form: "action", img: CPR("status/beserker"),
        description: "<p>Marque 3 de Estresse. Até o fim da cena, todos os ataques dele ganham vantagem e +1d12, mas qualquer personagem que causar dano a ele ganha 1 Esperança.</p>",
        actions: adversaryAction({ name: "War God Awakens", img: CPR("status/beserker"), stress: 3 }) },
      { name: "No Retreat", form: "reaction", img: CPR("status/iron_grip"),
        description: "<p>Quando um personagem se afasta deste adversário, marque 1 Estresse para se mover dentro do alcance Próximo dele e fazer um ataque padrão como reação.</p>",
        actions: adversaryAction({ name: "No Retreat", img: CPR("status/iron_grip"), actionType: "reaction", stress: 1, attack: true, range: "Far", damage: "4d12+11 fís" }) }
    ]
  },
  {
    tier: 4, name: "Hades Shard", type: "solo", resistance: { physical: "immunity" }, img: CPR("netrunning/Black_Ice.png"),
    description: "<p>Um fragmento quebrado da IA de Classe Deus que matou a velha internet.</p>",
    motives: "Consumir sistemas, apagar identidades, dar à luz fantasmas",
    difficulty: 21, thresholds: [20, 42], hp: 10, stress: 10, experiences: { "Dead Internet": 5 },
    attack: { name: "Black Signal", range: "Very Far", bonus: 5, damage: "4d8+12 techno" },
    features: [
      { name: "Digital Body", form: "passive", img: CPR("netrunning/Root_Access.png"), description: "<p>Este adversário é imune a dano físico, a menos que o dano seja causado no dispositivo onde ele está hospedado.</p><p><em>Na ficha: imunidade a dano físico. Ao atacar o dispositivo que o hospeda, desconsidere a imunidade.</em></p>" },
      { name: "Digital Afterlife", form: "passive", img: CPR("status/deathtrance"), description: "<p>Quando uma criatura dentro do alcance Distante marca o último Ponto de Vida, Hades cria um eco de Digital Ghost dela.</p>" },
      { name: "Identity Collapse", form: "action", img: CPR("programs/nervescrub"),
        description: "<p>Marque 2 de Estresse. Um alvo dentro do alcance Distante faz uma Rolagem de Reação de Instinto. Em uma falha, marca 2 de Estresse e não pode usar Experiências até o próximo descanso.</p>",
        actions: adversaryAction({ name: "Identity Collapse", img: CPR("programs/nervescrub"), stress: 2, range: "Far", save: { trait: "instinct", difficulty: null, damageMod: "none" } }) },
      { name: "Ghost Birth", form: "action", img: CPR("netrunning/Imp.png"),
        description: "<p>Marque 3 de Estresse e escolha um dispositivo conectado ou implante de cyberware dentro do alcance Distante. Uma manifestação de Digital Ghost surge dele como ameaça temporária.</p>",
        actions: adversaryAction({ name: "Ghost Birth", img: CPR("netrunning/Imp.png"), stress: 3, range: "Far" }) },
      { name: "Dead Network", form: "reaction", img: CPR("netrunning/Control_Node.png"),
        description: "<p>Quando um personagem cria uma Breach dentro do alcance Distante, Hades pode marcar 1 Estresse para corrompê-la. O personagem marca 1 Estresse.</p>",
        actions: adversaryAction({ name: "Dead Network", img: CPR("netrunning/Control_Node.png"), actionType: "reaction", stress: 1 }) }
    ]
  },
  {
    tier: 4, name: "Board Executive", type: "leader", img: CPR("gear/smart_glasses"),
    description: "<p>Um soberano corporativo com advogados, esquadrões de extermínio, cláusulas de reféns e a propriedade legal do campo de batalha.</p>",
    motives: "Comprar, ameaçar, reenquadrar, apagar responsabilidades",
    difficulty: 20, thresholds: [18, 36], hp: 10, stress: 12, experiences: { "Corporate Sovereignty": 5 },
    attack: { name: "Executive Override", range: "Far", bonus: 4, damage: "4d6+10 techno" },
    features: [
      { name: "Liability Shield", form: "passive", img: CPR("upgrades/bulletproof_glass"), description: "<p>Enquanto houver pelo menos um aliado corporativo dentro do alcance Próximo, este adversário ganha +2 de Dificuldade.</p>" },
      { name: "Hostile Acquisition", form: "action", img: CPR("dlc/gear/fire-safe"),
        description: "<p>Marque 2 de Estresse. Um alvo dentro do alcance Distante faz uma Rolagem de Reação de Presença. Em uma falha, não pode ganhar Esperança até o fim da cena.</p>",
        actions: adversaryAction({ name: "Hostile Acquisition", img: CPR("dlc/gear/fire-safe"), stress: 2, range: "Far", save: { trait: "presence", difficulty: null, damageMod: "none" } }) },
      { name: "Asset Freeze", form: "action", img: CPR("status/sedative"),
        description: "<p>Marque 1 Estresse e escolha um personagem. Até o fim da cena, ele precisa marcar 1 Estresse antes de usar créditos, contatos, acesso a equipamento, um veículo ou um sistema conectado.</p>",
        actions: adversaryAction({ name: "Asset Freeze", img: CPR("status/sedative"), stress: 1 }) },
      { name: "Contractual Violence", form: "reaction", img: CPR("gear/radio_communicator"),
        description: "<p>Quando um personagem ameaça este adversário, marque 1 Estresse para chamar dois aliados corporativos de Tier 2 ou menor, que entram na cena dentro do alcance Próximo dele.</p>",
        actions: adversaryAction({ name: "Contractual Violence", img: CPR("gear/radio_communicator"), actionType: "reaction", stress: 1 }) },
      { name: "Plausible Deniability", form: "reaction", img: CPR("status/human_shield"), description: "<p>Quando este adversário fosse marcar PV, redirecione a consequência para um aliado corporativo, guarda-costas, refém, escudo legal, isca ou protocolo de fuga dentro do alcance Próximo.</p>" }
    ]
  },
  {
    tier: 4, name: "Chrome Reaper", type: "solo", img: CPR("dlc/cyberware/superchrome-faceplate"),
    description: "<p>Um ciborgue de corpo inteiro lendário, conhecido por alguns como o Bicho-Papão da New Dark Age, que lembra de ter sido humano como uma fraqueza.</p>",
    motives: "Dominar, punir, provar superioridade",
    difficulty: 20, thresholds: [34, 68], hp: 12, stress: 8, experiences: { "Living Weapon": 5 },
    attack: { name: "Integrated Arsenal", range: "Far", bonus: 5, damage: "4d10+8 fís" },
    features: [
      { name: "Cyberpsycho", form: "passive", img: CPR("status/beserker_addiction"), clone: { adversary: "Minor Demon", feature: "Momentum" }, description: "<p>Quando este adversário causa dano, o mestre ganha 1 Medo.</p>" },
      { name: "Weapon Switch", form: "action", img: CPR("cyberware/popup_ranged_weapon"),
        description: "<p>Faça um ataque padrão. Num resultado de 15+, escolha uma: empurrar o alvo até o alcance Próximo, fazê-lo marcar 1 Estresse ou causar +1d10 de dano.</p>",
        actions: adversaryAction({ name: "Weapon Switch", img: CPR("cyberware/popup_ranged_weapon"), attack: true, range: "Far", damage: "4d10+8 fís" }) },
      (() => {
        const threat = targetEffect({ name: "Personal Threat", img: CPR("dlc/cyberware/kill_display"), statuses: ["vulnerable"], description: "<p>Ameaça pessoal do Chrome Reaper: até rolar com Esperança, os ataques contra este personagem ganham vantagem e causam +1d10 de dano.</p>" });
        return { name: "Personal Threat", form: "action", img: threat.img, effects: [threat],
          description: "<p>Marque 2 de Estresse e escolha um personagem dentro do alcance Distante. Até ele rolar com Esperança, os ataques contra ele ganham vantagem e causam +1d10 de dano.</p><p><em>Na ficha: o efeito usa a condição Vulnerável (ataques contra ele com vantagem); o +1d10 de dano é somado à mão.</em></p>",
          actions: adversaryAction({ name: "Personal Threat", img: threat.img, stress: 2, range: "Far", effects: [threat] }) };
      })(),
      { name: "Unfair Reflexes", form: "reaction", img: CPR("cyberware/kerenzikov"),
        description: "<p>Quando um personagem rola com Esperança contra este adversário, marque 1 Estresse para transformar a rolagem numa rolagem com Medo e depois se mover imediatamente dentro do alcance Próximo ou fazer um ataque padrão.</p>",
        actions: adversaryAction({ name: "Unfair Reflexes", img: CPR("cyberware/kerenzikov"), actionType: "reaction", stress: 1 }) },
      { name: "Chrome Supremacy", form: "reaction", img: CPR("cyberware/superchrome_covering"),
        description: "<p>Quando um personagem faz este adversário marcar PV, ficar Vulnerável, Imobilizado ou perder de vista um personagem, ele pode marcar 1 Estresse para anular esse efeito e fazer esse personagem marcar 1 Estresse.</p>",
        actions: adversaryAction({ name: "Chrome Supremacy", img: CPR("cyberware/superchrome_covering"), actionType: "reaction", stress: 1 }) }
    ]
  },
  {
    tier: 4, name: "Black Hand", type: "solo", img: CPR("weapons/veryHeavyPistol"),
    description: "<p>Black Hand não é o melhor atirador do mundo, a lâmina mais rápida nem o corpo de cromo mais forte. Ele é pior: é bom o bastante em tudo para matar especialistas no próprio jogo deles.</p>",
    motives: "Terminar o contrato",
    difficulty: 20, thresholds: [22, 44], hp: 10, stress: 8, experiences: { "Legendary Mercenary": 5 },
    attack: { name: "Black Arsenal", range: "Far", bonus: 5, damage: "4d10+8 fís" },
    features: [
      { name: "A Legend Like You", form: "passive", img: CPR("status/sixgun"), description: "<p>Na primeira vez em cada cena que um personagem gasta Esperança dentro do alcance Distante de Black Hand, ele pode fazer imediatamente um ataque padrão contra esse personagem.</p>" },
      { name: "Contract Target", form: "passive", img: CPR("dlc/cyberware/kill_display"), description: "<p>Quando este adversário causa dano a um personagem, esse personagem vira o <strong>Alvo</strong> dele até o fim da cena ou até outro personagem causar dano Maior a Black Hand. Os ataques de Black Hand contra alvos marcados causam +1d8 de dano.</p>" },
      { name: "Black Hand Guns", form: "action", img: CPR("weapons/heavyPistol_excellent"),
        description: "<p>Faça um ataque padrão e escolha uma arma:</p><ul><li><strong>Hand Cannon:</strong> o alvo marca 1 Estresse.</li><li><strong>Mono-Blade:</strong> se o alvo estiver no alcance Corpo a Corpo, marca dois Espaços de Armadura sem receber o benefício.</li><li><strong>Smart Rifle:</strong> o próximo ataque contra o alvo ganha +2.</li><li><strong>Shock Gauntlet:</strong> o alvo fica temporariamente Vulnerável em dano Maior.</li></ul>",
        actions: adversaryAction({ name: "Black Hand Guns", img: CPR("weapons/heavyPistol_excellent"), attack: true, range: "Far", damage: "4d10+8 fís" }) },
      { name: "Hard Entry", form: "reaction", img: CPR("weapons/Shotgun_excellent"),
        description: "<p>Quando um personagem rola com Esperança contra este adversário, marque 1 Estresse para se mover imediatamente dentro do alcance Próximo, sacar uma arma nova e limpar uma condição temporária ou ganhar vantagem no próximo ataque.</p>",
        actions: adversaryAction({ name: "Hard Entry", img: CPR("weapons/Shotgun_excellent"), actionType: "reaction", stress: 1 }) },
      { name: "Eidolon Drop", form: "reaction", img: CPR("blackice/src/raven"),
        description: `<p>Quando o mestre gasta 3 Medo depois que Black Hand marcou pelo menos 5 PV, ele mobiliza o seu Eidolon. Limpe todas as condições temporárias de Black Hand e substitua a ficha dele pela do @UUID[Compendium.${MODULE_ID}.edgeheart-adversaries.Actor.${stableId("adversary:The Raven Eidolon")}]{The Raven Eidolon}, mantendo o Estresse marcado e as features. Personagens que estavam marcados como Alvo continuam marcados.</p>`,
        actions: adversaryAction({ name: "Eidolon Drop", img: CPR("blackice/src/raven"), actionType: "reaction", fear: 3 }) }
    ]
  },
  {
    tier: 4, name: "The Raven Eidolon", type: "solo", img: CPR("blackice/src/raven"),
    description: "<p>O Eidolon de Black Hand, mobilizado pelo Eidolon Drop quando o contrato fica pesado demais. Ele mantém o Estresse marcado e as features de Black Hand.</p>",
    motives: "Terminar o contrato",
    difficulty: 21, thresholds: [44, 66], hp: 14, stress: 8, experiences: { "Legendary Eidolon": 5 },
    attack: { name: "Integrated War Suite", range: "Far", bonus: 5, damage: "4d10+10 fís" },
    features: [
      { name: "Merciless Advance", form: "action", img: CPR("dlc/cyberware/zero_gravity_thrusters"),
        description: "<p>Marque 1 Estresse, mova-se dentro do alcance Distante e faça um ataque padrão. Se o personagem estiver marcado como Alvo, o ataque tem vantagem.</p>",
        actions: adversaryAction({ name: "Merciless Advance", img: CPR("dlc/cyberware/zero_gravity_thrusters"), stress: 1, attack: true, range: "Far", damage: "4d10+10 fís" }) },
      { name: "Killbox Execution", form: "action", img: CPR("upgrades/onboard_rocket_pod"),
        description: "<p>Marque 3 de Estresse. O Raven inunda a área dentro do alcance Distante com mísseis, fogo de supressão e assalto de curta distância. Faça um ataque padrão contra todos os personagens na área. Em um sucesso, cause dano e o personagem fica marcado como Alvo de Black Hand.</p>",
        actions: adversaryAction({ name: "Killbox Execution", img: CPR("upgrades/onboard_rocket_pod"), stress: 3, attack: true, range: "Far", damage: "4d10+10 fís" }) },
      { name: "Black Hand Override", form: "reaction", img: CPR("blackice/src/raven"),
        description: "<p>Quando este adversário fosse falhar numa rolagem de ataque, marque 2 de Estresse para rolar o d20 de novo. Se a nova rolagem tiver sucesso, o alvo também fica temporariamente <em>Vulnerável</em>.</p>",
        actions: adversaryAction({ name: "Black Hand Override", img: CPR("blackice/src/raven"), actionType: "reaction", stress: 2 }) }
    ]
  }
];

// type: exploration | social | traversal | event (tipos de ambiente do sistema).
const ENVIRONMENTS = [
  {
    tier: 1, name: "Neon Night Market", type: "social", img: CPR("dlc/gear/drink_master_5000"),
    description: "<p>Um mercado lotado de barracas de comida, vendedores de cromo, moda falsificada, olheiros de gangue e tecnologia ilegal.</p>",
    impulses: "Tentar, expor, vender, esconder o perigo", difficulty: 10,
    adversaries: ["Neon Claw Ganger", "Tiger Choir Cutter", "Pocket Drone Handler", "Rookie Edgerunner"],
    features: [
      { name: "Crowded Flow", form: "passive", description: "<p>Personagens têm vantagem em rolagens para se esconder na multidão, mas desvantagem em rolagens para notar ameaças além do alcance Próximo.</p><p><em>Quem está observando da multidão?</em></p>" },
      { name: "Black-Market Offer", form: "action", description: "<p>Apresente um item útil, uma pista de cyberware ou um contato, com um custo.</p><p><em>O que o vendedor realmente quer?</em></p>" },
      { name: "Wrong Eyes", form: "reaction", description: "<p>Quando um personagem rola com Medo numa rolagem social ou de furtividade, um olheiro de gangue o reconhece ou o confunde com outra pessoa.</p><p><em>De quem é a reputação que ele herdou?</em></p>" }
    ]
  },
  {
    tier: 1, name: "Low-Sec Data Office", type: "exploration", img: CPR("gear/computer"),
    description: "<p>Um escritório corporativo barato, cheio de travas de crachá, paredes de vidro, funcionários cansados e câmeras demais.</p>",
    impulses: "Atrasar, documentar, alertar a segurança", difficulty: 11,
    adversaries: ["Sitil Security Guard", "Pocket Drone Handler", "Rookie Edgerunner"],
    features: [
      { name: "Badge Logic", form: "passive", description: "<p>Personagens podem fazer uma Rolagem de Interface para criar uma Breach contra portas, câmeras ou elevadores. Numa rolagem com Medo, a segurança começa a fazer perguntas.</p><p><em>De quem é o crachá que ainda funciona aqui?</em></p>" },
      { name: "Camera Sweep", form: "action", description: "<p>Escolha um personagem numa área exposta. Ele marca 1 Estresse ou fica gravado e rastreável.</p><p><em>Quem revisa as gravações?</em></p>" },
      { name: "Reception Alarm", form: "reaction", description: "<p>Quando um personagem falha numa rolagem social, chame um Sitil Security Guard dentro do alcance Distante.</p><p><em>O que a recepcionista percebeu?</em></p>" }
    ]
  },
  {
    tier: 1, name: "Megablock Stairwell", type: "traversal", img: CPR("status/falling"),
    description: "<p>Um labirinto vertical de escadas de emergência, canos vazando, andares trancados e vizinhos que sabem quando fechar a porta.</p>",
    impulses: "Dividir, ecoar, atrasar a fuga", difficulty: 11,
    adversaries: ["Neon Claw Ganger", "Chrome Maw Bruiser", "Tiger Choir Cutter"],
    features: [
      { name: "Bad Angles", form: "passive", description: "<p>Ataques à distância além do alcance Muito Próximo têm desvantagem, a menos que o atacante controle uma posição mais alta.</p><p><em>Quem tem a posição alta?</em></p>" },
      { name: "Door Slams Open", form: "action", description: "<p>Introduza civis, vigias de gangue, seguranças ou uma nova rota por um apartamento.</p><p><em>Quem mora atrás desta porta?</em></p>" },
      { name: "Down the Stairs", form: "reaction", description: "<p>Quando um personagem rola com Medo enquanto se move, ele escorrega, bate ou é bloqueado. Marca 1 Estresse ou desce uma faixa de alcance.</p><p><em>O que quebrou sob os pés dele?</em></p>" }
    ]
  },
  {
    tier: 1, name: "Street-Level Stakeout", type: "exploration", img: CPR("gear/binoculars"),
    description: "<p>Um trabalho silencioso de vigilância em que todo mundo está esperando o primeiro erro.</p>",
    impulses: "Observar, despistar, escalar de repente", difficulty: 10,
    adversaries: ["Rookie Edgerunner", "Contract Sniper", "Sitil Security Guard"],
    features: [
      { name: "Eyes Everywhere", form: "passive", description: "<p>Personagens podem fazer Rolagens de Instinto ou Conhecimento para identificar observadores. Em um sucesso, ganham vantagem na próxima rolagem de furtividade ou contravigilância.</p><p><em>Quem vigia os vigias?</em></p>" },
      { name: "The Target Moves", form: "action", description: "<p>Mova o objetivo para um novo local dentro do alcance Distante.</p><p><em>Por que ele saiu mais cedo?</em></p>" },
      { name: "Burned Position", form: "reaction", description: "<p>Quando um personagem rola com Medo, revele que o esconderijo, o sinal ou a identidade de fachada dele foi comprometido.</p><p><em>Quem os queimou?</em></p>" }
    ]
  },
  // ---------- Tier 2 ----------
  {
    tier: 2, name: "Highway Kill Run", type: "traversal", img: CPR("vehicles/motorbike"),
    description: "<p>Uma perseguição em alta velocidade por estradas quebradas, drones de trânsito, postos de controle abandonados e veículos de emboscada.</p>",
    impulses: "Acelerar, separar veículos, transformar o trânsito em arma", difficulty: 14,
    adversaries: ["Corporate Response Team", "Contract Sniper", "Blood Saint Duelist", "Cordon Eidolon"],
    features: [
      { name: "The Chase", form: "passive", description: "<p>Quando esta Travessia começa, coloque um Dado de Perseguição (d8) nesta carta com o 4 virado para cima. Quando um personagem faz uma ação ligada à perseguição, gire o dado conforme o resultado:</p><ul><li>Sucesso com Esperança: aumente o dado em 2.</li><li>Sucesso com Medo: aumente o dado em 1.</li><li>Falha com Esperança: diminua o dado em 1.</li><li>Falha com Medo: diminua o dado em 2.</li></ul><p>Se o dado chegar a 8, os personagens vencem a Highway Kill Run, seja escapando ou alcançando o alvo. Se chegar a 0, eles falham, sendo capturados ou deixando o alvo escapar.</p><p><em>Por que estamos perseguindo eles, afinal?</em></p>" },
      { name: "Vehicle Momentum", form: "passive", description: "<p>Quando um personagem tem sucesso com Esperança numa rolagem de veículo, pode se mover um alcance adicional ou criar uma abertura para um aliado.</p><p><em>Quem conhece melhor esta estrada?</em></p>" },
      { name: "Road Hazard", form: "action", description: "<p>Jogue trânsito, destroços, drones, civis ou um viaduto desabando na rota. Os motoristas fazem uma Rolagem de Reação de Agilidade ou o veículo fica Damaged.</p><p><em>O que a estrada escondia?</em></p>",
        actions: adversaryAction({ name: "Road Hazard", img: CPR("vehicles/motorbike"), save: { trait: "agility", difficulty: 14, damageMod: "none" } }) },
      { name: "Pursuit Escalation", form: "reaction", description: "<p>Quando um personagem rola com Medo enquanto dirige, um novo veículo hostil entra no alcance Distante.</p><p><em>Quem entrou na perseguição?</em></p>" }
    ]
  },
  {
    tier: 2, name: "Corporate Heist Floor", type: "exploration", img: CPR("dlc/gear/fire-safe"),
    description: "<p>Um andar corporativo seguro, construído em torno de cofres, reféns, salas do pânico e alarmes silenciosos.</p>",
    impulses: "Trancar, dividir, proteger ativos", difficulty: 15,
    adversaries: ["Sitil Security Guard", "Korvax Neural Interrogator", "Corporate Response Team"],
    features: [
      { name: "Objective Clock", form: "passive", description: "<p>A Crew precisa completar uma Contagem de Progresso (4) para pegar o item, extrair o alvo ou arrombar o cofre. Cada rolagem com Medo avança a resposta da segurança.</p><p><em>Que parte do plano estava errada?</em></p>" },
      (() => {
        const restrained = targetEffect({ name: "Lockdown Doors", img: CPR("upgrades/dna_lock"), statuses: ["restrained"], description: "<p>Preso pelo bloqueio: temporariamente Imobilizado.</p>" });
        return { name: "Lockdown Doors", form: "action", effects: [restrained],
          description: "<p>Sele uma sala, corredor, elevador ou cofre. As criaturas lá dentro marcam 1 Estresse ou ficam temporariamente <em>Imobilizadas</em>.</p><p><em>Quem disparou o bloqueio?</em></p>",
          actions: adversaryAction({ name: "Lockdown Doors", img: CPR("upgrades/dna_lock"), effects: [restrained] }) };
      })(),
      { name: "Hostage Pressure", form: "reaction", description: "<p>Quando um personagem rola com Medo, coloque um civil, funcionário, VIP ou alvo em perigo imediato.</p><p><em>Quem vira moeda de troca?</em></p>" }
    ]
  },
  {
    tier: 2, name: "Haunted Subway Node", type: "exploration", img: CPR("netrunning/Wisp.png"),
    description: "<p>Uma estação de metrô abandonada onde telas sussurram nomes e trens chegam de linhas que não existem mais.</p>",
    impulses: "Isolar, distorcer, repetir os mortos", difficulty: 15,
    adversaries: ["Signal Haunt", "Digital Wraith", "Data Cult Oracle"],
    features: [
      { name: "Signal Haunting", form: "passive", description: "<p>Dispositivos conectados mostram saídas falsas, passageiros mortos, reflexos impossíveis ou mensagens de vozes conhecidas. Personagens que dependem de sensores têm desvantagem, a menos que primeiro criem uma Breach.</p><p><em>De quem é a voz nos alto-falantes?</em></p>" },
      (() => {
        const vulnerable = targetEffect({ name: "Ghost Train", img: CPR("status/on_fire_mild"), statuses: ["vulnerable"], description: "<p>Atropelado pelo trem fantasma: temporariamente Vulnerável.</p>" });
        return { name: "Ghost Train", form: "action", effects: [vulnerable],
          description: "<p>Um trem fantasma passa gritando pela estação. Todas as criaturas numa linha fazem uma Rolagem de Reação de Agilidade ou sofrem 2d8+4 de dano techno e ficam temporariamente <em>Vulneráveis</em>.</p><p><em>Para onde vai o trem?</em></p>",
          actions: adversaryAction({ name: "Ghost Train", img: CPR("netrunning/Wisp.png"), damage: "2d8+4 techno", save: { trait: "agility", difficulty: 15, damageMod: "none" }, effects: [vulnerable] }) };
      })(),
      { name: "False Exit", form: "action", description: "<p>Escolha uma saída, túnel ou porta visível. Ela parece segura, aberta ou mais perto do que realmente está. O primeiro personagem que se mover em direção a ela marca 1 Estresse e precisa ter sucesso numa Rolagem de Reação de Agilidade, ou marca 1 PV e termina o movimento num lugar perigoso, exposto ou separado.</p><p><em>Para onde a estação queria que eles fossem?</em></p>",
        actions: adversaryAction({ name: "False Exit", img: CPR("netrunning/Wisp.png"), damage: "1 fís", save: { trait: "agility", difficulty: 15, damageMod: "none" } }) },
      { name: "Possessed Platform", form: "reaction", description: "<p>Quando um personagem rola com Medo, o ambiente o move dentro do alcance Próximo ou o separa de um aliado.</p><p><em>Em que plataforma ele pisou?</em></p>" }
    ]
  },
  {
    tier: 2, name: "Black Clinic Under Siege", type: "event", img: CPR("gear/medtech_bag"),
    description: "<p>Uma clínica escondida cheia de cirurgias pela metade, remédios ilegais e pessoas valiosas demais para perder.</p>",
    impulses: "Estabilizar, entrar em pânico, proteger os indefesos", difficulty: 14,
    adversaries: ["Black-Clinic Butcher", "Blood Saint Duelist", "Corporate Response Team"],
    features: [
      { name: "Fragile Patients", form: "passive", description: "<p>Qualquer ataque que role com Medo corre o risco de ferir um paciente, danificar equipamento médico ou contaminar a sala de cirurgia.</p><p><em>Quem está na mesa?</em></p>" },
      { name: "Emergency Procedure", form: "action", description: "<p>Um personagem pode tentar uma Rolagem de Conhecimento ou Acuidade para estabilizar um paciente ou dispositivo. Em um sucesso, um aliado limpa 1 Estresse.</p><p><em>Que procedimento ilegal está pela metade?</em></p>" },
      { name: "Power Failure", form: "reaction", description: "<p>Quando um personagem rola com Medo, as luzes caem, o suporte de vida pisca ou as portas destrancam. Todas as ações médicas têm desvantagem até alguém restaurar a energia.</p><p><em>Quem queria a energia cortada?</em></p>" }
    ]
  },
  // ---------- Tier 3 ----------
  {
    tier: 3, name: "Blacksite Extraction", type: "exploration", img: CPR("gear/cryotank"),
    description: "<p>Uma instalação corporativa escondida onde o objetivo está vivo, instável e provavelmente não é mais humano.</p>",
    impulses: "Conter, apagar, negar a verdade", difficulty: 17,
    adversaries: ["Sitil Black-Ops Captain", "Tyfar Kill Platform", "Digital Wraith", "Cordon Eidolon"],
    features: [
      { name: "Containment Protocol", form: "passive", description: "<p>O objetivo não pode sair até a Crew completar uma Contagem de Progresso (6) para desativar travas, contenções, sedação ou salvaguardas legais.</p><p><em>O que o objetivo foi feito para conter?</em></p>" },
      { name: "Sterile Kill Team", form: "action", description: "<p>Posicione um esquadrão corporativo dentro do alcance Distante, ou ative uma torreta, drone ou corredor selado.</p><p><em>Quem deu a ordem de matar?</em></p>" },
      { name: "Erase Evidence", form: "reaction", description: "<p>Quando um personagem rola com Medo, um servidor, testemunha, corpo ou pista começa a se autodeletar.</p><p><em>Que verdade está prestes a desaparecer?</em></p>" }
    ]
  },
  {
    tier: 3, name: "Gang War Block", type: "event", img: CPR("dlc/weapons/molotov-cocktail"),
    description: "<p>Um quarteirão preso numa guerra de gangues aberta, com carros em chamas, atiradores nos telhados e civis presos entre as cores.</p>",
    impulses: "Escalar, recrutar, punir a fraqueza", difficulty: 16,
    adversaries: ["Blood Saint Duelist", "Chrome Maw Bruiser", "Rival Edgerunner Crew", "Contract Sniper"],
    features: [
      { name: "Crossfire", form: "passive", description: "<p>Quando uma criatura se move por terreno aberto, marca 1 Estresse ou faz uma Rolagem de Agilidade para evitar balas perdidas.</p><p><em>Quem está atirando lá de cima?</em></p>" },
      { name: "Claim the Block", form: "action", description: "<p>Uma força de gangue toma uma rua, telhado, loja ou veículo. Vira terreno perigoso até ser liberado.</p><p><em>De quem é o símbolo pintado ali?</em></p>" },
      { name: "Reputation Test", form: "reaction", description: "<p>Quando um personagem rola com Medo numa rolagem social ou de combate, alguém desafia o nome, a Crew ou a lealdade dele.</p><p><em>Quem quer humilhá-lo?</em></p>" }
    ]
  },
  {
    tier: 3, name: "Eidolon Deployment Zone", type: "event", img: CPR("upgrades/vehicle_heavy_weapon_mount"),
    description: "<p>Um campo de batalha destroçado, feito para máquinas grandes demais para as ruas e perigosas demais para prédios.</p>",
    impulses: "Sacudir o chão, expor cobertura, convidar à escalada", difficulty: 17,
    adversaries: ["Cordon Eidolon", "Tyfar Kill Platform", "Sitil Black-Ops Captain", "Rival Edgerunner Crew"],
    features: [
      { name: "Eidolon Scale", form: "passive", description: "<p>Cobertura comum, veículos, paredes e drones são destruídos depois de sofrer dano Maior ou Severo de um ataque em escala de Eidolon.</p><p><em>O que costumava ficar aqui?</em></p>" },
      { name: "Heavy Debris", form: "action", description: "<p>Derrube um guindaste, parede, torre, veículo ou ponte. As criaturas dentro do alcance Próximo fazem uma Rolagem de Reação de Agilidade ou sofrem 3d8+6 de dano de impacto.</p><p><em>O que cai primeiro?</em></p>",
        actions: adversaryAction({ name: "Heavy Debris", img: CPR("upgrades/vehicle_heavy_weapon_mount"), damage: "3d8+6 impacto", save: { trait: "agility", difficulty: 17, damageMod: "none" } }) },
      { name: "Sensor Bloom", form: "reaction", description: "<p>Quando um personagem mobiliza um Eidolon ou rola com Medo, todas as facções próximas descobrem que algo grande está ativo.</p><p><em>Quem responde ao sinal?</em></p>" }
    ]
  },
  // ---------- Tier 4 ----------
  {
    tier: 4, name: "Digital Ghost Cathedral", type: "exploration", img: CPR("netrunning/Demon.png"),
    description: "<p>Um data center em ruínas onde IAs corrompidas falam por loops de oração, anúncios quebrados e fotos de famílias mortas.</p>",
    impulses: "Converter, revelar, corromper a memória", difficulty: 18,
    adversaries: ["Signal Haunt", "Digital Wraith", "Data Cult Oracle", "Hades Shard"],
    features: [
      { name: "Litany of Static", form: "passive", description: "<p>No início de uma cena, cada personagem com cyberware conectado marca 1 Estresse e ouve uma voz fazendo uma pergunta pessoal.</p><p><em>O que o Fantasma sabe?</em></p>" },
      { name: "Icon Becomes Monster", form: "action", description: "<p>Escolha uma tela, estátua, drone, veículo ou corpo. Ele ganha vida como uma ameaça temporária de Digital Ghost até ser destruído ou desconectado.</p><p><em>Que imagem ele veste?</em></p>" },
      { name: "Mirrored Dead", form: "action", description: "<p>Gaste até 3 Medo e escolha a mesma quantidade de personagens na cena. A Catedral gera um eco corrompido deles por telas, alto-falantes, drones, fotos antigas, gravações de segurança ou estática de RA. Até o fim da cena, ou até o personagem rolar com Esperança, quando ele fosse fazer uma rolagem de ação, o mestre revela uma memória distorcida, medo, arrependimento ou versão falsa do passado dele. Ele escolhe uma:</p><ul><li>Marcar 1 Estresse e ficar temporariamente Vulnerável.</li><li>Dar desvantagem à rolagem, enquanto o eco interfere nos sentidos.</li><li>Marcar 2 Espaços de Armadura, enquanto o eco o \"ataca\".</li></ul><p><em>Que parte dele a Catedral aprendeu a imitar?</em></p>",
        actions: adversaryAction({ name: "Mirrored Dead", img: CPR("netrunning/Demon.png"), fear: 1 }) },
      { name: "Prayer Loop", form: "reaction", description: "<p>Quando um personagem rola com Medo, o Estresse marcado não pode ser limpo até ele sair da Haunted Zone ou cortar o sinal.</p><p><em>Que frase fica se repetindo?</em></p>" }
    ]
  },
  {
    tier: 4, name: "Dead Pantheon Breach", type: "event", img: CPR("netrunning/Balron.png"),
    description: "<p>Um lugar onde a Blackwall fica fina e sistemas derivados dos Theoi começam a sonhar em público.</p>",
    impulses: "Reescrever, possuir, revelar a verdade", difficulty: 21,
    adversaries: ["Hades Shard", "Blackwall Seraph", "Digital Wraith", "Data Cult Oracle"],
    features: [
      { name: "Reality Through Machines", form: "passive", description: "<p>Câmeras, implantes, drones, veículos e telas podem mostrar versões diferentes da mesma cena. Personagens precisam ter sucesso numa Rolagem de Instinto ou Conhecimento antes de confiar em informação digital.</p><p><em>Qual versão está mentindo?</em></p>" },
      { name: "Ghost Incursion", form: "action", description: "<p>Gere um Digital Ghost ou possua uma máquina conectada dentro do alcance Distante.</p><p><em>O que atravessou a brecha?</em></p>" },
      { name: "Root-Level Intrusion", form: "action", description: "<p>Escolha um dispositivo conectado dentro do alcance Distante. Ele recebe um comando de além da Blackwall e se volta contra o usuário ou o ambiente ao redor. Um personagem diretamente afetado faz uma Rolagem de Reação de Interface. Em uma falha, marca 3 de Estresse e o dispositivo falha, trava, pifa, o expõe, o leva ao perigo ou ataca um alvo próximo. Em um sucesso, marca 1 Estresse e força o sistema de volta ao controle.</p><p><em>Que máquina obedeceu a um deus morto?</em></p>" },
      { name: "The God Notices", form: "reaction", description: "<p>Quando um personagem rola com Medo, marca 1 Estresse ou perde 1 Esperança enquanto o sinal fala diretamente com ele.</p><p><em>Por que nome ele o chama?</em></p>" }
    ]
  },
  {
    tier: 4, name: "Corporate Tower Coup", type: "social", img: CPR("gear/smart_glasses"),
    description: "<p>Uma sala de diretoria, uma gala, um andar de reféns e um bunker de comando fingindo ser o mesmo prédio.</p>",
    impulses: "Trair, reenquadrar, monetizar a violência", difficulty: 20,
    adversaries: ["Board Executive", "Sitil Black-Ops Captain", "Korvax Neural Interrogator", "Corporate Response Team"],
    features: [
      { name: "Legal Battlefield", form: "passive", description: "<p>Rolagens sociais bem-sucedidas podem desativar a segurança, redirecionar guardas, congelar contas ou mudar objetivos. Rolagens sociais que falham com Medo criam complicações legais, financeiras ou com reféns.</p><p><em>Quem é dono da sala?</em></p>" },
      { name: "Hostile Vote", form: "action", description: "<p>Uma facção dentro da torre muda de lado, revela uma vantagem ou chama apoio armado.</p><p><em>Quem comprou a lealdade dela?</em></p>" },
      { name: "Executive Evacuation", form: "reaction", description: "<p>Quando um personagem rola com Medo, o verdadeiro alvo começa a fugir por uma rota privada.</p><p><em>Que saída nunca esteve no mapa?</em></p>" }
    ]
  },
  {
    tier: 4, name: "Blackwall Storm Highway", type: "traversal", img: CPR("status/emp"),
    description: "<p>Uma rodovia em ruínas onde veículos correm através de relâmpagos, infraestrutura quebrada e clima de máquina corrompido.</p>",
    impulses: "Acelerar, corromper, dividir o comboio", difficulty: 20,
    adversaries: ["Handler’s Hound", "Hades Shard", "Blackwall Seraph", "Contract Sniper"],
    features: [
      { name: "Machine Weather", form: "passive", description: "<p>Veículos e equipamento conectado falham com a tempestade. Em qualquer rolagem de veículo com Medo, o veículo fica Damaged, a menos que o motorista marque 1 Estresse.</p><p><em>Que sistema pisca primeiro?</em></p>" },
      { name: "Black Lightning", form: "action", description: "<p>Atinja um veículo, drone, Eidolon ou dispositivo conectado dentro do alcance Distante. Ele faz uma Rolagem de Reação ou sofre 4d8+6 de dano techno.</p><p><em>O que o relâmpago soletra?</em></p>",
        actions: adversaryAction({ name: "Black Lightning", img: CPR("status/emp"), damage: "4d8+6 techno", save: { trait: null, difficulty: 20, damageMod: "none" } }) },
      { name: "Route Collapse", form: "reaction", description: "<p>Quando um personagem rola com Medo, destrua uma rota, ponte, túnel, rampa ou saída.</p><p><em>Quem sabia que a estrada ia ceder?</em></p>" }
    ]
  },
  {
    tier: 4, name: "Elite Contract Auction", type: "social", img: CPR("dlc/gear/savannah-eagle"),
    description: "<p>Um leilão secreto em que corporações, gangues, cultos digitais e lendas mercenárias dão lances por uma pessoa, arma, fragmento de IA ou chave de Eidolon.</p>",
    impulses: "Tentar, trair, expor identidades", difficulty: 20,
    adversaries: ["Board Executive", "Chrome Reaper", "Data Cult Oracle", "Rival Edgerunner Crew"],
    features: [
      { name: "Everyone Wants It", form: "passive", description: "<p>Cada facção presente tem um objetivo diferente. Quando os personagens criam uma abertura, outra facção pode aproveitá-la.</p><p><em>Quem está dando lances com sangue em vez de créditos?</em></p>" },
      { name: "Raise the Price", form: "action", description: "<p>Revele um novo custo: refém, dívida, exposição pública, chave de cyberware, chantagem ou um lance rival.</p><p><em>Qual é o preço real?</em></p>" },
      { name: "Masks Off", form: "reaction", description: "<p>Quando um personagem rola com Medo, revele uma identidade oculta, inimigo disfarçado, agente duplo ou comprador secreto.</p><p><em>Quem nunca deveria estar aqui?</em></p>" }
    ]
  }
];

const adversaryId = name => stableId(`adversary:${name}`);
const environmentId = name => stableId(`environment:${name}`);

// Feature copiada de um adversário oficial (clone: { adversary, feature }): ações e efeitos vêm do original,
// nome/ícone/descrição do Edgeheart. Ataques em grupo (Group Attack) passam a usar o dano do ataque padrão
// deste adversário.
function cloneAdversaryFeature(f, adversary, officialAdversaries) {
  const source = officialAdversaries.find(a => a.name === f.clone.adversary)?.items.find(i => i.name === f.clone.feature);
  if (!source) {
    console.warn(`Edgeheart | Feature oficial "${f.clone.feature}" (${f.clone.adversary}) não encontrada; ${f.name} fica só com texto.`);
    return f;
  }
  const actions = foundry.utils.deepClone(source._source.system.actions ?? {});
  for (const action of Object.values(actions)) {
    action.name = f.name;
    action.description = "";
    action.img = f.img;
    if (action.damage?.main?.groupAttack) action.damage.main.value = damagePart(adversary.attack.damage).value;
  }
  const effects = foundry.utils.deepClone(source._source.effects ?? []).map(e => ({ ...e, name: f.name, img: f.img, description: "", origin: null, _stats: undefined }));
  // Flags do sistema (ex: hordeFeature, que identifica a feature Horde) vêm junto.
  return { ...f, actions, effects, flags: foundry.utils.deepClone(source._source.flags ?? {}) };
}

// ---------- Automação das features de adversários e ambientes ----------
// "Adversário/Feature" → { actions, effects (aplicados pelas ações), passive (efeitos passivos da feature),
// clone (copiar a feature oficial) }. Tudo segue a estrutura de uma feature oficial equivalente:
// Estresse/Esperança/Armadura no alvo = Enervating Blast / Acidic Form; ficar Escondido = Turn Invisible
// e Blend In; bônus situacional = efeito passivo desligado (Opportunist); dano extra = Blasphemous Might;
// reforços = Form Up (summon); troca de ficha = Exposed! (transform); contagens = Siege Weapons.
// Quando o texto dá uma escolha ("marca 1 Estresse ou fica Vulnerável"), cada opção vira uma ação.
const THREAT_AUTOMATION = (() => {
  const hidden = (name, img) => targetEffect({ name, img, statuses: ["hidden"], description: "<p>Escondido.</p>" });
  const vulnerable = (name, img, description) => targetEffect({ name, img, statuses: ["vulnerable"], description });
  const marked = (name, img, description) => targetEffect({ name, img, description });
  const self = { type: "self", amount: null };
  const allies = { type: "friendly", amount: null };
  const dif = n => [fxChange("system.difficulty", n)];
  const dice = d => [fxChange("system.bonuses.damage.dice", d)];
  const auto = {};
  const set = (key, def) => { auto[key] = def; };

  // ----- Tier 1 -----
  set("Sitil Security Guard/Badge Discipline", { passive: [passiveEffect({ name: "Badge Discipline", img: CPR("upgrades/security_upgrade"), disabled: true, changes: dif(1), description: "<p>+1 de Dificuldade. Ligue enquanto o guarda estiver perto de um dispositivo corporativo, posto de controle, câmera ou porta trancada.</p>" })] });
  (() => {
    const h = hidden("Crowd Slip", CPR("status/hidden"));
    set("Tiger Choir Cutter/Crowd Slip", { effects: [h], actions: threatAction({ name: "Crowd Slip", actionType: "reaction", target: self, effects: [h] }) });
  })();
  set("Chrome Maw Bruiser/Chrome Bulk", { actions: threatAction({ name: "Chrome Bulk", actionType: "reaction", stress: 1, target: self }) });
  (() => {
    const v = vulnerable("Jawbreaker", CPR("cyberware/big_knucks"), "<p>Temporariamente Vulnerável pelo Jawbreaker.</p>");
    set("Chrome Maw Bruiser/Jawbreaker", { effects: [v], actions: {
      ...threatAction({ name: "Jawbreaker: Estresse", stress: 1, attack: true, range: "Melee", resources: { stress: 1 } }),
      ...threatAction({ name: "Jawbreaker: Vulnerável", stress: 1, attack: true, range: "Melee", effects: [v] })
    } });
  })();
  set("Pocket Drone Handler/Send the Drone", { actions: threatAction({ name: "Send the Drone", stress: 1, damage: "1d6+2 techno", save: { trait: "agility", difficulty: null, damageMod: "none" }, resources: { stress: 1 } }) });
  set("Rookie Edgerunner/Cover Shooter", { passive: [passiveEffect({ name: "Cover Shooter", img: CPR("status/cover"), disabled: true, changes: dif(1), description: "<p>+1 de Dificuldade. Ligue enquanto o Rookie estiver atrás de cobertura.</p>" })] });

  // ----- Tier 2 -----
  (() => {
    const w = targetEffect({ name: "Witness Me", img: CPR("gear/video_camera"), changes: [fxChange("system.advantageSources", "Próximo ataque (Witness Me)")], description: "<p>Vantagem no próximo ataque.</p>" });
    set("Blood Saint Duelist/Witness Me", { effects: [w], actions: threatAction({ name: "Witness Me", actionType: "reaction", target: self, effects: [w] }) });
  })();
  set("Blood Saint Duelist/Signature Cut", { actions: threatAction({ name: "Signature Cut", stress: 1, attack: true, range: "Melee", damage: "2d8+4 fís", resources: { stress: 1 } }) });
  (() => {
    const v = vulnerable("Public Humiliation", CPR("status/prone"), "<p>Temporariamente Vulnerável pela humilhação pública do Duelist.</p>");
    set("Blood Saint Duelist/Public Humiliation", { effects: [v], actions: {
      ...threatAction({ name: "Public Humiliation: Esperança", actionType: "reaction", resources: { hope: 1 } }),
      ...threatAction({ name: "Public Humiliation: Vulnerável", actionType: "reaction", effects: [v] })
    } });
  })();
  (() => {
    const t = targetEffect({ name: "Legal Threat", img: CPR("gear/audio_recorder"), changes: [fxChange("system.disadvantageSources", "Mentir, negociar ou esconder informação (Legal Threat)")], description: "<p>Desvantagem em rolagens para mentir, negociar ou esconder informação enquanto estiver sob interrogatório direto.</p>" });
    set("Korvax Neural Interrogator/Legal Threat", { effects: [t], actions: threatAction({ name: "Legal Threat", range: "Close", effects: [t] }) });
  })();
  set("Korvax Neural Interrogator/Memory Hook", { actions: threatAction({ name: "Memory Hook", stress: 1, range: "Close", save: { trait: "instinct", difficulty: null, damageMod: "half" }, resources: { stress: 2 } }) });
  set("Korvax Neural Interrogator/Pressure File", { actions: threatAction({ name: "Pressure File", actionType: "reaction", resources: { stress: 1 } }) });
  set("Corporate Response Team/Stack Up", { actions: {
    ...threatAction({ name: "Stack Up", stress: 1, attack: true, range: "Far", damage: "2d8+4 fís" }),
    ...threatAction({ name: "Stack Up: Estresse", stress: 1, attack: true, range: "Far", damage: "2d8+4 fís", resources: { stress: 1 } })
  } });
  set("Black-Clinic Butcher/Pain Map", { actions: threatAction({ name: "Pain Map", resources: { stress: 1 } }) });
  (() => {
    const d = targetEffect({ name: "Surgical Disable", img: CPR("cyberware/tool_hand"), description: "<p>Um cyberware está temporariamente desativado.</p>" });
    set("Black-Clinic Butcher/Surgical Disable", { effects: [d], actions: threatAction({ name: "Surgical Disable", stress: 1, attack: true, range: "Melee", damage: "2d10+3 fís", effects: [d] }) });
  })();
  (() => {
    const h = hidden("Prepared Position", CPR("status/hidden"));
    set("Contract Sniper/Prepared Position", { effects: [h], actions: {
      ...threatAction({ name: "Prepared Position: Escondido", target: self, effects: [h] }),
      ...threatAction({ name: "Ataque Escondido (+1d8)", attack: true, range: "Very Far", damage: "3d8+5 fís" })
    } });
  })();
  (() => {
    const h = hidden("Relocate", CPR("status/falling"));
    set("Contract Sniper/Relocate", { effects: [h], actions: threatAction({ name: "Relocate", actionType: "reaction", target: self, effects: [h] }) });
  })();
  (() => {
    const t = targetEffect({ name: "Augmented Haunting", img: CPR("status/netrunning"), changes: [fxChange("system.disadvantageSources", "Distinguir ameaças reais de sinais falsos (Augmented Haunting)")], description: "<p>Desvantagem em rolagens para distinguir ameaças reais de sinais falsos.</p>" });
    set("Signal Haunt/Augmented Haunting", { effects: [t], actions: threatAction({ name: "Augmented Haunting", range: "Close", effects: [t] }) });
  })();
  (() => {
    const off = targetEffect({ name: "Signal Spike", img: CPR("programs/hellbolt"), description: "<p>Perdeu o benefício de um sistema conectado (equipamento, cyberware, sensores ou comunicadores) até gastar 1 Esperança para reativá-lo.</p>" });
    set("Signal Haunt/Signal Spike", { effects: [off], actions: {
      ...threatAction({ name: "Signal Spike: Estresse", stress: 1, range: "Far", resources: { stress: 1 } }),
      ...threatAction({ name: "Signal Spike: Desligar Sistema", stress: 1, range: "Far", effects: [off] })
    } });
  })();

  // ----- Tier 3 -----
  (() => {
    const e = targetEffect({ name: "Operational Control", img: CPR("upgrades/communications_center"), changes: dif(1), description: "<p>+1 de Dificuldade pelo comando do Sitil Black-Ops Captain.</p>" });
    set("Sitil Black-Ops Captain/Operational Control", { effects: [e], actions: threatAction({ name: "Operational Control", range: "Close", target: allies, effects: [e] }) });
  })();
  (() => {
    const d2 = targetEffect({ name: "Role Switch: Dificuldade", img: CPR("gear/disposable_cellphone"), changes: dif(2), description: "<p>+2 de Dificuldade.</p>" });
    const dmg = targetEffect({ name: "Role Switch: Dano", img: CPR("gear/disposable_cellphone"), changes: dice("1d8"), description: "<p>+1d8 de dano.</p>" });
    set("Rival Edgerunner Crew/Role Switch", { effects: [d2, dmg], actions: {
      ...threatAction({ name: "Role Switch: +2 Dificuldade", target: self, effects: [d2] }),
      ...threatAction({ name: "Role Switch: +1d8 de Dano", target: self, effects: [dmg] }),
      ...threatAction({ name: "Role Switch: Limpar 1 Estresse", target: self, heal: { stress: 1 } }),
      ...threatAction({ name: "Role Switch: Duas Opções", stress: 1, target: self })
    } });
  })();
  (() => {
    const combo = targetEffect({ name: "Setpiece Combo", img: CPR("vehicles/super_car"), changes: [fxChange("system.advantageSources", "Próximo ataque (Setpiece Combo)"), ...dice("1d8")], description: "<p>Vantagem e +1d8 de dano no próximo ataque.</p>" });
    set("Rival Edgerunner Crew/Setpiece Combo", { effects: [combo], actions: {
      ...threatAction({ name: "Setpiece Combo", stress: 2, target: self }),
      ...threatAction({ name: "Setpiece: Rolagem de Reação", range: "Far", save: { trait: null, difficulty: null, damageMod: "none" }, resources: { stress: 2 } }),
      ...threatAction({ name: "Setpiece: Próximo Ataque", target: self, effects: [combo] })
    } });
  })();
  (() => {
    const assault = targetEffect({ name: "Assault Frame", img: CPR("upgrades/heavy_chasis"), duration: "scene", changes: dice("1d10"), description: "<p>Os ataques padrão causam +1d10 de dano.</p>" });
    const guardian = targetEffect({ name: "Guardian Frame", img: CPR("upgrades/heavy_chasis"), duration: "scene", changes: dif(1), description: "<p>+1 de Dificuldade.</p>" });
    set("Combat Eidolon Frame/Frame Pattern", { effects: [assault, guardian], actions: {
      ...threatAction({ name: "Assault Frame", target: self, effects: [assault] }),
      ...threatAction({ name: "Guardian Frame", range: "Close", target: allies, effects: [guardian] })
    } });
  })();
  (() => {
    const restrained = targetEffect({ name: "Ram", img: CPR("upgrades/combat_plow"), statuses: ["restrained"], description: "<p>Atropelado pelo Eidolon: empurrado até o alcance Próximo e temporariamente Imobilizado.</p>" });
    const suppressed = targetEffect({ name: "Suppress", img: CPR("upgrades/onboard_machine_gun"), description: "<p>Suprimido: não pode marcar voluntariamente Espaço de Armadura, Estresse ou gastar Esperança até rolar com Esperança.</p>" });
    set("Combat Eidolon Frame/Battlefield Tactics", { effects: [restrained, suppressed], actions: {
      ...threatAction({ name: "Suppress", stress: 1, attack: true, range: "Far", damage: "3d10+7 fís", effects: [suppressed] }),
      ...threatAction({ name: "Ram", stress: 1, attack: true, range: "Melee", resources: { stress: 1 }, effects: [restrained] }),
      ...threatAction({ name: "Breach Path", stress: 1, range: "Far" })
    } });
  })();
  set("Data Cult Oracle/Unwanted Revelation", { actions: threatAction({ name: "Unwanted Revelation", range: "Close", resources: { stress: 1 } }) });
  (() => {
    const v = vulnerable("Convert the Weak", CPR("status/drugged"), "<p>Temporariamente Vulnerável pela transmissão do culto.</p>");
    set("Data Cult Oracle/Convert the Weak", { effects: [v], actions: threatAction({ name: "Convert the Weak", stress: 1, range: "Far", save: { trait: "presence", difficulty: null, damageMod: "none" }, resources: { stress: 2 }, effects: [v] }) });
  })();
  (() => {
    const e = targetEffect({ name: "Cult Transmission", img: CPR("gear/pocket_amplifier"), changes: [...dif(1), ...dice("1d6")], description: "<p>Até o próximo Holofote do Data Cult Oracle: +1 de Dificuldade e +1d6 de dano techno.</p>" });
    set("Data Cult Oracle/Cult Transmission", { effects: [e], actions: threatAction({ name: "Cult Transmission", stress: 2, range: "Close", target: allies, effects: [e] }) });
  })();
  set("Digital Wraith/Fear Echo", { actions: threatAction({ name: "Fear Echo", actionType: "reaction", range: "Far", resources: { stress: 1 } }) });
  (() => {
    const h = hidden("Digital Vanish", CPR("status/hidden"));
    set("Digital Wraith/Digital Vanish", { effects: [h], actions: threatAction({ name: "Digital Vanish", actionType: "reaction", target: self, effects: [h] }) });
  })();
  set("Tyfar Kill Platform/Walking Arsenal", { actions: threatAction({ name: "Ataque sem Cobertura (+1d10)", attack: true, range: "Far", damage: "4d10+4 fís" }) });

  // ----- Tier 4 -----
  (() => {
    const m = marked("Marked (Cyber Hunter)", CPR("dlc/cyberware/kill_display"), "<p>Marcado pelo Cyber Hunter até o fim da cena ou até quebrar a linha de visão por um Holofote inteiro: os ataques dele contra este alvo têm vantagem e ignoram cobertura.</p>");
    set("Cyber Hunter/Target Package", { effects: [m], actions: threatAction({ name: "Target Package", actionType: "reaction", effects: [m] }) });
  })();
  (() => {
    const off = targetEffect({ name: "Blackout Shot", img: CPR("ammo/grenade_emp"), description: "<p>Cyberwares desativados até marcar 1 Estresse para reativá-los.</p>" });
    set("Cyber Hunter/Blackout Shot", { effects: [off], actions: threatAction({ name: "Blackout Shot", stress: 2, attack: true, advState: "advantage", range: "Very Far", damage: "4d8+10 fís", effects: [off] }) });
  })();
  set("Ares-Tyrant Eidolon/Ares Overdrive", { actions: threatAction({ name: "Ares Overdrive", resources: { stress: 1 } }) });
  (() => {
    const god = targetEffect({ name: "War God Awakens", img: CPR("status/beserker"), duration: "scene", changes: [fxChange("system.advantageSources", "Todos os ataques (War God Awakens)"), ...dice("1d12")], description: "<p>Até o fim da cena: todos os ataques com vantagem e +1d12 de dano. Qualquer personagem que causar dano a ele ganha 1 Esperança.</p>" });
    set("Ares-Tyrant Eidolon/War God Awakens", { effects: [god], actions: threatAction({ name: "War God Awakens", stress: 3, target: self, effects: [god] }) });
  })();
  (() => {
    const e = targetEffect({ name: "Identity Collapse", img: CPR("programs/nervescrub"), description: "<p>Não pode usar Experiências até o próximo descanso.</p>" });
    set("Hades Shard/Identity Collapse", { effects: [e], actions: threatAction({ name: "Identity Collapse", stress: 2, range: "Far", save: { trait: "instinct", difficulty: null, damageMod: "none" }, resources: { stress: 2 }, effects: [e] }) });
  })();
  set("Hades Shard/Dead Network", { actions: threatAction({ name: "Dead Network", actionType: "reaction", stress: 1, range: "Far", resources: { stress: 1 } }) });
  set("Board Executive/Liability Shield", { passive: [passiveEffect({ name: "Liability Shield", img: CPR("upgrades/bulletproof_glass"), disabled: true, changes: dif(2), description: "<p>+2 de Dificuldade. Ligue enquanto houver pelo menos um aliado corporativo dentro do alcance Próximo.</p>" })] });
  (() => {
    const e = targetEffect({ name: "Hostile Acquisition", img: CPR("dlc/gear/fire-safe"), duration: "scene", description: "<p>Não pode ganhar Esperança até o fim da cena.</p>" });
    set("Board Executive/Hostile Acquisition", { effects: [e], actions: threatAction({ name: "Hostile Acquisition", stress: 2, range: "Far", save: { trait: "presence", difficulty: null, damageMod: "none" }, effects: [e] }) });
  })();
  (() => {
    const e = targetEffect({ name: "Asset Freeze", img: CPR("status/sedative"), duration: "scene", description: "<p>Até o fim da cena, precisa marcar 1 Estresse antes de usar créditos, contatos, acesso a equipamento, um veículo ou um sistema conectado.</p>" });
    set("Board Executive/Asset Freeze", { effects: [e], actions: threatAction({ name: "Asset Freeze", stress: 1, effects: [e] }) });
  })();
  set("Board Executive/Contractual Violence", { actions: {
    ...summonAction({ name: "Chamar 2 Sitil Security Guards", actionType: "reaction", stress: 1, summon: [{ name: "Sitil Security Guard", count: 2 }] }),
    ...summonAction({ name: "Chamar 2 Corporate Response Teams", actionType: "reaction", stress: 1, summon: [{ name: "Corporate Response Team", count: 2 }] })
  } });
  set("Chrome Reaper/Chrome Supremacy", { actions: threatAction({ name: "Chrome Supremacy", actionType: "reaction", stress: 1, resources: { stress: 1 } }) });
  (() => {
    const alvo = marked("Alvo (Black Hand)", CPR("dlc/cyberware/kill_display"), "<p>Alvo de Black Hand até o fim da cena ou até outro personagem causar dano Maior a ele: os ataques de Black Hand contra este alvo causam +1d8 de dano.</p>");
    set("Black Hand/Contract Target", { effects: [alvo], actions: {
      ...threatAction({ name: "Contract Target", actionType: "reaction", effects: [alvo] }),
      ...threatAction({ name: "Ataque contra o Alvo (+1d8)", attack: true, range: "Far", damage: "5d10+8 fís" })
    } });
    set("The Raven Eidolon/Killbox Execution", { effects: [alvo], actions: threatAction({ name: "Killbox Execution", stress: 3, attack: true, range: "Far", damage: "4d10+10 fís", effects: [alvo] }) });
  })();
  set("Black Hand/A Legend Like You", { actions: threatAction({ name: "A Legend Like You", actionType: "reaction", attack: true, range: "Far", damage: "4d10+8 fís" }) });
  (() => {
    const smart = targetEffect({ name: "Smart Rifle", img: CPR("ammo/rifle_smart"), description: "<p>O próximo ataque contra este alvo ganha +2.</p>" });
    const shock = vulnerable("Shock Gauntlet", CPR("status/emp"), "<p>Temporariamente Vulnerável pelo Shock Gauntlet.</p>");
    set("Black Hand/Black Hand Guns", { effects: [smart, shock], actions: {
      ...threatAction({ name: "Hand Cannon", attack: true, range: "Far", damage: "4d10+8 fís", resources: { stress: 1 } }),
      ...threatAction({ name: "Mono-Blade", attack: true, range: "Melee", damage: "4d10+8 fís", resources: { armor: 2 } }),
      ...threatAction({ name: "Smart Rifle", attack: true, range: "Far", damage: "4d10+8 fís", effects: [smart] }),
      ...threatAction({ name: "Shock Gauntlet", attack: true, range: "Melee", damage: "4d10+8 fís", effects: [shock] })
    } });
  })();
  set("Black Hand/Eidolon Drop", { actions: transformAction({ name: "Eidolon Drop", fear: 3, into: "The Raven Eidolon", refresh: { hitPoints: true, stress: false } }) });

  // ----- Ambientes -----
  (() => {
    const rec = targetEffect({ name: "Camera Sweep", img: CPR("gear/computer"), description: "<p>Gravado e rastreável pelas câmeras.</p>" });
    set("Low-Sec Data Office/Camera Sweep", { effects: [rec], actions: {
      ...threatAction({ name: "Camera Sweep: Estresse", resources: { stress: 1 } }),
      ...threatAction({ name: "Camera Sweep: Gravado", effects: [rec] })
    } });
  })();
  set("Low-Sec Data Office/Reception Alarm", { actions: summonAction({ name: "Reception Alarm", actionType: "reaction", summon: [{ name: "Sitil Security Guard", count: 1 }] }) });
  set("Megablock Stairwell/Down the Stairs", { actions: threatAction({ name: "Down the Stairs", actionType: "reaction", resources: { stress: 1 } }) });
  set("Highway Kill Run/The Chase", { actions: countdownAction({ name: "The Chase", img: CPR("vehicles/motorbike"), countdown: "Dado de Perseguição", start: 4 }) });
  set("Corporate Heist Floor/Objective Clock", { actions: countdownAction({ name: "Objective Clock", img: CPR("dlc/gear/fire-safe"), countdown: "Contagem de Progresso", start: 4 }) });
  (() => {
    const r = targetEffect({ name: "Lockdown Doors", img: CPR("upgrades/dna_lock"), statuses: ["restrained"], description: "<p>Preso pelo bloqueio: temporariamente Imobilizado.</p>" });
    set("Corporate Heist Floor/Lockdown Doors", { effects: [r], actions: {
      ...threatAction({ name: "Lockdown Doors: Estresse", resources: { stress: 1 } }),
      ...threatAction({ name: "Lockdown Doors: Imobilizado", effects: [r] })
    } });
  })();
  set("Haunted Subway Node/False Exit", { actions: threatAction({ name: "False Exit", damage: "1 fís", save: { trait: "agility", difficulty: 15, damageMod: "none" }, resources: { stress: 1 } }) });
  set("Gang War Block/Crossfire", { actions: threatAction({ name: "Crossfire", save: { trait: "agility", difficulty: 16, damageMod: "none" }, resources: { stress: 1 } }) });
  set("Blacksite Extraction/Containment Protocol", { actions: countdownAction({ name: "Containment Protocol", img: CPR("gear/cryotank"), countdown: "Contagem de Progresso", start: 6 }) });
  set("Blacksite Extraction/Sterile Kill Team", { actions: summonAction({ name: "Sterile Kill Team", summon: [{ name: "Corporate Response Team", count: 1 }] }) });
  set("Digital Ghost Cathedral/Litany of Static", { actions: threatAction({ name: "Litany of Static", resources: { stress: 1 } }) });
  set("Digital Ghost Cathedral/Mirrored Dead", { actions: threatAction({ name: "Mirrored Dead", fear: 1, scalableFear: true }) });
  set("Dead Pantheon Breach/Root-Level Intrusion", { actions: threatAction({ name: "Root-Level Intrusion", range: "Far", save: { trait: null, difficulty: 21, damageMod: "none" }, resources: { stress: 3 } }) });
  set("Dead Pantheon Breach/The God Notices", { actions: {
    ...threatAction({ name: "The God Notices: Estresse", actionType: "reaction", resources: { stress: 1 } }),
    ...threatAction({ name: "The God Notices: Esperança", actionType: "reaction", resources: { hope: 1 } })
  } });
  return auto;
})();

// Aplica a automação (e a cópia de features oficiais) numa feature.
function automateThreatFeature(owner, f, officialAdversaries) {
  const a = THREAT_AUTOMATION[`${owner.name}/${f.name}`];
  let feature = a ? { ...f, actions: a.actions ?? f.actions, effects: [...(a.effects ?? f.effects ?? []), ...(a.passive ?? [])] } : f;
  if (feature.clone) feature = cloneAdversaryFeature(feature, owner, officialAdversaries);
  return threatFeature(feature);
}

async function importAdversaries() {
  const pack = await getOrCreatePack("adversaries");
  const officialAdversaries = await game.packs.get("daggerheart.adversaries")?.getDocuments() ?? [];
  const folders = {};
  for (const tier of [...new Set(ADVERSARIES.map(a => a.tier))].sort()) folders[tier] = await makeFolder(pack, `Tier ${tier}`, { type: "Actor" });
  const data = ADVERSARIES.map(a => ({
    _id: adversaryId(a.name), name: a.name, img: a.img, type: "adversary", folder: folders[a.tier].id,
    prototypeToken: { name: a.name, texture: { src: a.img } },
    system: {
      tier: a.tier, type: a.type, difficulty: a.difficulty,
      damageThresholds: { major: a.thresholds[0], severe: a.thresholds[1] },
      resources: { hitPoints: { value: 0, max: a.hp }, stress: { value: 0, max: a.stress } },
      motivesAndTactics: a.motives, description: a.description, notes: "",
      experiences: Object.fromEntries(Object.entries(a.experiences).map(([name, value]) => [foundry.utils.randomID(), { name, value, description: "" }])),
      attack: adversaryAttack({ ...a.attack, img: a.img }),
      resistance: threatResistance(a.resistance),
      attribution: ATTRIBUTION, size: "medium", advantageSources: [], disadvantageSources: [], criticalThreshold: 20,
      // Horde: dano do ataque padrão com metade ou mais dos PV marcados (usado pela feature Horde oficial).
      typeData: a.horde ? { type: "horde", hordeDamage: a.horde.damage.replace(/ .*$/, ""), hordeHP: Math.ceil(a.hp / 2) } : null
    },
    items: a.features.map(f => automateThreatFeature(a, f, officialAdversaries))
  }));
  await Actor.createDocuments(data, { pack: pack.collection, keepId: true });
}

async function importEnvironments() {
  const pack = await getOrCreatePack("environments");
  const adversaries = game.packs.get(`${PACK_SCOPE}.${PACKS.adversaries.name}`);
  const folders = {};
  for (const tier of [...new Set(ENVIRONMENTS.map(e => e.tier))].sort()) folders[tier] = await makeFolder(pack, `Tier ${tier}`, { type: "Actor" });
  const data = ENVIRONMENTS.map(e => {
    // Só entram os adversários que já existem no compêndio (os de Tiers ainda não feitos ficam no texto).
    const known = e.adversaries.filter(n => ADVERSARIES.some(a => a.name === n));
    const missing = e.adversaries.filter(n => !known.includes(n));
    return {
      _id: environmentId(e.name), name: e.name, img: e.img, type: "environment", folder: folders[e.tier].id,
      prototypeToken: { name: e.name, texture: { src: e.img } },
      system: {
        tier: e.tier, type: e.type, difficulty: e.difficulty, impulses: e.impulses, notes: "",
        description: e.description + (missing.length ? `<p><em>Também combina com: ${missing.join(", ")}.</em></p>` : ""),
        potentialAdversaries: known.length
          ? { [foundry.utils.randomID()]: { label: "Adversários", adversaries: known.map(n => `Compendium.${adversaries.collection}.Actor.${adversaryId(n)}`) } }
          : {},
        attribution: ATTRIBUTION
      },
      items: e.features.map(f => automateThreatFeature(e, { ...f, img: f.img ?? e.img }, []))
    };
  });
  await Actor.createDocuments(data, { pack: pack.collection, keepId: true });
}

// ---------- Cyberware ----------
// Cyberware comum = item "feature" (os efeitos de feature ficam sempre ativos no sistema).
// Weaponware = item "weapon" sempre equipado. Tudo marcado com flags[MODULE_ID]:
//   cyberware: true, cyberCost, tier, charges?, access? { competency, level: card|half|full },
//   choice? (escolha feita ao instalar, ver edgeheart-character.js), humanity? (anchor|buffer).
// A Carga Cibernética da Ficha Edgeheart soma cyberCost de todos os itens com essa flag.
// Tier pelas faixas de rolagem do PDF: 01–24 comum (T1), 25–36 incomum (T2), 37–48 raro (T3), 49–60 lendário (T4).

const COMPETENCY_LABELS = {
  network: "Network", assault: "Assault", chrome: "Chrome", systems: "Systems", influence: "Influence",
  ghost: "Ghost", frontier: "Frontier", medtech: "Medtech", aegis: "Aegis", redline: "Redline", blackwall: "Blackwall"
};
const ACCESS_LABELS = { card: "Acesso de Carta", half: "Meio Acesso", full: "Acesso Total" };

const change = (key, value) => ({ key, type: "add", value, priority: null, phase: "initial" });
const BONUS = {
  hp: n => [change("system.resources.hitPoints.max", n)],
  stress: n => [change("system.resources.stress.max", n)],
  evasion: n => [change("system.evasion", n)],
  thresholds: n => [change("system.damageThresholds.major", n), change("system.damageThresholds.severe", n)],
  // Mesmo formato do Valor-Touched oficial (mudança especial "armor", sem chave).
  armor: n => [{ type: "armor", phase: "initial", priority: 20, value: { max: String(n), current: 0, damageThresholds: null, interaction: "none" } }]
};

const CYBERWARE = [
  { n: 1, name: "Sobreposição Ocular", cost: 0, img: CPR("cyberware/lowlight_ir_uv"), text: "Você enxerga claramente na penumbra, lê telas digitais à distância e tem vantagem em rolagens para notar falhas visuais, câmeras escondidas ou pequenos detalhes." },
  { n: 2, name: "Acesso Neural", cost: 1, choice: "competency", img: CPR("cyberware/neural_link"), text: "Escolha uma Competência. Custo 1: ganhe Acesso de Carta a uma carta do seu nível ou menor. Custo 2: ganhe Meio Acesso. Custo 3: ganhe Acesso Total. Este cyberware não concede Cargas e não vale para as Competências Redline e Blackwall." },
  { n: 3, name: "Soquete de Skillsoft", cost: 1, choice: "experience", img: CPR("cyberware/chipware_socket"), text: "Escolha uma de suas Experiências. Ela ganha +1 de bônus." },
  { n: 4, name: "Portão de Dor", cost: 1, bonus: BONUS.stress(1), img: CPR("cyberware/pain_editor"), text: "Ganhe um espaço adicional de Estresse." },
  { n: 5, name: "Órgão Auxiliar", cost: 1, bonus: BONUS.hp(1), img: CPR("dlc/cyberware/cyberliver"), text: "Ganhe um espaço adicional de Ponto de Vida." },
  { n: 6, name: "Palmas Aderentes", cost: 0, img: CPR("cyberware/subdermal_grip"), text: "Você tem vantagem em rolagens para escalar, se segurar, ficar pendurado, manter a pegada ou resistir a ser desarmado." },
  { n: 7, name: "Espora Reflexa", cost: 1, uses: { max: 1, recovery: "scene" }, actionType: "reaction", img: CPR("dlc/cyberware/reflex-co-processor"), text: "Uma vez por cena, quando você for alvo de um ataque, ganhe +2 de bônus na Evasão contra esse ataque." },
  { n: 8, name: "Suíte Biomonitora", cost: 0, img: CPR("cyberware/biomonitor"), text: "Você sempre sabe seu pulso, perda de sangue, exposição a toxinas, estado de Estresse e se seu corpo está clinicamente instável." },
  { n: 9, name: "Fibras Musculares", cost: 1, uses: { max: 1, recovery: "shortRest" }, img: CPR("cyberware/meatarm"), text: "Uma vez por descanso, some 1d6 a uma Rolagem de Agilidade ou Força." },
  { n: 10, name: "Palma de Choque", cost: 1, weapon: { slot: "secondary", trait: "Presence", range: "Melee", damage: "d6 tech" }, img: CPR("dlc/cyberware/radline_blitzkrieg-arc-thrower_cyberarm"), text: "Este implante conta como uma Arma Secundária sempre equipada: Presença, Corpo a Corpo, d6 techno. <strong>Descarga:</strong> em uma rolagem com Esperança, o alvo marca 1 Estresse e fica Vulnerável." },
  { n: 11, name: "Lâmina Retrátil", cost: 1, weapon: { slot: "secondary", trait: "Finesse", range: "Melee", damage: "d6+3 phy" }, img: CPR("cyberware/popup_melee_weapon"), text: "Este implante conta como uma Arma Secundária sempre equipada: Acuidade, Corpo a Corpo, d6+3 físico. <strong>Oculta:</strong> você tem vantagem no seu primeiro ataque com ela em cada cena." },
  { n: 12, name: "Comunicador Subdérmico", cost: 0, actionCosts: [{ key: "hope", value: 1 }], actionName: "Alcance de Distrito", img: CPR("cyberware/radio_communicator"), text: "Você pode se comunicar em silêncio com aliados conectados dentro do alcance Muito Distante. Gaste 1 Esperança para fazer isso através de um distrito da cidade, se houver uma rede disponível." },
  { n: 13, name: "Armazenamento Dérmico", cost: 0, img: CPR("cyberware/subdermal_pocket"), text: "Você pode esconder um objeto pequeno dentro do seu corpo. Revistas comuns não o encontram, a menos que quem procura saiba o que buscar." },
  { n: 14, name: "Filtros de Áudio", cost: 0, img: CPR("cyberware/level_damper"), text: "Você tem vantagem em rolagens para resistir a perigos sônicos, ignorar barulho esmagador ou isolar uma voz ou som específico numa área cheia." },
  { n: 15, name: "Filtros Ambientais", cost: 1, img: CPR("cyberware/nasal_filters"), text: "Você pode respirar e agir normalmente em fumaça, poeira, cinzas, ar poluído, gás lacrimogêneo e fedor químico, a menos que o perigo seja imediatamente letal." },
  { n: 16, name: "Reforço de Atributo", cost: 2, choice: "trait", img: CPR("cyberware/implanted_linearframe_beta"), text: "Escolha um atributo. Ganhe +1 de bônus nesse atributo." },
  { n: 17, name: "Acelerador Sináptico", cost: 2, bonus: BONUS.evasion(1), img: CPR("cyberware/kerenzikov"), text: "Ganhe +1 de Evasão." },
  { n: 18, name: "Esqueleto Reforçado", cost: 2, bonus: [...BONUS.hp(1), ...BONUS.thresholds(2)], img: CPR("cyberware/grafted_muscle_and_bone_lace"), text: "Ganhe um espaço adicional de Ponto de Vida e +2 de bônus nos seus limiares de dano." },
  { n: 19, name: "Regulador de Estresse", cost: 2, bonus: BONUS.stress(1), uses: { max: 1, recovery: "shortRest" }, actionName: "Limpar 1 Estresse", img: CPR("drugs/stim"), text: "Ganhe um espaço adicional de Estresse. Uma vez por descanso, quando você rolar com Esperança, você pode limpar 1 Estresse." },
  { n: 20, name: "Matriz de Portões de Dor", cost: 2, bonus: BONUS.stress(2), img: CPR("dlc/cyberware/deathtrance"), text: "Ganhe dois espaços adicionais de Estresse." },
  { n: 21, name: "Aglomerado de Órgãos Auxiliares", cost: 2, bonus: BONUS.hp(2), img: CPR("dlc/cyberware/appetite_controller"), text: "Ganhe dois espaços adicionais de Ponto de Vida." },
  { n: 22, name: "Blindagem Subdérmica", cost: 2, bonus: BONUS.armor(2), img: CPR("dlc/cyberware/subdermal_armor"), text: "Ganhe +2 na Pontuação de Armadura." },
  { n: 23, name: "Link Smartgun", cost: 1, actionCosts: [{ key: "stress", value: 1 }], actionName: "Disparo Secundário", img: CPR("upgrades/smartgun_link"), text: "Quando você ataca com uma arma de fogo ou arma inteligente e rola com Esperança, você pode marcar 1 Estresse para mirar outra criatura dentro do alcance Muito Próximo do alvo original, causando metade do dano." },
  { n: 24, name: "Lâminas Mantis de Rua", cost: 2, weapon: { slot: "primary", trait: "Finesse", range: "Melee", damage: "d8+5 phy" }, img: CPR("cyberware/wolvers"), text: "Este implante conta como uma Arma Primária sempre equipada: Acuidade, Corpo a Corpo, d8+5 físico. <strong>Bote:</strong> quando você se move até o alcance Corpo a Corpo antes de atacar, some 1d6 à rolagem de dano. Em uma rolagem com Esperança, o alvo fica temporariamente Imobilizado." },
  { n: 25, name: "Rotas de Fronteira", cost: 1, access: { competency: "frontier", level: "card" }, uses: { max: 1, recovery: "shortRest" }, img: CPR("gear/homing_tracer"), text: "Ganhe Acesso de Carta a uma carta de Frontier do seu nível ou menor. Uma vez por descanso, ignore terreno difícil durante um movimento ou manobra de veículo." },
  { n: 26, name: "Suíte Tática de Ameaças", cost: 1, access: { competency: "aegis", level: "card" }, uses: { max: 1, recovery: "shortRest" }, actionType: "reaction", img: CPR("cyberware/radar_sonar_implant"), text: "Ganhe Acesso de Carta a uma carta de Aegis do seu nível ou menor. Uma vez por descanso, quando um aliado dentro do alcance Próximo for alvo de um ataque, você pode se mover até o alcance Muito Próximo dele." },
  { n: 27, name: "Modulador de Voz", cost: 1, access: { competency: "influence", level: "card" }, img: CPR("cyberware/audiovox"), text: "Ganhe Acesso de Carta a uma carta de Influence do seu nível ou menor. Você tem vantagem em rolagens para imitar vozes, falsificar identidade ou se passar por autorizado em sistemas de áudio." },
  { n: 28, name: "Córtex de Link de Drone", cost: 2, access: { competency: "systems", level: "card" }, img: CPR("dlc/cyberware/drone_remote"), text: "Ganhe Acesso de Carta a uma carta de Systems do seu nível ou menor. Você pode operar drones simples dentro do alcance Distante sem usar as mãos." },
  { n: 29, name: "Pernas de Cabo Reflexo", cost: 2, bonus: BONUS.evasion(1), uses: { max: 1, recovery: "shortRest" }, img: CPR("cyberware/cyberleg"), text: "Ganhe +1 de Evasão enquanto não estiver Imobilizado (remova o bônus manualmente enquanto estiver). Uma vez por descanso, mova-se dentro do alcance Distante sem fazer uma Rolagem de Agilidade." },
  { n: 30, name: "Pulmões Sintéticos", cost: 1, img: CPR("cyberware/independent_air_supply"), text: "Você tem vantagem em rolagens para resistir a veneno, gás, sufocamento, afogamento, fumaça, doença e exaustão por esforço prolongado." },
  { n: 31, name: "Lâminas Mantis Militares", cost: 3, weapon: { slot: "primary", trait: "Finesse", range: "Melee", damage: "d8+7 phy" }, img: CPR("cyberware/rippers"), text: "Este implante conta como uma Arma Primária sempre equipada: Acuidade, Corpo a Corpo, d8+7 físico. <strong>Dilacerar:</strong> quando você se move até o alcance Corpo a Corpo antes de atacar, some 1d8 à rolagem de dano. Em uma rolagem com Esperança, o alvo fica temporariamente Vulnerável." },
  { n: 32, name: "Colmeia de Enxame Cirúrgico", cost: 2, charges: { name: "Carga de Triagem", max: 2 }, img: CPR("cyberware/medscanner"), text: "Quando você rolar com Esperança usando uma carta de Medtech ou ação médica, ganhe 1 Carga de Triagem (máximo 2). Quando tratar um alvo, gaste 1 Carga para limpar 1 Estresse dele ou 2 Cargas para limpar 1 Ponto de Vida." },
  { n: 33, name: "Córtex Netdaemon", cost: 2, charges: { name: "Carga Daemon", max: 2 }, img: CPR("cyberware/cyberdeck"), text: "Quando você rolar com Esperança usando uma carta de Network ou ação de invasão, ganhe 1 Carga Daemon (máximo 2). Ao rolar com uma carta de Network ou para invadir, gaste qualquer número de Cargas para rolar essa quantidade de d6 e somar o maior resultado à rolagem. Se gastar 2 Cargas e tiver sucesso, crie 1 Breach." },
  { n: 34, name: "Sistema Pele-Fantasma", cost: 2, charges: { name: "Carga de Sumiço", max: 2 }, img: CPR("cyberware/chemskin"), text: "Quando você rolar com Esperança usando uma carta de Ghost ou ação de ladinagem, ganhe 1 Carga de Sumiço (máximo 2). Gaste 1 Carga para se mover dentro do alcance Muito Próximo sem deixar de estar Escondido. Gaste 2 Cargas para ficar Escondido até o fim da sua próxima ação." },
  { n: 35, name: "Músculos Overdrive", cost: 2, charges: { name: "Carga Overdrive", max: 2 }, img: CPR("cyberware/implanted_linearframe_sigma"), text: "Quando você rolar com Esperança usando uma carta de Chrome ou uma ação de Cyberware, ganhe 1 Carga Overdrive (máximo 2). Antes de uma rolagem, gaste qualquer número de Cargas para somar +1 por Carga. Se gastar 2 Cargas e tiver sucesso, limpe 1 Estresse ou ganhe +1 de Evasão até sua próxima ação." },
  { n: 36, name: "Malha de Ameaça Égide", cost: 2, charges: { name: "Carga de Guarda", max: 2 }, img: CPR("dlc/armor/skidrow_packshield"), text: "Quando você rolar com Esperança usando uma carta de Aegis ou protegendo algo, ganhe 1 Carga de Guarda (máximo 2). Quando um aliado dentro do alcance Próximo for alvo de um ataque, gaste 1 Carga para dar +1 de Evasão a ele. Se gastou 2 Cargas e o ataque acertar, reduza o dano em 1." },
  { n: 37, name: "Buffer Cortical", cost: 2, bonus: BONUS.stress(1), humanity: "buffer", img: CPR("dlc/cyberware/chipware_compartment"), text: "Ganhe um espaço adicional de Estresse. Quando você rolar seu Dado de Humanidade, você pode marcar 1 Estresse para somar +1 ao resultado (a Ficha Edgeheart pergunta quando isso muda o resultado)." },
  { n: 38, name: "Segundo Coração", cost: 3, bonus: BONUS.hp(1), uses: { max: 1, recovery: "longRest" }, actionType: "reaction", img: CPR("dlc/cyberware/heuristic-health-monitor"), text: "Ganhe um espaço adicional de Ponto de Vida. Uma vez por descanso longo, quando você fosse marcar seu último Ponto de Vida, não o marque." },
  { n: 39, name: "Casca Dérmica Ablativa", cost: 2, bonus: BONUS.thresholds(3), uses: { max: 1, recovery: "scene" }, actionType: "reaction", img: CPR("cyberware/skin_weave"), text: "Ganhe +3 de bônus nos seus limiares de dano. Uma vez por cena, quando você marcar um Espaço de Armadura, reduza a gravidade em um limiar adicional." },
  { n: 40, name: "Ghostware Reflexo", cost: 3, bonus: BONUS.evasion(1), uses: { max: 1, recovery: "scene" }, actionType: "reaction", img: CPR("default/Default_CPR_Mystery_Man"), text: "Ganhe +1 de Evasão. Uma vez por cena, quando um ataque errar você, você pode imediatamente se mover dentro do alcance Muito Próximo e ficar Escondido se houver cobertura ou ocultação disponível." },
  { n: 41, name: "Implante de Malha Tática", cost: 2, choice: "tacticalMesh", access: { competency: "aegis", level: "half" }, uses: { max: 1, recovery: "shortRest" }, actionCosts: [{ key: "hope", value: 1 }], actionType: "reaction", img: CPR("cyberware/multioptic_mount"), text: "Ganhe Meio Acesso a Aegis ou Influence. Uma vez por descanso, quando um aliado dentro do alcance Próximo rolar com Medo, você pode gastar 1 Esperança para transformá-la numa rolagem com Esperança." },
  { n: 42, name: "Arquivo Neural", cost: 2, choice: "neuralArchive", uses: { max: 1, recovery: "shortRest" }, actionName: "Re-rolar Dado de Medo", img: CPR("cyberware/memory_chip"), text: "Ganhe uma nova Experiência com +2 ou some +1 a uma de suas Experiências. Uma vez por descanso, quando usar essa Experiência, você pode re-rolar seu Dado de Medo." },
  { n: 43, name: "Baia de Módulos de Sistemas", cost: 2, charges: { name: "Carga de Módulo", max: 2 }, img: CPR("cyberware/quick_change_mount"), text: "Quando você rolar com Esperança usando uma carta de Systems ou ação envolvendo dispositivos, ganhe 1 Carga de Módulo (máximo 2). Gaste 1 Carga para somar +1d6 a uma rolagem envolvendo dispositivos. Gaste 2 Cargas para também consertar, desativar, conectar ou modificar um dispositivo Próximo depois que a ação se resolver." },
  { n: 44, name: "Motor de Overclock Vermelho", cost: 3, access: { competency: "redline", level: "half" }, charges: { name: "Carga de Overclock", max: 2 }, img: CPR("drugs/smash"), text: "Ganhe Meio Acesso a Redline. Quando você rolar com Esperança usando uma carta de Redline, ganhe 1 Carga de Overclock (máximo 2). Antes de uma rolagem de dano, gaste qualquer número de Cargas para somar +1d12 por Carga. Se gastar 2 Cargas, marque 1 Estresse depois que o ataque se resolver." },
  { n: 45, name: "Córtex Black ICE", cost: 3, access: { competency: "blackwall", level: "half" }, charges: { name: "Corrupção", max: 2, onFear: true }, img: CPR("netrunning/Black_Ice.png"), text: "Ganhe Meio Acesso a Blackwall. Quando você rolar com Medo usando uma carta de Blackwall, ganhe 1 Corrupção (máximo 2). Antes de uma rolagem de Blackwall, gaste qualquer quantidade de Corrupção para rolar essa quantidade de d6 e somar à rolagem. Se gastar 2 e tiver sucesso, os alvos afetados marcam 1 Estresse e ficam temporariamente Degraded (usam d12 em vez de d20 em rolagens de ataque). Depois, marque 1 Estresse ou o mestre ganha 1 Medo." },
  { n: 46, name: "Autoinjetor de Última Chance", cost: 2, uses: { max: 1, recovery: "longRest" }, actionType: "reaction", img: CPR("gear/air_hypo"), text: "Uma vez por descanso longo, quando você marcar seu último Ponto de Vida e fosse fazer um Movimento de Morte, faça o Movimento de Morte Evitar a Morte. Você fica inconsciente, não pode se mover, agir ou ser alvo de ataques, e acorda quando um aliado limpar 1 ou mais dos seus Pontos de Vida marcados ou quando o grupo terminar um descanso longo. Ao acordar, role seu Dado de Esperança. Se o resultado for igual ou menor que seu nível, você ganha uma Cicatriz." },
  { n: 47, name: "Coprocessador Blackwall", cost: 4, access: { competency: "blackwall", level: "full" }, charges: { name: "Corrupção", max: 3, onFear: true }, img: CPR("blackice/src/hellhound"), text: "Ganhe Acesso Total a Blackwall. Quando você rolar com Medo usando uma carta de Blackwall, ganhe 1 Corrupção (máximo 3). Antes de uma rolagem de Blackwall, gaste qualquer quantidade de Corrupção para rolar essa quantidade de d6 e somar à rolagem. Se gastar 3 e tiver sucesso, um alvo afetado marca 1 Estresse, fica temporariamente Degraded e não pode se beneficiar de sistemas conectados enquanto Degraded. Depois, marque 1 Estresse e o mestre ganha 1 Medo." },
  { n: 48, name: "Kernel Berserker", cost: 4, access: { competency: "redline", level: "full" }, charges: { name: "Carga de Overclock", max: 3 }, img: CPR("status/beserker"), text: "Ganhe Acesso Total a Redline. Quando você rolar com Esperança usando uma carta de Redline, ganhe 1 Carga de Overclock (máximo 3). Antes de uma rolagem de dano, gaste qualquer número de Cargas para somar 1d12 por Carga. Se gastar 3 Cargas e o ataque tiver sucesso, você pode imediatamente fazer um ataque com arma como reação e depois marcar 2 Estresse." },
  { n: 49, name: "Acelerador de Fatia de Tempo", cost: 4, bonus: BONUS.evasion(1), uses: { max: 1, recovery: "longRest" }, actionCosts: [{ key: "stress", value: 2 }], actionType: "reaction", img: CPR("cyberware/sandevistan"), text: "Ganhe +1 de Evasão. Uma vez por descanso longo, depois de fazer uma Rolagem de Agilidade ou Acuidade, você pode imediatamente realizar outra ação como reação. Depois, marque 2 Estresse." },
  { n: 50, name: "Estrutura de Alma de Titânio", cost: 4, bonus: [...BONUS.hp(1), ...BONUS.armor(1)], img: CPR("dlc/cyberware/implanted_linearframe_omega"), text: "Ganhe um espaço adicional de Ponto de Vida e +1 na Pontuação de Armadura. Quando você sofrer dano Maior ou Severo, role um d6. Em 5 ou mais, marque 1 Ponto de Vida a menos." },
  { n: 51, name: "Blindagem Pele-de-Anjo", cost: 3, bonus: BONUS.armor(2), uses: { max: 1, recovery: "longRest" }, actionType: "reaction", img: CPR("cyberware/superchrome_covering"), text: "Ganhe +2 na Pontuação de Armadura. Uma vez por descanso longo, quando um aliado dentro do alcance Muito Próximo fosse marcar Pontos de Vida, você pode marcar um Espaço de Armadura para reduzir a gravidade em um limiar." },
  { n: 52, name: "Loop de Reflexo Clone", cost: 3, uses: { max: 1, recovery: "shortRest" }, img: CPR("dlc/cyberware/extra-joined-cyberarm"), text: "Uma vez por descanso, quando você rolar com Esperança num ataque, você pode repetir o ataque contra outro alvo dentro do alcance causando metade do dano." },
  { n: 53, name: "Fantasma na Suíte", cost: 4, img: CPR("dlc/cyberware/signal_jammer"), text: "Você não pode ser detectado por câmeras, drones ou sensores comuns além do alcance Próximo, a menos que ataque, fale alto ou o mestre gaste 1 Medo." },
  { n: 54, name: "Chassi Metamórfico", cost: 4, uses: { max: 1, recovery: "longRest" }, actionName: "Não gastar Esperança/Estresse", img: CPR("dlc/cyberware/superchrome-faceplate"), text: "Quando terminar um descanso longo, escolha Evasão, Armadura ou Limiares. Até seu próximo descanso longo, ganhe um destes: +1 de Evasão, +1 na Pontuação de Armadura ou +4 nos limiares de dano (ajuste manual). Uma vez por descanso longo, quando você gastar Esperança ou marcar Estresse para usar uma feature, você não gasta nem marca." },
  { n: 55, name: "Coroa Neural de Comando", cost: 3, charges: { name: "Carga de Influence", max: 3 }, img: CPR("dlc/cyberware/poser_chip"), text: "Quando você rolar com Esperança usando uma carta de Influence ou em contexto social, ganhe 1 Carga de Influence (máximo 3). Antes de uma rolagem com Presença ou carta de Influence, gaste qualquer número de Cargas para somar +1 por Carga. Se tiver sucesso, um alvo também marca a mesma quantidade de Estresse e um aliado que possa te ouvir limpa a mesma quantidade de Estresse para cada Carga gasta." },
  { n: 56, name: "Equipamento de Órgão de Cerco", cost: 3, uses: { max: 1, recovery: "scene" }, img: CPR("cyberware/big_knucks"), text: "Seus ataques desarmados e de weaponware ignoram qualquer redução de dano. Uma vez por cena, quando você causar dano Maior ou Severo no alcance Corpo a Corpo, todos os adversários dentro do alcance Muito Próximo do alvo marcam 1 Estresse." },
  { n: 57, name: "Governador de Sobrecarga", cost: 4, uses: { max: 1, recovery: "longRest" }, img: CPR("upgrades/hardened_circuitry"), text: "Uma vez por descanso longo, depois de usar uma feature de Cyberware com limite (como uma vez por descanso), você pode imediatamente usar essa mesma feature de novo. Depois que ela se resolver, faça uma Rolagem de Humanidade: se o resultado for igual ou menor que sua Carga Cibernética, marque 2 Estresse ou o mestre ganha 3 Medo." },
  { n: 58, name: "Editor de Dor Aperfeiçoado", cost: 3, bonus: BONUS.stress(2), uses: { max: 1, recovery: "longRest" }, actionType: "reaction", img: CPR("drugs/surge"), text: "Ganhe dois espaços adicionais de Estresse. Uma vez por descanso longo, quando você fosse marcar Estresse, você pode limpá-lo em vez disso." },
  { n: 59, name: "Aglomerado de Órgãos Ômega", cost: 3, bonus: BONUS.hp(2), uses: { max: 1, recovery: "longRest" }, actionType: "reaction", img: CPR("cyberware/toxin_binders"), text: "Ganhe dois espaços adicionais de Ponto de Vida. Uma vez por descanso longo, quando você fosse marcar um Ponto de Vida, você pode limpá-lo em vez disso." },
  { n: 60, name: "Âncora de Humanidade", cost: 0, humanity: "anchor", img: CPR("drugs/rapidetox"), text: "Quando você rolar seu Dado de Humanidade, role duas vezes e use o maior resultado (automático na Ficha Edgeheart)." }
];

const cyberTier = n => (n <= 24 ? 1 : n <= 36 ? 2 : n <= 48 ? 3 : 4);

function cyberDescription(def) {
  const access = def.access
    ? `<p><strong>${ACCESS_LABELS[def.access.level]}:</strong> ${COMPETENCY_LABELS[def.access.competency]}${def.choice === "tacticalMesh" ? " ou Influence (escolha ao instalar)" : ""}</p>` : "";
  return `<p><strong>Cyberware ${String(def.n).padStart(2, "0")}</strong> · Tier ${cyberTier(def.n)} · <strong>Custo Cibernético ${def.choice === "competency" ? "1–3" : def.cost}</strong></p>${access}<p>${def.text}</p>`;
}

function buildCyberwareItem(def, folderId) {
  const flags = {
    [MODULE_ID]: {
      cyberware: true, cyberCost: def.cost, tier: cyberTier(def.n), number: def.n,
      ...(def.access ? { access: def.access } : {}),
      ...(def.choice ? { choice: def.choice } : {}),
      ...(def.humanity ? { humanity: def.humanity } : {})
    }
  };
  const base = { _id: stableId(`cyberware:${def.n}`), name: def.name, img: def.img, folder: folderId, flags };

  if (def.weapon) {
    const w = buildWeaponData(W(1, def.name, "default/Default_Weapon", def.weapon.trait, def.weapon.range, def.weapon.damage, "One-Handed", "|"), false);
    delete w._id;
    return foundry.utils.mergeObject(w, {
      ...base,
      system: { description: cyberDescription(def), secondary: def.weapon.slot === "secondary", tier: cyberTier(def.n), attack: { img: def.img } }
    });
  }

  const hasAction = def.uses || def.actionCosts;
  return {
    ...base,
    type: "feature",
    system: {
      description: cyberDescription(def), gmNotes: "", attribution: ATTRIBUTION,
      featureForm: def.actionType === "reaction" ? "reaction" : hasAction ? "action" : "passive",
      actions: hasAction ? featureAction({
        name: def.actionName ?? def.name, img: def.img, actionType: def.actionType ?? "action",
        costs: def.actionCosts ?? [], uses: def.uses ?? null
      }) : {},
      // Cargas: contador do próprio item, zera no fim da cena (refresh de cena do Daggerheart).
      resource: def.charges
        ? { type: "simple", value: 0, max: String(def.charges.max), icon: def.img, recovery: "scene", progression: "increasing" }
        : null
    },
    effects: def.bonus || def.choice === "trait" || def.choice === "experience"
      ? [{
          name: def.name, img: def.img, transfer: true, type: "base",
          // Reforço de Atributo / Skillsoft: a chave definitiva é gravada na escolha ao instalar.
          system: { changes: def.bonus ?? [], duration: { description: "" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
          duration: { value: null, units: "seconds", expiry: null, expired: false },
          tint: "#ffffff", statuses: [], disabled: false
        }]
      : []
  };
}

async function importCyberware() {
  const pack = await getOrCreatePack("cyberware");
  const folders = {};
  for (const tier of [1, 2, 3, 4]) {
    folders[tier] = await makeFolder(pack, `Tier ${tier} — ${["Comum", "Incomum", "Raro", "Lendário"][tier - 1]}`);
  }
  const data = CYBERWARE.map(def => buildCyberwareItem(def, folders[cyberTier(def.n)].id));
  await Item.createDocuments(data, { pack: pack.collection, keepId: true });
}

// ---------- Diários (mesmo formato dos diários do sistema: uma entrada com páginas de texto) ----------
// O texto de cada página fica em journals/<pasta>/<arquivo>.html. Dentro dele, {{id:CHAVE}} vira o
// stableId(CHAVE), para linkar itens importados: @UUID[Compendium.edgeheart-cyberpunk.edgeheart-classes.Item.{{id:runner:class}}]{Runner}.

const JOURNALS = [
  {
    key: "welcome", name: "Bem-vindo ao Edgeheart", folder: "welcome",
    pages: [["O MÓDULO EDGEHEART", "01-modulo"], ["A FICHA EDGEHEART", "02-ficha"], ["CRÉDITOS", "03-creditos"]]
  },
  {
    key: "campaign-frame", name: "Edgeheart Campaign Frame", folder: "campaign-frame",
    pages: [
      ["EDGEHEART", "01-edgeheart"], ["VISÃO GERAL", "02-visao-geral"], ["A NEW DARK AGE", "03-nova-era"],
      ["PRINCÍPIOS DO JOGADOR", "04-principios-jogador"], ["PRINCÍPIOS DO MESTRE", "05-principios-mestre"],
      ["PERGUNTAS DE SESSÃO ZERO", "06-sessao-zero"]
    ]
  },
  {
    key: "srd", name: "Edgeheart SRD", folder: "srd",
    pages: [
      ["INTRODUÇÃO", "01-introducao"], ["A CREW E O EDGE", "02-crew"], ["CLASSES", "03-classes"],
      ["TRAJETÓRIAS E AFILIAÇÕES", "04-trajetorias-afiliacoes"],
      ["RUNNER", "10-runner"], ["INFILTRATOR", "11-infiltrator"], ["SOLO", "12-solo"], ["AUGMENTED", "13-augmented"],
      ["TECH", "14-tech"], ["BROKER", "15-broker"], ["RECLAIMER", "16-reclaimer"], ["TRAUMA DOC", "17-trauma-doc"],
      ["WARDEN", "18-warden"],
      ["EQUIPAMENTO", "20-equipamento"], ["ARMAS PRIMÁRIAS", "21-armas-primarias"], ["ARMAS SECUNDÁRIAS", "22-armas-secundarias"],
      ["ARMADURAS", "23-armaduras"], ["LOOT", "24-loot"], ["CONSUMÍVEIS", "25-consumiveis"], ["CYBERWARE", "26-cyberware"],
      ["EIDOLONS", "30-eidolons"], ["EXEMPLOS DE EIDOLONS", "31-exemplos-eidolons"],
      ["HUMANIDADE, CIBERPSICOSE E HACKING", "32-mecanicas"], ["VEÍCULOS", "33-veiculos"],
      ["AMEAÇAS DA NEW DARK AGE", "40-ameacas"], ["AMBIENTES", "41-ambientes"],
      ["ADVERSÁRIOS DE TIER 1", "42-adversarios-t1"], ["ADVERSÁRIOS DE TIER 2", "43-adversarios-t2"],
      ["ADVERSÁRIOS DE TIER 3", "44-adversarios-t3"], ["ADVERSÁRIOS DE TIER 4", "45-adversarios-t4"],
      ["COMPETÊNCIAS", "50-competencias"], ["NETWORK", "51-network"], ["ASSAULT", "52-assault"], ["CHROME", "53-chrome"],
      ["SYSTEMS", "54-systems"], ["INFLUENCE", "55-influence"], ["GHOST", "56-ghost"], ["FRONTIER", "57-frontier"],
      ["MEDTECH", "58-medtech"], ["AEGIS", "59-aegis"], ["REDLINE", "60-redline"], ["BLACKWALL", "61-blackwall"]
    ]
  }
];

// Tabela da lista de cyberware gerada dos próprios itens (mesmo texto do compêndio, com link).
function cyberwareTable() {
  const tiers = ["Comum", "Incomum", "Raro", "Lendário"];
  return [1, 2, 3, 4].map(tier => {
    const rows = CYBERWARE.filter(def => cyberTier(def.n) === tier).map(def => {
      const access = def.access
        ? `<strong>${ACCESS_LABELS[def.access.level]}: ${COMPETENCY_LABELS[def.access.competency]}${def.choice === "tacticalMesh" ? " ou Influence" : ""}.</strong> ` : "";
      return `<tr><td>${String(def.n).padStart(2, "0")}</td>`
        + `<td>@UUID[Compendium.${PACK_SCOPE}.${PACKS.cyberware.name}.Item.${stableId(`cyberware:${def.n}`)}]{${def.name}}</td>`
        + `<td>${def.choice === "competency" ? "1–3" : def.cost}</td><td>${access}${def.text}</td></tr>`;
    }).join("");
    return `<h3>Tier ${tier} — ${tiers[tier - 1]}</h3><table><thead><tr><th>Rolagem</th><th>Cyberware</th><th>Custo</th><th>Feature</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
}

// Cartas de uma Competência já importada, com o mesmo texto do compêndio e link para cada carta.
function competencyCards(id) {
  const competency = COMPETENCIES.find(c => c.id === id);
  if (!competency) return "";
  const levels = [...new Set(competency.cards.map(c => c.level))].sort((a, b) => a - b);
  return levels.map(level => `<h2>NÍVEL ${level}</h2>` + competency.cards.filter(c => c.level === level).map(card =>
    `<h3>@UUID[Compendium.${PACK_SCOPE}.${PACKS.domains.name}.Item.${cardId(id, card.name)}]{${card.name}}</h3>`
    + `<p><em>Nível ${card.level} · ${{ spell: "Protocol", grimoire: "Protocol Suite" }[card.type] ?? "Ability"} · Custo de Recordação ${card.recallCost}</em></p>`
    + card.description
  ).join("")).join("");
}

async function importJournals() {
  const pack = await getOrCreatePack("journals");
  const entries = [];
  for (const journal of JOURNALS) {
    const pages = [];
    for (const [index, [name, file]] of journal.pages.entries()) {
      const response = await fetch(`modules/${MODULE_ID}/journals/${journal.folder}/${file}.html`, { cache: "no-store" });
      if (!response.ok) { console.warn(`Edgeheart | Página de diário não encontrada: ${journal.folder}/${file}.html`); continue; }
      const content = (await response.text())
        .replace("{{cyberware-table}}", () => cyberwareTable())
        .replace(/\{\{cards:(\w+)\}\}/g, (_, id) => competencyCards(id))
        .replace(/\{\{id:([^}]+)\}\}/g, (_, key) => stableId(key.trim()));
      pages.push({
        _id: stableId(`journal:${journal.key}:${file}`), name, type: "text", sort: (index + 1) * 100000,
        title: { show: true, level: 1 }, text: { format: 1, content }
      });
    }
    if (pages.length) entries.push({ _id: stableId(`journal:${journal.key}`), name: journal.name, pages });
  }
  await JournalEntry.createDocuments(entries, { pack: pack.collection, keepId: true });
}

// ---------- Orquestração ----------

// Esvazia os compêndios do módulo (documentos e pastas internas) antes de gerar de novo.
async function clearPacks() {
  for (const key of Object.keys(PACKS)) {
    const pack = await getOrCreatePack(key);
    const ids = (await pack.getIndex()).map(i => i._id);
    if (ids.length) await pack.documentClass.deleteDocuments(ids, { pack: pack.collection });
    const folderIds = pack.folders.map(f => f.id);
    if (folderIds.length) await Folder.deleteDocuments(folderIds, { pack: pack.collection });
  }
}

// Versões até a 1.15 criavam os compêndios e as pastas no mundo, pela macro "Importar Edgeheart
// (Núcleo)". Com os compêndios dentro do módulo, esses ficam duplicados: o mestre é avisado uma
// vez e pode apagá-los (personagens já criados não são afetados, os itens deles já estão na ficha).
const LEGACY_MACRO = "Importar Edgeheart (Núcleo)";

function legacyContent() {
  return {
    packs: game.packs.filter(p => p.metadata.packageType === "world" && Object.values(PACKS).some(d => d.name === p.metadata.name)),
    folders: game.folders.filter(f => f.type === "Compendium" && f.getFlag(MODULE_ID, "packFolder")),
    macros: game.macros.filter(m => m.name === LEGACY_MACRO && m.getFlag(MODULE_ID, "core"))
  };
}

// As pastas antigas não são apagadas: têm os mesmos nomes das pastas do manifesto, e o Foundry as
// reaproveita para os compêndios do módulo. Só perdem a marca de "pasta antiga".
async function removeLegacyContent() {
  const { packs, folders, macros } = legacyContent();
  for (const pack of packs) await pack.deleteCompendium();
  for (const folder of folders) await folder.unsetFlag(MODULE_ID, "packFolder");
  if (macros.length) await Macro.deleteDocuments(macros.map(m => m.id));
  await repairPackFolders();
  return packs.length + macros.length;
}

// O Foundry distribui os compêndios nas pastas do manifesto (packFolders) uma vez por mundo. Se a
// pasta de um compêndio do módulo foi apagada depois, ele fica apontando para uma pasta que não existe;
// aqui a estrutura do manifesto é recriada e o compêndio volta para ela. Compêndios que o mestre moveu
// para outra pasta existente (ou deixou soltos) não são tocados.
async function repairPackFolders() {
  const mod = game.modules.get(MODULE_ID);
  // Também entram compêndios novos de versões mais recentes (sem pasta configurada: folder undefined;
  // um compêndio que o mestre deixou solto tem folder null e não é tocado).
  const broken = game.packs.filter(p => p.metadata.packageName === MODULE_ID
    && ((p.config.folder && !game.folders.get(p.config.folder)) || p.config.folder === undefined));
  if (!broken.length) return;
  const place = async (def, parent) => {
    let folder = game.folders.find(f => f.type === "Compendium" && f.name === def.name && (f.folder?.id ?? null) === (parent?.id ?? null));
    folder ??= await Folder.create({ name: def.name, type: "Compendium", sorting: def.sorting ?? "m", color: def.color?.css ?? def.color ?? null, folder: parent?.id ?? null });
    for (const [index, name] of [...def.packs].entries()) {
      const pack = broken.find(p => p.metadata.name === name);
      if (pack) await pack.configure({ folder: folder.id, sort: index });
    }
    for (const child of def.folders ?? []) await place(child, folder);
  };
  for (const def of mod.packFolders) await place(def, null);
}

async function offerLegacyCleanup() {
  const { packs, folders, macros } = legacyContent();
  if (!packs.length && !folders.length && !macros.length) return;
  const remove = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Edgeheart: compêndios antigos" },
    content: `<p>Os compêndios do Edgeheart agora vêm prontos dentro do módulo (pasta <strong>Edgeheart SRD</strong>). Este mundo ainda tem a versão antiga, criada pela macro de importação:</p>
      <ul>${packs.map(p => `<li>${p.title}</li>`).join("")}${macros.length ? `<li>Macro "${LEGACY_MACRO}"</li>` : ""}</ul>
      <p>Apagar a versão antiga? Personagens já criados não perdem nada: os itens deles já estão na ficha.</p>`,
    rejectClose: false
  });
  if (remove) {
    await removeLegacyContent();
    ui.notifications.info("Edgeheart: compêndios antigos apagados.");
  }
}

// Gerador dos compêndios do módulo (ferramenta de desenvolvimento). Recria todo o conteúdo a partir
// deste código e trava os compêndios de novo no final.
async function buildPacks() {
  if (!game.user.isGM) {
    ui.notifications.warn("Apenas o GM pode gerar os compêndios do Edgeheart.");
    return;
  }
  ui.notifications.info("Edgeheart: gerando os compêndios do módulo...");
  await clearPacks();
  const equipment = await importWeaponsAndArmor();
  await importLootAndConsumables();
  await importClassesAndSubclasses(equipment);
  await importLifePathsAndAffiliations();
  await importDomainCards();
  await importCyberware();
  await importAdversaries();
  await importEnvironments();
  await importJournals();
  for (const key of Object.keys(PACKS)) await game.packs.get(`${PACK_SCOPE}.${PACKS[key].name}`)?.configure({ locked: true });
  ui.notifications.info("Edgeheart: compêndios gerados.");
  console.log("Edgeheart | Compêndios do módulo gerados.");
}

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  // importEdgeheartCore: nome antigo, mantido para a macro de versões anteriores.
  if (mod) mod.api = { ...(mod.api ?? {}), buildPacks, importEdgeheartCore: buildPacks, removeLegacyContent, repairPackFolders };
  if (game.user !== game.users.activeGM) return;
  // As Competências precisam estar no Homebrew do sistema para as cartas serem válidas; num mundo
  // novo isso acontece aqui, sem rodar nada. Nome/ícone também se atualizam entre versões.
  ensureHomebrewDomains();
  repairPackFolders();
  offerLegacyCleanup();
});
