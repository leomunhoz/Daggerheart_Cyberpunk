/* Edgeheart — Crew e Edge (PDF, Passo 1: Monte a Crew)
 *
 * A Crew é o ator "party" (Grupo) do próprio Daggerheart: membros, inventário (Recursos da Crew),
 * Rolagem em Dupla e Rolagem em Grupo continuam sendo os do sistema. Este arquivo só acrescenta:
 * - "Ficha da Crew": herda a ficha oficial do Grupo e adiciona a aba "Crew" (Reputação, Código,
 *   Fixer, Base, Edge e os Movimentos de Edge).
 * - Reputação como Experiência de cada membro (usar custa 1 Esperança, como toda Experiência).
 * - All In abre a Rolagem em Dupla oficial sem custo de Esperança e limpa 1 Estresse de quem rolou.
 * Os dados ficam em flags["edgeheart-cyberpunk"].crew do ator Grupo.
 */

const MODULE_ID = "edgeheart-cyberpunk";
const SHEET_ID = `${MODULE_ID}.EdgeheartCrewSheet`;
const SOCKET = `module.${MODULE_ID}`;
const EXPERIENCE_ID = "edgeheartCrew";
const MAX_EDGE = 3;

const MOVES = {
  teamwork: {
    name: "Teamwork", cost: 0, icon: "fa-handshake",
    text: "Na primeira vez em cada cena em que um personagem <strong>Ajuda um Aliado</strong>, o dado de vantagem dele é um <strong>d8</strong> em vez de um d6. Quando um personagem começa uma <strong>Rolagem de Ação em Equipe</strong>, os personagens podem dividir a Esperança gasta."
  },
  backMeUp: {
    name: "Back Me Up", cost: 1, icon: "fa-people-arrows",
    text: "Quando um membro da Crew falha numa rolagem de ação, outro membro pode intervir: move-se para dentro do alcance Próximo e faz uma rolagem de reação relevante, descrevendo como salva a situação. Em um sucesso, a rolagem original vira um <strong>sucesso com Medo</strong>."
  },
  getThemOut: {
    name: "Get Them Out", cost: 1, icon: "fa-person-running",
    text: "Quando um membro da Crew dentro do alcance Próximo fosse marcar Pontos de Vida, ficar <em>Vulnerável</em> ou <em>Imobilizado</em>, outro personagem se move para dentro do alcance Muito Próximo dele. Reduza em 1 os PV marcados ou limpe uma condição temporária. Depois, mova os dois dentro do alcance Próximo em direção a cobertura, veículo, saída ou posição mais segura."
  },
  planB: {
    name: "Plan B", cost: 2, icon: "fa-route",
    text: "Revele um plano de contingência plausível que a Crew preparou para o Contrato.",
    options: {
      hiddenCache: { name: "Hidden Cache", text: "Ganhe três marcadores de Suprimento. Gaste um para produzir um consumível, arma ou ferramenta comum." },
      insideAccess: { name: "Inside Access", text: "Crie uma Breach contra a rede local ou o sistema de segurança. A próxima rolagem feita para explorá-la ganha +4." },
      sabotagePackage: { name: "Sabotage Package", text: "Desative um sistema conectado até o mestre gastar 2 Medo para restaurá-lo." },
      escapeVector: { name: "Escape Vector", text: "Estabeleça uma rota de extração dentro do alcance Distante. O grupo pode sair da cena sem outra rolagem." }
    }
  },
  allIn: {
    name: "All In", cost: 3, icon: "fa-fire",
    text: "Dois membros da Crew fazem uma <strong>Rolagem em Dupla</strong> sem gastar Esperança, mesmo que já tenham feito uma nesta sessão. Depois, cada personagem que participou limpa 1 Estresse."
  }
};

const GAINS = [
  "Uma Rolagem em Dupla tem sucesso com Esperança.",
  "Um personagem marca PV, Estresse ou aceita uma consequência séria para proteger outro membro da Crew.",
  "Um personagem coloca a Crew acima da própria segurança ou recompensa.",
  "A Crew completa uma parte importante do Contrato por meio de cooperação."
];

