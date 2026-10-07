/* Edgeheart — Ficha de Personagem, Humanidade e Ciberpsicose (Fase 1)
 *
 * O personagem continua sendo um Actor "character" do Daggerheart (o sistema tem dezenas de
 * checagens de type === "character": subclasse, level up, descansos, Esperança/Medo...).
 * Este arquivo só acrescenta, sem substituir nada do sistema:
 * - "Ficha Edgeheart": herda a ficha oficial e adiciona a aba "Chrome".
 * - Dado de Humanidade (d4..d12), Carga Cibernética e Ciberpsicose (regras do PDF, cap. 3).
 * Os dados ficam em flags["edgeheart-cyberpunk"] do ator.
 */

const MODULE_ID = "edgeheart-cyberpunk";
const SHEET_ID = `${MODULE_ID}.EdgeheartCharacterSheet`;
const QUERY = `${MODULE_ID}.character`;
const HUMANITY_STEPS = [4, 6, 8, 10, 12];
const PSYCHO_IMG = `modules/${MODULE_ID}/assets/cpr/status/beserker_addiction.svg`;
const COMPETENCIES = {
  network: "Network", assault: "Assault", chrome: "Chrome", systems: "Systems", influence: "Influence",
  ghost: "Ghost", frontier: "Frontier", medtech: "Medtech", aegis: "Aegis", redline: "Redline", blackwall: "Blackwall"
};
// Textos da interface ficam em lang/*.json (EDGEHEART.*).
const t = (key, data) => data ? game.i18n.format(`EDGEHEART.${key}`, data) : game.i18n.localize(`EDGEHEART.${key}`);
const accessLabel = level => t(`Access.${level}`);
const TRAIT_KEYS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];
const traitLabel = key => game.i18n.localize(`DAGGERHEART.CONFIG.Traits.${key}.name`);

// Acha uma ação pelo nome na língua de origem: usa o _id guardado pelo gerador (flags.actionIds), então
// funciona mesmo com uma tradução (Babele) trocando os nomes. Itens antigos, sem a tabela, caem no nome.
export function isAction(action, name) {
  if (!action || !name) return false;
  const ids = action.item?.getFlag(MODULE_ID, "actionIds");
  const id = Array.isArray(ids) ? ids.find(([n]) => n === name)?.[1] : null;
  return id ? (action.id ?? action._id) === id : action.name === name;
}

// Chave de um mapa { nomeDaAção: valor } (flags coverActions, rollFormula) que corresponde à ação.
function actionKeyIn(action, map) {
  return Object.keys(map ?? {}).find(name => isAction(action, name));
}

