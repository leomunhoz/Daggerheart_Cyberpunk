# Spec: compat-2-12
PRD: nenhum (B-001, via completa sem PRD por decisão do Controlador; requisitos R1, R2, CA1, CA2 no
`docs/backlog.md`) · ADRs: 0003, 0004, 0005, 0007 · Status: Aprovada (gate 2026-11-01; Q5 = a)
Sistema conferido: Daggerheart 2.12.1 (tag `2.12.1`, commit `4842148`, 2026-11-01), comparado com
2.10.0 e 2.11.4 · Foundry 14 (sistema pede 14.364, verificado 14.369; módulo verificado 14.368)

## Resumo

A auditoria achou **um uso quebrado** na 2.12 e ele é justamente o CA1: a Rolagem de Humanidade
depois de rolar com Medo **nunca dispara**. O hook `daggerheart.postRollDuality` lê
`config.roll.result.duality`, e a 2.12 apagou esse campo (o resultado agora fica em
`config.evaluated`, que é a própria rolagem). O ponto que o backlog apontava (`config.data?.parent`)
**não quebra**: o código já cai em `config.source.actor`, que continua existindo.

O resto do que o módulo usa do sistema continua igual ou tem um substituto compatível. Há um risco
no **gerador** (`buildPacks`): desde a 2.11, as features oficiais de arma e armadura ficam em
`system.itemFeatures`, e o gerador ainda grava `system.weaponFeatures`/`armorFeatures`. Os packs
publicados foram gerados na 2.10.8 e são migrados pelo sistema ao carregar, então hoje nada quebra
na mesa; o risco só aparece se alguém rodar o gerador na 2.11 ou depois (Q3).

## 1. Contexto do código

Os números de linha são da versão 1.38.1 (`d3fe409`).

| Onde | O que faz com o sistema |
|---|---|
| `scripts/edgeheart-character.js:1309-1320` | `daggerheart.postRollDuality`: com Medo e Estresse cheio (ou sem Esperança), agenda `Humanity.roll`. Lê `config.roll?.result?.duality` e `config.data?.parent ?? fromUuidSync(config.source.actor)`. **Quebrado na 2.12.** |
| `scripts/edgeheart-character.js:1228-1232` | `daggerheart.postDualityRollConfiguration`: em Ciberpsicose, `roll.dHope.number = 0`; acha o ator por `roll.data?.parent`. |
| `scripts/edgeheart-character.js:1171-1186` | Eidolons: `preUseAction` (bloqueia peça Disabled) e `postUseAction` (Overclock, +1 PV). Usam `action.actor`, `action.item`. |
| `scripts/edgeheart-character.js:1245-1249` | Ciberpsicose: `preUseAction` filtra `config.costs` sem os de `key === "stress"`. |
| `scripts/edgeheart-character.js:1253-1266` | Kill Chain: `preUseAction` cancela a ação e chama `KillChain.*`; `isAction` por `action.id`/`action.name`. |
| `scripts/edgeheart-character.js:1271-1283`, `:847-913` | Cover e `rollFormula` (Takedown, Integrated Chrome, flag `rollFormula`): `preUseAction` troca `config.roll.formula`; `postUseAction` aplica a variação em `system.resource.value` da feature. |
| `scripts/edgeheart-character.js:1286-1293` | Escolhas (`Pick`, ex.: Calibrar Atributo): `preUseAction` cancela e abre a escolha. |
| `scripts/edgeheart-character.js:1333-1347` | Instalação de cyberware: `actor.system.constructor.unequipBeforeEquip`. |
| `scripts/edgeheart-character.js:349-388` | Acessos Cibernéticos: `CONFIG.DH.DOMAIN.allDomains()`, `game.system.settings.automation.levelupAuto`, item `class` com `isMulticlass`, `domains`, `classItems`. |
| `scripts/edgeheart-character.js:404-438` | Level Up: setting `CONFIG.DH.SETTINGS.gameSettings.LevelTiers`, `tiers[n].options[opção].checkboxSelections`. |
| `scripts/edgeheart-character.js:651-700` | Ficha: herda `game.system.api.applications.sheets.actors.Character`, usa `Base.PARTS`, `Base.TABS.primary.tabs`, seletor `.character-row .resource-section`. |
| `scripts/edgeheart-character.js:1409-1434` | `renderItemBrowser`: `.item-list`, `.item-container[data-item-uuid]`, `browser.selectedMenu.data.type`; criação aberta por `options.classes` `character-creation` e `app.character`. |
| `scripts/edgeheart-character.js:1439-1466` | `renderDhCharacterCreation`: `app.setup.subclass`, `app.setup.traits`, `app.getUpdateVisibility()`, `.suggested-traits-container`, `[data-action="useSuggestedTraits"]`, i18n `DAGGERHEART.CONFIG.Traits.<k>.short`. |
| `scripts/edgeheart-crew.js:148-155` | All In: `new game.system.api.applications.dialogs.TagTeamDialog(party)`, `usesTagTeamHopeCost`, `initiator.cost`. |
| `scripts/edgeheart-crew.js:254-291` | Back Me Up: `CONFIG.DH.ACTOR.abilities`, setting `Resources.Fear`. |
| `scripts/edgeheart-crew.js:378-418` | Ficha da Crew: herda `…sheets.actors.Party`, usa `Base.PARTS.header`, `Base.PARTS.tabs`, `Base.TABS.primary`. |
| `scripts/edgeheart-crew.js:506-531` | Fim da Rolagem em Dupla: `createChatMessage` com `type === "dualityRoll"` e flag `core.RollTable`; lê `party.system.tagTeam.initiator.memberId`, `.members`, `roll.options.roll.difficulty`, `roll.withHope`, `roll.isCritical`. |
| `scripts/edgeheart-crew.js:352-359` | Suprimentos: loot com `system.quantity` e `system.actions.<id>.cost[].itemId`. |
| `scripts/edgeheart-crew.js:559-589` | Veículos: `preUseAction` soma `-2` em `config.extraFormula`; `postUseAction` troca o estado. |
| `scripts/main.js:2808-2822` | `ensureHomebrewDomains`: setting `daggerheart.Homebrew`, campo `domains` `{id,label,src,color,invertText}`. |
| `scripts/main.js:482-487`, `:529-530` | Gerador: `applyOfficialFeatures` grava `system.weaponFeatures` / `system.armorFeatures`. **Risco a partir da 2.11.** |
| `scripts/main.js:2915-2924`, `:2977` | Gerador: itens iniciais por uuid de compêndio oficial (`daggerheart.classes`, `daggerheart.consumables`) em `inventory.take/choiceA`. |
| `scripts/main.js:4933-4940` | Gerador: `stampActionIds` itera `doc.system.actions` (`size`, iteração). |