// Hidden Cache: consumível do Inventário da Crew, no padrão das poções oficiais (a ação gasta 1 de
// quantidade do próprio item; o itemId do custo é preenchido depois de criado).
const SUPPLIES = quantity => {
  const actionId = foundry.utils.randomID();
  return {
    name: "Suprimento", type: "consumable", img: `modules/${MODULE_ID}/assets/cpr/gear/carryall.svg`,
    flags: { [MODULE_ID]: { supplies: true } },
    system: {
      quantity, consumeOnUse: true,
      description: "<p>Marcador de Suprimento do Plan B (Hidden Cache). Gaste um para produzir um consumível, arma ou ferramenta comum.</p>",
      actions: {
        [actionId]: {
          _id: actionId, type: "effect", name: "Usar Suprimento", actionType: "action",
          description: "<p>Produza um consumível, arma ou ferramenta comum.</p>",
          cost: [{ key: "quantity", value: 1, scalable: false, step: null, consumeOnSuccess: false }]
        }
      }
    }
  };
};
// ---------- Regras ----------

export const Crew = {
  isCrew(actor) {
    if (actor?.type !== "party") return false;
    return !!actor.getFlag(MODULE_ID, "crew") || actor.getFlag("core", "sheetClass") === SHEET_ID;
  },

  data(actor) {
    return foundry.utils.mergeObject(
      { reputation: "", code: "", fixer: "", base: "", edge: 0 },
      actor.getFlag(MODULE_ID, "crew") ?? {}, { inplace: false }
    );
  },

  members(actor) {
    return actor.system.partyMembers.filter(m => m?.type === "character");
  },

  // Tier da Crew = maior Tier entre os membros (a Reputação sobe +1 a cada Tier novo).
  tier(actor) {
    return Math.max(1, ...this.members(actor).map(m => m.system.tier ?? 1));
  },

  reputationValue(actor) {
    return 2 + (this.tier(actor) - 1);
  },

  // Crew ativa: o Grupo ativo do sistema, se for uma Crew; senão, a primeira Crew do mundo.
  active() {
    const party = game.actors.party;
    if (party && this.isCrew(party)) return party;
    return game.actors.find(a => this.isCrew(a)) ?? null;
  },

  crewOf(character) {
    return game.actors.find(a => this.isCrew(a) && a.system.partyMembers.includes(character)) ?? null;
  },

  view(actor) {
    const d = this.data(actor);
    return {
      ...d,
      tier: this.tier(actor),
      reputationValue: this.reputationValue(actor),
      edgePips: Array.from({ length: MAX_EDGE }, (_, i) => ({ value: i + 1, filled: i < d.edge })),
      moves: Object.entries(MOVES).map(([id, m]) => ({
        id, ...m, affordable: d.edge >= m.cost,
        options: m.options ? Object.values(m.options) : null
      })),
      gains: GAINS,
      members: this.members(actor).map(m => ({ name: m.name, img: m.img, uuid: m.uuid, tier: m.system.tier }))
    };
  },

  async setEdge(actor, value) {
    value = Math.clamp(value, 0, MAX_EDGE);
    if (value === this.data(actor).edge) return;
    return asOwner(actor, "crewSetEdge", { crewUuid: actor.uuid, value });
  },

  async useMove(actor, moveId) {
    const move = MOVES[moveId];
    const { edge } = this.data(actor);
    if (edge < move.cost) return ui.notifications.warn(`${move.name} custa ${move.cost} Edge; a Crew tem ${edge}.`);

    let option = null;
    if (move.options) {
      option = await chooseOption(move);
      if (!option) return;
    }
    const confirmed = move.cost === 0 || await foundry.applications.api.DialogV2.confirm({
      window: { title: `${move.name} — ${move.cost} Edge` },
      content: `<p>A Crew concorda em gastar <strong>${move.cost} Edge</strong> em <strong>${move.name}</strong>${option ? ` (${option.name})` : ""}?</p>`
    });
    if (!confirmed) return;

    if (move.cost) await this.setEdge(actor, edge - move.cost);
    if (option?.id === "hiddenCache") await asOwner(actor, "crewAddSupplies", { crewUuid: actor.uuid, quantity: 3 });
    await chatCard(actor, moveId, option);
    if (moveId === "allIn") await this.startAllIn(actor);
  },

  // All In: a Rolagem em Dupla oficial, com o custo de Esperança desligado (a mesma opção que o
  // diálogo do sistema oferece). Quando ela termina, quem participou limpa 1 Estresse.
  async startAllIn(actor) {
    const Dialog = game.system.api.applications.dialogs.TagTeamDialog;
    const dialog = new Dialog(actor);
    dialog.usesTagTeamHopeCost = false;
    dialog.initiator = { ...(dialog.initiator ?? {}), cost: 0 };
    await asOwner(actor, "crewSetFlag", { crewUuid: actor.uuid, key: "allInPending", value: true });
    dialog.render({ force: true });
  },

  // Reputação: Experiência compartilhada, igual em todos os membros. Só o mestre ativo sincroniza.
  async syncReputation(actor) {
    if (!game.user.isActiveGM || !this.isCrew(actor)) return;
    const { reputation } = this.data(actor);
    const value = this.reputationValue(actor);
    for (const member of this.members(actor)) {
      const current = member._source.system.experiences?.[EXPERIENCE_ID];
      if (!reputation) {
        if (current) await member.update({ [`system.experiences.${EXPERIENCE_ID}`]: new foundry.data.operators.ForcedDeletion() });
        continue;
      }
      const name = `Crew: ${reputation}`;
      if (current?.name === name && current?.value === value && !current.core) continue;
      // O sistema marca as duas primeiras Experiências de um personagem como "core" (as da criação);
      // a Reputação nunca é uma delas, então um personagem ainda sem Experiências recebe a correção.
      await member.update({
        [`system.experiences.${EXPERIENCE_ID}`]: {
          name, value, core: false,
          description: `Reputação da Crew ${actor.name}. Uma vez por cena, gaste 1 Esperança para somá-la a uma rolagem adequada.`
        }
      });
      if (member._source.system.experiences[EXPERIENCE_ID]?.core) {
        await member.update({ [`system.experiences.${EXPERIENCE_ID}.core`]: false });
      }
    }
  },

  // Quem saiu da Crew perde a Experiência de Reputação.
  async cleanupReputation() {
    if (!game.user.isActiveGM) return;
    for (const actor of game.actors.filter(a => a.type === "character")) {
      if (!actor._source.system.experiences?.[EXPERIENCE_ID]) continue;
      if (!this.crewOf(actor)) await actor.update({ [`system.experiences.${EXPERIENCE_ID}`]: new foundry.data.operators.ForcedDeletion() });
    }
  }
};