// ---------- Regras ----------
export const Humanity = {
  isEdgeheart(actor) {
    if (actor?.type !== "character") return false;
    return !!actor.getFlag(MODULE_ID, "edgeheart") || actor.getFlag("core", "sheetClass") === SHEET_ID;
  },

  die(actor) {
    return Number(actor.getFlag(MODULE_ID, "humanityDie") ?? 6);
  },

  // Soma do Custo Cibernético dos cyberwares instalados + modificador temporário da ficha.
  // Cyberware = qualquer item com flags[MODULE_ID].cyberware (compêndio Edgeheart: Cyberware).
  cyberware(actor) {
    return actor.items.filter(i => i.getFlag(MODULE_ID, "cyberware"));
  },

  // Cyberware comum (sem os Eidolons, que são Cyberware Especial com seção própria na aba Chrome).
  commonCyberware(actor) {
    return this.cyberware(actor).filter(i => !i.getFlag(MODULE_ID, "eidolon"));
  },

  hasHumanityMod(actor, kind) {
    return this.cyberware(actor).some(i => i.getFlag(MODULE_ID, "humanity") === kind);
  },

  // Competências acessíveis: Acesso Total pela classe + acessos dados por cyberware.
  // O Daggerheart só aceita cartas cujo domínio esteja num item de classe do personagem
  // (DHDomainCard._preCreate), então os acessos por cyberware aqui são informativos.
  access(actor) {
    const level = actor.system.levelData?.level?.current ?? 1;
    const map = {};
    const add = (id, kind, source) => {
      const entry = map[id] ??= { id, label: COMPETENCIES[id] ?? id, full: false, half: false, cards: 0, sources: [] };
      if (kind === "full") entry.full = true;
      else if (kind === "half") entry.half = true;
      else entry.cards += 1;
      entry.sources.push(source);
    };
    for (const d of actor.system.class?.value?.system?.domains ?? []) add(d, "full", t("Access.SourceClass"));
    const multiclass = actor.items.find(i => i.type === "class" && i.system.isMulticlass && !i.getFlag(MODULE_ID, "cyberAccess"));
    for (const d of multiclass?.system.domains ?? []) add(d, "half", t("Access.SourceMulticlass"));
    for (const item of this.cyberware(actor)) {
      const a = item.getFlag(MODULE_ID, "access");
      if (a?.competency && a?.level) add(a.competency, a.level, item.name);
    }
    // Competency Link do Eidolon sincronizado (só vale enquanto sincronizado).
    const linked = Eidolon.synced(actor);
    const link = linked?.getFlag(MODULE_ID, "eidolon")?.link;
    for (const d of link?.competencies ?? []) add(d, link.level, `${linked.name} (Competency Link)`);
    return Object.values(map).map(e => ({
      ...e,
      kind: e.full ? "full" : e.half ? "half" : "card",
      label: e.label,
      kindLabel: e.full ? accessLabel("full") : e.half ? accessLabel("half") : t("Access.CardCount", { count: e.cards }),
      maxLevel: e.full ? level : e.half ? Math.ceil(level / 2) : level
    }));
  },

  // Cartas de domínio fora do acesso (domínio sem acesso, nível acima do permitido ou
  // mais cartas do que os Acessos de Carta cobrem).
  cardIssues(actor) {
    const level = actor.system.levelData?.level?.current ?? 1;
    const access = Object.fromEntries(this.access(actor).map(a => [a.id, a]));
    const issues = [];
    const byDomain = {};
    for (const card of actor.items.filter(i => i.type === "domainCard")) (byDomain[card.system.domain] ??= []).push(card);
    for (const [domain, cards] of Object.entries(byDomain)) {
      const a = access[domain];
      const label = COMPETENCIES[domain] ?? domain;
      if (!a) {
        cards.forEach(c => issues.push({ uuid: c.uuid, name: c.name, problem: t("Access.Issue.NoAccess", { competency: label }) }));
        continue;
      }
      const limit = a.kind === "card" ? level : a.maxLevel;
      cards.filter(c => c.system.level > limit)
        .forEach(c => issues.push({ uuid: c.uuid, name: c.name, problem: t("Access.Issue.LevelTooHigh", { level: c.system.level, limit, access: a.kindLabel }) }));
      if (a.kind === "card" && cards.length > a.cards) {
        cards.slice(a.cards).forEach(c => issues.push({ uuid: c.uuid, name: c.name, problem: t("Access.Issue.TooManyCards", { competency: label, count: a.cards }) }));
      }
    }
    return issues;
  },

  cyberLoad(actor) {
    const installed = this.cyberware(actor).reduce((sum, i) => sum + Number(i.getFlag(MODULE_ID, "cyberCost")), 0);
    // Custo de Sincronia do Eidolon soma na Carga só enquanto sincronizado.
    return installed + Number(actor.getFlag(MODULE_ID, "cyberLoadMod") ?? 0) + Eidolon.syncCost(actor);
  },

  // Carga usada na Rolagem de Humanidade: Integrated Chrome (Augmented) trata a Carga como 1 menor.
  rollLoad(actor) {
    const load = this.cyberLoad(actor);
    return actor.items.some(i => i.getFlag(MODULE_ID, "integratedChrome")) ? Math.max(0, load - 1) : load;
  },

  psychoEffect(actor) {
    return actor.effects.find(e => e.getFlag(MODULE_ID, "cyberpsychosis"));
  },

  isCyberpsycho(actor) {
    return !!this.psychoEffect(actor);
  },

  isLost(actor) {
    return !!actor.getFlag(MODULE_ID, "lost");
  },

  summary(actor) {
    const die = this.die(actor);
    const level = actor.system.levelData?.level?.current ?? 1;
    return {
      die,
      steps: HUMANITY_STEPS.map(faces => ({ faces, current: faces === die, below: faces < die })),
      // Perdido (abaixo de d4) só o mestre traz de volta, e pode fazer isso a qualquer momento.
      // O limite de um avanço por nível vale para os jogadores; o mestre pode ajustar sempre.
      canAdvance: this.isLost(actor) ? game.user.isGM : die < 12 && (game.user.isGM || actor.getFlag(MODULE_ID, "humanityAdvancedAt") !== level),
      advancedThisLevel: !game.user.isGM && actor.getFlag(MODULE_ID, "humanityAdvancedAt") === level,
      canReduce: !this.isLost(actor),
      load: this.cyberLoad(actor),
      loadMod: Number(actor.getFlag(MODULE_ID, "cyberLoadMod") ?? 0),
      eidolons: Eidolon.view(actor),
      syncCost: Eidolon.syncCost(actor),
      cyberware: this.commonCyberware(actor).map(i => {
        const a = i.getFlag(MODULE_ID, "access");
        return {
          uuid: i.uuid, name: i.name, img: i.img,
          cost: Number(i.getFlag(MODULE_ID, "cyberCost") ?? 0), tier: i.getFlag(MODULE_ID, "tier"),
          access: a ? `${accessLabel(a.level)}: ${COMPETENCIES[a.competency] ?? a.competency}` : null,
          pending: !!i.getFlag(MODULE_ID, "choice") && !i.getFlag(MODULE_ID, "chosen"),
          weapon: i.type === "weapon"
        };
      }),
      access: this.access(actor),
      cardIssues: this.cardIssues(actor),
      accessClass: AccessClass.item(actor)?.system.domains.map(d => COMPETENCIES[d] ?? d) ?? [],
      accessNote: AccessClass.blockedReason(actor),
      anchor: this.hasHumanityMod(actor, "anchor"),
      buffer: this.hasHumanityMod(actor, "buffer"),
      cyberpsycho: this.isCyberpsycho(actor),
      lost: this.isLost(actor),
      // Chance de manter o controle numa Rolagem de Humanidade agora (resultado > Carga).
      // Com Âncora de Humanidade: rola duas vezes e fica com o maior.
      controlChance: (() => {
        const fail = Math.min(die, Math.max(0, this.rollLoad(actor))) / die;
        return Math.round((1 - (this.hasHumanityMod(actor, "anchor") ? fail * fail : fail)) * 100);
      })()
    };
  },

  // Dados já prontos para a aba Chrome (só apresentação).
  view(actor) {
    const s = this.summary(actor);
    const risk = s.controlChance >= 70 ? "ok" : s.controlChance >= 40 ? "warn" : "bad";
    const state = s.lost ? "lost" : s.cyberpsycho ? "psycho" : "stable";
    return {
      ...s,
      risk,
      state,
      stateLabel: t(`Humanity.State.${state}`),
      cyberCount: s.cyberware.length,
      access: s.access.map(a => ({
        ...a,
        short: a.full ? t("Access.Short.full") : a.half ? t("Access.Short.half") : t(`Access.Short.${a.cards > 1 ? "many" : "one"}`, { count: a.cards }),
        tooltip: t("Access.Tooltip", { access: a.kindLabel, level: a.maxLevel, sources: a.sources.join(", ") })
      })),
      hasProblems: s.cardIssues.length > 0 || !!s.accessNote
    };
  },

  // "Você só pode avançar seu Dado de Humanidade uma vez por nível."
  async advance(actor) {
    const s = this.summary(actor);
    // Personagem perdido: o mestre o traz de volta para o d4 (o passo logo acima de "perdido").
    if (s.lost) {
      if (!game.user.isGM) return ui.notifications.warn(t("Humanity.OnlyGMRestore"));
      await actor.update({ [`flags.${MODULE_ID}.lost`]: false, [`flags.${MODULE_ID}.humanityDie`]: HUMANITY_STEPS[0] });
      await chat(actor, t("Humanity.ChatRestored", { name: actor.name }));
      return;
    }
    if (!s.canAdvance) {
      ui.notifications.warn(t(s.die >= 12 ? "Humanity.MaxDie" : "Humanity.AlreadyAdvanced"));
      return;
    }
    const next = HUMANITY_STEPS[HUMANITY_STEPS.indexOf(s.die) + 1];
    // Ajuste do mestre não gasta o avanço do nível do jogador.
    await actor.update({
      [`flags.${MODULE_ID}.humanityDie`]: next,
      ...(game.user.isGM ? {} : { [`flags.${MODULE_ID}.humanityAdvancedAt`]: actor.system.levelData.level.current })
    });
    await chat(actor, t("Humanity.ChatAdvanced", { name: actor.name, from: s.die, to: next }));
  },

  // Reduz um passo. Abaixo de d4 o personagem está perdido (Movimento de Morte: Ciberpsicopata).
  async reduce(actor, reason = "") {
    const die = this.die(actor);
    const index = HUMANITY_STEPS.indexOf(die);
    if (index <= 0) return this.lose(actor, reason);
    const next = HUMANITY_STEPS[index - 1];
    await actor.setFlag(MODULE_ID, "humanityDie", next);
    await chat(actor, t("Humanity.ChatReduced", { name: actor.name, reason: reason ? ` (${reason})` : "", from: die, to: next }));
  },

  async lose(actor, reason = "") {
    await actor.setFlag(MODULE_ID, "lost", true);
    await chat(actor, t("Humanity.ChatLost", { name: actor.name, reason: reason ? ` (${reason})` : "" }));
  },

  // Rolagem de Humanidade: resultado > Carga Cibernética = mantém o controle.
  // stabilize: um aliado gastou 1 Esperança para tentar tirar o personagem da Ciberpsicose.
  async roll(actor, { reason = "", stabilize = false, helper = null } = {}) {
    const die = this.die(actor);
    const load = this.rollLoad(actor);
    // Âncora de Humanidade (cyberware 60): rola duas vezes e usa o maior.
    const anchor = this.hasHumanityMod(actor, "anchor");
    const roll = await new Roll(anchor ? `2d${die}kh` : `1d${die}`).evaluate();
    let total = roll.total;
    const notes = [];
    if (load < this.cyberLoad(actor)) notes.push(t("Humanity.NoteIntegratedChrome"));
    if (anchor) notes.push(t("Humanity.NoteAnchor"));
    // Buffer Cortical (cyberware 37): marcar 1 Estresse para +1, oferecido só quando muda o resultado.
    const { stress } = actor.system.resources;
    if (total <= load && total + 1 > load && this.hasHumanityMod(actor, "buffer") && stress.value < stress.max) {
      const useBuffer = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("Humanity.BufferTitle") },
        content: t("Humanity.BufferPrompt", { total, load })
      });
      if (useBuffer) {
        await actor.update({ "system.resources.stress.value": stress.value + 1 });
        total += 1;
        notes.push(t("Humanity.NoteBuffer"));
      }
    }
    const inControl = total > load;
    const wasPsycho = this.isCyberpsycho(actor);

    let outcome;
    if (stabilize) outcome = t(inControl ? "Humanity.Outcome.PsychoEnds" : "Humanity.Outcome.PsychoContinues");
    else if (inControl) outcome = t("Humanity.Outcome.InControl");
    else outcome = t(wasPsycho ? "Humanity.Outcome.StillPsycho" : "Humanity.Outcome.EntersPsycho");

    const title = stabilize ? (helper ? t("Humanity.StabilizeBy", { name: helper.name }) : t("Humanity.StabilizeTitle")) : t("Humanity.RollTitle");
    const math = total !== roll.total ? `${roll.total} + ${total - roll.total} = ` : "";
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="eh-chat"><h3>${title}</h3>${reason ? `<p><em>${reason}</em></p>` : ""}
        <p>${t("Humanity.RollLine", { die, math, total, load })}</p>
        ${notes.map(n => `<p><em>${n}</em></p>`).join("")}
        <p class="eh-outcome ${inControl ? "eh-ok" : "eh-bad"}">${outcome}</p></div>`
    });

    if (stabilize && inControl) await this.end(actor, { resolved: true });
    else if (!stabilize && !inControl && !wasPsycho) await this.enter(actor);
    return { total, load, inControl };
  },

  async enter(actor) {
    if (this.isCyberpsycho(actor)) return;
    // Duração "cena": o refresh de cena do Daggerheart remove o efeito, e o hook de
    // deleteActiveEffect abaixo aplica "terminou a cena em Ciberpsicose: reduza a Humanidade".
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: t("Humanity.EffectName"), img: PSYCHO_IMG, type: "base",
      description: t("Humanity.EffectDescription"),
      system: {
        changes: [{ key: "system.rules.dualityRoll.defaultFearDice", type: "override", value: 20, priority: null, phase: "initial" }],
        duration: { description: t("Humanity.EffectDuration"), type: "scene" },
        rangeDependence: null, stacking: null, targetDispositions: [], conditionals: []
      },
      flags: { [MODULE_ID]: { cyberpsychosis: true } }
    }]);
    await chat(actor, `${t("Humanity.ChatPsycho", { name: actor.name })}
      <button type="button" data-eh-action="stabilize" data-actor-uuid="${actor.uuid}">
        <i class="fa-solid fa-hand-holding-heart"></i> ${t("Humanity.StabilizeButton")}
      </button>`);
  },

  // resolved: terminou por estabilização/decisão do mestre (sem penalidade).
  async end(actor, { resolved = true } = {}) {
    const effect = this.psychoEffect(actor);
    if (effect) await effect.delete({ [MODULE_ID]: { resolved } });
  },

  // Um aliado (dono do personagem ajudante) gasta 1 Esperança e o personagem rola a Humanidade de novo.
  async stabilize(actor, helper) {
    if (!this.isCyberpsycho(actor)) return ui.notifications.info(t("Humanity.NotPsycho", { name: actor.name }));
    if (!helper || helper === actor) return ui.notifications.warn(t("Humanity.SelectHelper"));
    if ((helper.system.resources.hope?.value ?? 0) < 1) return ui.notifications.warn(t("Humanity.NoHope", { name: helper.name }));
    await helper.update({ "system.resources.hope.value": helper.system.resources.hope.value - 1 });
    return this.roll(actor, { stabilize: true, helper });
  }
};

// ---------- Acessos Cibernéticos (cartas de outras Competências) ----------
// O Daggerheart só aceita cartas de domínios que estejam num item de classe do personagem, e o
// único jeito oficial de ter um segundo item de classe é a multiclasse (que libera o domínio até
// metade do nível, igual ao Meio Acesso). Então o módulo mantém um item de classe marcado como
// multiclasse, "Acessos Cibernéticos", sem PV, Evasão nem features, só com os domínios liberados
// por cyberware. Ele não é criado se o personagem já tiver uma multiclasse de verdade.

const AccessClass = {
  item(actor) {
    return actor.items.find(i => i.type === "class" && i.getFlag(MODULE_ID, "cyberAccess"));
  },

  realMulticlass(actor) {
    return actor.items.find(i => i.type === "class" && i.system.isMulticlass && !i.getFlag(MODULE_ID, "cyberAccess"));
  },

  // Competências de cyberware que ainda não vêm da classe e já existem como domínio no sistema.
  wanted(actor) {
    const classDomains = actor.system.class?.value?.system?.domains ?? [];
    const registered = CONFIG.DH.DOMAIN.allDomains();
    const domains = Humanity.cyberware(actor).map(i => i.getFlag(MODULE_ID, "access")?.competency).filter(Boolean);
    domains.push(...(Eidolon.synced(actor)?.getFlag(MODULE_ID, "eidolon")?.link?.competencies ?? []));
    return [...new Set(domains)].filter(d => !classDomains.includes(d) && registered[d]).sort();
  },

  // Por que o acesso não virou item de classe (mostrado na aba Chrome).
  blockedReason(actor) {
    if (!Humanity.cyberware(actor).some(i => i.getFlag(MODULE_ID, "access")) && !Eidolon.synced(actor)) return null;
    if (this.realMulticlass(actor)) return t("Access.Blocked.Multiclass");
    if (!game.system.settings.automation.levelupAuto) return t("Access.Blocked.Levelup");
    const missing = Humanity.cyberware(actor).map(i => i.getFlag(MODULE_ID, "access")?.competency)
      .filter(d => d && !CONFIG.DH.DOMAIN.allDomains()[d]);
    if (missing.length) return t("Access.Blocked.Missing", { list: [...new Set(missing)].map(d => COMPETENCIES[d] ?? d).join(", ") });
    return null;
  },

  async sync(actor) {
    if (!Humanity.isEdgeheart(actor) || !actor.isOwner) return;
    const current = this.item(actor);
    const wanted = this.wanted(actor);
    const blocked = !!this.realMulticlass(actor) || !game.system.settings.automation.levelupAuto;
    const same = current && JSON.stringify([...current.system.domains].sort()) === JSON.stringify(wanted);
    if (same && !blocked) return;
    // Recria em vez de atualizar: o sistema limita a quantidade de domínios só nas atualizações.
    if (current) await current.delete();
    if (blocked || !wanted.length || !actor.system.class?.value) return;
    await actor.createEmbeddedDocuments("Item", [{
      name: t("Access.ItemName"), type: "class", img: `modules/${MODULE_ID}/assets/cpr/cyberware/interface_plugs.svg`,
      system: {
        description: t("Access.ItemDescription"),
        domains: wanted, isMulticlass: true, hitPoints: 0, evasion: 0, features: [], classItems: []
      },
      flags: { [MODULE_ID]: { cyberAccess: true } }
    }]);
  }
};

// ---------- Level Up do Edgeheart ----------
// PDF: "subir de nível não dá mais as opções de Avanço para PV, Estresse, Evasão, Limiares ou
// Atributos; essas melhorias vêm do Cyberware". O +1 automático por nível nos Limiares não é uma
// opção de avanço, então continua. A Multiclasse sai porque os Acessos Cibernéticos ocupam esse
// espaço. Para os níveis continuarem com 2 escolhas, Experiência e Carta extra podem ser escolhidas
// mais vezes por Tier (Tier 2 tinha só essas duas opções válidas: 1x cada, para 6 escolhas).
// Nada do sistema é alterado: isto usa a configuração de mundo "Level Tiers" que o próprio
// Daggerheart oferece para homebrew. A original fica guardada e volta ao desligar a opção.
const LEVELUP_REMOVED = ["trait", "hitPoint", "stress", "evasion", "multiclass"];
const LEVELUP_SELECTIONS = {
  2: { experience: 3, domainCard: 3 },
  3: { experience: 2, domainCard: 2 },
  4: { experience: 2, domainCard: 2 }
};

const EdgeheartLevelup = {
  get key() { return CONFIG.DH.SETTINGS.gameSettings.LevelTiers; },

  build(base) {
    const data = foundry.utils.deepClone(base);
    for (const [tierKey, tier] of Object.entries(data.tiers ?? {})) {
      for (const option of LEVELUP_REMOVED) delete tier.options[option];
      for (const [option, times] of Object.entries(LEVELUP_SELECTIONS[tierKey] ?? {})) {
        if (tier.options[option]) tier.options[option].checkboxSelections = times;
      }
    }
    return data;
  },

  async apply() {
    if (game.settings.get(MODULE_ID, "levelupApplied")) return;
    const original = game.settings.get(CONFIG.DH.id, this.key).toObject();
    await game.settings.set(MODULE_ID, "levelTiersBackup", original);
    await game.settings.set(CONFIG.DH.id, this.key, this.build(original));
    await game.settings.set(MODULE_ID, "levelupApplied", true);
    ui.notifications.info(t("Levelup.Applied"));
  },

  async restore() {
    if (!game.settings.get(MODULE_ID, "levelupApplied")) return;
    const original = game.settings.get(MODULE_ID, "levelTiersBackup");
    if (original?.tiers) await game.settings.set(CONFIG.DH.id, this.key, original);
    await game.settings.set(MODULE_ID, "levelupApplied", false);
    ui.notifications.info(t("Levelup.Restored"));
  },

  async sync() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get(MODULE_ID, "edgeheartLevelup")) await this.apply();
    else await this.restore();
  }
};

// ---------- Cyberware: escolhas ao instalar ----------

const Cyberware = {
  async choose(item) {
    const actor = item.parent;
    const choice = item.getFlag(MODULE_ID, "choice");
    const baseName = item.name.replace(/\s*\(.*\)$/, "");
    const select = (name, options) =>
      `<select name="${name}">${Object.entries(options).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`;
    const ask = (title, content) =>
      foundry.applications.api.DialogV2.input({ window: { title: `${baseName}: ${title}` }, content, rejectClose: false });

    if (choice === "trait") {
      const traits = Object.fromEntries(TRAIT_KEYS.map(k => [k, traitLabel(k)]));
      const r = await ask(t("Cyberware.ChooseTrait"), `<label>${t("Cyberware.Trait")} ${select("trait", traits)}</label>`);
      if (!r) return this.pending(item);
      await this.setBonus(item, `system.traits.${r.trait}.value`, 1);
      return this.done(item, `${baseName} (${traits[r.trait]})`);
    }

    if (choice === "experience" || choice === "neuralArchive") {
      const experiences = Object.fromEntries(Object.entries(actor.system.experiences ?? {}).map(([id, e]) => [id, `${e.name} (+${e.value})`]));
      const options = choice === "neuralArchive" ? { new: t("Cyberware.NewExperience"), ...experiences } : experiences;
      if (!Object.keys(options).length) {
        ui.notifications.warn(t("Cyberware.NoExperiences", { name: actor.name }));
        return this.pending(item);
      }
      const content = `<label>${t("Cyberware.Experience")} ${select("experience", options)}</label>`
        + (choice === "neuralArchive" ? `<label>${t("Cyberware.NewExperienceName")} <input type="text" name="newName" placeholder="${t("Cyberware.NewExperiencePlaceholder")}"></label>` : "");
      const r = await ask(t("Cyberware.ChooseExperience"), content);
      if (!r) return this.pending(item);
      if (r.experience === "new") {
        const id = foundry.utils.randomID();
        const name = r.newName?.trim() || t("Cyberware.NeuralArchiveDefault");
        await actor.update({ [`system.experiences.${id}`]: { name, value: 2, core: false } });
        await item.setFlag(MODULE_ID, "linkedExperience", id);
        return this.done(item, `${baseName} (${name})`);
      }
      await this.setBonus(item, `system.experiences.${r.experience}.value`, 1);
      await item.setFlag(MODULE_ID, "linkedExperience", r.experience);
      return this.done(item, `${baseName} (${actor.system.experiences[r.experience].name})`);
    }

    if (choice === "competency") {
      const competencies = Object.fromEntries(Object.entries(COMPETENCIES).filter(([id]) => !["redline", "blackwall"].includes(id)));
      const r = await ask(t("Cyberware.ChooseCompetency"),
        `<label>${t("Cyberware.Competency")} ${select("competency", competencies)}</label>`
        + `<label>${t("Cyberware.AccessLevel")} ${select("level", { card: t("Cyberware.Cost.card"), half: t("Cyberware.Cost.half"), full: t("Cyberware.Cost.full") })}</label>`);
      if (!r) return this.pending(item);
      await item.update({
        [`flags.${MODULE_ID}.access`]: { competency: r.competency, level: r.level },
        [`flags.${MODULE_ID}.cyberCost`]: { card: 1, half: 2, full: 3 }[r.level]
      });
      return this.done(item, `${baseName} (${COMPETENCIES[r.competency]}, ${accessLabel(r.level)})`);
    }

    if (choice === "tacticalMesh") {
      const r = await ask(t("Cyberware.ChooseCompetency"), `<label>${t("Cyberware.HalfAccessTo")} ${select("competency", { aegis: COMPETENCIES.aegis, influence: COMPETENCIES.influence })}</label>`);
      if (!r) return this.pending(item);
      await item.setFlag(MODULE_ID, "access", { competency: r.competency, level: "half" });
      return this.done(item, `${baseName} (${COMPETENCIES[r.competency]})`);
    }
  },

  // Grava (ou cria) o efeito do item com a chave escolhida.
  async setBonus(item, key, value) {
    const changes = [{ key, type: "add", value, priority: null, phase: "initial" }];
    const effect = item.effects.contents[0];
    if (effect) return effect.update({ "system.changes": changes });
    return item.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name, img: item.img, transfer: true, type: "base",
      system: { changes, duration: { description: "" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] }
    }]);
  },

  async done(item, name) {
    await item.update({ name, [`flags.${MODULE_ID}.chosen`]: true });
  },

  pending(item) {
    ui.notifications.warn(t("Cyberware.Pending", { name: item.name }));
  }
};

async function chat(actor, content) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="eh-chat">${content}</div>` });
}