## 2. API do sistema e do Foundry usada

Veredito: **ok** = igual ou compatível na 2.12.1; **quebra** = não funciona na 2.12.1;
**risco** = funciona hoje, mas depende de algo que mudou ou que é frágil. Os caminhos são do
repositório `Foundryborne/daggerheart` (tag `2.12.1`, comparada com `2.10.0` e `2.11.4`).

### 2.1 Hooks `daggerheart.*`

| Uso | Conferido em | Veredito |
|---|---|---|
| `daggerheart.preUseAction(action, config)` e `postUseAction(action, config)`; `false` cancela | `module/data/action/baseAction.mjs` (`use`, l. 264 e 278) | ok. Mesma ordem: `prepareConfig` → `preUseAction` → diálogo → workflow → `resourceUpdates.updateResources()` → `postUseAction`. |
| `daggerheart.postDualityRollConfiguration(roll, config, message)` | `module/dice/dhRoll.mjs` (`buildConfigure`, l. 84-90; hooks de `DualityRoll.getHooks` = `Duality`) | ok. Chamado depois do diálogo e antes de `roll.evaluate()`. |
| `daggerheart.postRollDuality(config, message)` | `module/dice/dhRoll.mjs` (`buildPost`, l. 135-138) | ok (o hook existe e roda depois de `buildEvaluate`). |

### 2.2 O `config` dos hooks (`MoveContext`, `module/data/action/move-context.mjs`)

| Campo que o módulo lê ou escreve | Conferido em | Veredito |
|---|---|---|
| `config.roll.result.duality` (`postRollDuality`) | `module/dice/dualityRoll.mjs` 2.12.1 não grava mais `config.roll.result` (na 2.11.4, l. 235); `module/dice/dhRoll.mjs` `buildEvaluate` grava `config.evaluated = roll` | **quebra.** Sempre `undefined` → o hook sai na primeira linha → **CA1 falha**. Substituto: `config.evaluated.withFear` (getter de `DualityRoll`, `dualityRoll.mjs` l. 100-103), o mesmo que o sistema usa para dar Medo (`addDualityResourceUpdates`). Não existe na 2.10/2.11 (lá `config.evaluated` é `undefined`). |
| `config.data?.parent` (`postRollDuality`) | `move-context.mjs` (`this.data = pick(getRollData(), ['experiences','traits','rules','action'])`) | risco. Sem `parent` na 2.12; o código cai em `fromUuidSync(config.source.actor)`, que existe (`move-context.mjs`, `this.source.actor = actor?.uuid`). Na 2.12 há também `config.actor` (documento já resolvido). |
| `config.source.actor` | `move-context.mjs` (construtor); `actor.mjs` `rollTrait` monta `MoveContext` com `actor` | ok. Vale também para rolagem de atributo pela ficha. |
| `config.costs[].key` (filtro de `"stress"`) | `module/data/fields/action/costField.mjs` (`prepareConfig`; sem mudança 2.10 → 2.12) | ok. Antes da 2.12 já era assim: o custo é calculado no `prepareConfig`, antes do `preUseAction`. |
| `config.roll.formula` (troca no `preUseAction`) | `module/data/fields/action/rollField.mjs` (`prepareConfig`, objeto novo); `dhRoll.mjs` `createRollInstance` usa `config.roll.formula` | ok. `config.roll` é um objeto do config, não a ação; a troca não altera o item. |
| `config.extraFormula` (veículo Damaged) | `module/applications/dialogs/d20RollDialog.mjs` l. 127 e 164; `module/dice/d20Roll.mjs` l. 92 | ok. |
| `roll.data?.parent` (`postDualityRollConfiguration`) | `dhRoll.mjs` `createRollInstance(config)` = `new this(formula, config.getRollData(), config)`; `module/documents/actor.mjs` `getRollData` (proxy de `this.system`, que tem `parent`); o próprio sistema lê `roll.data?.parent` em `dualityRoll.mjs` (`buildEvaluate`, `handleTriggers`) | ok. |
| `roll.dHope.number = 0` | `dualityRoll.mjs` (`get dHope`, `createBaseDice`); `d20Roll.mjs` `evaluate` não recria os dados | ok. O d20 de Medo vem de `this.data.rules.dualityRoll.defaultFearDice` (o efeito da Ciberpsicose). |
| `action.actor`, `action.item`, `action.id`, `action.name` | `baseAction.mjs` (getters `actor`, `item`, l. 148-156) | ok. |

