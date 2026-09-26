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

// Classes importadas, na ordem em que aparecem nos compêndios.
const CLASSES = [RUNNER, SOLO, WARDEN];

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
function buildCardAction({
  actionType = "action", difficulty = null, damageStr = null, scaleDamage = null,
  range = null, targetType = "hostile", targetAmount = null, cost = [], uses = null,
  save = null, name = null, damageFormula = null
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
    img: "icons/skills/trades/academics-merchant-scribe.webp",
    baseAction: true,
    systemPath: "actions",
    type: "attack",
    range: range ? (RANGE_MAP[range] || "melee") : "",
    target: { type: targetType, amount: targetAmount },
    roll: {
      trait: null,
      type: "spellcast",
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
    effects: [],
    save: save ?? { trait: null, difficulty: null, damageMod: "none" },
    originItem: { type: "itemCollection" },
    triggers: [],
    areas: []
  };
}

// O _id de cada carta é stableId(`card:<domínio>:<nome>`) (ver importDomainCards).
const cardId = (domain, name) => stableId(`card:${domain}:${name}`);

// Custo "resource" (gastar marcadores da própria carta): o sistema só confere se cost.itemId
// está preenchido e sempre usa o item dono da ação (CostField.getItemIdCostResource).
const SIGNAL_BURST_ID = cardId("network", "Signal Burst");

const NETWORK_CARDS = [
  { name: "Personal Firewall", img: CPR("programs/shield"), level: 1, recallCost: 0, type: "spell", description: "<p>Você tem um dispositivo criptografado que pode ser carregado com um firewall defensivo e segurado por você ou um aliado. Descreva o que é e por que ele importa para você.</p><p>Quem segura o firewall pode gastar 1 Esperança para reduzir o dano techno recebido em 1d12. Se o resultado do Dado do Firewall for 12, o firewall queima depois de reduzir o dano neste turno. Ele pode ser recarregado de graça no seu próximo descanso.</p>" },
  { name: "Signal Burst", img: CPR("programs/hellbolt"), level: 1, recallCost: 1, type: "spell", description: "<p>No início de uma sessão, coloque marcadores iguais ao seu atributo de Interface nesta carta.</p><p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Distante e gaste qualquer número de marcadores para liberar uma explosão concentrada de código instável, ruído de sinal, ou feedback armado contra ele. Em um sucesso, role um número de d10 igual aos marcadores gastos e cause essa quantidade de dano techno ao alvo.</p><p>Marque 1 Estresse para reabastecer esta carta com marcadores, até o seu atributo de Interface. No fim de cada sessão, limpe todos os marcadores não usados.</p>",
    resource: { type: "simple", value: 0, max: "@cast", icon: CPR("programs/hellbolt"), recovery: "session", progression: "decreasing" },
    action: buildCardAction({
      range: "Far", targetType: "hostile", targetAmount: 1,
      scaleDamage: { dice: "d10", dmgType: "magical" },
      cost: [{ key: "resource", itemId: SIGNAL_BURST_ID, value: 1, scalable: true, step: 1, consumeOnSuccess: false }]
    }) },
  { name: "Threat Prediction", img: CPR("cyberware/sensor_array"), level: 1, recallCost: 1, type: "ability", description: "<p>Seu software de predição analisa constantemente movimentos hostis ao seu redor. Ganhe um bônus na sua Evasão igual à metade do seu atributo de Interface.</p>",
    effects: [{
      name: "Threat Prediction",
      img: CPR("cyberware/sensor_array"),
      description: "<p>Ganhe um bônus na sua Evasão igual à metade do seu atributo de Interface.</p>",
      transfer: true,
      type: "base",
      system: {
        // O DhActiveEffect do sistema avalia fórmulas com @ contra actor.getRollData().
        // @cast = system.spellcastModifier (atributo de spellcast da subclasse ativa).
        // Não usar @system.spellcastModifier: é um getter e não entra no rollData.
        changes: [{ key: "system.evasion", type: "add", value: "floor(@cast / 2)", priority: null, phase: "initial" }],
        duration: { description: "" },
        rangeDependence: null, stacking: null, targetDispositions: [], conditionals: []
      },
      duration: { value: null, units: "seconds", expiry: null, expired: false },
      tint: "#ffffff", statuses: [], disabled: false
    }]
  },
  { name: "Thermal Hijack", img: CPR("programs/efreet"), level: 2, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra um alvo dentro do alcance Corpo a Corpo. Em um sucesso, você força as portas de implante dele a superaquecerem violentamente. Ele sofre 1d20+3 de dano techno e fica Overheated.</p><p>Quando uma criatura age enquanto Overheated, ela deve sofrer 2d6 de dano techno extra se ainda estiver Overheated no fim de sua ação.</p>",
    action: buildCardAction({ range: "Melee", damageStr: "1d20+3 tech", targetType: "hostile", targetAmount: 1 }) },
  { name: "Ghost Ping", img: CPR("blackice/src/wisp"), level: 2, recallCost: 0, type: "spell", description: "<p>Gaste 1 Esperança para liberar uma aranha de sinal oculta em uma rede que você pode mover para qualquer lugar dentro do alcance Muito Distante.</p><p>Enquanto este protocolo estiver ativo, você pode ver ou ouvir através de um dispositivo ou feed conectado dentro dessa rede como se estivesse lá. Você pode alternar livremente entre usar seus próprios sentidos e ver através da aranha.</p><p>Se a rede for cortada, purgada, ficar totalmente offline, ou for protegida por um sistema hostil mais forte, este protocolo termina.</p>",
    actions: featureAction({ name: "Ghost Ping", img: CPR("blackice/src/wisp"), costs: [{ key: "hope", value: 1 }] }) },
  { name: "Countermeasure", img: CPR("programs/eraser"), level: 3, recallCost: 2, type: "spell", description: "<p>Você pode interromper um efeito tecnológico ou digital em andamento fazendo uma Rolagem de Reação usando seu atributo de Interface. Em um sucesso, o efeito para e quaisquer consequências são evitadas, e esta carta é colocada no seu cofre.</p>",
    action: buildCardAction({ actionType: "reaction", targetType: "any" }) },
  { name: "Shared Feed", img: CPR("netrunning/Control_Node.png"), level: 3, recallCost: 1, type: "ability", description: "<p>Quando você Ajuda um Aliado, ele pode gastar 1 Esperança para adicionar uma de suas Experiências à rolagem dele junto com seu dado de vantagem.</p><p>Ao fazer uma Rolagem em Dupla, você pode rolar um d20 como seu Dado de Esperança.</p>" },
  { name: "Perceptual Spyware", img: CPR("cyberware/cybereye"), level: 4, recallCost: 1, type: "spell", description: "<p>Escolha um alvo dentro do alcance Muito Distante. Você pode ver através dos olhos dele e ouvir através dos ouvidos dele por meio de um feed sensorial invadido, ponte neural, implante de vigilância, ou parasita de sinal. Você pode alternar livremente entre seus próprios sentidos ou os do alvo até rodar outro protocolo ou até seu próximo descanso.</p>" },
  { name: "Defensive Protocols", img: CPR("programs/armor"), level: 4, recallCost: 2, type: "spell", description: "<p><strong>Arc-Deflection:</strong> Uma vez por descanso longo, gaste 1 Esperança para anular o dano de um ataque que te atinja ou atinja um aliado dentro do alcance Muito Próximo.</p><p><strong>Routine Lock:</strong> Escolha um objeto dentro do alcance Distante. A rotina de operação daquele objeto é interrompida exatamente onde está até seu próximo descanso. Se uma criatura tentar reativá-lo, faça uma Rolagem de Interface contra ela para manter este protocolo.</p><p><strong>Fire-Wall:</strong> Faça uma Rolagem de Interface (15). Em um sucesso, crie uma parede de sinal hostil, plasma em chamas, código de luz sólida, ou supressão automatizada entre dois pontos dentro do alcance Distante. Todas as criaturas em seu caminho devem escolher um lado, e qualquer coisa que atravesse a parede depois sofre 4d10+3 de dano techno.</p>",
    action: buildCardAction({ difficulty: 15, range: "Far", targetType: "hostile" }) },
  { name: "Predictive Algorithm", img: CPR("status/timewarp"), level: 5, recallCost: 2, type: "spell", description: "<p>Você pode rodar modelos preditivos para vislumbrar as consequências mais prováveis de suas ações. Uma vez por descanso longo, imediatamente depois que o mestre transmitir as consequências de uma rolagem que você fez, você pode desfazer a ação e as consequências como se nunca tivessem acontecido e fazer outra ação.</p>" },
  { name: "Viral Cascade", img: CPR("programs/worm"), level: 5, recallCost: 1, type: "spell", description: "<p>Marque 2 Estresse para fazer uma Rolagem de Interface, desencadeando um ataque autorreplicante em todos os alvos dentro do alcance Próximo. Alvos contra os quais você tem sucesso devem fazer uma Rolagem de Reação com Dificuldade igual ao resultado da sua Rolagem de Interface. Alvos que falharem sofrem 2d8+4 de dano techno.</p><p>Adversários adicionais ainda não alvejados pela Viral Cascade e dentro do alcance Próximo de alvos anteriores que sofreram dano também devem fazer a Rolagem de Reação. Alvos que falharem sofrem 2d8+4 de dano techno. Essa corrente continua até não haver mais adversários dentro do alcance.</p>",
    // Mesmo formato do Chain Lightning oficial: save com difficulty null = Dificuldade igual ao
    // resultado da sua rolagem. O PDF não diz o atributo da Reação; Agility = o do original.
    action: buildCardAction({
      range: "Close", targetType: "hostile", damageStr: "2d8+4 tech",
      cost: [{ key: "stress", value: 2 }],
      save: { trait: "agility", difficulty: null, damageMod: "none" }
    }) },
  { name: "Deep Trace", img: CPR("cyberware/homing_tracer"), level: 6, recallCost: 0, type: "spell", description: "<p>Você pode abrir um canal de sinal com qualquer pessoa com quem já tenha feito contato. Depois de abrir um canal com ela, ela pode responder na sua mente, comunicador ou feed neural.</p><p>Além disso, você pode marcar 1 Estresse para fazer uma Rolagem de Interface contra ela. Em um sucesso, você recebe a resposta de uma destas perguntas:</p><ol><li>Onde ela está?</li><li>O que ela está fazendo?</li><li>Do que ela tem medo?</li><li>O que ela mais valoriza?</li></ol>",
    action: buildCardAction({ targetType: "any", targetAmount: 1, cost: [{ key: "stress", value: 1 }] }) },
  { name: "Retaliation Daemon", img: CPR("default/default-demon"), level: 6, recallCost: 2, type: "spell", description: "<p>Marque um adversário dentro do alcance Próximo com um daemon. O mestre ganha 1 Medo.</p><p>Quando o adversário marcado causar dano a você ou a seus aliados, coloque um d8 nesta carta. Você pode guardar um número de d8 igual ao seu nível.</p><p>Quando você acertar o adversário marcado, role os dados desta carta e some ao seu dano, depois limpe os dados.</p><p>Este efeito termina quando o adversário marcado é derrotado ou quando você roda o Retaliation Daemon de novo.</p>" },
  { name: "Optical Scrambler", img: CPR("status/hidden"), level: 7, recallCost: 2, type: "spell", description: "<p>Quando você tem sucesso em uma Rolagem de Interface para rodar um protocolo diferente, você pode gastar 1 Esperança para ficar Cloaked.</p><p>Enquanto Cloaked, você permanece sem ser visto se estiver parado quando alguém se mover para onde poderia te ver. Quando você se move para dentro ou dentro da linha de visão de um adversário, ou faz um ataque, você deixa de estar Cloaked.</p>",
    actions: featureAction({ name: "Ficar Cloaked", img: CPR("status/hidden"), costs: [{ key: "hope", value: 1 }] }) },
  { name: "Network-Synced", img: CPR("default/Default_Net_Architecture"), level: 7, recallCost: 2, type: "ability", description: "<p>Quando 4 ou mais cartas de domínio no seu loadout forem da Competência Network, ganhe o seguinte:</p><ul><li>+1 de bônus nas suas Rolagens de Interface.</li><li>Uma vez por descanso, você pode trocar os resultados dos seus Dados de Esperança e Medo.</li></ul>",
    actions: featureAction({ name: "Trocar Esperança e Medo", img: CPR("default/Default_Net_Architecture"), uses: { max: 1, recovery: "shortRest" } }) },
  { name: "Mirror Stack", img: CPR("cyberware/plastic_covering"), level: 8, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface (14). Uma vez por descanso longo, em um sucesso, você cria uma pilha de perfis de mira falsos, fantasmas de RA, ecos de sinal, loops de movimento ou dados de mira falsos sobre seu corpo, que tornam difícil dizer exatamente onde você está.</p><p>Marque qualquer quantidade de Estresse para criar essa mesma quantidade de camadas adicionais.</p><p>Quando um adversário faz um ataque contra você, role um número de d6 igual ao número de camadas ativas. Se algum resultado for 5 ou mais, uma camada do loop de iscas é destruída e o ataque falha. Se todos os resultados forem 4 ou menos, você sofre o dano e este protocolo termina.</p>",
    action: buildCardAction({ difficulty: 14, targetType: "self", uses: { max: 1, recovery: "longRest", onSuccess: true } }) },
  { name: "Signal Rebound", img: CPR("cyberware/hardend_shielding"), level: 8, recallCost: 1, type: "spell", description: "<p>Quando você fosse sofrer dano techno, você pode gastar qualquer quantidade de Esperança para rolar essa mesma quantidade de d6. Se algum resultado for 6, o ataque é refletido de volta ao atacante, causando o dano a ele em vez de a você.</p>" },
  { name: "Remote Trojan", img: CPR("programs/imp"), level: 9, recallCost: 0, type: "spell", description: "<p>Uma vez por descanso, faça uma Rolagem de Interface (15). Em um sucesso, você entra em um spyware remoto que te permite ver e ouvir claramente qualquer lugar onde você já esteve, como se estivesse lá neste momento.</p><p>Você pode se mover livremente neste spyware e não está limitado pela física ou pelos impedimentos de um corpo físico. Este protocolo não pode ser detectado por meios mundanos ou tecnológicos. Você sai deste feed ao sofrer dano ou ao rodar outro protocolo.</p>",
    action: buildCardAction({ difficulty: 15, targetType: "self", uses: { max: 1, recovery: "shortRest" } }) },
  { name: "Hard Shutdown", img: CPR("status/emp"), level: 9, recallCost: 2, type: "spell", description: "<p>Faça uma Rolagem de Interface (16). Uma vez por descanso, em um sucesso, todos os alvos dentro do alcance Muito Distante fazem uma Rolagem de Reação (18). Alvos que falharem sofrem 3d10+8 de dano techno e ficam temporariamente Vulneráveis. Alvos que tiverem sucesso sofrem metade do dano.</p><p>Além disso, quando você tem sucesso na Rolagem de Interface, todo o terreno dentro do alcance Muito Distante fica Offline. Enquanto dentro de uma área Offline, os alvos não podem gastar Medo, e rolagens com Medo não geram Medo para o mestre.</p>",
    // Mesmo formato do Earthquake oficial (Reação 18, metade do dano no sucesso).
    action: buildCardAction({
      difficulty: 16, range: "Very Far", targetType: "hostile", damageStr: "3d10+8 tech",
      uses: { max: 1, recovery: "shortRest", onSuccess: true },
      save: { trait: "agility", difficulty: 18, damageMod: "half" }
    }) },
  { name: "Botnet Cataclysm", img: CPR("blackice/src/dragon"), level: 10, recallCost: 1, type: "spell", description: "<p>Faça uma Rolagem de Interface contra todos os adversários dentro do alcance Distante. Marque qualquer quantidade de Estresse para acordar cada processo comprometido, credencial roubada, vírus antigo, dispositivo sequestrado, servidor corrompido, conta morta e daemon adormecido que você plantou na rede local.</p><p>Alvos contra os quais você tiver sucesso sofrem 1d20+2 de dano físico para cada Estresse marcado.</p><p>Em um sucesso com Esperança, escolha um alvo afetado. Ele também fica bloqueado de todo sistema conectado, modo de arma, link de drone, talento de cyberware ou efeito de suporte tático até o próximo Holofote dele.</p>",
    action: buildCardAction({
      range: "Far", targetType: "hostile",
      cost: [{ key: "stress", value: 1, scalable: true, step: 1 }],
      damageFormula: { formula: "(@scale)d20 + 2 * @scale", dmgType: "physical" }
    }) },
  { name: "Probability Rewrite", img: CPR("default/Default_Dice"), level: 10, recallCost: 1, type: "spell", description: "<p>Depois que você ou um aliado voluntário fizer qualquer rolagem, você pode gastar 5 Esperança para reescrever o resultado por meio de modelagem preditiva, despiste tático e intervenção perfeitamente cronometrada, mudando o resultado numérico dessa rolagem para um resultado à sua escolha.</p><p>O resultado precisa ser plausível dentro do alcance dos dados.</p>",
    actions: featureAction({ name: "Reescrever Resultado", img: CPR("default/Default_Dice"), actionType: "reaction", costs: [{ key: "hope", value: 5 }] }) }
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

// Nomes em português para as ações/efeitos copiados das cartas oficiais.
const OFFICIAL_ACTION_NAMES = {
  "Mark Stress": "Marcar Estresse", "Spend Hope": "Gastar Esperança", "Avoid Condition": "Evitar Condição",
  "Critically Succeed": "Sucesso Crítico", "Repair Armor": "Consertar Armadura", "Clear Stress": "Limpar Estresse",
  "Roll d6": "Rolar d6", "Clear Armor": "Limpar Armadura", "Strike Ground": "Golpear o Chão",
  "Restrain": "Imobilizar", "Pull into Chokehold": "Imobilizar", "Damage": "Dano Extra",
  "Spend a Hope": "Gastar Esperança", "Mark a Stress": "Marcar Estresse", "Gain 3 Hope": "Ganhar 3 Esperança",
  "Avoid": "Evitar o Ataque", "Focus": "Focar", "Clear 1 HP": "Limpar 1 PV", "Clear 1 Armor Slot": "Limpar 1 Espaço de Armadura",
  "Deal 1 HP Damage": "Alvo marca 1 PV", "Apply Effect": "Aplicar Benefícios", "Clear Stress & Gain Hope": "Limpar Estresse e Ganhar Esperança",
  "Gain Hope": "Ganhar Esperança"
};
const OFFICIAL_EFFECT_NAMES = {
  "Forcefully Pushed": "Empurrado", "Chokehold": "Imobilizado",
  "Vitality (HP)": "Combat Conditioning (PV)", "Vitality (Stress)": "Combat Conditioning (Estresse)",
  "Vitality (Thresholds)": "Combat Conditioning (Limiares)", "Rage Up (2)": "Overpressure (2x)"
};

// Copia ações, efeitos e recurso de uma carta oficial. A chave de cada ação continua igual ao
// _id dela e os _id dos efeitos são mantidos, porque as ações apontam para eles.
function cloneOfficialCard(official, cardName, img) {
  const src = official._source;
  const actions = foundry.utils.deepClone(src.system.actions ?? {});
  for (const action of Object.values(actions)) {
    action.name = OFFICIAL_ACTION_NAMES[action.name] ?? cardName;
    action.description = "";
    if (img) action.img = img;
  }
  const effects = foundry.utils.deepClone(src.effects ?? []).map(effect => {
    delete effect._stats;
    return { ...effect, name: OFFICIAL_EFFECT_NAMES[effect.name] ?? cardName, img: img ?? effect.img, description: "", origin: null };
  });
  // domainTouched (ex: Valor-Touched = 4): o sistema só ativa os efeitos com 4+ cartas do domínio
  // da própria carta no loadout, então vale para a Égide automaticamente.
  return { actions, effects, resource: foundry.utils.deepClone(src.system.resource ?? null), domainTouched: src.system.domainTouched ?? null };
}

// Competências (domínios homebrew). Para adicionar uma, registre aqui com as cartas dela;
// importDomainCards registra o domínio no Homebrew do sistema e cria as cartas.
const COMPETENCIES = [
  { id: "network", label: "Network", src: ICON("competency-network"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/blade.png", cards: NETWORK_CARDS },
  { id: "aegis", label: "Aegis", src: ICON("competency-aegis"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/valor.png", cards: AEGIS_CARDS },
  { id: "assault", label: "Assault", src: ICON("competency-assault"), cardImg: "systems/daggerheart/assets/icons/domains/domain-card/blade.png", cards: ASSAULT_CARDS }
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
        if (official) c = { ...card, ...cloneOfficialCard(official, card.name, card.img) };
        else console.warn(`Edgeheart | Carta oficial "${card.clone}" não encontrada; ${card.name} fica só com texto.`);
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
    + `<p><em>Nível ${card.level} · ${card.type === "spell" ? "Protocol" : "Ability"} · Custo de Recordação ${card.recallCost}</em></p>`
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