// Ações que mexem num ator que o usuário não controla (ex: jogador estabilizando outro
// personagem) são pedidas ao mestre ativo por uma consulta do Foundry (User#query), que espera a
// resposta: se o mestre não responder, o jogador é avisado em vez de o clique não fazer nada.
async function asOwner(actor, action, payload) {
  if (actor.isOwner) return handlers[action](payload);
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn(t("Common.NoGM"));
  try {
    return await gm.query(QUERY, { action, payload }, { timeout: 15000 });
  } catch (err) {
    console.warn("Edgeheart | O mestre não respondeu:", err);
    ui.notifications.warn(t("Common.GMNoResponse", { name: gm.name }));
  }
}

const handlers = {
  async stabilize({ actorUuid, helperUuid }) {
    const actor = await fromUuid(actorUuid);
    const helper = await fromUuid(helperUuid);
    if (actor && helper) await Humanity.stabilize(actor, helper);
  }
};

function helperActor(exclude) {
  const controlled = canvas?.tokens?.controlled?.map(t => t.actor).find(a => a?.type === "character" && a !== exclude);
  return controlled ?? (game.user.character !== exclude ? game.user.character : null);
}

// ---------- Visual da ficha (tema cyberpunk e glitch) ----------
// Tudo é CSS em styles/edgeheart-sheet-theme.css, ligado pelas classes eh-theme (tema), eh-fx (animações)
// e eh-psycho (Ciberpsicose). Aqui só entram as classes, a decoração e as rajadas de glitch em pontos
// aleatórios perto das bordas; o centro da ficha fica limpo para leitura.
const SheetFx = {
  mode: () => game.settings.get(MODULE_ID, "sheetFx"),

  apply(sheet) {
    const el = sheet.element;
    const mode = this.mode();
    const psycho = Humanity.summary(sheet.document).cyberpsycho;
    el.classList.toggle("eh-theme", mode !== "off");
    el.classList.toggle("eh-fx", mode === "full");
    el.classList.toggle("eh-psycho", mode !== "off" && psycho);
    el.querySelectorAll(".eh-deco-id, .eh-deco-foot, .eh-glitch").forEach(n => n.remove());
    this.stop(sheet);
    if (mode === "off") return;
    this.decorate(sheet);
    if (mode === "full" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) this.start(sheet, psycho);
  },

  decorate(sheet) {
    const el = sheet.element;
    const actor = sheet.document;
    const tag = s => String(s ?? "").toUpperCase().replace(/\s+/g, "_").slice(0, 14);
    const id = document.createElement("div");
    id.className = "eh-deco-id";
    id.textContent = `ID://${actor.id.slice(0, 4).toUpperCase()}-${actor.id.slice(-2).toUpperCase()}\nSYS://ONLINE\nUSR://${tag(actor.system.class?.value?.name ?? "RUNNER")}`;
    id.insertAdjacentHTML("beforeend", `<span class="eh-barcode"></span>`);
    el.querySelector(".portrait")?.append(id);
    const foot = document.createElement("div");
    foot.className = "eh-deco-foot";
    foot.innerHTML = `<span class="eh-barcode"></span><span>CHAR://NODE\nSYS://${Humanity.summary(actor).cyberpsycho ? "BREACH" : "ONLINE"}</span>`;
    el.querySelector(".window-content")?.append(foot);
    const glitch = document.createElement("div");
    glitch.className = "eh-glitch";
    el.append(glitch);
  },

  // Uma rajada a cada ~1,5s (normal) ou ~0,3s (psicose), com 2–4 riscos perto das bordas.
  start(sheet, psycho) {
    const layer = sheet.element.querySelector(".eh-glitch");
    if (!layer) return;
    const burst = () => {
      if (document.hidden || !layer.isConnected) return;
      const { width: w, height: h } = layer.getBoundingClientRect();
      const n = psycho ? 6 + Math.floor(Math.random() * 7) : 3 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) layer.append(this.spark(w, h, psycho));
    };
    const tick = () => {
      burst();
      const base = psycho ? 150 : 700;
      sheet._ehFxTimer = setTimeout(tick, base + Math.random() * base);
    };
    sheet._ehFxTimer = setTimeout(tick, 400);
  },

  spark(w, h, psycho) {
    const s = document.createElement("i");
    const edge = Math.random();
    const band = Math.random() < (psycho ? 0.45 : 0.2);
    let len = band ? 60 + Math.random() * (psycho ? 360 : 180) : 12 + Math.random() * (psycho ? 180 : 90);
    const thick = band ? 6 + Math.random() * (psycho ? 22 : 12) : 1 + Math.random() * (psycho ? 6 : 3);
    // Esquerda, direita, topo ou base (um quarto cada), sempre perto da borda: o miolo fica legível.
    const margin = psycho ? 0.14 : 0.1;
    if (edge < 0.5) len = Math.min(len, w * (psycho ? 0.16 : 0.12));
    let x, y;
    if (edge < 0.25) { x = Math.random() * w * margin; y = Math.random() * h; }
    else if (edge < 0.5) { x = w - Math.random() * w * margin - len; y = Math.random() * h; }
    else if (edge < 0.75) { x = Math.random() * (w - len); y = Math.random() * h * margin * 0.5; }
    else { x = Math.random() * (w - len); y = h - Math.random() * h * margin * 0.5 - thick; }
    const colors = psycho ? ["#ff1f3d", "#ff5a6e", "#ffffff", "#19e3ff"] : ["var(--eh-y)", "var(--eh-y)", "#19e3ff", "#ff2a4f"];
    s.className = band ? "eh-g-band" : "";
    s.style.cssText = `left:${x}px;top:${y}px;width:${len}px;height:${thick}px;--c:${colors[Math.floor(Math.random() * colors.length)]};`
      + `--d:${120 + Math.random() * (psycho ? 320 : 200)}ms;--dx:${(Math.random() * 2 - 1) * (psycho ? 28 : 8)}px`;
    s.addEventListener("animationend", () => s.remove(), { once: true });
    return s;
  },

  stop(sheet) {
    clearTimeout(sheet._ehFxTimer);
    sheet._ehFxTimer = null;
  },

  refreshAll() {
    for (const app of foundry.applications.instances.values()) {
      if (app.element?.classList.contains("edgeheart-sheet")) this.apply(app);
    }
  }
};