### 2.3 `game.system.api`, `CONFIG.DH` e settings

| Uso | Conferido em | Veredito |
|---|---|---|
| `game.system.api.applications.sheets.actors.Character` / `.Party` | `module/applications/sheets/actors/_module.mjs` (arquivos renomeados para `*-sheet.mjs` no #2478; nomes exportados iguais) | ok. |
| `Character.PARTS`, `Character.TABS.primary.tabs` (aba Chrome na 2ª posição) | `character-sheet.mjs` l. 114-161 (abas `features, loadout, inventory, biography, effects`) | ok. |
| `.character-row .resource-section` (selo da ficha) | `templates/sheets/actors/character/header.hbs` l. 60-61 | ok. |
| `Party.PARTS.header`, `.tabs`, `Party.TABS.primary` | `party-sheet.mjs` l. 54-72 | ok. |
| `game.system.api.applications.dialogs.TagTeamDialog`: `new (party)`, `usesTagTeamHopeCost`, `initiator.cost` | `module/applications/dialogs/tagTeamDialog.mjs` l. 12-30, 162-169, 328 | ok. A 2.12 mudou o filtro de membros (`party.system.constructor.DICE_ROLL_ACTOR_TYPES`) e o `MoveContext` no dano, sem mexer no que o módulo usa. |
| Mensagem final da Rolagem em Dupla: `type: "dualityRoll"`, `flags.core.RollTable`, criada antes de limpar `system.tagTeam` | `tagTeamDialog.mjs` l. 757-775 | ok. |
| `party.system.tagTeam.initiator.memberId`, `.members`; `party.system.partyMembers` | `module/data/tagTeamData.mjs` (sem mudança); `module/data/actor/party.mjs` l. 21 | ok. |
| `roll.options.roll.difficulty`, `roll.withHope`, `roll.isCritical` (rolagem da mensagem) | `dualityRoll.mjs` l. 89-103; `move-context.mjs` `toJSON` (vai para `roll.options`) | ok. |
| `CONFIG.DH.ACTOR.abilities[trait].label` | `module/config/actorConfig.mjs` (renomeado para `traits`; `export const abilities = traits` como alias) | risco. Funciona pelo alias; se o sistema tirar o alias, o Back Me Up e a descrição dos veículos no gerador quebram. Sem ticket agora (Q4). |
| i18n `DAGGERHEART.CONFIG.Traits.<k>.short` e `.name` | `lang/en.json` do sistema (`Traits.agility.short = "AGI"`) | ok. |
| `CONFIG.DH.DOMAIN.allDomains()` | `module/config/domainConfig.mjs` l. 76 | ok. |
| setting `daggerheart.Homebrew`, campo `domains` | `module/data/settings/Homebrew.mjs` (a 2.12 mexeu em outros campos; `domains` igual) | ok. |
| `game.system.settings.automation.levelupAuto` | `module/data/settings/Automation.mjs` l. 30 | ok. |
| `CONFIG.DH.SETTINGS.gameSettings.LevelTiers` e `.Resources.Fear` | `module/config/settingsConfig.mjs` l. 39-41 | ok. |
| Opções de Level Tiers `trait, hitPoint, stress, evasion, multiclass, experience, domainCard` com `checkboxSelections` | `module/data/levelTier.mjs` l. 144-188 | ok. |
| `CONFIG.DH.GENERAL.range.<id>.short` (#2561) | `module/config/generalConfig.mjs` | ok, não usado. O módulo só grava os ids (`melee`, `veryClose`, `close`, `far`, `veryFar`), que não mudaram. |
| `game.system.api.documents.DhToken` (#2436, virou `DhTokenDocument`) | — | ok, não usado pelo módulo. |

### 2.4 Hooks de render (ApplicationV2) e telas do sistema

| Uso | Conferido em | Veredito |
|---|---|---|
| `renderDhCharacterCreation`; `app.character`, `app.setup.subclass`, `app.setup.traits`, `getUpdateVisibility()`, classe `character-creation` | `module/applications/characterCreation/characterCreation.mjs` l. 10-58, 363; `templates/characterCreation/tabs/traits.hbs` (`.suggested-traits-container`, botão `useSuggestedTraits`, agora com `type="button"`) | ok. |
| `renderItemBrowser`; `selectedMenu.data.type`, `.item-list`, `.item-container[data-item-uuid]` | `module/applications/ui/itemBrowser.mjs` l. 15-21, 227-234; `module/config/itemBrowserConfig.mjs` (`type: [...]`); `templates/ui/itemBrowser/itemBrowser.hbs` l. 38, `itemContainer.hbs` | ok. |

### 2.5 Dados de personagem e itens

| Uso | Conferido em | Veredito |
|---|---|---|
| `actor.system.resources.{hitPoints,stress,hope}`, `levelData.level.current`, `class.value`, `experiences` | `module/data/actor/character.mjs` | ok. |
| Chaves de efeito: `system.rules.dualityRoll.defaultFearDice`, `system.rules.roll.defaultAdvantageDice`, `system.bonuses.roll.bonus`, `system.bonuses.damage.{bonus,dice}`, `system.evasion`, `system.proficiency`, `system.damageThresholds.*`, `system.resources.*.max` | `character.mjs` l. 124-276 | ok. A 2.12 tirou `system.rules.attack.*`, que o módulo não usa. |
| Efeitos criados com `system.{changes, duration, rangeDependence, stacking, targetDispositions, conditionals}` | `module/data/activeEffect/baseEffect.mjs` (migrações novas `damageReduction`; o módulo não usa `reduceSeverity`) | ok. |
| `actor.system.constructor.unequipBeforeEquip` | `character.mjs` l. 635; usado do mesmo jeito em `character-sheet.mjs` l. 914 | ok. |
| `system.resource.value/max` de feature (Cover, Kill Chain) | `module/data/item/base.mjs` (`hasResource`) | ok. |
| `system.actions` como coleção (`size`, iteração, `.get`) | `module/data/fields/action-collection-field.mjs` (`ActionCollection extends Collection`) | ok. |
| Item `class` criado pelo módulo (`domains`, `isMulticlass`, `classItems: []`) e gerado (`inventory.take/choiceA/choiceB`, `characterGuide.suggested*` por uuid) | `module/data/item/class.mjs` (agora `DocumentUUIDField`, aceita uuid de compêndio) | ok. Os uuids oficiais usados (`zqeXrJTd1geX73Pw`, `hMST9iizQP1yz0MG`, `uoG5iq09mxJPXfmk`, `tPfKtKRRjv8qdSqy`, `b6vGSPFWOlzZZDLO`) existem em `src/packs/` da 2.12.1. |
| Loot de suprimentos com `system.quantity` na Party | `module/data/actor/party.mjs` (metadado `quantifiable` saiu; loot continua com quantidade) | risco baixo. Coberto pelo passo 10 do roteiro. |
| Gerador: `system.weaponFeatures` / `system.armorFeatures` (`applyOfficialFeatures`) | `module/data/item/weapon.mjs` e `armor.mjs` (campo `itemFeatures`, `TypedObjectField`, desde a 2.11.0); `module/documents/item.mjs` `migrateData` converte o formato antigo; `module/data/item/helpers.mjs` `updateItemFeatures` só cria as ações e efeitos da feature quando a mudança vem em `system.itemFeatures` | risco (só no gerador). Os packs atuais (gerados na 2.10.8) são migrados ao carregar. Rodar o gerador na 2.11+ pode criar armas sem as ações e efeitos das features oficiais. Ver C212-03 e Q3. |

### 2.6 Foundry

| Uso | Conferido em | Veredito |
|---|---|---|
| `fromUuidSync`, `Actors.registerSheet`, `DialogV2`, `ChatMessage.create` | `docs/referencias/foundry-v14.md` | ok. |
| `Hooks.call` com retorno `false` cancela | `docs/referencias/foundry-v14.md` | ok. |

## 3. Design

**Princípio (ADR 0007):** enquanto o mínimo declarado for anterior à versão que mudou um campo, o
módulo lê **o campo novo primeiro e o antigo como reserva**, na mesma expressão. Nada de checar
número de versão no código.

### 3.1 Rolagem de Humanidade (C212-01)
Só o hook `daggerheart.postRollDuality` em `scripts/edgeheart-character.js` muda:
- **Medo:** `config.evaluated` existe (2.12+) → usa `config.evaluated.withFear`; senão (2.10/2.11)
  → `config.roll?.result?.duality === -1`. Os dois dão o mesmo resultado (empate = crítico, não é
  Medo; crítico garantido também não).
- **Ator:** `config.actor ?? config.data?.parent ?? fromUuidSync(config.source.actor)`.
  `config.actor` (2.12) evita resolver uuid de token não vinculado; `config.data.parent` cobre a 2.10/2.11.
- O resto do hook (condições de Estresse e Esperança, `setTimeout` de 800 ms, `Humanity.roll`) não muda.

### 3.2 Gerador (C212-03, condicional a Q3)
`applyOfficialFeatures` grava no campo que o sistema em uso tem: se o schema do item tem
`itemFeatures`, grava `system.itemFeatures = { [valor]: { value } }`; senão, o formato antigo
(`[{ value }]` em `weaponFeatures`/`armorFeatures`). Assim o gerador funciona na 2.10 e na 2.12.

### 3.3 `module.json` (C212-02, condicional a Q1/Q2)
`relationships.systems[daggerheart].compatibility` ganha `"verified": "2.12.1"`. O `minimum` só
sobe se o gate decidir (Q1). `manifest`, `download`, `version` e o `compatibility` do Foundry não
mudam (regra 9; versão é do commit de versão, ADR 0006).

### O que não muda
Nenhum outro hook, ficha, template, CSS, texto de `lang/`, flag ou setting. Nenhuma chave de
`stableId` nem nome de ação. Não há texto novo de interface.

### Dados salvos
Nenhuma flag nem setting nova ou alterada.

## 4. Quebras e migração
- **C212-01:** nenhuma. Mesa na 2.10/2.11 continua pelo caminho antigo; mesa na 2.12 volta a ter a
  Rolagem de Humanidade.
- **C212-02:** se o `minimum` subir (Q1), mesas na 2.10 deixam de poder ativar a versão nova do
  módulo (o Foundry avisa). Só `verified` não bloqueia ninguém.
- **Rebuild na 2.11+ (com ou sem o C212-03; verificação na seção 5.1):** packs gerados na 2.12 gravam `itemFeatures`. Na 2.10 esse campo
  não existe e as features oficiais das armas e armaduras do Edgeheart **somem**. Por isso Rebuild
  na 2.11+ exige `minimum` ≥ `2.11.0` (Q1 e Q3 andam juntas). Personagens existentes não são
  afetados (cópias já criadas ficam como estão).

## 5. Perguntas técnicas para o usuário
- **Q1 — Versão mínima do sistema.** A correção funciona na 2.10, 2.11 e 2.12, então dá para manter
  `minimum: "2.10.0"`. Recomendo manter (R2 atendido sem afastar mesas na 2.10). Só precisa subir para
  `2.11.0` se Q3 for "sim, regenerar na 2.12". Manter 2.10.0 ou subir?
- **Q2 — Declarar a 2.12.1 como verificada no `module.json`** (`relationships.systems[0].compatibility.verified = "2.12.1"`,
  ticket C212-02)? Só deve entrar **depois** do roteiro do nível 3 passar. Sim ou não?
- **Q3 — Gerador na 2.12.** Os próximos `buildPacks()` (Rebuild de B-002…B-005 e outros) vão rodar na
  2.12? Se sim, C212-03 entra antes do primeiro Rebuild e Q1 vira "subir para 2.11.0". Se os Rebuilds
  continuarem num Foundry com o sistema 2.10.x, C212-03 fica fora deste épico.
- **Q4 — Alias `CONFIG.DH.ACTOR.abilities`.** A 2.12 renomeou para `traits` e manteve `abilities` como
  alias. Trocar agora para `traits ?? abilities` (ticket pequeno) ou deixar até o sistema avisar
  que vai tirar o alias? Recomendo deixar (fora do escopo de "funcionar na 2.12").

## 5.1 Decisões do gate (2026-11-01)

| Pergunta | Resposta do usuário | Efeito |
|---|---|---|
| Q1 | Manter `minimum: "2.10.0"` | Em conflito com Q3; ver a verificação abaixo e Q5. |
| Q2 | Sim, declarar `verified: "2.12.1"` depois do roteiro do nível 3 | C212-02 entra. |
| Q3 | Sim, os próximos `buildPacks()` rodam com o sistema na 2.12 | C212-03 entra. |
| Q4 | Não trocar `abilities` → `traits` agora | Risco anotado no backlog como **B-006** (bruto). |
| ADRs | 0004, 0005, 0006 e 0007 aceitas | — |

### Verificação do conflito Q1 × Q3 (Rebuild na 2.12 com mínimo 2.10.0)

Pergunta: dá para gerar os compêndios na 2.12 e eles continuarem válidos na 2.10?
**Resposta: não, pela API pública.** **[V]** = conferido no código do sistema (tags 2.10.0, 2.11.0,
2.11.4, 2.12.1). **[I]** = inferência (o código do Foundry não é público e não há Foundry aqui).

1. **[V]** A 2.10.0 só conhece `system.weaponFeatures` / `system.armorFeatures` (`ArrayField` de
   `{value, effectIds, actionIds}`, `module/data/item/weapon.mjs` l. 43 e `armor.mjs`);
   `itemFeatures` lá é só um getter que devolve `weaponFeatures`. Não há migração de `itemFeatures`
   de volta para o formato antigo em nenhum `migrateData` da 2.10.0.
2. **[V]** O campo `system.itemFeatures` (`TypedObjectField`) entrou na **2.11.0**, junto com a
   migração `weaponFeatures/armorFeatures → itemFeatures` em `DhItem.migrateData`
   (`module/documents/item.mjs` l. 365-370, igual na 2.12.1). A migração só roda quando
   `itemFeatures` está ausente e apaga os campos antigos.
3. **[I]** O `migrateData` roda na construção de todo documento, inclusive na criação dentro do
   compêndio. Logo, **qualquer** Rebuild na 2.11+ grava `itemFeatures` e nunca `weaponFeatures`,
   **com ou sem o C212-03**. O C212-03 só garante que as ações e efeitos da feature sejam criados.
4. **[I]** Gravar os dois formatos no mesmo item não funciona: na 2.12 `weaponFeatures` não está no
   schema, e o Foundry descarta, ao limpar os dados, as chaves que não estão no schema. Não confirmei
   no código do Foundry, que não é público.
5. **[V]** Na 2.10.0, um item gerado na 2.12 chega com `weaponFeatures = []` (o `itemFeatures` é
   descartado, **[I]** pelo mesmo motivo do item 4). Efeito, pelo código de `weapon.mjs` 2.10.0
   l. 111-135: a lista de features some da descrição; `hasReload` fica falso (a feature
   *Reloading* deixa de funcionar); as ações da feature aparecem como ações comuns
   (`customActions`). Os efeitos ativos da feature continuam no item (estão em `item.effects`, fora
   desse campo).
6. **[V]** A 2.11.x lê `itemFeatures` igual à 2.12.1 (mesmo `TypedObjectField` e mesma migração).

**Conclusão:** packs gerados na 2.12 só ficam inteiros na **2.11.0 ou mais nova**. Com Q1 = 2.10.0 e
Q3 = sim, mesas na 2.10.x perdem a lista de features e a *Reloading* das armas e armaduras do
Edgeheart depois do próximo Rebuild. As outras features continuam funcionando. Como isso não se
resolve só com o gerador, volta ao usuário uma única pergunta, a Q5.

- **Q5 — Mínimo do sistema × Rebuild na 2.12.** Escolha uma:
  (a) subir o `minimum` para `2.11.0` no C212-02, junto com o primeiro Rebuild feito na 2.12
  (recomendado: a 2.10 já tem duas versões menores atrás);
  (b) manter `2.10.0` e fazer os Rebuilds num Foundry com o sistema 2.10.x (o C212-03 sai do épico);
  (c) manter `2.10.0` e aceitar a perda acima nas mesas 2.10, registrando isso no CHANGELOG.

**Resposta do usuário (2026-11-01): (a).** O `minimum` sobe para `2.11.0` no C212-02, junto com o
primeiro Rebuild na 2.12. Com isso: C212-01 aprovado; C212-02 aprovado (condicionado ao roteiro do
nível 3); C212-03 aprovado. A Q1 ("manter 2.10.0") fica substituída por esta resposta.

## 6. Tickets

Ordem: C212-01 → roteiro do nível 3 → C212-02. C212-03 entra antes do primeiro Rebuild feito na 2.12.

| Ticket | Status (gate 2026-11-01) |
|---|---|
| C212-01 | Aprovado. |
| C212-02 | Aprovado, condicionado ao roteiro do nível 3 sem falha. O `minimum` depende da Q5: `2.11.0` na opção (a); `2.10.0` nas opções (b) e (c). |
| C212-03 | Aprovado se a Q5 for (a) ou (c), antes do primeiro Rebuild na 2.12. Sai do épico se a Q5 for (b). |

### C212-01: fix(humanidade): Rolagem de Humanidade com Medo volta a disparar na 2.12
- Requisitos: R1, R2, CA1
- Escopo: `scripts/edgeheart-character.js` (só o hook `daggerheart.postRollDuality`, l. 1309-1320),
  `tests/humanity-fear-roll.test.mjs` (novo). Se o stub precisar de `fromUuidSync` ou de algo no
  `fakeActor`, pode crescer `tests/helpers/foundry-stub.mjs` só no necessário.
- Testes red (nível 2, ADR 0004): instala o stub, importa `scripts/edgeheart-character.js`, acha em
  `Hooks.registered` o callback de `daggerheart.postRollDuality` e chama com um ator Edgeheart
  (`flags.edgeheart`, `isOwner: true`, Estresse 6/6, Esperança 2), trocando `Humanity.roll`,
  `isCyberpsycho` e `isLost` por espiões no objeto exportado e usando `mock.timers` do `node:test`
  para os 800 ms:
  1. **config da 2.12** `{ evaluated: { withFear: true }, roll: { type: "trait" }, actor, source: { actor: "Actor.x" }, data: { traits: {}, rules: {} } }` → espera `Humanity.roll(actor, …)` uma vez. **Falha hoje** porque o hook lê `config.roll.result.duality` (inexistente na 2.12) e sai antes.
  2. **config da 2.12 com Esperança** `{ evaluated: { withFear: false }, … }` → não chama.
  3. **config da 2.10/2.11** `{ roll: { result: { duality: -1 } }, data: { parent: actor } }` → chama (passa hoje; garante R2).
  4. **config da 2.12 sem `config.actor`**, só `source.actor` com `globalThis.fromUuidSync` falso devolvendo o ator → chama.
  5. Estresse 3/6 e Esperança 2 → não chama.
- Critério de pronto: os 5 casos verdes; `npm run verify` verde; roteiro do nível 3 (abaixo), passos
  1 e 2, descrito no PR para o usuário rodar na 2.12.1 e, se houver mundo, na 2.10.x.
- Depende de: nada.
- Rebuild: não.
- Tamanho estimado: ~100 linhas (código ~6, teste ~90), 2 arquivos (3 se o stub crescer).
- Paralelo com: C212-03 (sem arquivo em comum).

### C212-02: chore(module): declarar o Daggerheart 2.12.1 como verificado
**Aprovado (Q2 = sim)**, condicionado ao roteiro do nível 3 rodar sem falha.
- Requisitos: R1, R2
- Escopo: `module.json` (só `relationships.systems[daggerheart].compatibility`: `verified: "2.12.1"`;
  `minimum` conforme a Q5: `"2.11.0"` na opção (a), `"2.10.0"` nas opções (b) e (c)), `tools/check.mjs` (regra nova).
- Testes red (nível 1): regra nova no `tools/check.mjs`: a entrada `daggerheart` de
  `relationships.systems` precisa ter `compatibility.minimum` e `compatibility.verified`, e
  `verified` ≥ `minimum` (comparação numérica por partes). **Falha hoje**: não há `verified`.
- Critério de pronto: `npm run verify` verde; `module.json` com `"verified": "2.12.1"` e o `minimum`
  decidido; `manifest`, `download`, `version` e `compatibility` do Foundry intactos (o Examinador
  confere no diff).
- Depende de: C212-01 e o roteiro do nível 3 conferido pelo usuário.
- Rebuild: não.
- Tamanho estimado: ~20 linhas, 2 arquivos.
- Paralelo com: nenhum.

### C212-03: fix(gerador): features oficiais de armas e armaduras no formato `itemFeatures`
**Aprovado se a Q5 for (a) ou (c)** (Q3 = sim), antes do primeiro Rebuild feito na 2.12. Mesmo
com este ticket, os packs gerados na 2.12 gravam `itemFeatures`, que a 2.10 não lê (seção 5.1).
- Requisitos: R1 (gerador)
- Escopo: `scripts/main.js` (só `applyOfficialFeatures` e as duas chamadas em `importWeaponsAndArmor`).
- Testes red (nível 3, a função não é exportada e só roda no Foundry): num mundo de teste com o
  Daggerheart 2.12.1 e o Foundry em inglês, como GM, rodar
  `await game.modules.get("edgeheart-cyberpunk").api.buildPacks()` e depois, no console:
  `(await game.packs.get("edgeheart-cyberpunk.edgeheart-weapons").getDocuments()).filter(w => Object.keys(w.system.itemFeatures ?? {}).length).map(w => [w.name, Object.keys(w.system.itemFeatures), w.system.actions.size, w.effects.size])`.
  **Esperado:** as armas com feature oficial no `main.js` (campo `official` de `W(...)`) aparecem
  com as chaves das features e com as ações/efeitos que a feature cria (igual a uma arma oficial
  com a mesma feature em `daggerheart.weapons`). **Atual (hipótese a confirmar no red):** lista
  vazia ou armas sem as ações/efeitos da feature. Se o red **não** falhar (o Foundry migrar a
  atualização), o ticket é descartado e a Spec recebe emenda.
- Critério de pronto: o mesmo comando mostra as features nas armas e armaduras; numa mesa 2.10.x o
  gerador continua gravando `weaponFeatures`/`armorFeatures`; `npm run verify` verde.
- Depende de: Q5 (com a opção (a), entra no mesmo lote do C212-02 com `minimum: "2.11.0"`).
- Rebuild: sim.
- Tamanho estimado: ~15 linhas, 1 arquivo (+ `packs/` e `babele/pt-BR/` gerados, que não contam).
- Paralelo com: C212-01.

### Roteiro do nível 3: regressão na 2.12.1 (CA1 e CA2)

Mundo de teste: Foundry v14 (≥ 14.364), Daggerheart **2.12.1**, módulo com C212-01, Babele opcional.
Automação de Esperança/Medo e `levelupAuto` ligadas (padrão). Um GM e, se possível, um jogador dono
do personagem. Se houver mundo com 2.10.x, repetir os passos 1, 2 e 4 lá (R2).

Preparação: criar pelo botão **Novo Personagem Edgeheart** do diretório de Atores um personagem
com a classe Solo (Kill Chain), outro Infiltrator (Cover) e outro Augmented (Integrated Chrome),
ou um só trocando a classe. Criar um ator **Party**, abrir na ficha da Crew e pôr os personagens
como membros.

1. **CA1 — Medo com Estresse cheio.** Marcar todo o Estresse. Rolar um atributo pela ficha até sair
   com Medo. **Esperado:** depois da mensagem da rolagem, sai a mensagem da Rolagem de Humanidade
   (motivo "Estresse cheio"). **Atual na 2.12.1 sem C212-01:** nada acontece.
2. **CA1 — Medo sem Esperança, por ação.** Estresse abaixo do máximo, Esperança 0. Usar uma ação com
   rolagem (ataque da arma) até sair Medo → Rolagem de Humanidade (motivo "sem Esperança"). Rolar
   com Esperança → nada. Rolar com Medo com Estresse e Esperança normais → nada.
3. **Ciberpsicose.** Pela aba Chrome, entrar em Ciberpsicose. Rolar um atributo: a fórmula mostra só
   o d20 de Medo (Dado de Esperança com 0 dados), sempre com Medo, sem crítico. Usar uma feature
   com custo de Estresse: a ação roda sem marcar Estresse.
4. **Ações com custo.** Fora da Ciberpsicose, usar uma carta de Competência com custo de Esperança:
   a janela de custo abre e a Esperança cai. Cancelar a janela não gasta nada.
5. **Kill Chain (Solo).** Usar "Rolar Kill Chain Die", "Aumentar Kill Chain Die" e "Resetar Kill
   Chain Die": cada uma faz a ação do módulo (rolagem/troca do dado no chat) e **não** abre a
   janela padrão do sistema. "No Way Back" ajusta o dado para d10. Encerrar a cena (refresh de
   cena) → o dado volta a d4.
6. **Cover (Infiltrator).** "Ganhar Cover" sobe o contador da feature Cover Work (até 3; no máximo
   avisa e não roda). "Setup"/"Takedown" gastam; sem saldo, avisa e não roda. Takedown com Kill
   Window rola d8 no card. Cancelar a janela da ação não altera o Cover.
7. **Integrated Chrome (Augmented).** "Calibrar Atributo" abre a escolha do módulo (não a ação do
   sistema) e o selo do cabeçalho mostra o atributo. "Integrated Chrome" rola o dado do módulo
   (d8 com Reinforced Build e Força calibrada). Reinforced Build liga/desliga o +1 de Armadura.
8. **Eidolons.** Arrastar um Eidolon (ex.: Norai Hermes-Arrow) do compêndio Cyberware, sincronizar
   pela aba Chrome. Marcar o último PV do Eidolon → pergunta Overclock/Stay Inside. Em Stay
   Inside, usar uma peça do Eidolon → aviso e a ação não roda. Em Overclock, cada ação usada marca
   +1 PV.
9. **Veículos.** Pôr um veículo (ex.: Street Bike) no personagem. "Sofrer Dano Sério" → nome com
   "(Damaged)"; "Ataque do Veículo" abre a rolagem com −2 no modificador situacional; a ação da
   característica avisa e não roda. "Sofrer Dano Sério" de novo → "(Disabled)": só "Consertar"
   roda. "Consertar" → volta ao normal.
10. **Movimentos da Crew.** Na aba Crew: marcar Edge; usar Teamwork (custo 0), Back Me Up (escolher
    atributo; o Medo do mestre cai 2), Get Them Out, Plan B (opção Hidden Cache cria/soma os
    Suprimentos na Party com quantidade 3) e All In (abre a Rolagem em Dupla do sistema **sem**
    custo de Esperança). Terminar a Rolagem em Dupla: sai o card da Crew; no All In, cada
    participante limpa 1 Estresse; com Esperança e sucesso, o card oferece +1 Edge.
11. **Criação de personagem.** Abrir a criação pela Ficha Edgeheart: o navegador de itens, aberto
    nos botões de classe/subclasse/ancestralidade/comunidade, mostra só itens do Edgeheart. Ao
    escolher uma subclasse do Edgeheart, os atributos sugeridos são os da subclasse e o botão
    "Usar" aplica esses valores.
12. **Competências e Acessos.** Uma carta de Competência do Edgeheart entra na ficha (domínio aceito
    pelo Homebrew). Instalar um cyberware com acesso a Competência → item de classe "Acessos
    Cibernéticos" com o domínio. Subir de nível: o Level Up não oferece PV, Estresse, Evasão,
    Atributos nem Multiclasse.
13. **Console limpo.** Durante os passos, nenhum erro vermelho no console (F12) com origem em
    `modules/edgeheart-cyberpunk/`.

## 7. Exceções
| Ticket | Linhas | Arquivos | Motivo | Data |
|---|---|---|---|---|