async function chooseOption(move) {
  const buttons = Object.entries(move.options).map(([action, o]) => ({ action, label: o.name }));
  const content = `<p>${move.text}</p><ul>${Object.values(move.options).map(o => `<li><strong>${o.name}:</strong> ${o.text}</li>`).join("")}</ul>`;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: `${move.name} — escolha a contingência` },
    content, buttons, rejectClose: false,
    position: { width: 480 }
  });
  return choice ? { id: choice, ...move.options[choice] } : null;
}

// Botões dos cards de movimento, no padrão dos cards de ação do sistema (aplicam ao alvo / ao
// personagem selecionado). "gm" = só o mestre vê.
const CARD_BUTTONS = {
  getThemOut: [
    { id: "reduceHp", icon: "fa-heart", label: "Reduzir 1 PV marcado", tooltip: "Aplica ao aliado alvo (ou ao token selecionado)" },
    { id: "clearCondition", icon: "fa-person-walking-arrow-right", label: "Limpar Vulnerável/Imobilizado", tooltip: "Aplica ao aliado alvo (ou ao token selecionado)" }
  ],
  backMeUp: [
    { id: "reactionRoll", icon: "fa-dice", label: "Rolagem de Reação", tooltip: "Rola a reação do personagem selecionado (ou do seu personagem)" }
  ],
  sabotagePackage: [
    { id: "restoreSystem", icon: "fa-skull", label: "Restaurar o sistema (2 Medo)", gm: true, once: true }
  ],
  edgeGain: [
    { id: "gainEdge", icon: "fa-bolt", label: "+1 Edge", tooltip: "Uma vez por cena", once: true }
  ]
};