// ---------- Ficha ----------

function defineSheet() {
  const Base = game.system.api.applications.sheets.actors.Character;

  return class EdgeheartCharacterSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["edgeheart-sheet"],
      actions: {
        ehAdvanceHumanity: EdgeheartCharacterSheet.#advanceHumanity,
        ehReduceHumanity: EdgeheartCharacterSheet.#reduceHumanity,
        ehRollHumanity: EdgeheartCharacterSheet.#rollHumanity,
        ehStabilize: EdgeheartCharacterSheet.#stabilize,
        ehEndCyberpsychosis: EdgeheartCharacterSheet.#endCyberpsychosis,
        ehOpenChrome: EdgeheartCharacterSheet.#openChrome,
        ehOpenCyberware: EdgeheartCharacterSheet.#openCyberware,
        ehChooseCyberware: EdgeheartCharacterSheet.#chooseCyberware,
        ehEidolonMobilize: EdgeheartCharacterSheet.#eidolonMobilize,
        ehEidolonUnsync: EdgeheartCharacterSheet.#eidolonUnsync,
        ehEidolonRepair: EdgeheartCharacterSheet.#eidolonRepair,
        ehEidolonBond: EdgeheartCharacterSheet.#eidolonBond
      }
    };

    static PARTS = {
      ...Base.PARTS,
      chrome: {
        id: "chrome",
        scrollable: [".eh-chrome"],
        template: `modules/${MODULE_ID}/templates/chrome-tab.hbs`
      }
    };

    static TABS = {
      primary: {
        ...Base.TABS.primary,
        tabs: [
          ...Base.TABS.primary.tabs.slice(0, 1),
          { id: "chrome", label: "Chrome" },
          ...Base.TABS.primary.tabs.slice(1)
        ]
      }
    };

    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      if (partId === "chrome") {
        context.edgeheart = Humanity.view(this.document);
        context.isGM = game.user.isGM;
      }
      return context;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      // Marca o ator como Edgeheart na primeira vez que abre nesta ficha.
      if (this.isEditable && !this.document.getFlag(MODULE_ID, "edgeheart")) {
        this.document.setFlag(MODULE_ID, "edgeheart", true);
      }
      this.#renderHeaderBadge();
      SheetFx.apply(this);
    }

    _onClose(options) {
      SheetFx.stop(this);
      super._onClose(options);
    }

    // Resumo compacto ao lado da Esperança, visível em qualquer aba. Contadores e dados que já aparecem
    // na própria feature (Cover, Kill Chain Die) não se repetem aqui, como no sistema; só entram as
    // escolhas de feature (Atributo Calibrado, Public Persona), que não aparecem em outro lugar.
    #renderHeaderBadge() {
      const anchor = this.element.querySelector(".character-row .resource-section");
      if (!anchor) return;
      this.element.querySelector(".eh-header-badge")?.remove();
      const s = Humanity.summary(this.document);
      const badge = document.createElement("a");
      badge.className = `eh-header-badge${s.cyberpsycho ? " eh-psycho" : ""}${s.lost ? " eh-lost" : ""}`;
      badge.dataset.action = "ehOpenChrome";
      const picks = Pick.items(this.document);
      badge.dataset.tooltip = [t("Humanity.Label"), t("Humanity.CyberLoad"), ...picks.map(i => i.getFlag(MODULE_ID, "pick").title)].join(" / ");
      badge.innerHTML = `<i class="fa-solid fa-heart-pulse"></i> d${s.die} <span class="eh-sep">|</span> <i class="fa-solid fa-gear"></i> ${s.load}`
        + picks.map(i => ` <span class="eh-sep">|</span> <i class="fa-solid ${i.getFlag(MODULE_ID, "pick").icon ?? "fa-list-check"}"></i> ${Pick.label(i)}`).join("")
        + (s.cyberpsycho ? ` <span class="eh-flag">${t("Humanity.Flag.psycho")}</span>` : "")
        + (s.lost ? ` <span class="eh-flag">${t("Humanity.Flag.lost")}</span>` : "");
      anchor.after(badge);
    }

    static async #advanceHumanity() { await Humanity.advance(this.document); }

    static async #reduceHumanity() { await Humanity.reduce(this.document, t("Humanity.ReasonManual")); }

    static async #rollHumanity() { await Humanity.roll(this.document, { reason: t("Humanity.ReasonSheet") }); }

    static async #stabilize() {
      const helper = helperActor(this.document);
      if (!helper) return ui.notifications.warn(t("Common.SelectHelperToken"));
      await asOwner(this.document, "stabilize", { actorUuid: this.document.uuid, helperUuid: helper.uuid });
    }

    static async #endCyberpsychosis() {
      if (!game.user.isGM) return ui.notifications.warn(t("Humanity.OnlyGMEnd"));
      await Humanity.end(this.document, { resolved: true });
      await chat(this.document, t("Humanity.ChatGMEnded", { name: this.document.name }));
    }

    static #openChrome() { this.changeTab("chrome", "primary"); }

    static #openCyberware() {
      const pack = game.packs.get(`${MODULE_ID}.edgeheart-cyberware`);
      if (!pack) return ui.notifications.warn(t("Cyberware.PackMissing"));
      pack.render(true);
    }

    static async #chooseCyberware(_event, target) {
      const item = await fromUuid(target.dataset.itemUuid);
      if (item) await Cyberware.choose(item);
    }

    static async #eidolonMobilize(_event, target) {
      const item = await fromUuid(target.dataset.itemUuid);
      if (item) await Eidolon.mobilize(this.document, item);
    }

    static async #eidolonUnsync() { await Eidolon.unsync(this.document); }

    static async #eidolonRepair(_event, target) {
      const item = await fromUuid(target.dataset.itemUuid);
      if (item) await Eidolon.repair(item);
    }

    static async #eidolonBond(_event, target) {
      const item = await fromUuid(target.dataset.itemUuid);
      if (item) await item.setFlag(MODULE_ID, "eidolon.bonded", !item.getFlag(MODULE_ID, "eidolon").bonded);
    }
  };
}

