// Passo final do gerador (buildPacks): deixa os compêndios em inglês e escreve a tradução pt-BR para o
// Babele em babele/pt-BR/<compêndio>.json. O conteúdo é escrito em português no main.js; aqui:
// - os nomes seguem data/glossary-pt-BR.json (inglês na base, português na tradução);
// - os textos em inglês vêm de data/content-en.json quando já existem; senão a base fica com o texto
//   português como marcador provisório;
// - a tradução recebe o texto português com os termos do glossário aplicados (Kill Chain → Cadeia de
//   Abate etc.). Nomes de classe e subclasse nunca são trocados.
// As automações não dependem dos nomes (flags.actionIds, gravado antes deste passo).
import { ITEM_MAPPING, ACTOR_MAPPING } from "./edgeheart-babele.js";

const MODULE_ID = "edgeheart-cyberpunk";
const OUT_DIR = `modules/${MODULE_ID}/babele/pt-BR`;

// Pastas dos compêndios: nome em português no gerador → nome em inglês na base.
const FOLDER_EN = {
  "Armas Primárias": "Primary Weapons", "Armas Físicas": "Physical Weapons", "Armas Tech": "Tech Weapons",
  "Armas Secundárias": "Secondary Weapons", "Veículos": "Vehicles", "Talentos de Trajetória": "Life Path Features",
  "Talentos de Afiliação": "Affiliation Features", "Talentos de Subclasse": "Subclass Features", "Itens de Classe": "Class Items",
  "Talentos de Classe": "Class Features", "Fundação": "Foundation", "Especialização": "Specialization", "Maestria": "Mastery",
  "Eidolons (Cyberware Especial)": "Eidolons (Special Cyberware)"
};
const RARITY_EN = { "Comum": "Common", "Incomum": "Uncommon", "Raro": "Rare", "Lendário": "Legendary" };

function folderNames(name, term) {
  if (FOLDER_EN[name]) return { en: FOLDER_EN[name], pt: term(name) };
  let m = name.match(/^Nível (\d+)$/);
  if (m) return { en: `Level ${m[1]}`, pt: name };
  m = name.match(/^Tier (\d+) — (.+)$/);
  if (m && RARITY_EN[m[2]]) return { en: `Tier ${m[1]} — ${RARITY_EN[m[2]]}`, pt: name };
  return { en: name, pt: term(name) };
}

// ---------- Glossário ----------

function readGlossary(glossary) {
  const enToPt = new Map();
  const pairs = [];
  const add = (en, pt) => {
    if (!enToPt.has(en)) enToPt.set(en, pt);
    // Chaves de termo podem ter anotação ("Cover (Infiltrator)") ou singular/plural ("Charge / Charges").
    const enForms = en.replace(/\s*\([^)]*\)\s*$/, "").split(" / ");
    const ptForms = pt.split(" / ");
    enForms.forEach((form, i) => pairs.push([form.trim(), (ptForms[i] ?? ptForms[0]).trim()]));
  };
  for (const section of Object.values(glossary.sections)) {
    for (const [en, pt] of Object.entries(section.entries ?? {})) add(en, pt);
    for (const group of Object.values(section.groups ?? {})) for (const [en, pt] of Object.entries(group)) add(en, pt);
  }
  const ptToEn = new Map();
  for (const [en, pt] of enToPt) if (!ptToEn.has(pt)) ptToEn.set(pt, en);
  return { enToPt, ptToEn, pairs };
}

// Troca os termos em inglês que o texto português ainda usa, numa passada só com o nome mais longo
// primeiro. Nomes protegidos (classes, subclasses) entram trocando por eles mesmos: assim "Breach
// Specialist" não vira "Brecha Specialist", e "Street Icon Fit" ainda vira "Traje Ícone de Rua".
function makeTermReplacer(pairs, protectedNames, extraPairs) {
  const map = new Map();
  for (const name of protectedNames) map.set(name, name);
  for (const [en, pt] of [...extraPairs, ...pairs]) if (en && pt && en !== pt && !map.has(en)) map.set(en, pt);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alternation = [...map.keys()].sort((a, b) => b.length - a.length).map(escape).join("|");
  const re = new RegExp(`(?<![\\p{L}\\p{N}-])(${alternation})(?![\\p{L}\\p{N}-])`, "gu");
  return text => (typeof text === "string" && text ? text.replace(re, m => map.get(m)) : text);
}

