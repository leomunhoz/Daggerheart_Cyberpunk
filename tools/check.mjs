// Checagem estática do módulo (ferramenta de desenvolvimento; não entra no module.zip).
// Uso: node tools/check.mjs   (ou npm run check)
// Sai com código 1 se houver ERRO. AVISO não reprova. Veja docs/adr/0004-testes-em-tres-niveis.md.
//
// O que confere:
//  1. sintaxe de cada scripts/*.js (node --check);
//  2. JSON válido em module.json, lang/, babele/ e data/;
//  3. lang/en.json e lang/pt-BR.json com as mesmas chaves;
//  4. chaves EDGEHEART.* usadas no código e nos templates existem no lang/en.json;
//  5. module.json: esmodules, styles, languages e packs apontam para arquivos/pastas que existem,
//     e packFolders só cita compêndios declarados;
//  6. caminhos fixos de arte (CPR("..."), ICON_PNG("..."), `modules/${MODULE_ID}/...`) existem no disco;
//  7. babele/pt-BR tem um arquivo por compêndio.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODULE_ID = "edgeheart-cyberpunk";
const errors = [];
const warnings = [];
const err = msg => errors.push(msg);
const warn = msg => warnings.push(msg);
const p = (...parts) => join(ROOT, ...parts);
const rel = path => relative(ROOT, path).replaceAll("\\", "/");

function list(dir, ext) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...list(full, ext));
    else if (!ext || name.endsWith(ext)) out.push(full);
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    err(`JSON inválido: ${rel(path)} (${e.message})`);
    return null;
  }
}

function flatten(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.add(full);
  }
  return out;
}

// 1. Sintaxe
const scripts = list(p("scripts"), ".js");
for (const file of scripts) {
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) err(`Sintaxe: ${rel(file)}\n${(r.stderr || "").trim().split("\n").slice(0, 4).join("\n")}`);
}

// 2. JSON
const manifest = readJson(p("module.json"));
for (const dir of ["lang", "babele", "data"]) for (const file of list(p(dir), ".json")) readJson(file);

// 3. Paridade das línguas
const en = readJson(p("lang", "en.json"));
const pt = readJson(p("lang", "pt-BR.json"));
const enKeys = flatten(en);
if (en && pt) {
  const ptKeys = flatten(pt);
  for (const k of enKeys) if (!ptKeys.has(k)) err(`lang/pt-BR.json sem a chave ${k}`);
  for (const k of ptKeys) if (!enKeys.has(k)) err(`lang/en.json sem a chave ${k}`);
}

// 4. Chaves usadas no código e nos templates
const sources = [...scripts, ...list(p("templates"), ".hbs")];
const used = new Map();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  // t("Chave") e t("Chave", {...}): o helper t() prefixa EDGEHEART.
  for (const m of text.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)) used.set(`EDGEHEART.${m[1]}`, rel(file));
  // EDGEHEART.Chave literal (localize no código, {{localize "EDGEHEART.X"}} nos templates).
  // Chaves montadas em tempo de execução (terminadas em ".") não são checadas.
  for (const m of text.matchAll(/EDGEHEART\.[A-Za-z0-9_.]*[A-Za-z0-9_]/g)) used.set(m[0], rel(file));
}
for (const [key, file] of used) {
  if (enKeys.has(key)) continue;
  // Prefixo de um grupo (ex.: EDGEHEART.Access, completado em tempo de execução): só aviso.
  if ([...enKeys].some(k => k.startsWith(`${key}.`))) continue;
  err(`Chave de idioma inexistente ${key} (usada em ${file})`);
}

// 5. module.json
if (manifest) {
  for (const f of [...(manifest.esmodules ?? []), ...(manifest.styles ?? [])])
    if (!existsSync(p(f))) err(`module.json cita ${f}, que não existe`);
  for (const l of manifest.languages ?? []) if (!existsSync(p(l.path))) err(`module.json: idioma ${l.lang} aponta para ${l.path}, que não existe`);
  const packNames = new Set((manifest.packs ?? []).map(pk => pk.name));
  for (const pk of manifest.packs ?? []) if (!existsSync(p(pk.path))) err(`module.json: compêndio ${pk.name} aponta para ${pk.path}, que não existe`);
  const walk = folders => {
    for (const f of folders ?? []) {
      for (const name of f.packs ?? []) if (!packNames.has(name)) err(`module.json: packFolders "${f.name}" cita o compêndio ${name}, que não está em packs`);
      walk(f.folders);
    }
  };
  walk(manifest.packFolders);
  if (manifest.id !== MODULE_ID) err(`module.json: id "${manifest.id}" diferente de ${MODULE_ID}`);

  // 7. Uma tradução do Babele por compêndio
  for (const name of packNames) {
    if (!existsSync(p("babele", "pt-BR", `${MODULE_ID}.${name}.json`))) warn(`babele/pt-BR sem tradução para o compêndio ${name}`);
  }
}

// 6. Arte e arquivos com caminho fixo
const missing = new Map();
const need = (path, file) => { if (!existsSync(p(path))) missing.set(path, file); };
for (const file of scripts) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bCPR\(\s*"([^"]+)"\s*\)/g)) need(`assets/cpr/${/\.\w+$/.test(m[1]) ? m[1] : `${m[1]}.svg`}`, rel(file));
  for (const m of text.matchAll(/\bICON_PNG\(\s*"([^"]+)"\s*\)/g)) need(`assets/icons/${m[1]}.png`, rel(file));
  for (const m of text.matchAll(/`modules\/\$\{MODULE_ID\}\/([^`$]+)`/g)) need(m[1], rel(file));
  for (const m of text.matchAll(/["'`]modules\/edgeheart-cyberpunk\/([^"'`$]+)["'`]/g)) need(m[1], rel(file));
}
// Pastas de destino (terminam em /) e pastas inteiras existem como diretório; ignoramos o que não tem extensão e existe como pasta.
for (const [path, file] of missing) {
  if (!/\.\w+$/.test(path) && existsSync(p(path))) continue;
  err(`Arquivo inexistente: ${path} (citado em ${file})`);
}

// Relatório
for (const w of warnings) console.log(`AVISO  ${w}`);
for (const e of errors) console.log(`ERRO   ${e}`);
console.log(`\ncheck: ${errors.length} erro(s), ${warnings.length} aviso(s) em ${scripts.length} scripts.`);
process.exit(errors.length ? 1 : 0);