// ---------- Kill Chain Die (Solo) ----------
// O tamanho do dado fica em system.resource.dieFaces da feature "Kill Chain" (recurso "die" do
// sistema, que desenha o dado na ficha) e o último resultado em system.resource.value.
// Enquanto o dado está acima de d4, um efeito de duração "cena" fica no personagem: quando o
// refresh de cena do Daggerheart o remove, o dado volta a d4.
const KILL_CHAIN_STEPS = ["d4", "d6", "d8", "d10", "d12", "d20"];
const KILL_CHAIN_ACTIONS = { roll: "Rolar Kill Chain Die", step: "Aumentar Kill Chain Die", reset: "Resetar Kill Chain Die" };

const KillChain = {
  feature(actor) {
    return actor?.items.find(i => i.getFlag(MODULE_ID, "killChain"));
  },

  faces(item) {
    return item.system.resource?.dieFaces ?? "d4";
  },

  async set(item, faces, value = 0) {
    await item.update({ "system.resource.dieFaces": faces, "system.resource.value": value });
    const actor = item.parent;
    const timer = actor.effects.find(e => e.getFlag(MODULE_ID, "killChainTimer"));
    if (faces === "d4") {
      if (timer) await timer.delete({ [MODULE_ID]: { killChainReset: true } });
    } else if (!timer) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Kill Chain", img: item.img, type: "base",
        description: t("KillChain.EffectDescription"),
        system: { changes: [], duration: { description: t("KillChain.EffectDuration"), type: "scene" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
        flags: { [MODULE_ID]: { killChainTimer: true } }
      }]);
    }
  },

  async roll(item) {
    const faces = this.faces(item);
    const roll = await new Roll(`1${faces}`).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: item.parent }), flavor: t("KillChain.RollFlavor", { faces }) });
    await item.update({ "system.resource.value": roll.total });
  },

  async step(item) {
    const faces = this.faces(item);
    const next = KILL_CHAIN_STEPS[Math.min(KILL_CHAIN_STEPS.indexOf(faces) + 1, KILL_CHAIN_STEPS.length - 1)];
    if (next === faces) return ui.notifications.info(t("KillChain.Max"));
    await this.set(item, next);
    await chat(item.parent, t("KillChain.ChatStep", { name: item.parent.name, from: faces, to: next }));
  },

  async reset(item, reason = "") {
    if (this.faces(item) === "d4" && !item.system.resource?.value) return;
    await this.set(item, "d4");
    await chat(item.parent, t("KillChain.ChatReset", { name: item.parent.name, reason: reason ? ` (${reason})` : "" }));
  }
};

// ---------- Cover (Infiltrator) ----------
// O Cover fica em system.resource.value da feature "Cover Work" (0 a 3; o refresh de cena do
// sistema zera). Cada item lista em flags.coverActions quanto Cover cada ação ganha ou gasta.
const COVER_TAKEDOWN = "Takedown";

const Cover = {
  feature(actor) {
    return actor?.items.find(i => i.getFlag(MODULE_ID, "cover"));
  },

  value(item) {
    return Number(item.system.resource?.value ?? 0);
  },

  max(item) {
    return Number(item.system.resource?.max ?? 3) || 3;
  },

  delta(action) {
    const map = action.item?.getFlag(MODULE_ID, "coverActions");
    const key = actionKeyIn(action, map);
    return key ? map[key] : 0;
  },

  // Confere antes da ação (e da janela de configuração) se há Cover para gastar ou espaço para ganhar.
  check(action) {
    const delta = this.delta(action);
    if (!delta) return true;
    const item = this.feature(action.actor);
    if (!item) {
      ui.notifications.warn(t("Cover.NoFeature", { action: action.name }));
      return false;
    }
    const value = this.value(item);
    if (delta < 0 && value < -delta) {
      ui.notifications.warn(t("Cover.NotEnough", { action: action.name, need: -delta, have: value }));
      return false;
    }
    if (delta > 0 && value >= this.max(item)) {
      ui.notifications.info(t("Cover.Max", { max: this.max(item) }));
      return false;
    }
    return true;
  },

  // O card da ação no chat já registra o uso e o contador da feature mostra o novo valor, como nas
  // cartas oficiais que gastam marcadores; por isso nenhuma mensagem extra.
  async apply(action) {
    const delta = this.delta(action);
    if (!delta) return;
    const item = this.feature(action.actor);
    if (!item) return;
    await item.update({ "system.resource.value": Math.clamp(this.value(item) + delta, 0, this.max(item)) });
  }
};

// Ações com rolagem de dados do sistema (diceSet, rolada dentro do card da ação) cujo dado depende do
// personagem: a fórmula é trocada antes da rolagem.
// - flag rollFormula do item ({ nomeDaAção: fórmula }), ex: Opening Strike = "(@tier)d6";
// - Takedown: d8 com Kill Window (flag takedownDie);
// - Integrated Chrome: d8 com Reinforced Build e Força calibrada.
function rollFormula(action) {
  const item = action.item;
  const actor = action.actor;
  const formulas = item?.getFlag(MODULE_ID, "rollFormula");
  const custom = formulas?.[actionKeyIn(action, formulas)];
  if (custom) return Roll.replaceFormulaData(custom, actor.getRollData());
  if (item?.getFlag(MODULE_ID, "cover") && isAction(action, COVER_TAKEDOWN)) {
    const faces = actor.items.find(i => i.getFlag(MODULE_ID, "takedownDie"))?.getFlag(MODULE_ID, "takedownDie");
    return faces ? `1${faces}` : null;
  }
  if (item?.getFlag(MODULE_ID, "integratedChrome") && isAction(action, CHROME_ACTIONS.use)) return `1${IntegratedChrome.faces(actor)}`;
  return null;
}