// ---------- Tradução de um documento ----------

function createContext(glossary, protectedNames, extraNames, contentEn) {
  const { enToPt, ptToEn, pairs } = readGlossary(glossary);
  // Nomes em português que mudaram no glossário (ex: "Córtex Black ICE" → "Córtex de GELO Negro").
  const legacy = new Map(Object.entries(glossary.legacyPt ?? {}));
  // Nomes que ficam iguais de propósito (codinomes de Eidolon).
  for (const name of glossary.keep ?? []) protectedNames.add(name);
  const extra = [
    ["techno", "tecno"], ["Techno", "Tecno"], ["Minion", "Lacaio"], ["Horde", "Horda"], ["ICE", "GELO"],
    ...[...legacy].map(([oldPt, en]) => [oldPt, enToPt.get(en) ?? oldPt])
  ];
  const term = makeTermReplacer(pairs, protectedNames, extra);
  const unknown = new Set();
  // Entrada de content-en.json de um documento, pelo nome dele em inglês.
  const contentFor = (pack, name) => contentEn?.[pack.metadata.name]?.[names(name, { track: false }).en] ?? {};
  // Nomes de ação e efeito que se repetem em vários itens ("Bolt Gun: Imobilizado"): content-en.json "_names".
  const globalName = name => contentEn?._names?.[name] ?? name;

  const names = (name, { track = true } = {}) => {
    if (extraNames.has(name)) return { en: extraNames.get(name).en, pt: extraNames.get(name).pt };
    if (enToPt.has(name)) return { en: name, pt: enToPt.get(name) };
    if (ptToEn.has(name)) return { en: ptToEn.get(name), pt: name };
    if (legacy.has(name)) { const en = legacy.get(name); return { en, pt: enToPt.get(en) ?? name }; }
    const frame = name.match(/^Estrutura: (.+)$/);
    if (frame) return { en: `Frame: ${frame[1]}`, pt: name };
    if (track && !protectedNames.has(name)) unknown.add(name);
    return { en: name, pt: term(name) };
  };
  return { term, names, unknown, contentEn, contentFor, globalName };
}

// Ações: a base fica com o nome do glossário (ou o de origem) e, se houver, o nome e a descrição em
// inglês de content-en.json (chave: esse nome da base). A tradução leva o português com os termos aplicados.
function translateActions(ctx, actions, en = {}) {
  const base = {};
  const pt = {};
  for (const action of actions ?? []) {
    const src = action.name ?? "";
    const known = ctx.names(src, { track: false });
    const override = en?.[known.en] ?? {};
    const enName = override.name ?? ctx.globalName(known.en);
    if (enName !== src) base[`system.actions.${action.id}.name`] = enName;
    if (override.description) base[`system.actions.${action.id}.description`] = override.description;
    const entry = {};
    const ptName = known.pt !== known.en ? known.pt : ctx.term(src);
    if (ptName !== enName) entry.name = ptName;
    if (action.description) entry.description = ctx.term(action.description);
    if (Object.keys(entry).length) pt[enName] = entry;
  }
  return { base, pt };
}

// Efeitos: mesma ideia, pelo nome de origem. Devolve as mudanças da base como updates de ActiveEffect.
// `item`: descrição de origem do item e a dele em inglês — o efeito passivo de uma feature costuma repetir
// a descrição do item (armas, armaduras, peças de Eidolon), e aí recebe a mesma em inglês.
function translateEffects(ctx, effects, en = {}, item = {}) {
  const pt = {};
  const updates = [];
  for (const effect of effects ?? []) {
    const byName = ctx.globalName(effect.name);
    // A entrada pode usar o nome de origem ou o nome já em inglês.
    const override = en?.[effect.name] ?? en?.[byName] ?? {};
    const enName = override.name ?? (byName !== effect.name ? byName : ctx.names(effect.name, { track: false }).en);
    const change = {};
    if (enName !== effect.name) change.name = enName;
    if (override.description) change.description = override.description;
    else if (item.en && effect.description && effect.description === item.src) change.description = item.en;
    if (Object.keys(change).length) updates.push({ _id: effect._id, src: effect.name, change });
    const entry = {};
    const name = ctx.term(effect.name);
    if (name !== enName) entry.name = name;
    if (effect.description) entry.description = ctx.term(effect.description);
    if (Object.keys(entry).length) pt[enName] = entry;
  }
  return { pt, updates };
}

