/* Edgeheart - Cyberpunk para Daggerheart (Núcleo v0.3)
 * Agora com o schema REAL do sistema, confirmado a partir de exports oficiais:
 * Shortsword/Battleaxe (weapon), Chainmail Armor (armor), Loreborne (community),
 * Drakona (ancestry), Get Back Up (domainCard), Acid Burrower (adversary Actor).
 *
 * - Armas: ataque e dano agora são automáticos (trait, alcance, dado, bônus).
 * - Armaduras: thresholds e armor score automáticos.
 * - Features de arma/armadura (ex: "Flexible: +1 Evasão") ainda ficam só como texto na
 *   descrição — automatizar isso como ActiveEffect exige modelar cada efeito único
 *   (são dezenas diferentes), então deixei pra uma rodada futura se você quiser.
 * - Adiciona 1 adversário de exemplo (Neon Claw Ganger) já no formato certo de Actor,
 *   como prova de conceito antes de eu gerar o bestiário inteiro.
 */

const MODULE_ID = "edgeheart-cyberpunk";
const PACK_SCOPE = "world";

const PACKS = {
  classes: { name: "edgeheart-classes", label: "Edgeheart: Classes", type: "Item" },
  subclasses: { name: "edgeheart-subclasses", label: "Edgeheart: Subclasses", type: "Item" },
  weapons: { name: "edgeheart-weapons", label: "Edgeheart: Armas", type: "Item" },
  armors: { name: "edgeheart-armors", label: "Edgeheart: Armaduras", type: "Item" },
  adversaries: { name: "edgeheart-adversaries", label: "Edgeheart: Adversários", type: "Actor" },
  ancestries: { name: "edgeheart-lifepaths", label: "Edgeheart: Trajetórias", type: "Item" },
  communities: { name: "edgeheart-affiliations", label: "Edgeheart: Afiliações", type: "Item" },
  domains: { name: "edgeheart-domains", label: "Edgeheart: Cartas de Competência", type: "Item" },
  cyberware: { name: "edgeheart-cyberware", label: "Edgeheart: Cyberware", type: "Item" },
  journals: { name: "edgeheart-journals", label: "Edgeheart: Diários", type: "JournalEntry" }
};