function cardButtons(key) {
  return (CARD_BUTTONS[key] ?? []).map(b =>
    `<button type="button" data-eh-crew="${b.id}"${b.gm ? ` data-eh-gm="1"` : ""}${b.once ? ` data-eh-once="1"` : ""}${b.tooltip ? ` data-tooltip="${b.tooltip}"` : ""}><i class="fa-solid ${b.icon}"></i> ${b.label}</button>`
  ).join("");
}

async function chatCard(actor, moveId, option) {
  const move = MOVES[moveId];
  const body = option ? `<p>${move.text}</p><p><strong>${option.name}:</strong> ${option.text}</p>` : `<p>${move.text}</p>`;
  const buttons = cardButtons(moveId) + cardButtons(option?.id);
  const extra = option?.id === "hiddenCache" ? `<p class="eh-note"><i class="fa-solid fa-box-open"></i> 3 Suprimentos no Inventário da Crew.</p>` : "";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="eh-chat eh-crew-chat"><h3><i class="fa-solid ${move.icon}"></i> ${move.name} <span class="eh-edge-cost">${move.cost} Edge</span></h3>${body}${extra}${buttons ? `<div class="eh-card-buttons">${buttons}</div>` : ""}</div>`,
    flags: { [MODULE_ID]: { crewCard: { crewUuid: actor.uuid, move: moveId, option: option?.id ?? null, used: [] } } }
  });
}

// Alvos do botão: os tokens alvo do usuário; sem alvo, os tokens selecionados (como no sistema).
function buttonTargets() {
  const targets = [...game.user.targets].map(t => t.actor).filter(Boolean);
  return targets.length ? targets : (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
}

function rollingCharacter() {
  const controlled = (canvas?.tokens?.controlled ?? []).map(t => t.actor).find(a => a?.type === "character" && a.isOwner);
  return controlled ?? game.user.character ?? null;
}

async function chooseTrait() {
  const traits = CONFIG.DH.ACTOR.abilities;
  const buttons = Object.entries(traits).map(([action, t]) => ({ action, label: game.i18n.localize(t.label) }));
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Back Me Up — atributo da reação" },
    content: "<p>Com que atributo o personagem salva a situação?</p>",
    buttons, rejectClose: false, position: { width: 420 }
  });
}

const CARD_ACTIONS = {
  async reduceHp(message) {
    const actors = buttonTargets().filter(a => a.type === "character");
    if (!actors.length) return ui.notifications.warn("Marque como alvo (ou selecione) o aliado que está sendo tirado dali.");
    await relay("crewReduceHp", { actorUuids: actors.map(a => a.uuid) }, actors);
    ui.notifications.info(`Get Them Out: ${actors.map(a => a.name).join(", ")} reduz 1 PV marcado.`);
  },
  async clearCondition(message) {
    const actors = buttonTargets().filter(a => a.type === "character");
    if (!actors.length) return ui.notifications.warn("Marque como alvo (ou selecione) o aliado que está sendo tirado dali.");
    await relay("crewClearConditions", { actorUuids: actors.map(a => a.uuid) }, actors);
    ui.notifications.info(`Get Them Out: condição temporária limpa em ${actors.map(a => a.name).join(", ")}.`);
  },
  async reactionRoll(message) {
    const actor = rollingCharacter();
    if (!actor) return ui.notifications.warn("Selecione o token do personagem que vai salvar a situação.");
    const trait = await chooseTrait();
    if (!trait) return;
    await actor.rollTrait(trait, {
      actionType: "reaction",
      title: `Back Me Up: ${game.i18n.localize(CONFIG.DH.ACTOR.abilities[trait].label)}`
    });
  },
  async restoreSystem(message) {
    const key = CONFIG.DH.SETTINGS.gameSettings.Resources.Fear;
    const fear = game.settings.get(CONFIG.DH.id, key);
    if (fear < 2) return ui.notifications.warn(`Restaurar o sistema custa 2 Medo; você tem ${fear}.`);
    await game.settings.set(CONFIG.DH.id, key, fear - 2);
    return true;
  },
  async gainEdge(message) {
    const crew = await fromUuid(message.getFlag(MODULE_ID, "crewCard.crewUuid"));
    if (!crew) return;
    const { edge } = Crew.data(crew);
    if (edge >= MAX_EDGE) return ui.notifications.warn("A Crew já está com 3 Edge.");
    await Crew.setEdge(crew, edge + 1);
    return true;
  }
};

// Aplica em atores que o usuário pode não controlar: direto se for dono de todos, senão pelo mestre.
async function relay(action, payload, actors) {
  if (actors.every(a => a.isOwner)) return handlers[action](payload);
  if (!game.users.activeGM) return ui.notifications.warn("Nenhum mestre conectado para aplicar isso.");
  game.socket.emit(SOCKET, { action, payload });
}

// Mudanças no ator da Crew feitas por quem não é dono dela vão para o mestre pelo socket do módulo.
async function asOwner(actor, action, payload) {
  if (actor.isOwner) return handlers[action](payload);
  if (!game.users.activeGM) return ui.notifications.warn("Nenhum mestre conectado para aplicar isso.");
  game.socket.emit(SOCKET, { action, payload });
}

const handlers = {
  async crewSetEdge({ crewUuid, value }) {
    const actor = await fromUuid(crewUuid);
    if (actor) await actor.setFlag(MODULE_ID, "crew.edge", Math.clamp(value, 0, MAX_EDGE));
  },
  async crewSetFlag({ crewUuid, key, value }) {
    const actor = await fromUuid(crewUuid);
    if (actor) await actor.setFlag(MODULE_ID, `crew.${key}`, value);
  },
  async crewReduceHp({ actorUuids }) {
    for (const uuid of actorUuids) {
      const actor = await fromUuid(uuid);
      const hp = actor?.system.resources?.hitPoints?.value ?? 0;
      if (hp > 0) await actor.update({ "system.resources.hitPoints.value": hp - 1 });
    }
  },
  async crewClearConditions({ actorUuids }) {
    for (const uuid of actorUuids) {
      const actor = await fromUuid(uuid);
      for (const status of ["vulnerable", "restrained"]) {
        if (actor?.statuses.has(status)) await actor.toggleStatusEffect(status, { active: false });
      }
    }
  },
  async crewAddSupplies({ crewUuid, quantity }) {
    const crew = await fromUuid(crewUuid);
    if (!crew) return;
    const existing = crew.items.find(i => i.getFlag(MODULE_ID, "supplies"));
    if (existing) return existing.update({ "system.quantity": existing.system.quantity + quantity });
    const [item] = await crew.createEmbeddedDocuments("Item", [SUPPLIES(quantity)]);
    const [actionId, action] = Object.entries(item.system.toObject().actions)[0];
    await item.update({ [`system.actions.${actionId}.cost`]: action.cost.map(c => ({ ...c, itemId: item.id })) });
  },
  async crewMarkCard({ messageId, buttonId }) {
    const message = game.messages.get(messageId);
    if (!message) return;
    const used = message.getFlag(MODULE_ID, "crewCard.used") ?? [];
    if (!used.includes(buttonId)) await message.setFlag(MODULE_ID, "crewCard.used", [...used, buttonId]);
  },
  async crewClearStress({ actorUuids }) {
    for (const uuid of actorUuids) {
      const actor = await fromUuid(uuid);
      const stress = actor?.system.resources?.stress?.value ?? 0;
      if (stress > 0) await actor.update({ "system.resources.stress.value": stress - 1 });
    }
  }
};

// ---------- Ficha ----------

function defineSheet() {
  const Base = game.system.api.applications.sheets.actors.Party;

  return class EdgeheartCrewSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["edgeheart-sheet", "edgeheart-crew"],
      actions: {
        ehToggleEdge: EdgeheartCrewSheet.#toggleEdge,
        ehUseMove: EdgeheartCrewSheet.#useMove
      }
    };

    static PARTS = {
      header: Base.PARTS.header,
      tabs: Base.PARTS.tabs,
      crew: { id: "crew", scrollable: [".eh-crew"], template: `modules/${MODULE_ID}/templates/crew-tab.hbs` },
      ...Object.fromEntries(Object.entries(Base.PARTS).filter(([k]) => !["header", "tabs"].includes(k)))
    };

    static TABS = {
      primary: {
        ...Base.TABS.primary,
        tabs: [{ id: "crew", label: "Crew" }, ...Base.TABS.primary.tabs],
        initial: "crew"
      }
    };

    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      if (partId === "crew") {
        context.crew = Crew.view(this.document);
        context.isGM = game.user.isGM;
      }
      return context;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      if (this.isEditable && !this.document.getFlag(MODULE_ID, "crew")) {
        this.document.setFlag(MODULE_ID, "crew", Crew.data(this.document));
      }
    }

    static async #toggleEdge(_, target) {
      const value = Number(target.dataset.value);
      const { edge } = Crew.data(this.document);
      await Crew.setEdge(this.document, edge >= value ? value - 1 : value);
    }

    static async #useMove(_, target) {
      await Crew.useMove(this.document, target.dataset.move);
    }
  };
}

// ---------- Ganchos ----------

Hooks.once("init", () => {
  foundry.applications.handlebars.loadTemplates([`modules/${MODULE_ID}/templates/crew-tab.hbs`]);
});

Hooks.once("setup", () => {
  foundry.documents.collections.Actors.registerSheet(MODULE_ID, defineSheet(), {
    types: ["party"], label: "Ficha da Crew", makeDefault: false
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, async ({ action, payload }) => {
    if (game.user !== game.users.activeGM) return;
    await handlers[action]?.(payload);
  });
  game.modules.get(MODULE_ID).api = { ...(game.modules.get(MODULE_ID).api ?? {}), Crew };
  if (game.user.isActiveGM) {
    for (const actor of game.actors.filter(a => Crew.isCrew(a))) Crew.syncReputation(actor);
    Crew.cleanupReputation();
  }
});

Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type !== "party" || !game.settings.get(MODULE_ID, "defaultSheet")) return;
  if (data.flags?.core?.sheetClass) return;
  actor.updateSource({ "flags.core.sheetClass": SHEET_ID, [`flags.${MODULE_ID}.crew`]: Crew.data(actor) });
});

// Reputação acompanha nome da frase, membros e Tier.
Hooks.on("updateActor", async (actor, changes) => {
  if (!game.user.isActiveGM) return;
  if (Crew.isCrew(actor) && (changes.system?.partyMembers || changes.flags?.[MODULE_ID]?.crew || "name" in changes)) {
    await Crew.syncReputation(actor);
    if (changes.system?.partyMembers) await Crew.cleanupReputation();
  } else if (actor.type === "character" && changes.system?.levelData) {
    const crew = Crew.crewOf(actor);
    if (crew) await Crew.syncReputation(crew);
  }
});

Hooks.on("deleteActor", actor => {
  if (Crew.isCrew(actor)) Crew.cleanupReputation();
});

// Botões dos cards da Crew.
Hooks.on("renderChatMessageHTML", (message, html) => {
  const card = message.getFlag(MODULE_ID, "crewCard");
  if (!card) return;
  for (const button of html.querySelectorAll("[data-eh-crew]")) {
    const id = button.dataset.ehCrew;
    if (button.dataset.ehGm && !game.user.isGM) { button.remove(); continue; }
    if (button.dataset.ehOnce && card.used?.includes(id)) { button.disabled = true; continue; }
    button.addEventListener("click", async event => {
      event.preventDefault();
      button.disabled = true;
      try {
        const done = await CARD_ACTIONS[id]?.(message);
        if (done && button.dataset.ehOnce) {
          const payload = { messageId: message.id, buttonId: id };
          if (message.isOwner) await handlers.crewMarkCard(payload);
          else game.socket.emit(SOCKET, { action: "crewMarkCard", payload });
          return;
        }
      } finally {
        if (!button.dataset.ehOnce || !card.used?.includes(id)) button.disabled = false;
      }
    });
  }
});

// Fim de uma Rolagem em Dupla (o sistema cria a mensagem antes de limpar os dados do Grupo):
// - All In: cada participante limpa 1 Estresse.
// - Com Esperança (e sucesso, se houver Dificuldade): o card oferece +1 Edge (uma vez por cena, a mesa decide).
Hooks.on("createChatMessage", async (message, _options, userId) => {
  if (userId !== game.user.id || message.type !== "dualityRoll" || !message.getFlag("core", "RollTable")) return;
  const crew = game.actors.find(a => Crew.isCrew(a) && a.system.tagTeam?.initiator?.memberId && Object.keys(a.system.tagTeam.members ?? {}).length);
  if (!crew) return;
  const members = Object.keys(crew.system.tagTeam.members).map(id => game.actors.get(id)).filter(Boolean);
  const names = members.map(m => m.name).join(" e ");
  const lines = [];

  if (crew.getFlag(MODULE_ID, "crew.allInPending")) {
    await asOwner(crew, "crewSetFlag", { crewUuid: crew.uuid, key: "allInPending", value: false });
    await relay("crewClearStress", { actorUuids: members.map(m => m.uuid) }, members);
    lines.push(`<p><i class="fa-solid fa-fire"></i> <strong>All In:</strong> ${names} limpam 1 Estresse.</p>`);
  }

  const roll = message.rolls[0];
  const difficulty = roll?.options?.roll?.difficulty;
  const success = difficulty == null || roll.isCritical || roll.total >= difficulty;
  const gain = (roll?.withHope || roll?.isCritical) && success;
  if (gain) lines.push(`<p>Rolagem em Dupla com Esperança: a Crew pode ganhar 1 Edge (uma vez por cena).</p>`);
  if (!lines.length) return;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: crew }),
    content: `<div class="eh-chat eh-crew-chat"><h3><i class="fa-solid fa-people-group"></i> ${crew.name}</h3>${lines.join("")}${gain ? `<div class="eh-card-buttons">${cardButtons("edgeGain")}</div>` : ""}</div>`,
    flags: { [MODULE_ID]: { crewCard: { crewUuid: crew.uuid, move: "tagTeam", option: null, used: [] } } }
  });
});

// ---------- Veículos (itens de loot com flag vehicle, gerados pelo main.js) ----------
// "Sofrer Dano Sério" deixa o veículo Damaged (−2 no Ataque do Veículo e no Manobrar, Característica
// bloqueada) e, se já estiver Damaged, Disabled (só Consertar funciona). "Consertar" volta ao normal.
// O estado aparece no nome do item, como no inventário do sistema.
const VEHICLE = { attack: "Ataque do Veículo", maneuver: "Manobrar", damage: "Sofrer Dano Sério", repair: "Consertar" };
const VEHICLE_STATES = { ok: "", damaged: " (Damaged)", disabled: " (Disabled)" };

export const Vehicle = {
  data(item) {
    return item?.getFlag(MODULE_ID, "vehicle") ?? null;
  },

  async setState(item, state) {
    const v = this.data(item);
    await item.update({ name: v.baseName + VEHICLE_STATES[state], [`flags.${MODULE_ID}.vehicle.state`]: state });
  }
};

Hooks.on("daggerheart.preUseAction", (action, config) => {
  const v = Vehicle.data(action.item);
  if (!v) return;
  // Damaged: −2 no campo de modificador situacional do diálogo de rolagem (o jogador vê e pode ajustar).
  if (v.state === "damaged" && [VEHICLE.attack, VEHICLE.maneuver].includes(action.name)) {
    config.extraFormula = config.extraFormula ? `${config.extraFormula} - 2` : "-2";
  }
  if (v.state === "disabled" && action.name !== VEHICLE.repair) {
    ui.notifications.warn(`${v.baseName} está Disabled: não se move nem pode ser usado até ser consertado.`);
    return false;
  }
  if (v.state === "damaged" && v.featureActions?.includes(action.name)) {
    ui.notifications.warn(`${v.baseName} está Damaged: a Característica não pode ser usada até ser consertado.`);
    return false;
  }
});

Hooks.on("daggerheart.postUseAction", async (action) => {
  const item = action.item;
  const v = Vehicle.data(item);
  if (!v || !item.isOwner) return;
  if (action.name === VEHICLE.damage) {
    const next = v.state === "ok" ? "damaged" : "disabled";
    await Vehicle.setState(item, next);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.parent }),
      content: `<div class="eh-chat"><p><strong>${v.baseName}</strong> ficou <strong>${next === "damaged" ? "Damaged" : "Disabled"}</strong>. ${next === "damaged" ? "A Característica para de funcionar e as rolagens para dirigir sofrem −2." : "Não se move nem pode ser usado até ser consertado."}</p></div>`
    });
  } else if (action.name === VEHICLE.repair && v.state !== "ok") {
    await Vehicle.setState(item, "ok");
  }
});