// Dados de item (documento ou item embutido/guardado em flag) → { update da base, updates dos efeitos,
// entrada pt-BR }. `en` é a entrada do item em content-en.json.
function translateItemData(ctx, data, en = {}) {
  const system = data.system ?? {};
  const { en: enName, pt: ptName } = ctx.names(data.name);
  const update = {};
  if (enName !== data.name) update.name = enName;
  if (en.description) update["system.description"] = en.description;
  const entry = { name: ptName };
  if (system.description) entry.description = ctx.term(system.description);
  const actionList = Array.isArray(system.actions) ? system.actions : Object.values(system.actions ?? {}).map((a, i) => ({ ...a, id: a._id ?? Object.keys(system.actions)[i] }));
  const actions = translateActions(ctx, actionList, en.actions);
  Object.assign(update, actions.base);
  if (Object.keys(actions.pt).length) entry.actions = actions.pt;
  const effects = translateEffects(ctx, data.effects, en.effects, { src: system.description, en: en.description });
  if (Object.keys(effects.pt).length) entry.effects = effects.pt;
  if (system.attack?.name) {
    const attackEn = en.attack?.name ?? ctx.globalName(system.attack.name);
    if (attackEn !== system.attack.name) update["system.attack.name"] = attackEn;
    const attack = ctx.term(system.attack.name);
    if (attack !== attackEn) entry.attack = { name: attack };
  }
  for (const field of ["backgroundQuestions", "connections"]) {
    if (!Array.isArray(system[field]) || !system[field].length) continue;
    entry[field] = system[field].map(ctx.term);
    if (Array.isArray(en[field]) && en[field].length === system[field].length) update[`system.${field}`] = en[field];
  }
  const flags = data.flags?.[MODULE_ID] ?? {};
  if (flags.pick) {
    entry.pick = {
      title: ctx.term(flags.pick.title), prompt: ctx.term(flags.pick.prompt),
      options: Object.fromEntries(Object.entries(flags.pick.options ?? {}).map(([k, v]) => [k, ctx.term(v)]))
    };
    // A chave "action" é o nome de origem usado pela automação; só os textos mudam.
    if (en.pick) for (const key of ["title", "prompt", "options"]) if (en.pick[key]) update[`flags.${MODULE_ID}.pick.${key}`] = en.pick[key];
  }
  if (flags.vehicle?.baseName) {
    const vehicle = ctx.names(flags.vehicle.baseName);
    if (vehicle.en !== flags.vehicle.baseName) update[`flags.${MODULE_ID}.vehicle.baseName`] = vehicle.en;
    entry.vehicleName = vehicle.pt;
  }
  if (Array.isArray(flags.eidolon?.parts)) {
    const parts = foundry.utils.deepClone(flags.eidolon.parts);
    const ptParts = {};
    for (const part of parts) {
      const t = translateItemData(ctx, part, en.parts?.[ctx.names(part.name, { track: false }).en]);
      for (const [path, value] of Object.entries(t.update)) foundry.utils.setProperty(part, path, value);
      // Peças guardadas em flag podem não ter _id nos efeitos: casa pelo nome de origem.
      for (const { _id, src, change } of t.effectUpdates) {
        const effect = part.effects?.find(e => (_id && e._id === _id) || e.name === src);
        if (effect) Object.assign(effect, change);
      }
      ptParts[part.name] = t.entry;
    }
    update[`flags.${MODULE_ID}.eidolon.parts`] = parts;
    entry.eidolonParts = ptParts;
  }
  return { update, effectUpdates: effects.updates, entry, enName };
}