async function getOrCreatePack(key) {
  const { name, label, type } = PACKS[key];
  const id = `${PACK_SCOPE}.${name}`;
  let pack = game.packs.get(id);
  if (pack) return pack;
  return CompendiumCollection.createCompendium({ type, label, name });
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
function featureAction({
  name, description = "", img = "icons/svg/upgrade.svg", actionType = "action",
  costs = [], uses = null, effects = [], target = null
}) {
  const id = foundry.utils.randomID();
  return {
    [id]: {
      type: "effect", _id: id, systemPath: "actions", description,
      chatDisplay: true, actionType,
      cost: costs.map(c => ({ scalable: false, key: c.key, value: c.value, step: null, consumeOnSuccess: false, itemId: null })),
      uses: uses
        ? { value: null, max: String(uses.max), recovery: uses.recovery, consumeOnSuccess: !!uses.onSuccess }
        : { value: null, max: null, recovery: null, consumeOnSuccess: false },
      effects: effects.map(e => ({ _id: e._id, onSave: false })),
      target: target ?? { type: effects.length ? "hostile" : "any", amount: effects.length ? 1 : null },
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
  },
  weapons: {
    "Carabina de Assalto": CPR("weapons/AssaultRifle"),
    "SMG Compacta": CPR("weapons/SMG"),
    "Espingarda de Rua": CPR("weapons/Shotgun"),
    "Martelo de Arrombamento": CPR("weapons/Sledgehammer"),
    "Mono-Katana": CPR("weapons/Sword"),
    "Arco Inteligente": CPR("weapons/Bow"),
    "Cassetete de Choque": CPR("weapons/StunBaton"),
    "Lançador de Sucata": CPR("weapons/GrenadeLauncher"),
    "Pistola de Reserva": CPR("weapons/mediumPistol"),
    "Faca de Combate": CPR("weapons/CombatKnife"),
    "Escudo Anti-Motim": CPR("armor/bullet_proof_shield"),
    "Luva de Choque": CPR("cyberware/battleglove"),
    "Cabo de Gancho": CPR("gear/grapple_gun"),
    "Bomba de Fumaça": CPR("ammo/grenade_smoke"),
    "Drone Tático": CPR("dlc/gear/the-observer"),
    "Dardo Atordoante": CPR("weapons/dartgun")
  },
  armor: {
    "Traje Ícone de Rua": CPR("armor/light-armorjack_body"),
    "Jaqueta de Sintcouro": CPR("clothing/generic_jacket"),
    "Colete Balístico": CPR("armor/kevlar_body"),
    "Blindagem Anti-Motim": CPR("armor/heavy-armorjack_body"),
    "Traje de Perigo": CPR("gear/radiation_suit")
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

function buildWeaponData([name, trait, range, damageStr, burdenLabel, featureText], img = ICONS.weapons[name] ?? CPR("default/Default_Weapon")) {
  return {
    name,
    type: "weapon",
    img,
    system: {
      description: `<p><strong>Característica:</strong> ${featureText}</p>`,
      actions: {},
      tier: 1,
      equipped: false,
      secondary: false,
      burden: burdenLabel === "Two-Handed" ? "twoHanded" : "oneHanded",
      weaponFeatures: [],
      attack: buildAttackAction({ name, trait, range, damageStr, burden: burdenLabel, img }),
      rules: { attack: { roll: { trait: null } } },
      attribution: { source: "Edgeheart (homebrew)", page: null, artist: "" },
      gmNotes: "",
      resource: null,
      quantity: 1
    }
  };
}

function buildArmorData([name, thresholds, score, featureText, evasionMod]) {
  const [major, severe] = thresholds.split("/").map(Number);
  const img = ICONS.armor[name] ?? CPR("default/Default_Armor");
  const effects = evasionMod ? [{
    name: name + " (Característica)",
    img,
    description: `<p><strong>Característica:</strong> ${featureText}</p>`,
    transfer: true,
    type: "base",
    system: {
      changes: [{ key: "system.evasion", type: "add", value: evasionMod, priority: null, phase: "initial" }],
      duration: { description: "" },
      rangeDependence: null, stacking: null, targetDispositions: [], conditionals: []
    },
    duration: { value: null, units: "seconds", expiry: null, expired: false },
    tint: "#ffffff", statuses: [], disabled: false
  }] : [];
  return {
    name,
    type: "armor",
    img,
    effects,
    system: {
      armor: { current: 0, max: Number(score) },
      description: `<p><strong>Característica:</strong> ${featureText}</p>`,
      actions: {},
      tier: 1,
      equipped: false,
      armorFeatures: [],
      baseThresholds: { major, severe },
      attribution: { source: "Edgeheart (homebrew)", page: null, artist: "" },
      gmNotes: "",
      resource: null,
      quantity: 1
    }
  };
}

const PRIMARY_WEAPONS_T1 = [
  ["Carabina de Assalto", "Agility", "Far", "d8+2 phy", "Two-Handed", "Fogo Controlado: Em uma rolagem com Esperança, ganhe um bônus de +1 na sua próxima rolagem de ataque dentro da cena."],
  ["SMG Compacta", "Agility", "Close", "d6+2 phy", "One-Handed", "Rajada: Marque 1 Estresse para atingir outra criatura dentro do alcance Muito Próximo do seu alvo original."],
  ["Espingarda de Rua", "Strength", "Very Close", "d8+3 phy", "Two-Handed", "Dispersão: Em um ataque bem-sucedido, outro alvo dentro do alcance Muito Próximo do alvo original marca 1 Estresse."],
  ["Martelo de Arrombamento", "Strength", "Melee", "d10+3 phy", "Two-Handed", "Arrombamento: Em um ataque bem-sucedido contra um objeto, porta, barricada, cobertura ou veículo, adicione +1 de Proficiência."],
  ["Mono-Katana", "Finesse", "Melee", "d8+2 phy", "One-Handed", "Corte Limpo: Quando você causa dano Maior, o alvo também marca 1 Estresse."],
  ["Arco Inteligente", "Finesse", "Far", "d8 tech", "Two-Handed", "Mira Calculada: Se você não se moveu durante seu Holofote antes de atacar, ganhe um bônus de +2 na rolagem de ataque."],
  ["Cassetete de Choque", "Presence", "Melee", "d8 tech", "One-Handed", "Pulso de Choque: Em um ataque bem-sucedido, o alvo sofre desvantagem na próxima Rolagem de Reação que fizer."],
  ["Lançador de Sucata", "Knowledge", "Close", "d8+1 phy", "Two-Handed", "Disparo de Sucata: Em uma rolagem com Medo, o alvo sofre 1d6 de dano e a arma emperra até você marcar 1 Estresse para destravá-la."]
];

const SECONDARY_WEAPONS_T1 = [
  ["Pistola de Reserva", "Finesse", "Far", "d6 phy", "One-Handed", "Saque Rápido: Você não marca Estresse para equipar esta arma em perigo."],
  ["Faca de Combate", "Agility", "Melee", "d6+1 phy", "One-Handed", "Combo: +2 no dano da arma primária contra alvos dentro do alcance Corpo a Corpo."],
  ["Escudo Anti-Motim", "Strength", "Melee", "d4 phy", "One-Handed", "Guarda: +1 na Pontuação de Armadura."],
  ["Luva de Choque", "Presence", "Melee", "d6 tech", "One-Handed", "Descarga por Toque: Em uma rolagem com Esperança, o alvo marca 1 Estresse."],
  ["Cabo de Gancho", "Finesse", "Close", "d6 phy", "One-Handed", "Fisgado: Em um ataque bem-sucedido, puxe o alvo para o alcance Corpo a Corpo ou puxe-se até o alcance Muito Próximo dele."],
  ["Bomba de Fumaça", "Knowledge", "Close", "d4 tech", "One-Handed", "Fumaça: Marque 1 Estresse para lançar fumaça dentro do alcance Muito Próximo e ficar Oculto enquanto estiver dentro da cortina de fumaça."],
  ["Drone Tático", "Instinct", "Close", "d6 tech", "One-Handed", "Observador: Gaste 1 Esperança para dar ao seu próximo ataque com a arma primária um bônus de +2."],
  ["Dardo Atordoante", "Finesse", "Far", "d6 tech", "One-Handed", "Sedativo: Em dano Maior, o alvo sofre desvantagem na próxima rolagem de ação que fizer."]
];

const ARMOR_T1 = [
  ["Traje Ícone de Rua", "5/11", "3", "Reconhecível: Uma vez por cena, escolha uma criatura que já ouviu falar da sua reputação. Ganhe vantagem na sua primeira rolagem contra ela."],
  ["Jaqueta de Sintcouro", "6/13", "3", "Flexível: +1 na Evasão.", 1],
  ["Colete Balístico", "7/15", "4", "Reforçado: Quando você marca seu último Espaço de Armadura, aumente seus limiares de dano em +2 até limpar pelo menos 1 Espaço de Armadura."],
  ["Blindagem Anti-Motim", "8/17", "4", "Pesada: −1 na Evasão; Escudo de Cobertura: Marque 1 Espaço de Armadura para ganhar um bônus de +2 na Evasão contra um ataque recebido.", -1],
  ["Traje de Perigo", "6/13", "3", "Selado: Você tem vantagem em rolagens para resistir a fumaça, veneno, gás, contaminação, doença ou exposição ambiental."]
];

async function importWeaponsAndArmor() {
  const weaponsPack = await getOrCreatePack("weapons");
  const armorsPack = await getOrCreatePack("armors");

  // Estrutura idêntica ao compêndio oficial daggerheart.items (conferida no .zip do sistema):
  // Primary Weapons > Physical Weapons / Magical Weapons > Tier 1
  // Secondary Weapons > Tier 1 (sem separar físico/mágico)
  const primaryTop = await makeFolder(weaponsPack, "Armas Primárias");
  const primaryPhysical = await makeFolder(weaponsPack, "Armas Físicas", { parent: primaryTop.id });
  const primaryMagical = await makeFolder(weaponsPack, "Armas Tech", { parent: primaryTop.id });
  const primaryPhysicalT1 = await makeFolder(weaponsPack, "Nível 1", { parent: primaryPhysical.id });
  const primaryMagicalT1 = await makeFolder(weaponsPack, "Nível 1", { parent: primaryMagical.id });

  const secondaryTop = await makeFolder(weaponsPack, "Armas Secundárias");
  const secondaryT1 = await makeFolder(weaponsPack, "Nível 1", { parent: secondaryTop.id });

  const armorTier1 = await makeFolder(armorsPack, "Nível 1");

  const primaryData = PRIMARY_WEAPONS_T1.map(row => {
    const d = buildWeaponData(row);
    const isMagical = /tech/i.test(row[3]);
    d.folder = isMagical ? primaryMagicalT1.id : primaryPhysicalT1.id;
    return d;
  });
  const secondaryData = withFolder(SECONDARY_WEAPONS_T1.map(row => {
    const d = buildWeaponData(row);
    d.system.secondary = true;
    return d;
  }), secondaryT1.id);

  const armorData = withFolder(ARMOR_T1.map(buildArmorData), armorTier1.id);

  const createdWeapons = await Item.createDocuments([...primaryData, ...secondaryData], { pack: weaponsPack.collection });
  const createdArmor = await Item.createDocuments(armorData, { pack: armorsPack.collection });
  return { weapons: createdWeapons, armor: createdArmor };
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
    primaryWeapon: "Lançador de Sucata", secondaryWeapon: null, armor: "Colete Balístico"
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
<p><strong>Build Sugerida:</strong> Conhecimento +2, Agilidade +1, Instinto +1, Presença 0, Força 0, Finesse −1. Equipamento recomendado: Lançador de Sucata (primária, duas mãos — sem arma secundária) + Colete Balístico — favorece o assalto direto a sistemas e sobreviver ao alcance corpo a corpo que o Rootkill te leva.</p>`,
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
<p><strong>Build Sugerida:</strong> Instinto +2, Finesse +1, Agilidade +1, Presença 0, Conhecimento 0, Força −1. Equipamento recomendado: Arco Inteligente (primária, duas mãos — sem arma secundária) + Jaqueta de Sintcouro — favorece manter-se móvel e cobrir aliados à distância enquanto usa o Deep Dive.</p>`,
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
    primaryWeapon: "Martelo de Arrombamento", secondaryWeapon: null, armor: "Blindagem Anti-Motim"
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
<p><strong>Build Sugerida:</strong> Força +2, Instinto +1, Presença +1, Agilidade 0, Conhecimento 0, Acuidade −1. Equipamento recomendado: Martelo de Arrombamento (primária, duas mãos) + Blindagem Anti-Motim — a armadura mais pesada do Tier 1, para aproveitar o Impact Frame.</p>`,
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
<p><strong>Build Sugerida:</strong> Presença +2, Força +1, Instinto +1, Agilidade 0, Conhecimento 0, Acuidade −1. Equipamento recomendado: Cassetete de Choque (primária, uma mão) + Escudo Anti-Motim (secundária) + Blindagem Anti-Motim — controle de perto com uma mão livre para o escudo.</p>`,
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
    primaryWeapon: "Arco Inteligente", secondaryWeapon: null, armor: "Jaqueta de Sintcouro"
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
<p><strong>Build Sugerida:</strong> Acuidade +2, Agilidade +1, Instinto +1, Força 0, Presença 0, Conhecimento −1. Equipamento recomendado: Arco Inteligente (primária, duas mãos) + Jaqueta de Sintcouro — ataques de longe, ficando parado para aproveitar o Draw do arco.</p>`,
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
<p><strong>Build Sugerida:</strong> Força +2, Agilidade +1, Instinto +1, Acuidade 0, Presença 0, Conhecimento −1. Equipamento recomendado: Espingarda de Rua (primária, duas mãos) + Colete Balístico — combate de perto, entrando no alcance Muito Próximo para o Hard Entry.</p>`,
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
// aplica a variação no postUseAction (edgeheart-character.js). O Takedown também rola o dado.
// Outras features que só pedem "role um dado e some" usam o flag rolls ({ nomeDaAção: { formula, flavor } }):
// o módulo rola a fórmula (com os dados do personagem, ex: @tier) depois que a ação termina.
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
    primaryWeapon: "Mono-Katana", secondaryWeapon: "Faca de Combate", armor: "Jaqueta de Sintcouro"
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
        ...featureAction({ name: COVER_ACTIONS.takedown, img: CPR("weapons/CombatKnife"), target: { type: "self", amount: null } })
      }
    }]
  },
  subclasses: [
    {
      name: "Silent Killer", img: CPR("classes/infiltrator/subclasses/silent-killer.png"),
      description: `<p><em>Jogue de Silent Killer se você quiser eliminar alvos com precisão e terminar lutas antes que elas comecem.</em></p>
<p><strong>Build Sugerida:</strong> Acuidade +2, Agilidade +1, Instinto +1, Presença 0, Conhecimento 0, Força −1. Equipamento recomendado: Mono-Katana (primária, uma mão) + Faca de Combate (secundária) + Jaqueta de Sintcouro — ataques de perto, saindo do Escondido.</p>`,
      spellcastingTrait: "finesse",
      suggestedTraits: { agility: 1, strength: -1, finesse: 2, instinct: 1, presence: 0, knowledge: 0 },
      foundation: [
        {
          name: "Opening Strike", img: CPR("weapons/CombatKnife_excellent"), form: "action",
          description: "<p>Uma vez por Holofote, quando você causa dano a um alvo enquanto está <em>Escondido</em> dele ou enquanto ele está <em>Vulnerável</em>, some à rolagem de dano uma quantidade de d6 igual ao seu Tier.</p><p><em>Na ficha: a ação rola os d6 do seu Tier para somar ao dano.</em></p>",
          flags: { [MODULE_ID]: { rolls: { "Opening Strike": { formula: "(@tier)d6", flavor: "Opening Strike (d6 por Tier) — some ao dano" } } } },
          actions: featureAction({ name: "Opening Strike", img: CPR("weapons/CombatKnife_excellent"), target: { type: "self", amount: null } })
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
<p><strong>Build Sugerida:</strong> Agilidade +2, Acuidade +1, Instinto +1, Presença 0, Conhecimento 0, Força −1. Equipamento recomendado: SMG Compacta (primária, uma mão) + Faca de Combate (secundária) + Jaqueta de Sintcouro — mobilidade e Evasão alta.</p>`,
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
    primaryWeapon: "SMG Compacta", secondaryWeapon: "Faca de Combate", armor: "Jaqueta de Sintcouro"
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
      flags: { [MODULE_ID]: { rolls: { "Chrome Surge": { formula: "1d8", flavor: "Chrome Surge (d8) — some à Rolagem de Agilidade, Força ou Acuidade" } } } },
      actions: featureAction({ name: "Chrome Surge", img: CPR("status/stim"), costs: [{ key: "hope", value: 3 }], target: { type: "self", amount: null } })
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
        ...featureAction({ name: CHROME_ACTIONS.use, img: CPR("cyberware/cyberarm"), costs: [{ key: "stress", value: 1 }], target: { type: "self", amount: null } })
      }
    }]
  },
  subclasses: [
    {
      name: "Reflex Suite", img: CPR("classes/augmented/subclasses/reflex-suite.png"),
      description: `<p><em>Jogue de Reflex Suite se você quiser se mover mais rápido que o tempo de reação humano e transformar o seu sistema nervoso numa arma.</em></p>
<p><strong>Build Sugerida:</strong> Agilidade +2, Acuidade +1, Instinto +1, Força 0, Presença 0, Conhecimento −1. Equipamento recomendado: SMG Compacta (primária, uma mão) + Faca de Combate (secundária) + Jaqueta de Sintcouro — Evasão alta e Agilidade calibrada.</p>`,
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
          flags: { [MODULE_ID]: { rolls: { "Fast Enough": { formula: "1d6", flavor: "Fast Enough (d6) — some à Evasão contra este ataque" } } } },
          actions: featureAction({ name: "Fast Enough", img: CPR("cyberware/sandevistan"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], uses: { max: 1, recovery: "shortRest" }, target: { type: "self", amount: null } })
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
<p><strong>Build Sugerida:</strong> Força +2, Agilidade +1, Instinto +1, Acuidade 0, Presença 0, Conhecimento −1. Equipamento recomendado: Martelo de Arrombamento (primária, duas mãos) + Colete Balístico — Força calibrada para o Reinforced Build.</p>`,
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
    primaryWeapon: "Lançador de Sucata", secondaryWeapon: null, armor: "Colete Balístico"
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
      flags: { [MODULE_ID]: { rolls: { "Rolar Boost": { formula: "1d6", flavor: "Jury-Rig: Boost (d6) — some à rolagem do item modificado" } } } },
      actions: {
        ...featureAction({ name: "Jury-Rig", img: CPR("gear/tech_tool"), uses: { max: 1, recovery: "scene" }, target: { type: "self", amount: null } }),
        ...featureAction({ name: "Jury-Rig Extra", costs: [{ key: "stress", value: 1 }], target: { type: "self", amount: null } }),
        ...featureAction({ name: "Rolar Boost", img: CPR("upgrades/nos"), target: { type: "self", amount: null } })
      }
    }]
  },
  subclasses: [
    {
      name: "Rigger", img: CPR("classes/tech/subclasses/rigger.png"),
      description: `<p><em>Jogue de Rigger se você quiser controlar drones, operar máquinas remotamente e apoiar aliados por meio de equipamento.</em></p>
<p><strong>Build Sugerida:</strong> Conhecimento +2, Agilidade +1, Instinto +1, Acuidade 0, Presença 0, Força −1. Equipamento recomendado: Lançador de Sucata (primária, duas mãos) + Colete Balístico — o drone faz o trabalho de perto enquanto você fica no alcance Próximo.</p>`,
      spellcastingTrait: "knowledge",
      suggestedTraits: { agility: 1, strength: -1, finesse: 0, instinct: 1, presence: 0, knowledge: 2 },
      foundation: [{
        name: "Companion Drone", img: CPR("dlc/cyberware/drone_remote"), form: "action",
        description: "<p>Você tem um pequeno drone ou máquina companheira que pode se mover de forma independente dentro do alcance Distante, carregar objetos pequenos, gravar, escanear e interagir com controles.</p><p>Você pode Ajudar um aliado dentro do alcance Próximo do drone, não importa onde você esteja. Se a rolagem dele envolver equipamento ou sistemas conectados, use um d8 como dado de Ajuda.</p><p>Quando o drone fosse sofrer dano, marque 1 Estresse para tirá-lo do perigo. Caso contrário, ele fica desativado até o seu próximo descanso.</p><p><em>Na ficha: \"Ajuda do Drone\" gasta 1 Esperança e rola o d8 de Ajuda; \"Proteger Drone\" marca 1 Estresse.</em></p>",
        flags: { [MODULE_ID]: { rolls: { "Ajuda do Drone": { formula: "1d8", flavor: "Companion Drone: dado de Ajuda (d8) — some à rolagem do aliado" } } } },
        actions: {
          ...featureAction({ name: "Ajuda do Drone", img: CPR("upgrades/communications_center"), costs: [{ key: "hope", value: 1 }], target: { type: "friendly", amount: 1 } }),
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
          flags: { [MODULE_ID]: { rolls: { "Reduzir Dano (Drone Network)": { formula: "1d8", flavor: "Drone Network (d8) — reduza o dano do aliado" } } } },
          actions: {
            ...featureAction({ name: "Drone Network", img: network.img, uses: { max: 1, recovery: "longRest" }, effects: [network], target: { type: "self", amount: null } }),
            ...featureAction({ name: "Reduzir Dano (Drone Network)", img: CPR("upgrades/insulated_wiring"), actionType: "reaction", costs: [{ key: "stress", value: 1 }], target: { type: "friendly", amount: 1 } })
          }
        };
      })()]
    },
    {
      name: "Saboteur", img: CPR("classes/tech/subclasses/saboteur.png"),
      description: `<p><em>Jogue de Saboteur se você quiser plantar cargas, desativar defesas e virar o ambiente contra os seus inimigos.</em></p>
<p><strong>Build Sugerida:</strong> Acuidade +2, Conhecimento +1, Agilidade +1, Instinto 0, Presença 0, Força −1. Equipamento recomendado: Mono-Katana (primária, uma mão) + Cabo de Gancho (secundária) + Jaqueta de Sintcouro — chegar perto para plantar as cargas.</p>`,
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
          flags: { [MODULE_ID]: { rolls: { "Controlled Demolition": { formula: "3d10", flavor: "Controlled Demolition (3d10 físico) — metade para quem passar na Rolagem de Reação (16)" } } } },
          actions: featureAction({ name: "Controlled Demolition", img: restrained.img, uses: { max: 1, recovery: "longRest" }, effects: [restrained], target: { type: "hostile", amount: null } })
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
    primaryWeapon: "Cassetete de Choque", secondaryWeapon: "Luva de Choque", armor: "Jaqueta de Sintcouro"
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
<p><strong>Build Sugerida:</strong> Presença +2, Conhecimento +1, Instinto +1, Agilidade 0, Acuidade 0, Força −1. Equipamento recomendado: Cassetete de Choque (primária, uma mão) + Luva de Choque (secundária) + Jaqueta de Sintcouro — as duas armas usam Presença.</p>`,
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
        flags: { [MODULE_ID]: { rolls: { "Rolar 2d8": { formula: "2d8", flavor: "Contacts Everywhere (2d8) — some à próxima rolagem de dano" } } } },
        actions: {
          ...featureAction({ name: "Contacts Everywhere", img: CPR("gear/radio_communicator"), uses: { max: 1, recovery: "shortRest" }, target: { type: "self", amount: null } }),
          ...featureAction({ name: "Rolar 2d8", img: CPR("default/Default_Dice"), target: { type: "self", amount: null } })
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
<p><strong>Build Sugerida:</strong> Presença +2, Agilidade +1, Acuidade +1, Instinto 0, Conhecimento 0, Força −1. Equipamento recomendado: Cassetete de Choque (primária, uma mão) + Luva de Choque (secundária) + Traje Ícone de Rua — a reputação faz parte do figurino.</p>`,
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
    primaryWeapon: "Carabina de Assalto", secondaryWeapon: null, armor: "Jaqueta de Sintcouro"
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
<p><strong>Build Sugerida:</strong> Agilidade +2, Instinto +1, Acuidade +1, Força 0, Presença 0, Conhecimento −1. Equipamento recomendado: Carabina de Assalto (primária, duas mãos) + Jaqueta de Sintcouro — atirar de longe, de dentro do veículo.</p>`,
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
          flags: { [MODULE_ID]: { rolls: { "Drive Off": { formula: "3d10", flavor: "Drive Off (3d10 físico) — metade se o alvo passar na Rolagem de Reação (16)" } } } },
          actions: featureAction({ name: "Drive Off", img: vulnerable.img, uses: { max: 1, recovery: "longRest" }, effects: [vulnerable] })
        };
      })()]
    },
    {
      name: "Zonebreaker", img: CPR("classes/reclaimer/subclasses/zonebreaker.png"),
      description: `<p><em>Jogue de Zonebreaker se você quiser dominar o terreno, transformar ruínas em armas e deixar o próprio campo de batalha perigoso.</em></p>
<p><strong>Build Sugerida:</strong> Instinto +2, Agilidade +1, Força +1, Acuidade 0, Conhecimento 0, Presença −1. Equipamento recomendado: SMG Compacta (primária, uma mão) + Drone Tático (secundária, de Instinto) + Colete Balístico — ficar dentro da Surveyed Route e segurar a posição.</p>`,
      spellcastingTrait: "instinct",
      suggestedTraits: { agility: 1, strength: 1, finesse: 0, instinct: 2, presence: -1, knowledge: 0 },
      foundation: [{
        name: "Field Salvage", img: CPR("gear/carryall"), form: "action",
        description: "<p>Uma vez por cena, você pode recolher material útil da área ao redor. Escolha uma peça de Field Salvage:</p><ul><li><strong>Patch:</strong> você ou um aliado dentro do alcance Corpo a Corpo limpa um Espaço de Armadura.</li><li><strong>Tool:</strong> você ou um aliado ganha +2 na próxima ação.</li><li><strong>Hazard:</strong> na próxima vez que você causar dano a um adversário dentro da sua Surveyed Route, some 1d6 de dano físico à rolagem de dano.</li></ul><p>O Field Salvage não usado se perde quando você faz um descanso.</p><p><em>Na ficha: \"Field Salvage\" controla o uso da cena; \"Rolar Hazard\" rola o d6.</em></p>",
        flags: { [MODULE_ID]: { rolls: { "Rolar Hazard": { formula: "1d6", flavor: "Field Salvage: Hazard (d6 físico) — some ao dano" } } } },
        actions: {
          ...featureAction({ name: "Field Salvage", img: CPR("gear/carryall"), uses: { max: 1, recovery: "scene" }, target: { type: "self", amount: null } }),
          ...featureAction({ name: "Rolar Hazard", img: CPR("ammo/grenade_incendiary"), target: { type: "self", amount: null } })
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
          flags: { [MODULE_ID]: { rolls: { "Rolar Dead Zone": { formula: "1d8", flavor: "Dead Zone (d8 físico) — some ao dano" } } } },
          actions: {
            ...featureAction({ name: "Dead Zone", img: zone.img, uses: { max: 1, recovery: "longRest" }, effects: [zone], target: { type: "self", amount: null } }),
            ...featureAction({ name: "Rolar Dead Zone", img: CPR("status/radiation_low"), target: { type: "self", amount: null } })
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
    primaryWeapon: "SMG Compacta", secondaryWeapon: "Drone Tático", armor: "Colete Balístico"
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
<p><strong>Build Sugerida:</strong> Instinto +2, Agilidade +1, Conhecimento +1, Acuidade 0, Presença 0, Força −1. Equipamento recomendado: SMG Compacta (primária, uma mão) + Drone Tático (secundária, de Instinto) + Colete Balístico — mobilidade para chegar até quem caiu.</p>`,
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
<p><strong>Build Sugerida:</strong> Conhecimento +2, Acuidade +1, Instinto +1, Agilidade 0, Presença 0, Força −1. Equipamento recomendado: Lançador de Sucata (primária, duas mãos, de Conhecimento) + Jaqueta de Sintcouro — o mesmo atributo para atacar e para os protocolos.</p>`,
      spellcastingTrait: "knowledge",
      suggestedTraits: { agility: 0, strength: -1, finesse: 1, instinct: 1, presence: 0, knowledge: 2 },
      foundation: [{
        name: "Black-Clinic Procedure", img: CPR("gear/generic_street_drugs"), form: "action",
        description: "<p>Quando você usa Emergency Medicine com sucesso numa criatura, pode dar a ela um aprimoramento perigoso além do efeito normal. Escolha um:</p><ul><li>Ela soma 1d8 à próxima rolagem de dano.</li><li>Ela ganha +2 na próxima Rolagem de Agilidade, Força ou Acuidade.</li><li>Ela ganha +2 de Evasão contra o próximo ataque que a tiver como alvo.</li></ul><p>Depois que a rolagem ou efeito aprimorado se resolver, ela marca 1 Estresse.</p><p><em>Na ficha: \"Rolar 1d8\" rola o dano extra da primeira opção.</em></p>",
        flags: { [MODULE_ID]: { rolls: { "Rolar 1d8": { formula: "1d8", flavor: "Black-Clinic Procedure (d8) — some à rolagem de dano; depois, o alvo marca 1 Estresse" } } } },
        actions: featureAction({ name: "Rolar 1d8", img: CPR("gear/generic_street_drugs"), target: { type: "self", amount: null } })
      }],
      specialization: [{
        name: "Bad Medicine", img: CPR("gear/vial_poison"), form: "action",
        description: "<p>Uma vez por descanso, quando você tem sucesso com uma carta de Medtech, ataque com arma ou Rolagem de Interface contra um adversário dentro do alcance Próximo, pode virar o seu conhecimento médico contra ele.</p><p>O alvo marca 1 Estresse. Na próxima vez que esse alvo causar dano, reduza o dano em 1 Ponto de Vida.</p>",
        actions: featureAction({ name: "Bad Medicine", img: CPR("gear/vial_poison"), uses: { max: 1, recovery: "shortRest" }, target: { type: "hostile", amount: 1 } })
      }],
      mastery: [{
        name: "Miracle Cocktail", img: CPR("dlc/gear/distilling_compound"), form: "action",
        description: "<p>Uma vez por descanso longo, quando você usa Emergency Medicine com sucesso numa criatura, pode inundar o corpo dela com estabilizantes ilegais, drogas de combate, bloqueadores nervosos ou comandos de emergência de cyberware.</p><p>Além dos benefícios normais da Emergency Medicine, o alvo pode se mover imediatamente dentro do alcance Próximo e fazer uma rolagem de ação com vantagem. Se essa ação causar dano, some 2d8 à rolagem de dano.</p><p><em>Na ficha: a ação controla o uso e rola os 2d8.</em></p>",
        flags: { [MODULE_ID]: { rolls: { "Miracle Cocktail": { formula: "2d8", flavor: "Miracle Cocktail (2d8) — some à rolagem de dano da ação com vantagem" } } } },
        actions: featureAction({ name: "Miracle Cocktail", img: CPR("dlc/gear/distilling_compound"), uses: { max: 1, recovery: "longRest" }, target: { type: "friendly", amount: 1 } })
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
    action.name = actionNames[action.name] ?? (multiple ? OFFICIAL_ACTION_NAMES[action.name] ?? action.name : cardName);
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
  { id: "medtech", label: "Medtech", src: ICON("competency-medtech"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/splendor.png", cards: MEDTECH_CARDS }
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
  for (const competency of COMPETENCIES) {
    const top = await makeFolder(pack, competency.label);
    const levelFolders = {};
    for (const level of [...new Set(competency.cards.map(c => c.level))].sort((a, b) => a - b)) {
      levelFolders[level] = await makeFolder(pack, `Nível ${level}`, { parent: top.id });
    }
    const data = competency.cards.map(card => {
      let c = card;
      if (card.clone) {
        const official = officialCards.find(o => o.name === card.clone);
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

// ---------- Adversário de exemplo: Neon Claw Ganger ----------

function buildFeatureAction({ name, img, actionType, costFear, formula }) {
  const id = foundry.utils.randomID();
  return {
    [id]: {
      type: formula ? "damage" : "effect",
      _id: id,
      systemPath: "actions",
      description: "",
      chatDisplay: !!formula,
      actionType,
      cost: costFear ? [{ scalable: false, key: "fear", value: costFear, step: null, consumeOnSuccess: false, itemId: null }] : [],
      uses: { value: null, max: null, recovery: null, consumeOnSuccess: false },
      effects: [],
      target: { type: "any", amount: null },
      name,
      img,
      range: "",
      baseAction: false,
      originItem: { type: "itemCollection" },
      triggers: [],
      areas: [],
      ...(formula ? {
        damage: {
          main: {
            value: { custom: { enabled: true, formula }, multiplier: "flat", flatMultiplier: 1, dice: "d6", bonus: null },
            applyTo: "hitPoints", type: ["physical"], base: false, resultBased: false,
            valueAlt: null, includeBase: false, direct: false, fullRestore: false, itemId: null
          },
          resources: {}
        },
        roll: { type: "attack", trait: null, difficulty: null, bonus: null, advState: "neutral", diceRolling: { multiplier: "prof", flatMultiplier: 1, dice: "d6", compare: null, treshold: null }, useDefault: false },
        save: { trait: null, difficulty: null, damageMod: "none" }
      } : {})
    }
  };
}

async function importAdversaryExample() {
  const pack = await getOrCreatePack("adversaries");
  const tier1Folder = await makeFolder(pack, "Nível 1", { type: "Actor" });

  const data = {
    name: "Marginal da Garra de Néon",
    img: CPR("default/Default_Mook"),
    type: "adversary",
    folder: tier1Folder.id,
    system: {
      difficulty: 10,
      damageThresholds: { major: 0, severe: 0 },
      resources: { hitPoints: { value: 0, max: 1 }, stress: { value: 0, max: 1 } },
      motivesAndTactics: "Atacar em bando, intimidar, proteger o território",
      resistance: {
        physical: { resistance: false, immunity: false, reduction: 0 },
        magical: { resistance: false, immunity: false, reduction: 0 }
      },
      type: "minion",
      notes: "",
      experiences: { edgeheart01: { name: "Violência de Rua", value: 1, description: "" } },
      tier: 1,
      description: "<p>Um marginal barulhento com cromo barato, cores vivas, e algo a provar.</p>",
      attack: {
        name: "Lâmina de Rua",
        range: "melee",
        roll: {
          bonus: "-2", type: "attack", trait: null, difficulty: null, advState: "neutral",
          diceRolling: { multiplier: "prof", flatMultiplier: 1, dice: "d20", compare: null, treshold: null },
          useDefault: false
        },
        damage: {
          main: {
            value: { custom: { enabled: true, formula: "3" }, dice: "d6", bonus: null, multiplier: "flat", flatMultiplier: 1 },
            applyTo: "hitPoints", type: ["physical"], resultBased: false,
            valueAlt: { multiplier: "prof", flatMultiplier: 1, dice: "d6", bonus: null, custom: { enabled: false, formula: "" } },
            base: false, includeBase: false, direct: false, fullRestore: false, itemId: null
          },
          resources: {}
        },
        systemPath: "actions", type: "attack", description: "", chatDisplay: false,
        actionType: "action", cost: [], uses: { value: null, max: null, recovery: null, consumeOnSuccess: false },
        target: { type: "any", amount: 1 }, effects: [], save: { trait: null, difficulty: null, damageMod: "none" },
        baseAction: false, originItem: { type: "itemCollection" }, triggers: [], areas: []
      },
      attribution: { source: "Edgeheart (homebrew)", page: null, artist: "" },
      size: "medium",
      advantageSources: [], disadvantageSources: [], criticalThreshold: 20, typeData: null
    },
    items: [
      {
        name: "Lacaio", type: "feature", img: CPR("status/knockout"),
        system: {
          description: "<p>Este adversário é derrotado ao sofrer qualquer dano.</p>",
          resource: null, actions: {}, attribution: {}, gmNotes: "",
          featureForm: "passive", granter: null, actorResources: []
        }
      },
      {
        name: "Demonstração de Força", type: "feature", img: CPR("dlc/cyberware/cybermatrix_gang_jazzler"),
        system: {
          description: "<p>Quando outro aliado de gangue dentro do alcance Próximo causa dano, este Marginal pode imediatamente se mover para dentro do alcance Muito Próximo do alvo atingido.</p>",
          resource: null, actions: {}, attribution: {}, gmNotes: "",
          featureForm: "reaction", granter: null, actorResources: []
        }
      }
    ]
  };

  await Actor.createDocuments([data], { pack: pack.collection });
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
    const w = buildWeaponData([def.name, def.weapon.trait, def.weapon.range, def.weapon.damage, "One-Handed", ""]);
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
// stableId(CHAVE), para linkar itens importados: @UUID[Compendium.world.edgeheart-classes.Item.{{id:runner:class}}]{Runner}.

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
        + `<td>@UUID[Compendium.world.${PACKS.cyberware.name}.Item.${stableId(`cyberware:${def.n}`)}]{${def.name}}</td>`
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
    `<h3>@UUID[Compendium.world.${PACKS.domains.name}.Item.${cardId(id, card.name)}]{${card.name}}</h3>`
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

async function resetPacks() {
  for (const key of Object.keys(PACKS)) {
    const id = `${PACK_SCOPE}.${PACKS[key].name}`;
    const pack = game.packs.get(id);
    if (pack) {
      try {
        await pack.deleteCompendium();
        console.log(`Edgeheart | Compêndio ${id} apagado pra recriar do zero.`);
      } catch (err) {
        console.warn(`Edgeheart | Não consegui apagar ${id}, vou reusar como está.`, err);
      }
    }
  }
}

async function importEdgeheartCore() {
  if (!game.user.isGM) {
    ui.notifications.warn("Apenas o GM pode importar o conteúdo do Edgeheart.");
    return;
  }
  ui.notifications.info("Edgeheart: importando... isso pode levar alguns segundos.");
  await resetPacks();
  const equipment = await importWeaponsAndArmor();
  await importClassesAndSubclasses(equipment);
  await importLifePathsAndAffiliations();
  await importDomainCards();
  await importCyberware();
  await importAdversaryExample();
  await importJournals();
  ui.notifications.info("Edgeheart: importação concluída! Confira os compêndios Edgeheart: Classes, Subclasses, Trajetórias, Afiliações, Armas, Armaduras, Cartas de Competência, Cyberware, Adversários e Diários.");
  console.log("Edgeheart | Importação concluída.");
}

async function ensureMacro() {
  if (!game.user.isGM) return;
  const name = "Importar Edgeheart (Núcleo)";
  let macro = game.macros.find(m => m.name === name && m.getFlag(MODULE_ID, "core"));
  const img = CPR("default/Default_Cyberware");
  if (macro) {
    if (macro.img !== img) await macro.update({ img });
    return;
  }
  macro = await Macro.create({
    name, type: "script", img,
    command: `game.modules.get("${MODULE_ID}").api.importEdgeheartCore();`,
    flags: { [MODULE_ID]: { core: true } }
  });
  await game.user.assignHotbarMacro(macro, null); // null = primeiro espaço livre
  ui.notifications.info('Edgeheart: macro "Importar Edgeheart (Núcleo)" criada na barra de macros.');
}

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { ...(mod.api ?? {}), importEdgeheartCore };
  ensureMacro();
  // Nome/ícone das Competências já registradas se atualizam sem precisar reimportar.
  if (game.user === game.users.activeGM && game.settings.get("daggerheart", "Homebrew")?.domains?.network) ensureHomebrewDomains();
});
