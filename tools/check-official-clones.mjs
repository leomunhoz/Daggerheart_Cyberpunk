// Conferência dos clones (BLD-03, ADR 0007 item 5): roda as cópias de cartas, consumíveis e features
// de adversário do gerador contra os src/packs de um clone local do sistema Daggerheart e lista o que
// não casa (oficial que sumiu, chave de actionNames/effectNames renomeada, patch que lança).
// Uso: node tools/check-official-clones.mjs <caminho do clone do sistema>
//      (ex: node tools/check-official-clones.mjs ../dh-2.12.1). Sai com código 1 se achar algo.
// Fica fora do npm run verify: o sistema não está no repositório.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Lê todos os documentos JSON de uma pasta de src/packs (sem as pastas do compêndio), no formato
// que o gerador usa: { name, _source, items }.
export function loadPackDir(dir) {
  const docs = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { docs.push(...loadPackDir(path)); continue; }
    if (!name.endsWith(".json") || name.startsWith("folders_")) continue;
    const json = JSON.parse(readFileSync(path, "utf8"));
    docs.push({ name: json.name, _source: json, items: (json.items ?? []).map(i => ({ name: i.name, _source: i })) });
  }
  return docs;
}

// Núcleo puro. content = { competencies, consumables, adversaries } do main.js;
// officials = { domains, void, consumables, adversaries } (documentos no formato de loadPackDir);
// cloneCard = cloneCompetencyCard do main.js. Devolve a lista de problemas (texto).
export function findCloneProblems(content, officials, cloneCard) {
  const problems = [];
  for (const competency of content.competencies) {
    for (const card of competency.cards.filter(c => c.clone)) {
      const list = card.source === "void" ? officials.void : officials.domains;
      const where = `Carta ${competency.id}/${card.name} (clone "${card.clone}")`;
      const official = list.find(o => o.name === card.clone);
      if (!official) { problems.push(`${where}: oficial não encontrada`); continue; }
      const actionNames = Object.values(official._source.system?.actions ?? {}).map(a => a.name);
      for (const key of Object.keys(card.actionNames ?? {})) {
        if (!actionNames.includes(key)) problems.push(`${where}: actionNames "${key}" não existe (ações: ${actionNames.join(", ")})`);
      }
      const effectNames = (official._source.effects ?? []).map(e => e.name);
      for (const key of Object.keys(card.effectNames ?? {})) {
        if (!effectNames.includes(key)) problems.push(`${where}: effectNames "${key}" não existe (efeitos: ${effectNames.join(", ")})`);
      }
      // O gerador engole a falha do patch e só avisa; aqui o aviso vira problema.
      const original = console.warn;
      console.warn = (...args) => { if (/ajuste da carta falhou/.test(String(args[0]))) problems.push(`${where}: patch lançou ${args[1]?.message ?? args[1]}`); };
      try { cloneCard(card, list); } catch (err) { problems.push(`${where}: cópia lançou ${err.message}`); } finally { console.warn = original; }
    }
  }
  for (const c of content.consumables.filter(c => c.clone)) {
    if (!officials.consumables.some(o => o.name === c.clone)) problems.push(`Consumível ${c.name}: oficial "${c.clone}" não encontrado`);
  }
  for (const a of content.adversaries) {
    for (const f of a.features.filter(f => f.clone)) {
      const source = officials.adversaries.find(o => o.name === f.clone.adversary);
      if (!source) problems.push(`Adversário ${a.name}/${f.name}: oficial "${f.clone.adversary}" não encontrado`);
      else if (!source.items.some(i => i.name === f.clone.feature)) problems.push(`Adversário ${a.name}/${f.name}: feature "${f.clone.feature}" não existe em ${f.clone.adversary}`);
    }
  }
  return problems;
}

async function main(systemDir) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const packs = join(resolve(systemDir), "src", "packs");
  if (!existsSync(packs)) { console.error(`Sem ${packs}. Uso: node tools/check-official-clones.mjs <clone do sistema>`); process.exit(2); }
  const { installFoundryStub } = await import(pathToFileURL(join(root, "tests/helpers/foundry-stub.mjs")).href);
  installFoundryStub();
  const main = await import(pathToFileURL(join(root, "scripts/main.js")).href);
  // Cartas do Blood do The Void: o gerador lê de data/void-blood.json (ver importDomainCards).
  const voidCards = JSON.parse(readFileSync(join(root, "data/void-blood.json"), "utf8")).cards
    .map(v => ({ name: v.name, _source: { system: { actions: v.actions, resource: v.resource, domainTouched: v.domainTouched }, effects: v.effects } }));
  const officials = {
    domains: loadPackDir(join(packs, "domains")), void: voidCards,
    consumables: loadPackDir(join(packs, "items", "consumables")), adversaries: loadPackDir(join(packs, "adversaries"))
  };
  const problems = findCloneProblems({ competencies: main.COMPETENCIES, consumables: main.CONSUMABLES, adversaries: main.ADVERSARIES }, officials, main.cloneCompetencyCard);
  const version = JSON.parse(readFileSync(join(resolve(systemDir), "system.json"), "utf8")).version;
  if (!problems.length) { console.log(`Clones OK contra Daggerheart ${version}.`); return; }
  console.log(`${problems.length} problema(s) contra Daggerheart ${version}:\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) { console.error("Uso: node tools/check-official-clones.mjs <caminho do clone do sistema>"); process.exit(2); }
  await main(process.argv[2]);
}