// Chave da entrada: o nome em inglês; se houver nome repetido no compêndio, o _id (o Babele aceita os dois).
function entryKey(seen, name, id) {
  if (!seen.has(name)) { seen.add(name); return name; }
  return id;
}

// ---------- Compêndios ----------

async function localizeItemPack(ctx, pack) {
  const docs = await pack.getDocuments();
  const entries = {};
  const updates = [];
  const seen = new Set();
  for (const doc of docs) {
    const en = ctx.contentFor(pack, doc.name);
    const { update, effectUpdates, entry, enName } = translateItemData(ctx, doc.toObject(), en);
    if (Object.keys(update).length) updates.push({ _id: doc.id, ...update });
    if (effectUpdates.length) await doc.updateEmbeddedDocuments("ActiveEffect", effectUpdates.map(({ _id, change }) => ({ _id, ...change })));
    entries[entryKey(seen, enName, doc.id)] = entry;
  }
  if (updates.length) await Item.updateDocuments(updates, { pack: pack.collection });
  return { mapping: ITEM_MAPPING, entries };
}

async function localizeActorPack(ctx, pack) {
  const docs = await pack.getDocuments();
  const entries = {};
  const seen = new Set();
  for (const actor of docs) {
    const data = actor.toObject();
    const { en: enName, pt: ptName } = ctx.names(data.name);
    const en = ctx.contentFor(pack, data.name);
    const entry = { name: ptName };
    for (const field of ["description", "motivesAndTactics", "impulses"]) if (data.system[field]) entry[field] = ctx.term(data.system[field]);
    if (data.system.attack?.name) entry.attack = { name: ctx.term(data.system.attack.name) };
    const experiences = Object.values(data.system.experiences ?? {});
    if (experiences.length) entry.experiences = Object.fromEntries(experiences.map(e => [e.name, { name: ctx.term(e.name) }]));
    const groups = Object.values(data.system.potentialAdversaries ?? {});
    if (groups.length) entry.potentialAdversaries = Object.fromEntries(groups.map(g => [g.label, { label: ctx.term(g.label) }]));
    const items = {};
    const itemUpdates = [];
    const seenItems = new Set();
    for (const item of data.items) {
      const t = translateItemData(ctx, item, en.items?.[ctx.names(item.name, { track: false }).en]);
      if (Object.keys(t.update).length) itemUpdates.push({ _id: item._id, ...t.update });
      if (t.effectUpdates.length) await actor.items.get(item._id).updateEmbeddedDocuments("ActiveEffect", t.effectUpdates.map(({ _id, change }) => ({ _id, ...change })));
      items[entryKey(seenItems, t.enName, item._id)] = t.entry;
    }
    if (Object.keys(items).length) entry.items = items;
    if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item", itemUpdates);
    const actorUpdate = {};
    if (enName !== data.name) Object.assign(actorUpdate, { name: enName, "prototypeToken.name": enName });
    for (const field of ["description", "motivesAndTactics", "impulses"]) if (en[field]) actorUpdate[`system.${field}`] = en[field];
    if (en.attack?.name) actorUpdate["system.attack.name"] = en.attack.name;
    if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);
    entries[entryKey(seen, enName, actor.id)] = entry;
  }
  return { mapping: ACTOR_MAPPING, entries };
}

async function localizeJournalPack(ctx, pack) {
  const docs = await pack.getDocuments();
  const entries = {};
  for (const journal of docs) {
    const { en, pt } = ctx.names(journal.name);
    const pages = {};
    const pageUpdates = [];
    for (const page of journal.pages) {
      const p = ctx.names(page.name);
      const change = {};
      if (p.en !== page.name) change.name = p.en;
      // Texto em inglês da página (journals/en/...), quando já existe.
      const enText = ctx.journalEn?.get(page.id);
      if (enText) change["text.content"] = enText;
      if (Object.keys(change).length) pageUpdates.push({ _id: page.id, ...change });
      pages[p.en] = { name: p.pt, text: ctx.term(page.text?.content ?? "") };
    }
    if (pageUpdates.length) await journal.updateEmbeddedDocuments("JournalEntryPage", pageUpdates);
    if (en !== journal.name) await journal.update({ name: en });
    entries[en] = { name: pt, pages };
  }
  return { entries };
}

