/* Edgeheart — Filtros do Item Browser do sistema (ui.compendiumBrowser)
 *
 * Só esconde linhas da lista com uma classe CSS própria; nada do sistema é alterado. O filtro de
 * classes da criação fica em edgeheart-character.js (classe eh-hidden); cada filtro usa a sua classe.
 * - Level Up: enquanto uma janela de Level Up de personagem estiver aberta, as cartas de domínio que
 *   o personagem já tem (ou já escolheu no Level Up) somem da lista (classe eh-hidden-owned).
 */

const MODULE_ID = "edgeheart-cyberpunk";
const OWNED_CLASS = "eh-hidden-owned";

// ---------- Level Up: cartas já possuídas ----------

// Cartas do personagem (uuid de origem e nome) mais as escolhidas no Level Up em andamento.
export function ownedCards(actor, levelup) {
  const uuids = new Set();
  const names = new Set();
  for (const item of actor?.items ?? []) {
    if (item.type !== "domainCard") continue;
    if (item._stats?.compendiumSource) uuids.add(item._stats.compendiumSource);
    if (item.name) names.add(item.name);
  }
  for (const level of Object.values(levelup?.levels ?? {})) {
    for (const card of Object.values(level?.achievements?.domainCards ?? {})) {
      if (card?.uuid) uuids.add(card.uuid);
    }
    for (const choice of Object.values(level?.choices?.domainCard ?? {})) {
      for (const uuid of [choice?.data].flat()) if (uuid) uuids.add(uuid);
    }
  }
  return { uuids, names };
}

// Mesma regra do sistema para recusar carta repetida (nome), mais o uuid de origem.
export function isOwnedRow({ uuid, name }, owned) {
  return owned.uuids.has(uuid) || owned.names.has(name);
}

// Janelas de Level Up de personagem abertas (menos a que está fechando).
function levelupApps(closing) {
  const LevelupClass = game.system.api?.applications?.levelup?.CharacterLevelup;
  if (!LevelupClass) return [];
  return [...foundry.applications.instances.values()].filter(app => app instanceof LevelupClass && app !== closing);
}

function filterOwnedCards(browser, closing) {
  const list = browser?.element?.querySelector(".item-list");
  if (!list) return;
  const types = browser.selectedMenu?.data?.type ?? [];
  const apps = types.includes("domainCard") ? levelupApps(closing) : [];
  const owned = { uuids: new Set(), names: new Set() };
  for (const app of apps) {
    const { uuids, names } = ownedCards(app.actor, app.levelup);
    uuids.forEach(u => owned.uuids.add(u));
    names.forEach(n => owned.names.add(n));
  }
  for (const row of list.querySelectorAll(".item-container[data-item-uuid]")) {
    const name = row.querySelector(".item-list-name")?.textContent?.trim();
    row.classList.toggle(OWNED_CLASS, apps.length > 0 && isOwnedRow({ uuid: row.dataset.itemUuid, name }, owned));
  }
}

// A lista é preenchida depois do render (loadItems), por isso o observer próprio.
Hooks.on("renderItemBrowser", (app) => {
  const list = app.element.querySelector(".item-list");
  if (!list || list.ehOwnedObserver) return;
  list.ehOwnedObserver = new MutationObserver(() => filterOwnedCards(app));
  list.ehOwnedObserver.observe(list, { childList: true });
  filterOwnedCards(app);
});

// Carta escolhida ou tirada no Level Up (a janela renderiza de novo) e Level Up fechado.
Hooks.on("renderDhCharacterLevelUp", () => filterOwnedCards(ui.compendiumBrowser));
Hooks.on("closeDhCharacterLevelUp", (app) => filterOwnedCards(ui.compendiumBrowser, app));