// ---------- Escolhas de feature (Atributo Calibrado, Public Persona...) ----------
// flag pick do item: { action, title, prompt, icon, options: { id: rótulo } }. A ação com esse nome
// abre a escolha (em vez de ser usada no sistema) e o valor escolhido fica no flag "picked".
// As escolhas feitas aparecem no selo do cabeçalho da ficha.
const Pick = {
  items(actor) {
    return actor?.items.filter(i => i.getFlag(MODULE_ID, "pick")) ?? [];
  },

  value(item) {
    return item?.getFlag(MODULE_ID, "picked") ?? null;
  },

  label(item) {
    const value = this.value(item);
    return value ? item.getFlag(MODULE_ID, "pick").options[value] ?? value : "—";
  },

  async choose(item) {
    const actor = item.parent;
    const pick = item.getFlag(MODULE_ID, "pick");
    const current = this.value(item);
    const value = await foundry.applications.api.DialogV2.wait({
      window: { title: pick.title },
      content: `<p>${pick.prompt ?? t("Pick.Prompt", { title: pick.title })}</p>`,
      buttons: Object.entries(pick.options).map(([action, label]) => ({ action, label, default: action === current })),
      rejectClose: false
    });
    if (!value) return;
    await item.setFlag(MODULE_ID, "picked", value);
    if (item.getFlag(MODULE_ID, "integratedChrome")) await IntegratedChrome.syncReinforcedBuild(actor);
    await chat(actor, t("Pick.ChatChose", { name: actor.name, option: pick.options[value], title: pick.title }));
  }
};

// ---------- Integrated Chrome (Augmented) ----------
// O Atributo Calibrado é a escolha (Pick) da feature Integrated Chrome. Reinforced Build
// (Titan Frame) tem um efeito de +1 de Armadura que só fica ligado com Força calibrada.
const CHROME_ACTIONS = { use: "Integrated Chrome" };

const IntegratedChrome = {
  feature(actor) {
    return actor?.items.find(i => i.getFlag(MODULE_ID, "integratedChrome"));
  },

  calibrated(actor) {
    return Pick.value(this.feature(actor));
  },

  async syncReinforcedBuild(actor) {
    const on = this.calibrated(actor) === "strength";
    for (const item of actor.items.filter(i => i.getFlag(MODULE_ID, "reinforcedBuild"))) {
      const updates = item.effects.filter(e => e.disabled === on).map(e => ({ _id: e.id, disabled: !on }));
      if (updates.length) await item.updateEmbeddedDocuments("ActiveEffect", updates);
    }
  },

  // Dado do Integrated Chrome: d6, ou d8 com Reinforced Build e Força calibrada.
  faces(actor) {
    const reinforced = this.calibrated(actor) === "strength" && actor.items.some(i => i.getFlag(MODULE_ID, "reinforcedBuild"));
    return reinforced ? "d8" : "d6";
  }
};