async function localizeTablePack(ctx, pack) {
  const docs = await pack.getDocuments();
  const entries = {};
  for (const table of docs) {
    const { en, pt } = ctx.names(table.name);
    const change = {};
    if (en !== table.name) change.name = en;
    const enDescription = ctx.contentEn?._tables?.[en]?.description;
    if (enDescription) change.description = enDescription;
    if (Object.keys(change).length) await table.update(change);
    entries[en] = { name: pt, description: ctx.term(table.description ?? "") };
  }
  return { entries };
}

async function localizeFolders(ctx, pack) {
  const folders = {};
  const updates = [];
  for (const folder of pack.folders) {
    const { en, pt } = folderNames(folder.name, ctx.term);
    if (en !== folder.name) updates.push({ _id: folder.id, name: en });
    if (pt !== en) folders[en] = pt;
  }
  if (updates.length) await Folder.updateDocuments(updates, { pack: pack.collection });
  return folders;
}

async function writeTranslation(collection, data) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  for (const dir of [`modules/${MODULE_ID}/babele`, OUT_DIR]) { try { await FP.createDirectory("data", dir); } catch { /* já existe */ } }
  const file = new File([JSON.stringify(data, null, 2) + "\n"], `${collection}.json`, { type: "application/json" });
  await FP.upload("data", OUT_DIR, file, {}, { notify: false });
}

/**
 * @param {object} options
 * @param {{collection: string, labelPt: string}[]} options.packs
 * @param {Map<string, {en: string, pt: string}>} options.extraNames  nomes fora do glossário (diários, tabelas), pelo nome de origem
 */
export async function localizePacks({ packs, extraNames = new Map(), packFolders = {}, journalEn = new Map() }) {
  const fetchJson = async (path, fallback) => {
    const response = await fetch(`modules/${MODULE_ID}/${path}`, { cache: "no-store" });
    return response.ok ? response.json() : fallback;
  };
  const glossary = await fetchJson("data/glossary-pt-BR.json", null);
  if (!glossary) throw new Error("Edgeheart | data/glossary-pt-BR.json não encontrado.");
  const contentEn = await fetchJson("data/content-en.json", {});

  // Classes e subclasses ficam com o nome em inglês nas duas línguas.
  const protectedNames = new Set();
  for (const { collection } of packs) {
    const pack = game.packs.get(collection);
    if (pack?.documentName !== "Item") continue;
    for (const entry of await pack.getIndex({ fields: ["type"] })) if (["class", "subclass"].includes(entry.type)) protectedNames.add(entry.name);
  }
  const ctx = createContext(glossary, protectedNames, extraNames, contentEn);
  ctx.journalEn = journalEn;

  for (const { collection, labelPt } of packs) {
    const pack = game.packs.get(collection);
    if (!pack) continue;
    const handler = { Item: localizeItemPack, Actor: localizeActorPack, JournalEntry: localizeJournalPack, RollTable: localizeTablePack }[pack.documentName];
    if (!handler) continue;
    const result = await handler(ctx, pack);
    const folders = await localizeFolders(ctx, pack);
    await writeTranslation(collection, { label: labelPt, ...(result.mapping ? { mapping: result.mapping } : {}), ...(Object.keys(folders).length ? { folders } : {}), entries: result.entries });
  }
  // Pastas da barra de compêndios (packFolders do module.json): { nome em inglês: nome em português }.
  if (Object.keys(packFolders).length) await writeTranslation(`${MODULE_ID}._packs-folders`, { entries: packFolders });
  if (ctx.unknown.size) console.warn(`Edgeheart | Nomes fora do glossário (ficam iguais nas duas línguas): ${[...ctx.unknown].sort().join(" | ")}`);
  return { unknown: [...ctx.unknown].sort() };
}
