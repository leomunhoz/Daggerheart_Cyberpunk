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
const SOCKET = `module.${MODULE_ID}`;
const HUMANITY_STEPS = [4, 6, 8, 10, 12];
const PSYCHO_IMG = `modules/${MODULE_ID}/assets/cpr/status/beserker_addiction.svg`;
const COMPETENCIES = {
  network: "Network", assault: "Assault", chrome: "Chrome", systems: "Systems", influence: "Influence",
  ghost: "Ghost", frontier: "Frontier", medtech: "Medtech", aegis: "Aegis", redline: "Redline", blackwall: "Blackwall"
};
const ACCESS = { full: "Acesso Total", half: "Meio Acesso", card: "Acesso de Carta" };
const TRAITS = { agility: "Agilidade", strength: "Força", finesse: "Acuidade", instinct: "Instinto", presence: "Presença", knowledge: "Conhecimento" };

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
    for (const d of actor.system.class?.value?.system?.domains ?? []) add(d, "full", "Classe");
    const multiclass = actor.items.find(i => i.type === "class" && i.system.isMulticlass && !i.getFlag(MODULE_ID, "cyberAccess"));
    for (const d of multiclass?.system.domains ?? []) add(d, "half", "Multiclasse");
    for (const item of this.cyberware(actor)) {
      const a = item.getFlag(MODULE_ID, "access");
      if (a?.competency && a?.level) add(a.competency, a.level, item.name);
    }
    return Object.values(map).map(e => ({
      ...e,
      kind: e.full ? "full" : e.half ? "half" : "card",
      label: e.label,
      kindLabel: e.full ? ACCESS.full : e.half ? ACCESS.half : `${ACCESS.card} (${e.cards})`,
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
        cards.forEach(c => issues.push({ uuid: c.uuid, name: c.name, problem: `sem acesso a ${label}` }));
        continue;
      }
      const limit = a.kind === "card" ? level : a.maxLevel;
      cards.filter(c => c.system.level > limit)
        .forEach(c => issues.push({ uuid: c.uuid, name: c.name, problem: `nível ${c.system.level} acima do permitido (${limit}) pelo ${a.kindLabel}` }));
      if (a.kind === "card" && cards.length > a.cards) {
        cards.slice(a.cards).forEach(c => issues.push({ uuid: c.uuid, name: c.name, problem: `mais cartas de ${label} do que Acessos de Carta (${a.cards})` }));
      }
    }
    return issues;
  },

  cyberLoad(actor) {
    const installed = this.cyberware(actor).reduce((sum, i) => sum + Number(i.getFlag(MODULE_ID, "cyberCost")), 0);
    return installed + Number(actor.getFlag(MODULE_ID, "cyberLoadMod") ?? 0);
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
      canAdvance: die < 12 && actor.getFlag(MODULE_ID, "humanityAdvancedAt") !== level,
      advancedThisLevel: actor.getFlag(MODULE_ID, "humanityAdvancedAt") === level,
      canReduce: !this.isLost(actor),
      load: this.cyberLoad(actor),
      loadMod: Number(actor.getFlag(MODULE_ID, "cyberLoadMod") ?? 0),
      cyberware: this.cyberware(actor).map(i => {
        const a = i.getFlag(MODULE_ID, "access");
        const r = i.system.resource;
        return {
          uuid: i.uuid, name: i.name, img: i.img,
          cost: Number(i.getFlag(MODULE_ID, "cyberCost") ?? 0), tier: i.getFlag(MODULE_ID, "tier"),
          access: a ? `${ACCESS[a.level]}: ${COMPETENCIES[a.competency] ?? a.competency}` : null,
          charges: r && i.type === "feature" ? `${r.value ?? 0}/${r.max}` : null,
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
    return {
      ...s,
      risk,
      state: s.lost ? "lost" : s.cyberpsycho ? "psycho" : "stable",
      stateLabel: s.lost ? "Perdido" : s.cyberpsycho ? "Ciberpsicose" : "Estável",
      cyberCount: s.cyberware.length,
      access: s.access.map(a => ({
        ...a,
        short: a.full ? "Total" : a.half ? "Meio" : `${a.cards} carta${a.cards > 1 ? "s" : ""}`,
        tooltip: `${a.kindLabel} · até nível ${a.maxLevel} · ${a.sources.join(", ")}`
      })),
      hasProblems: s.cardIssues.length > 0 || !!s.accessNote
    };
  },

  // "Você só pode avançar seu Dado de Humanidade uma vez por nível."
  async advance(actor) {
    const s = this.summary(actor);
    if (!s.canAdvance) {
      ui.notifications.warn(s.die >= 12 ? "O Dado de Humanidade já está no máximo (d12)." : "O Dado de Humanidade já avançou neste nível.");
      return;
    }
    const next = HUMANITY_STEPS[HUMANITY_STEPS.indexOf(s.die) + 1];
    await actor.update({
      [`flags.${MODULE_ID}.humanityDie`]: next,
      [`flags.${MODULE_ID}.humanityAdvancedAt`]: actor.system.levelData.level.current
    });
    await chat(actor, `<p><strong>${actor.name}</strong> avançou o Dado de Humanidade: d${s.die} → <strong>d${next}</strong>.</p>`);
  },

  // Reduz um passo. Abaixo de d4 o personagem está perdido (Movimento de Morte: Ciberpsicopata).
  async reduce(actor, reason = "") {
    const die = this.die(actor);
    const index = HUMANITY_STEPS.indexOf(die);
    if (index <= 0) return this.lose(actor, reason);
    const next = HUMANITY_STEPS[index - 1];
    await actor.setFlag(MODULE_ID, "humanityDie", next);
    await chat(actor, `<p><strong>${actor.name}</strong> perdeu Humanidade${reason ? ` (${reason})` : ""}: d${die} → <strong>d${next}</strong>.</p>`);
  },

  async lose(actor, reason = "") {
    await actor.setFlag(MODULE_ID, "lost", true);
    await chat(actor, `
      <h3>Movimento de Morte: Ciberpsicopata</h3>
      <p><strong>${actor.name}</strong> foi perdido para a Ciberpsicose${reason ? ` (${reason})` : ""}. Escolha um:</p>
      <ul>
        <li>Você desaparece na cidade como uma lenda urbana violenta.</li>
        <li>Sua equipe é forçada a te abater.</li>
        <li>Você se consome num último ato de destruição, salvando alguém ou completando o trabalho a um custo terrível.</li>
      </ul>
      <p>Depois, crie um novo personagem.</p>`);
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
    if (load < this.cyberLoad(actor)) notes.push("Integrated Chrome: Carga Cibernética tratada como 1 menor.");
    if (anchor) notes.push("Âncora de Humanidade: rolou duas vezes e usou o maior.");
    // Buffer Cortical (cyberware 37): marcar 1 Estresse para +1, oferecido só quando muda o resultado.
    const { stress } = actor.system.resources;
    if (total <= load && total + 1 > load && this.hasHumanityMod(actor, "buffer") && stress.value < stress.max) {
      const useBuffer = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Buffer Cortical" },
        content: `<p>Rolagem de Humanidade: <strong>${total}</strong> contra Carga <strong>${load}</strong>. Marcar 1 Estresse para somar +1 e manter o controle?</p>`
      });
      if (useBuffer) {
        await actor.update({ "system.resources.stress.value": stress.value + 1 });
        total += 1;
        notes.push("Buffer Cortical: marcou 1 Estresse para +1.");
      }
    }
    const inControl = total > load;
    const wasPsycho = this.isCyberpsycho(actor);

    let outcome;
    if (stabilize) outcome = inControl ? "A Ciberpsicose termina." : "A Ciberpsicose continua.";
    else if (inControl) outcome = "Mantém o controle.";
    else outcome = wasPsycho ? "Continua em Ciberpsicose." : "Entra em CIBERPSICOSE.";

    const title = stabilize ? `Estabilização${helper ? ` por ${helper.name}` : ""}` : "Rolagem de Humanidade";
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="eh-chat"><h3>${title}</h3>${reason ? `<p><em>${reason}</em></p>` : ""}
        <p>d${die} = ${total !== roll.total ? `${roll.total} + ${total - roll.total} = ` : ""}<strong>${total}</strong> contra Carga Cibernética <strong>${load}</strong></p>
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
      name: "Ciberpsicose", img: PSYCHO_IMG, type: "base",
      description: "<p>Você não rola o Dado de Esperança: use só o Dado de Medo como d20 + atributo; a rolagem é sempre com Medo. Features que exigiriam marcar Estresse podem ser usadas sem marcar Estresse.</p><p>Um aliado dentro do alcance Próximo pode gastar 1 Esperança para te estabilizar (role a Humanidade de novo). Se a cena terminar em Ciberpsicose, reduza seu Dado de Humanidade.</p>",
      system: {
        changes: [{ key: "system.rules.dualityRoll.defaultFearDice", type: "override", value: 20, priority: null, phase: "initial" }],
        duration: { description: "Até ser estabilizado ou o fim da cena", type: "scene" },
        rangeDependence: null, stacking: null, targetDispositions: [], conditionals: []
      },
      flags: { [MODULE_ID]: { cyberpsychosis: true } }
    }]);
    await chat(actor, `
      <h3>CIBERPSICOSE</h3>
      <p><strong>${actor.name}</strong> perdeu o controle. Rolagens usam só o Dado de Medo (d20) e são sempre com Medo; features que marcariam Estresse não marcam.</p>
      <button type="button" data-eh-action="stabilize" data-actor-uuid="${actor.uuid}">
        <i class="fa-solid fa-hand-holding-heart"></i> Estabilizar (aliado gasta 1 Esperança)
      </button>`);
  },

  // resolved: terminou por estabilização/decisão do mestre (sem penalidade).
  async end(actor, { resolved = true } = {}) {
    const effect = this.psychoEffect(actor);
    if (effect) await effect.delete({ [MODULE_ID]: { resolved } });
  },

  // Um aliado (dono do personagem ajudante) gasta 1 Esperança e o personagem rola a Humanidade de novo.
  async stabilize(actor, helper) {
    if (!this.isCyberpsycho(actor)) return ui.notifications.info(`${actor.name} não está em Ciberpsicose.`);
    if (!helper || helper === actor) return ui.notifications.warn("Selecione o token (ou defina o personagem) do aliado que vai estabilizar.");
    if ((helper.system.resources.hope?.value ?? 0) < 1) return ui.notifications.warn(`${helper.name} não tem Esperança para gastar.`);
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
    return [...new Set(domains)].filter(d => !classDomains.includes(d) && registered[d]).sort();
  },

  // Por que o acesso não virou item de classe (mostrado na aba Chrome).
  blockedReason(actor) {
    if (!Humanity.cyberware(actor).some(i => i.getFlag(MODULE_ID, "access"))) return null;
    if (this.realMulticlass(actor)) return "O personagem já tem uma multiclasse; os acessos cibernéticos ficam só como referência.";
    if (!game.system.settings.automation.levelupAuto) return "Com a automação de Level Up desligada, o sistema pede o domínio da multiclasse numa janela; os acessos ficam só como referência.";
    const missing = Humanity.cyberware(actor).map(i => i.getFlag(MODULE_ID, "access")?.competency)
      .filter(d => d && !CONFIG.DH.DOMAIN.allDomains()[d]);
    if (missing.length) return `Ainda sem cartas no módulo: ${[...new Set(missing)].map(d => COMPETENCIES[d] ?? d).join(", ")}.`;
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
      name: "Acessos Cibernéticos", type: "class", img: `modules/${MODULE_ID}/assets/cpr/cyberware/interface_plugs.svg`,
      system: {
        description: "<p>Competências liberadas por cyberware (Edgeheart). Mantido automaticamente pelo módulo; não dá PV, Evasão nem features.</p>",
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
    ui.notifications.info("Edgeheart: Level Up do Edgeheart aplicado neste mundo (sem PV, Estresse, Evasão, Atributos e Multiclasse). Dá para desligar nas configurações do módulo.");
  },

  async restore() {
    if (!game.settings.get(MODULE_ID, "levelupApplied")) return;
    const original = game.settings.get(MODULE_ID, "levelTiersBackup");
    if (original?.tiers) await game.settings.set(CONFIG.DH.id, this.key, original);
    await game.settings.set(MODULE_ID, "levelupApplied", false);
    ui.notifications.info("Edgeheart: Level Up original do Daggerheart restaurado neste mundo.");
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
      const r = await ask("escolha o atributo", `<label>Atributo ${select("trait", TRAITS)}</label>`);
      if (!r) return this.pending(item);
      await this.setBonus(item, `system.traits.${r.trait}.value`, 1);
      return this.done(item, `${baseName} (${TRAITS[r.trait]})`);
    }

    if (choice === "experience" || choice === "neuralArchive") {
      const experiences = Object.fromEntries(Object.entries(actor.system.experiences ?? {}).map(([id, e]) => [id, `${e.name} (+${e.value})`]));
      const options = choice === "neuralArchive" ? { new: "Nova Experiência (+2)", ...experiences } : experiences;
      if (!Object.keys(options).length) {
        ui.notifications.warn(`${actor.name} não tem Experiências para escolher.`);
        return this.pending(item);
      }
      const content = `<label>Experiência ${select("experience", options)}</label>`
        + (choice === "neuralArchive" ? `<label>Nome da nova Experiência <input type="text" name="newName" placeholder="só se escolher Nova"></label>` : "");
      const r = await ask("escolha a Experiência", content);
      if (!r) return this.pending(item);
      if (r.experience === "new") {
        const id = foundry.utils.randomID();
        const name = r.newName?.trim() || "Arquivo Neural";
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
      const r = await ask("escolha a Competência",
        `<label>Competência ${select("competency", competencies)}</label>`
        + `<label>Acesso ${select("level", { card: "Custo 1: Acesso de Carta", half: "Custo 2: Meio Acesso", full: "Custo 3: Acesso Total" })}</label>`);
      if (!r) return this.pending(item);
      await item.update({
        [`flags.${MODULE_ID}.access`]: { competency: r.competency, level: r.level },
        [`flags.${MODULE_ID}.cyberCost`]: { card: 1, half: 2, full: 3 }[r.level]
      });
      return this.done(item, `${baseName} (${COMPETENCIES[r.competency]}, ${ACCESS[r.level]})`);
    }

    if (choice === "tacticalMesh") {
      const r = await ask("escolha a Competência", `<label>Meio Acesso a ${select("competency", { aegis: COMPETENCIES.aegis, influence: COMPETENCIES.influence })}</label>`);
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
    ui.notifications.warn(`${item.name}: escolha pendente. Faça pela aba Chrome da Ficha Edgeheart.`);
  }
};

async function chat(actor, content) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="eh-chat">${content}</div>` });
}

// Ações que mexem num ator que o usuário não controla (ex: jogador estabilizando outro
// personagem) são repassadas ao mestre pelo socket do módulo.
async function asOwner(actor, action, payload) {
  if (actor.isOwner) return handlers[action](payload);
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn("Nenhum mestre conectado para aplicar isso.");
  game.socket.emit(SOCKET, { action, payload });
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
        ehChooseCyberware: EdgeheartCharacterSheet.#chooseCyberware
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
    }

    // Resumo compacto ao lado da Esperança, visível em qualquer aba.
    #renderHeaderBadge() {
      const anchor = this.element.querySelector(".character-row .resource-section");
      if (!anchor) return;
      this.element.querySelector(".eh-header-badge")?.remove();
      const s = Humanity.summary(this.document);
      const badge = document.createElement("a");
      badge.className = `eh-header-badge${s.cyberpsycho ? " eh-psycho" : ""}${s.lost ? " eh-lost" : ""}`;
      badge.dataset.action = "ehOpenChrome";
      const killChain = KillChain.feature(this.document);
      const picks = Pick.items(this.document);
      badge.dataset.tooltip = ["Humanidade", "Carga Cibernética", killChain && "Kill Chain Die", ...picks.map(i => i.getFlag(MODULE_ID, "pick").title)].filter(Boolean).join(" / ");
      badge.innerHTML = `<i class="fa-solid fa-heart-pulse"></i> d${s.die} <span class="eh-sep">|</span> <i class="fa-solid fa-microchip"></i> ${s.load}`
        + (killChain ? ` <span class="eh-sep">|</span> <i class="fa-solid fa-crosshairs"></i> ${KillChain.faces(killChain)}` : "")        + picks.map(i => ` <span class="eh-sep">|</span> <i class="fa-solid ${i.getFlag(MODULE_ID, "pick").icon ?? "fa-list-check"}"></i> ${Pick.label(i)}`).join("")
        + (s.cyberpsycho ? ` <span class="eh-flag">CIBERPSICOSE</span>` : "")
        + (s.lost ? ` <span class="eh-flag">PERDIDO</span>` : "");
      anchor.after(badge);
    }

    static async #advanceHumanity() { await Humanity.advance(this.document); }

    static async #reduceHumanity() { await Humanity.reduce(this.document, "ajuste manual"); }

    static async #rollHumanity() { await Humanity.roll(this.document, { reason: "Rolagem pedida na ficha" }); }

    static async #stabilize() {
      const helper = helperActor(this.document);
      if (!helper) return ui.notifications.warn("Selecione o token do aliado que vai gastar a Esperança.");
      await asOwner(this.document, "stabilize", { actorUuid: this.document.uuid, helperUuid: helper.uuid });
    }

    static async #endCyberpsychosis() {
      if (!game.user.isGM) return ui.notifications.warn("Só o mestre pode encerrar a Ciberpsicose sem estabilização.");
      await Humanity.end(this.document, { resolved: true });
      await chat(this.document, `<p>O mestre encerrou a Ciberpsicose de <strong>${this.document.name}</strong>.</p>`);
    }

    static #openChrome() { this.changeTab("chrome", "primary"); }

    static #openCyberware() {
      const pack = game.packs.get(`${MODULE_ID}.edgeheart-cyberware`);
      if (!pack) return ui.notifications.warn("Compêndio de Cyberware não encontrado. Confira se o módulo Edgeheart está ativo.");
      pack.render(true);
    }

    static async #chooseCyberware(_event, target) {
      const item = await fromUuid(target.dataset.itemUuid);
      if (item) await Cyberware.choose(item);
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
        description: "<p>O Kill Chain Die está acima de d4. No fim da cena ele volta a d4.</p>",
        system: { changes: [], duration: { description: "Até o fim da cena", type: "scene" }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
        flags: { [MODULE_ID]: { killChainTimer: true } }
      }]);
    }
  },

  async roll(item) {
    const faces = this.faces(item);
    const roll = await new Roll(`1${faces}`).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: item.parent }), flavor: `Kill Chain Die (${faces}) — some ao dano` });
    await item.update({ "system.resource.value": roll.total });
  },

  async step(item) {
    const faces = this.faces(item);
    const next = KILL_CHAIN_STEPS[Math.min(KILL_CHAIN_STEPS.indexOf(faces) + 1, KILL_CHAIN_STEPS.length - 1)];
    if (next === faces) return ui.notifications.info("O Kill Chain Die já está no máximo (d20).");
    await this.set(item, next);
    await chat(item.parent, `<p><strong>${item.parent.name}</strong>: Kill Chain Die ${faces} → <strong>${next}</strong>.</p>`);
  },

  async reset(item, reason = "") {
    if (this.faces(item) === "d4" && !item.system.resource?.value) return;
    await this.set(item, "d4");
    await chat(item.parent, `<p><strong>${item.parent.name}</strong>: Kill Chain Die volta a <strong>d4</strong>${reason ? ` (${reason})` : ""}.</p>`);
  }
};

// ---------- Cover (Infiltrator) ----------
// O Cover fica em system.resource.value da feature "Cover Work" (0 a 3; o refresh de cena do
// sistema zera). Cada item lista em flags.coverActions quanto Cover cada ação ganha ou gasta.
const COVER_TAKEDOWN = "Takedown";
const COVER_SETUP = "Setup";

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
    return action.item?.getFlag(MODULE_ID, "coverActions")?.[action.name] ?? 0;
  },

  // Confere antes da ação (e da janela de configuração) se há Cover para gastar ou espaço para ganhar.
  check(action) {
    const delta = this.delta(action);
    if (!delta) return true;
    const item = this.feature(action.actor);
    if (!item) {
      ui.notifications.warn(`${action.name}: o personagem não tem a feature Cover Work.`);
      return false;
    }
    const value = this.value(item);
    if (delta < 0 && value < -delta) {
      ui.notifications.warn(`${action.name} precisa de ${-delta} Cover (você tem ${value}).`);
      return false;
    }
    if (delta > 0 && value >= this.max(item)) {
      ui.notifications.info(`O Cover já está no máximo (${this.max(item)}).`);
      return false;
    }
    return true;
  },

  async apply(action) {
    const delta = this.delta(action);
    if (!delta) return;
    const item = this.feature(action.actor);
    if (!item) return;
    const before = this.value(item);
    const after = Math.clamp(before + delta, 0, this.max(item));
    await item.update({ "system.resource.value": after });
    const actor = action.actor;
    const verb = delta > 0 ? `ganhou ${delta}` : `gastou ${-delta}`;
    let extra = "";
    if (action.name === COVER_SETUP) extra = " Ganhe <strong>+2</strong> na rolagem para se esconder, infiltrar, sabotar, se passar por alguém ou burlar a segurança.";
    await chat(actor, `<p><strong>${actor.name}</strong> ${verb} Cover (${action.name}): ${before} → <strong>${after}</strong>.${extra}</p>`);
    if (action.name === COVER_TAKEDOWN) await this.takedown(actor);
  },

  // Takedown: 1d6 extra de dano (1d8 com Kill Window, que também faz um alvo Vulnerável marcar 1 Estresse).
  async takedown(actor) {
    const faces = actor.items.find(i => i.getFlag(MODULE_ID, "takedownDie"))?.getFlag(MODULE_ID, "takedownDie") ?? "d6";
    const roll = await new Roll(`1${faces}`).evaluate();
    const note = faces === "d6" ? "" : " — Kill Window: se o alvo estiver Vulnerável, ele também marca 1 Estresse";
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Takedown (${faces}) — some ao dano${note}` });
  }
};