// ---------- Eidolons (Cyberware Especial) ----------
// Mesmo padrão do Beastform do sistema, feito pelo módulo porque o Eidolon também troca os PV:
// Mobilizar guarda o estado do piloto (PV marcados, itens equipados, token) em flags.eidolonSync,
// desequipa as armas e armadura dele, cria as peças do Eidolon (armas embutidas com a Interface do
// piloto, features e a armadura "Estrutura") e aplica um efeito com os PV máximos e a Evasão do Eidolon.
// Os Limiares vêm da armadura Estrutura (o sistema soma o nível, então a base é o valor do PDF − nível).
// Dessincronizar guarda o dano do Eidolon no item e devolve tudo ao piloto.
const Eidolon = {
  items(actor) {
    return actor.items.filter(i => i.getFlag(MODULE_ID, "eidolon"));
  },

  state(actor) {
    return actor?.getFlag(MODULE_ID, "eidolonSync") ?? null;
  },

  synced(actor) {
    const s = this.state(actor);
    return s ? actor.items.get(s.itemId) ?? null : null;
  },

  syncCost(actor) {
    return Number(this.synced(actor)?.getFlag(MODULE_ID, "eidolon")?.syncCost ?? 0);
  },

  parts(actor) {
    return actor.items.filter(i => i.getFlag(MODULE_ID, "eidolonPart"));
  },

  effect(actor) {
    return actor.effects.find(e => e.getFlag(MODULE_ID, "eidolonEffect"));
  },

  view(actor) {
    const s = this.state(actor);
    return this.items(actor).map(i => {
      const d = i.getFlag(MODULE_ID, "eidolon");
      const synced = s?.itemId === i.id;
      return {
        uuid: i.uuid, name: i.name, img: i.img, syncCost: d.syncCost, hp: d.hp, evasion: d.evasion, armor: d.armor,
        thresholds: d.thresholds.join("/"), bonded: d.bonded, disabled: d.disabled, hpMarked: synced && !s.overclock ? actor.system.resources.hitPoints.value : d.hpMarked,
        link: `${accessLabel(d.link.level)}: ${d.link.competencies.map(c => COMPETENCIES[c] ?? c).join(", ")}`,
        synced, overclock: synced && !!s.overclock, canMobilize: !s && !d.disabled
      };
    });
  },

  async setTokens(actor, src) {
    await actor.update({ "prototypeToken.texture.src": src });
    for (const token of actor.getActiveTokens(false, true)) await token.update({ "texture.src": src });
  },

  // Rolagem de Humanidade de sincronização (sem Soul Bond ou Hard Disconnect usa a do sistema da ficha).
  async unbondedSync(actor, data, item) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Eidolon.UnbondedTitle") },
      content: t("Eidolon.UnbondedPrompt", { name: actor.name, item: item.name })
    });
    if (!ok) return false;
    const stress = actor.system.resources.stress;
    await actor.update({ "system.resources.stress.value": Math.min(stress.max, stress.value + 2) });
    const die = Humanity.die(actor);
    const load = Humanity.rollLoad(actor) + Number(data.syncCost);
    const roll = await new Roll(`1d${die}`).evaluate();
    const success = roll.total > load;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="eh-chat"><h3>${t("Eidolon.UnbondedRollTitle")}</h3><p>${t("Eidolon.UnbondedLine", { die, total: roll.total, load, item: item.name })}</p><p class="eh-outcome ${success ? "eh-ok" : "eh-bad"}">${t(success ? "Eidolon.SyncOk" : "Eidolon.SyncFail")}</p></div>`
    });
    return success;
  },

  async mobilize(actor, item) {
    if (this.state(actor)) return ui.notifications.warn(t("Eidolon.AlreadySynced", { name: actor.name }));
    const data = item.getFlag(MODULE_ID, "eidolon");
    if (data.disabled) return ui.notifications.warn(t("Eidolon.IsDisabled", { item: item.name }));
    if (!data.bonded && !(await this.unbondedSync(actor, data, item))) return;

    const level = actor.system.levelData?.level?.current ?? 1;
    const pilotHp = actor.system.resources.hitPoints.value;
    const equipped = actor.items.filter(i => ["weapon", "armor"].includes(i.type) && i.system.equipped && !i.getFlag(MODULE_ID, "eidolonPart")).map(i => i.id);
    if (equipped.length) await actor.updateEmbeddedDocuments("Item", equipped.map(id => ({ _id: id, "system.equipped": false })));

    const trait = actor.system.spellcastModifierTrait?.key ?? "knowledge";
    const parts = foundry.utils.deepClone(data.parts).map(part => {
      part.flags = { ...(part.flags ?? {}), [MODULE_ID]: { ...(part.flags?.[MODULE_ID] ?? {}), eidolonPart: item.id } };
      if (part.type === "weapon") { part.system.equipped = true; part.system.attack.roll.trait = trait; }
      if (part.type === "armor") {
        part.system.equipped = true;
        part.system.armor.current = data.armorMarked ?? 0;
        part.system.baseThresholds = { major: data.thresholds[0] - level, severe: data.thresholds[1] - level };
      }
      return part;
    });
    await actor.createEmbeddedDocuments("Item", parts);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: t("Eidolon.EffectName", { item: item.name }), img: item.img, type: "base",
      description: t("Eidolon.EffectDescription"),
      flags: { [MODULE_ID]: { eidolonEffect: true } },
      system: {
        changes: [
          { key: "system.resources.hitPoints.max", type: "override", value: data.hp, priority: 50, phase: "initial" },
          { key: "system.evasion", type: "override", value: data.evasion, priority: 50, phase: "initial" }
        ],
        duration: { description: "" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: []
      }
    }]);
    await actor.update({
      "system.resources.hitPoints.value": data.hpMarked ?? 0,
      [`flags.${MODULE_ID}.eidolonSync`]: { itemId: item.id, pilotHp, equipped, tokenImg: actor.prototypeToken.texture.src, overclock: false }
    });
    // Token redondo do Eidolon (flag token); itens antigos sem ele usam a imagem do item.
    await this.setTokens(actor, data.token ?? item.img);
    await queueAccessSync(actor);
    await chat(actor, t("Eidolon.ChatMobilized", { name: actor.name, item: item.name, cost: data.syncCost }));
  },

  async unsync(actor, { quiet = false } = {}) {
    const s = this.state(actor);
    if (!s) return;
    const item = actor.items.get(s.itemId);
    const frame = this.parts(actor).find(i => i.type === "armor");
    if (item) {
      const data = item.getFlag(MODULE_ID, "eidolon");
      const hpMarked = s.overclock ? data.hp : actor.system.resources.hitPoints.value;
      await item.update({
        [`flags.${MODULE_ID}.eidolon.hpMarked`]: Math.min(hpMarked, data.hp),
        [`flags.${MODULE_ID}.eidolon.armorMarked`]: frame?.system.armor.current ?? 0,
        [`flags.${MODULE_ID}.eidolon.disabled`]: data.disabled || hpMarked >= data.hp
      });
    }
    const pilotHp = s.overclock ? actor.system.resources.hitPoints.value : s.pilotHp;
    const partIds = this.parts(actor).map(i => i.id);
    if (partIds.length) await actor.deleteEmbeddedDocuments("Item", partIds);
    const effect = this.effect(actor);
    if (effect) await effect.delete();
    const equipped = (s.equipped ?? []).filter(id => actor.items.get(id));
    if (equipped.length) await actor.updateEmbeddedDocuments("Item", equipped.map(id => ({ _id: id, "system.equipped": true })));
    await actor.update({ "system.resources.hitPoints.value": pilotHp, [`flags.${MODULE_ID}.eidolonSync`]: new foundry.data.operators.ForcedDeletion() });
    await this.setTokens(actor, s.tokenImg);
    await queueAccessSync(actor);
    if (!quiet) await chat(actor, item ? t("Eidolon.ChatUnsyncedFrom", { name: actor.name, item: item.name }) : t("Eidolon.ChatUnsynced", { name: actor.name }));
  },

  async repair(item) {
    await item.update({ [`flags.${MODULE_ID}.eidolon.hpMarked`]: 0, [`flags.${MODULE_ID}.eidolon.armorMarked`]: 0, [`flags.${MODULE_ID}.eidolon.disabled`]: false });
    await chat(item.parent, t("Eidolon.ChatRepaired", { item: item.name }));
  },

  // Último PV do Eidolon marcado: as três escolhas do PDF.
  async disabled(actor) {
    const item = this.synced(actor);
    if (!item) return;
    await item.setFlag(MODULE_ID, "eidolon.disabled", true);
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("Eidolon.DisabledTitle", { item: item.name }) },
      content: t("Eidolon.DisabledPrompt", { item: item.name }),
      buttons: [{ action: "stay", label: "Stay Inside" }, { action: "disconnect", label: "Hard Disconnect" }, { action: "overclock", label: "Emergency Overclock" }],
      rejectClose: false
    });
    if (choice === "disconnect") {
      const stress = actor.system.resources.stress;
      await actor.update({ "system.resources.stress.value": Math.min(stress.max, stress.value + 2) });
      await Humanity.roll(actor, { reason: t("Humanity.ReasonHardDisconnect", { item: item.name }) });
      await this.unsync(actor);
    } else if (choice === "overclock") {
      const s = this.state(actor);
      const effect = this.effect(actor);
      if (effect) await effect.update({ "system.changes": effect.system.changes.filter(c => c.key !== "system.resources.hitPoints.max") });
      await actor.update({ "system.resources.hitPoints.value": s.pilotHp, [`flags.${MODULE_ID}.eidolonSync.overclock`]: true });
      await chat(actor, t("Eidolon.ChatOverclock", { item: item.name, name: actor.name }));
    } else {
      await chat(actor, t("Eidolon.ChatStayInside", { name: actor.name, item: item.name }));
    }
  }
};

// ---------- Ganchos dos Eidolons ----------
// Último PV do Eidolon (fora do Overclock): pergunta ao dono que fez a alteração.
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (userId !== game.user.id || !foundry.utils.hasProperty(changes, "system.resources.hitPoints.value")) return;
  const s = Eidolon.state(actor);
  if (!s || s.overclock) return;
  const item = Eidolon.synced(actor);
  if (item?.getFlag(MODULE_ID, "eidolon").disabled) return;
  const hp = actor.system.resources.hitPoints;
  if (hp.max > 0 && hp.value >= hp.max) Eidolon.disabled(actor);
});

// Disabled (Stay Inside): as peças do Eidolon não funcionam. Overclock: 1 PV no fim de cada ação.
Hooks.on("daggerheart.preUseAction", (action) => {
  const actor = action.actor;
  const s = Eidolon.state(actor);
  if (!s || s.overclock || !action.item?.getFlag(MODULE_ID, "eidolonPart")) return;
  if (Eidolon.synced(actor)?.getFlag(MODULE_ID, "eidolon").disabled) {
    ui.notifications.warn(t("Eidolon.DisabledWarn"));
    return false;
  }
});

Hooks.on("daggerheart.postUseAction", async (action) => {
  const actor = action.actor;
  if (!actor?.isOwner || !Eidolon.state(actor)?.overclock) return;
  const hp = actor.system.resources.hitPoints;
  await actor.update({ "system.resources.hitPoints.value": Math.min(hp.max, hp.value + 1) });
});
// ---------- Ganchos ----------

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "defaultSheet", {
    name: "EDGEHEART.Settings.DefaultSheet.Name",
    hint: "EDGEHEART.Settings.DefaultSheet.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULE_ID, "edgeheartLevelup", {
    name: "EDGEHEART.Settings.Levelup.Name",
    hint: "EDGEHEART.Settings.Levelup.Hint",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => EdgeheartLevelup.sync()
  });
  game.settings.register(MODULE_ID, "sheetFx", {
    name: "EDGEHEART.Settings.SheetFx.Name",
    hint: "EDGEHEART.Settings.SheetFx.Hint",
    scope: "client", config: true, type: String, default: "full",
    choices: { full: "EDGEHEART.Settings.SheetFx.full", static: "EDGEHEART.Settings.SheetFx.static", off: "EDGEHEART.Settings.SheetFx.off" },
    onChange: () => SheetFx.refreshAll()
  });
  game.settings.register(MODULE_ID, "levelTiersBackup", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "levelupApplied", { scope: "world", config: false, type: Boolean, default: false });

  foundry.applications.handlebars.loadTemplates([`modules/${MODULE_ID}/templates/chrome-tab.hbs`]);
  // Pedidos de jogadores ao mestre (ver asOwner).
  CONFIG.queries[QUERY] = async ({ action, payload }) => { await handlers[action]?.(payload); return true; };
});

Hooks.once("setup", () => {
  const Sheet = defineSheet();
  foundry.documents.collections.Actors.registerSheet(MODULE_ID, Sheet, {
    types: ["character"], label: "EDGEHEART.Sheet.Label", makeDefault: false
  });
});

// Ciberpsicose: sem Dado de Esperança. Nada do sistema é alterado: o d20 de Medo vem do efeito
// (system.rules.dualityRoll.defaultFearDice = 20) e, neste hook oficial do Daggerheart (chamado com
// a rolagem já configurada e ainda não avaliada), o Dado de Esperança desta rolagem passa a ter 0
// dados. Fica "0d12 + 1d20 + atributo": nunca crítica e sempre com Medo.
Hooks.on("daggerheart.postDualityRollConfiguration", (roll) => {
  const actor = roll.data?.parent;
  if (!(actor instanceof Actor) || !Humanity.isCyberpsycho(actor)) return;
  roll.dHope.number = 0;
});

Hooks.once("ready", () => {
  EdgeheartLevelup.sync();
});

Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type !== "character" || !game.settings.get(MODULE_ID, "defaultSheet")) return;
  if (data.flags?.core?.sheetClass) return;
  actor.updateSource({ "flags.core.sheetClass": SHEET_ID, [`flags.${MODULE_ID}.edgeheart`]: true });
});

// Em Ciberpsicose, features que exigiriam marcar Estresse podem ser usadas sem marcar.
Hooks.on("daggerheart.preUseAction", (action, config) => {
  const actor = action.actor;
  if (!Humanity.isEdgeheart(actor) || !Humanity.isCyberpsycho(actor) || !config.costs?.length) return;
  config.costs = config.costs.filter(c => c.key !== "stress");
});

// Kill Chain Die: as três ações da feature são tratadas aqui (retornar false cancela o uso normal
// da ação no sistema). "No Way Back" usa a ação normal e também ajusta o dado para d10.
Hooks.on("daggerheart.preUseAction", (action, config) => {
  const item = action.item;
  if (!(item?.parent instanceof Actor) || !item.parent.isOwner) return;
  if (item.getFlag(MODULE_ID, "killChain")) {
    const handler = Object.entries({ [KILL_CHAIN_ACTIONS.roll]: "roll", [KILL_CHAIN_ACTIONS.step]: "step", [KILL_CHAIN_ACTIONS.reset]: "reset" }).find(([name]) => isAction(action, name))?.[1];
    if (!handler) return;
    KillChain[handler](item);
    return false;
  }
  if (isAction(action, "No Way Back")) {
    const killChain = KillChain.feature(item.parent);
    if (killChain) KillChain.set(killChain, "d10");
  }
});

// Cover: sem saldo (ou já no máximo) a ação nem começa; a variação só é aplicada depois que a ação
// termina, então cancelar a janela de configuração não gasta Cover. Aqui também entra o dado que
// depende do personagem (ver rollFormula).
Hooks.on("daggerheart.preUseAction", (action, config) => {
  const item = action.item;
  if (!(item?.parent instanceof Actor) || !item.parent.isOwner) return;
  if (!Cover.check(action)) return false;
  const formula = rollFormula(action);
  if (formula && config.roll) config.roll.formula = formula;
});

Hooks.on("daggerheart.postUseAction", (action) => {
  const item = action.item;
  if (!(item?.parent instanceof Actor) || !item.parent.isOwner) return;
  Cover.apply(action);
});

// Ações de escolha (ex: "Calibrar Atributo") abrem a escolha do módulo em vez de usar a ação no sistema.
Hooks.on("daggerheart.preUseAction", (action) => {
  const item = action.item;
  if (!(item?.parent instanceof Actor) || !item.parent.isOwner) return;
  if (isAction(action, item.getFlag(MODULE_ID, "pick")?.action)) {
    Pick.choose(item);
    return false;
  }
});

// Reinforced Build recém-adicionado: liga/desliga o +1 de Armadura conforme o Atributo Calibrado.
Hooks.on("createItem", (item, options, userId) => {
  if (userId !== game.user.id || !(item.parent instanceof Actor) || !item.getFlag(MODULE_ID, "reinforcedBuild")) return;
  IntegratedChrome.syncReinforcedBuild(item.parent);
});

// Fim de cena (refresh do sistema remove o efeito de duração "cena"): o dado volta a d4.
Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (userId !== game.user.id || !effect.getFlag(MODULE_ID, "killChainTimer") || options?.[MODULE_ID]?.killChainReset) return;
  const item = KillChain.feature(effect.parent);
  if (item) await KillChain.reset(item, t("KillChain.ReasonSceneEnd"));
});

// "Faça uma Rolagem de Humanidade quando rolar com Medo com todo o Estresse marcado ou sem Esperança."
Hooks.on("daggerheart.postRollDuality", (config) => {
  if (config.roll?.result?.duality !== -1) return;
  const actor = config.data?.parent ?? (config.source?.actor ? fromUuidSync(config.source.actor) : null);
  if (!Humanity.isEdgeheart(actor) || !actor.isOwner || Humanity.isCyberpsycho(actor) || Humanity.isLost(actor)) return;
  const { stress, hope } = actor.system.resources;
  const stressFull = stress.value >= stress.max;
  const noHope = (hope?.value ?? 0) <= 0;
  if (!stressFull && !noHope) return;
  const reason = t(stressFull ? "Humanity.ReasonFearStress" : "Humanity.ReasonFearHope");
  // Depois da mensagem da rolagem original, para o chat ficar na ordem certa.
  setTimeout(() => Humanity.roll(actor, { reason }), 800);
});

// Fim de cena ainda em Ciberpsicose: o refresh de cena do sistema remove o efeito (duração
// "scene") sem a opção "resolved"; aí o Dado de Humanidade cai um passo.
Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (userId !== game.user.id || !effect.getFlag(MODULE_ID, "cyberpsychosis")) return;
  if (options?.[MODULE_ID]?.resolved) return;
  const actor = effect.parent;
  if (actor instanceof Actor) await Humanity.reduce(actor, t("Humanity.ReasonScenePsycho"));
});

// Instalação de cyberware (item arrastado para o personagem): escolhas do PDF e weaponware
// sempre equipado. O equipar usa a mesma regra do sistema (unequipBeforeEquip) para liberar o espaço.
Hooks.on("createItem", async (item, options, userId) => {
  if (userId !== game.user.id || !(item.parent instanceof Actor) || !item.getFlag(MODULE_ID, "cyberware")) return;
  const actor = item.parent;
  if (item.type === "weapon" && !item.system.equipped) {
    await actor.system.constructor.unequipBeforeEquip.call(actor.system, item);
    await item.update({ "system.equipped": true });
  }
  if (item.getFlag(MODULE_ID, "choice") && !item.getFlag(MODULE_ID, "chosen")) await Cyberware.choose(item);
  if (item.getFlag(MODULE_ID, "access") || item.getFlag(MODULE_ID, "choice")) queueAccessSync(actor);
  // Aviso de risco: a Carga passou do ponto em que a Rolagem de Humanidade costuma falhar.
  if (Humanity.isEdgeheart(actor)) {
    const s = Humanity.summary(actor);
    if (s.controlChance < 50) ui.notifications.warn(t("Humanity.LoadWarning", { name: actor.name, load: s.load, die: s.die, chance: s.controlChance }));
  }
});

// Uma sincronização por vez por personagem (instalar + escolher disparam atualizações seguidas).
const accessQueues = new Map();
function queueAccessSync(actor) {
  const previous = accessQueues.get(actor.id) ?? Promise.resolve();
  const next = previous.then(() => AccessClass.sync(actor)).catch(err => console.error("Edgeheart | Acessos Cibernéticos:", err));
  accessQueues.set(actor.id, next);
  return next;
}

Hooks.on("updateItem", (item, changes, options, userId) => {
  if (userId !== game.user.id || !(item.parent instanceof Actor) || !item.getFlag(MODULE_ID, "cyberware")) return;
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.access`)) queueAccessSync(item.parent);
});

