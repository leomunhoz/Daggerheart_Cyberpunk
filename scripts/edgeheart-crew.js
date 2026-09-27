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
    await chatCard(actor, move, option);
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
  return choice ? move.options[choice] : null;
}

async function chatCard(actor, move, option) {
  const cost = move.cost ? `${move.cost} Edge` : "0 Edge";
  const body = option ? `<p>${move.text}</p><p><strong>${option.name}:</strong> ${option.text}</p>` : `<p>${move.text}</p>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="eh-chat eh-crew-chat"><h3><i class="fa-solid ${move.icon}"></i> ${move.name} <span class="eh-edge-cost">${cost}</span></h3>${body}</div>`
  });
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

// All In: quando a Rolagem em Dupla termina, cada participante limpa 1 Estresse.
Hooks.on("createChatMessage", async (message, _options, userId) => {
  if (userId !== game.user.id || message.type !== "dualityRoll") return;
  const title = game.i18n.localize("DAGGERHEART.APPLICATIONS.TagTeamSelect.chatMessageRollTitle");
  if (message.system?.title !== title) return;
  const crew = game.actors.find(a => Crew.isCrew(a) && a.getFlag(MODULE_ID, "crew.allInPending") && Object.keys(a.system.tagTeam.members ?? {}).length);
  if (!crew) return;
  const members = Object.keys(crew.system.tagTeam.members).map(id => game.actors.get(id)).filter(Boolean);
  await asOwner(crew, "crewSetFlag", { crewUuid: crew.uuid, key: "allInPending", value: false });
  const payload = { actorUuids: members.map(m => m.uuid) };
  if (members.every(m => m.isOwner)) await handlers.crewClearStress(payload);
  else if (game.users.activeGM) game.socket.emit(SOCKET, { action: "crewClearStress", payload });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: crew }),
    content: `<div class="eh-chat eh-crew-chat"><h3><i class="fa-solid fa-fire"></i> All In</h3><p>${members.map(m => m.name).join(" e ")} limpam 1 Estresse.</p></div>`
  });
});