// Features do tipo "role um dado e some" (flag rolls do item: { nomeDaAção: { formula, flavor } }).
async function rollOnUse(action) {
  const def = action.item?.getFlag(MODULE_ID, "rolls")?.[action.name];
  if (!def) return;
  const actor = action.actor;
  const roll = await new Roll(def.formula, actor.getRollData()).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: def.flavor ?? action.name });
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
      content: `<p>${pick.prompt ?? `Escolha: ${pick.title}.`}</p>`,
      buttons: Object.entries(pick.options).map(([action, label]) => ({ action, label, default: action === current })),
      rejectClose: false
    });
    if (!value) return;
    await item.setFlag(MODULE_ID, "picked", value);
    if (item.getFlag(MODULE_ID, "integratedChrome")) await IntegratedChrome.syncReinforcedBuild(actor);
    await chat(actor, `<p><strong>${actor.name}</strong> escolheu <strong>${pick.options[value]}</strong> (${pick.title}).</p>`);
  }
};

// ---------- Integrated Chrome (Augmented) ----------
// O Atributo Calibrado é a escolha (Pick) da feature Integrated Chrome. Reinforced Build
// (Titan Frame) tem um efeito de +1 de Armadura que só fica ligado com Força calibrada.
const CHROME_TRAITS = { agility: "Agilidade", strength: "Força", finesse: "Acuidade" };
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

  // d6 (d8 com Reinforced Build e Força calibrada) para somar à rolagem.
  async roll(actor) {
    const trait = this.calibrated(actor);
    const reinforced = trait === "strength" && actor.items.some(i => i.getFlag(MODULE_ID, "reinforcedBuild"));
    const faces = reinforced ? "d8" : "d6";
    const roll = await new Roll(`1${faces}`).evaluate();
    const traitNote = trait ? `Atributo Calibrado: ${CHROME_TRAITS[trait]}` : "sem Atributo Calibrado escolhido";
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Integrated Chrome (${faces}${reinforced ? ", Reinforced Build" : ""}) — some à rolagem · ${traitNote}` });
  }
};

// ---------- Ganchos ----------

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "defaultSheet", {
    name: "Personagens novos usam a Ficha Edgeheart",
    hint: "Ao criar um Personagem, ele já nasce com a Ficha Edgeheart (Humanidade, Carga Cibernética, Ciberpsicose). Personagens existentes podem trocar de ficha pelo ícone de configuração da ficha.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULE_ID, "edgeheartLevelup", {
    name: "Level Up do Edgeheart",
    hint: "Remove do Level Up as opções de PV, Estresse, Evasão, Atributos e Multiclasse (no Edgeheart elas vêm do Cyberware) e deixa Experiência e Carta extra serem escolhidas mais vezes. Vale para o mundo todo; ao desligar, o Level Up original do Daggerheart volta.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => EdgeheartLevelup.sync()
  });
  game.settings.register(MODULE_ID, "levelTiersBackup", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "levelupApplied", { scope: "world", config: false, type: Boolean, default: false });

  foundry.applications.handlebars.loadTemplates([`modules/${MODULE_ID}/templates/chrome-tab.hbs`]);
});

Hooks.once("setup", () => {
  const Sheet = defineSheet();
  foundry.documents.collections.Actors.registerSheet(MODULE_ID, Sheet, {
    types: ["character"], label: "Ficha Edgeheart", makeDefault: false
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
  game.socket.on(SOCKET, async ({ action, payload }) => {
    if (game.user !== game.users.activeGM) return;
    await handlers[action]?.(payload);
  });
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
    const handler = { [KILL_CHAIN_ACTIONS.roll]: "roll", [KILL_CHAIN_ACTIONS.step]: "step", [KILL_CHAIN_ACTIONS.reset]: "reset" }[action.name];
    if (!handler) return;
    KillChain[handler](item);
    return false;
  }
  if (action.name === "No Way Back") {
    const killChain = KillChain.feature(item.parent);
    if (killChain) KillChain.set(killChain, "d10");
  }
});

// Cover: sem saldo (ou já no máximo) a ação nem começa; a variação só é aplicada depois que a ação
// termina, então cancelar a janela de configuração não gasta Cover.
Hooks.on("daggerheart.preUseAction", (action) => {
  const item = action.item;
  if (!(item?.parent instanceof Actor) || !item.parent.isOwner) return;
  if (!Cover.check(action)) return false;
});

Hooks.on("daggerheart.postUseAction", (action) => {
  const item = action.item;
  if (!(item?.parent instanceof Actor) || !item.parent.isOwner) return;
  Cover.apply(action);
  rollOnUse(action);
  if (item.getFlag(MODULE_ID, "integratedChrome") && action.name === CHROME_ACTIONS.use) IntegratedChrome.roll(item.parent);
});

// Ações de escolha (ex: "Calibrar Atributo") abrem a escolha do módulo em vez de usar a ação no sistema.
Hooks.on("daggerheart.preUseAction", (action) => {
  const item = action.item;
  if (!(item?.parent instanceof Actor) || !item.parent.isOwner) return;
  if (item.getFlag(MODULE_ID, "pick")?.action === action.name) {
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
  if (item) await KillChain.reset(item, "fim da cena");
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
  const reason = `Rolou com Medo ${stressFull ? "com todo o Estresse marcado" : "sem Esperança"}.`;
  // Depois da mensagem da rolagem original, para o chat ficar na ordem certa.
  setTimeout(() => Humanity.roll(actor, { reason }), 800);
});

// Fim de cena ainda em Ciberpsicose: o refresh de cena do sistema remove o efeito (duração
// "scene") sem a opção "resolved"; aí o Dado de Humanidade cai um passo.
Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (userId !== game.user.id || !effect.getFlag(MODULE_ID, "cyberpsychosis")) return;
  if (options?.[MODULE_ID]?.resolved) return;
  const actor = effect.parent;
  if (actor instanceof Actor) await Humanity.reduce(actor, "terminou a cena em Ciberpsicose");
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
      if (!helper) return ui.notifications.warn("Selecione o token do aliado que vai gastar a Esperança.");
      if (!helper.isOwner) return ui.notifications.warn(`Você não controla ${helper.name}.`);
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
  button.innerHTML = `<i class="fa-solid fa-microchip"></i> Novo Personagem Edgeheart`;
  button.addEventListener("click", async () => {
    await Actor.create({
      name: "Novo Mercenário", type: "character",
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
    list.dataset.tooltip = `Sugestão da subclasse ${app.setup.subclass.name}`;
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