Hooks.on("deleteItem", (item, options, userId) => {
  if (userId !== game.user.id || !(item.parent instanceof Actor)) return;
  if (item.getFlag(MODULE_ID, "cyberware") && item.getFlag(MODULE_ID, "access")) queueAccessSync(item.parent);
});

// Arquivo Neural que criou uma Experiência nova: desinstalar remove a Experiência também.
Hooks.on("deleteItem", async (item, options, userId) => {
  if (userId !== game.user.id || !(item.parent instanceof Actor)) return;
  const id = item.getFlag(MODULE_ID, "linkedExperience");
  if (item.getFlag(MODULE_ID, "choice") !== "neuralArchive" || !id || item.effects.size) return;
  if (item.parent.system.experiences?.[id]) await item.parent.update({ [`system.experiences.-=${id}`]: null });
});

// Botão "Estabilizar" nos cards de chat.
Hooks.on("renderChatMessageHTML", (message, html) => {
  html.querySelectorAll('[data-eh-action="stabilize"]').forEach(button => {
    button.addEventListener("click", async () => {
      const actor = await fromUuid(button.dataset.actorUuid);
      if (!actor) return;
      const helper = helperActor(actor);
      if (!helper) return ui.notifications.warn(t("Common.SelectHelperToken"));
      if (!helper.isOwner) return ui.notifications.warn(t("Common.NotOwner", { name: helper.name }));
      await asOwner(actor, "stabilize", { actorUuid: actor.uuid, helperUuid: helper.uuid });
    });
  });
});

// Botão "Novo Personagem Edgeheart" no diretório de Atores.
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.can("ACTOR_CREATE") || html.querySelector(".eh-new-character")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "eh-new-character";
  button.innerHTML = `<i class="fa-solid fa-microchip"></i> ${t("Sheet.NewCharacter")}`;
  button.addEventListener("click", async () => {
    await Actor.create({
      name: t("Sheet.NewCharacterName"), type: "character",
      flags: { core: { sheetClass: SHEET_ID }, [MODULE_ID]: { edgeheart: true } }
    }, { renderSheet: true });
  });
  (html.querySelector(".header-actions") ?? html.querySelector(".directory-header"))?.append(button);
});

// Criação de personagem da Ficha Edgeheart: enquanto ela estiver aberta, o navegador de compêndios
// do sistema (aberto pelos botões da criação) mostra só classes, subclasses, Trajetórias e Afiliações
// dos compêndios do Edgeheart. Só esconde linhas da lista; nada do sistema é alterado.
const EDGEHEART_PACK_UUID = `Compendium.${MODULE_ID}.edgeheart-`;
const CREATION_ONLY_TYPES = ["class", "subclass", "ancestry", "community"];

function edgeheartCreationOpen() {
  return [...foundry.applications.instances.values()].some(app =>
    app.options?.classes?.includes("character-creation") && Humanity.isEdgeheart(app.character));
}

function filterItemBrowser(browser) {
  const list = browser.element?.querySelector(".item-list");
  if (!list) return;
  const types = browser.selectedMenu?.data?.type ?? [];
  const active = types.some(t => CREATION_ONLY_TYPES.includes(t)) && edgeheartCreationOpen();
  for (const row of list.querySelectorAll(".item-container[data-item-uuid]")) {
    row.classList.toggle("eh-hidden", active && !row.dataset.itemUuid.startsWith(EDGEHEART_PACK_UUID));
  }
}

// A lista é preenchida depois do render (loadItems), por isso o observer.
Hooks.on("renderItemBrowser", (app) => {
  const list = app.element.querySelector(".item-list");
  if (!list || list.ehObserver) return;
  list.ehObserver = new MutationObserver(() => filterItemBrowser(app));
  list.ehObserver.observe(list, { childList: true });
  filterItemBrowser(app);
});

// Atributos sugeridos por subclasse: o sistema só tem os da classe (characterGuide). Quando a
// subclasse escolhida na criação tem flags.suggestedTraits (subclasses do Edgeheart), a lista
// mostrada e o botão "Usar" passam a usar os dela. Os itens do sistema não são alterados.
Hooks.on("renderDhCharacterCreation", (app) => {
  const traits = app.setup?.subclass?.getFlag?.(MODULE_ID, "suggestedTraits");
  if (!traits) return;
  const list = app.element.querySelector(".suggested-traits-container");
  if (list) {
    list.innerHTML = Object.keys(app.setup.traits).map(key => {
      const value = traits[key] ?? 0;
      const label = game.i18n.localize(`DAGGERHEART.CONFIG.Traits.${key}.short`);
      return `<div class="suggested-trait-container">${label} ${value > 0 ? `+${value}` : value}</div>`;
    }).join("");
    list.dataset.tooltip = t("Sheet.SubclassSuggestion", { name: app.setup.subclass.name });
  }
  const button = app.element.querySelector('[data-action="useSuggestedTraits"]');
  if (!button || button.dataset.ehSubclass) return;
  button.dataset.ehSubclass = "true";
  // Captura o clique antes da ação do sistema e faz o mesmo que ela, com os valores da subclasse.
  button.addEventListener("click", event => {
    const current = app.setup?.subclass?.getFlag?.(MODULE_ID, "suggestedTraits");
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    for (const key of Object.keys(app.setup.traits)) {
      app.setup.traits[key] = { ...app.setup.traits[key], value: current[key] ?? 0 };
    }
    app.setup.visibility = app.getUpdateVisibility();
    app.render();
  }, { capture: true });
});

// Acesso pelo console / macros: game.modules.get("edgeheart-cyberpunk").api.humanity
Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  mod.api = { ...(mod.api ?? {}), humanity: Humanity };
});
