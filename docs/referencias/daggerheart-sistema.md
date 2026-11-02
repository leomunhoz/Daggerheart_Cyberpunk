# Sistema Daggerheart: o que o módulo pode usar

Pesquisado em 2026-11-01 no repositório `Foundryborne/daggerheart`, branch `v14`, tag **2.12.1**.
**[V]** = conferido no código do sistema. **[I]** = inferência. Os caminhos são do repositório do sistema.

Para conferir algo: clone o sistema **fora** deste repositório e só leia.
`git clone --depth 1 -b v14 https://github.com/Foundryborne/daggerheart ../daggerheart-src`

## Versão e ritmo
- **[V]** Última versão: 2.12.1 (2026-11-01). `system.json`: Foundry mínimo `14.364`, verificado `14.369`.
- **[V]** Releases saem da branch `v14`, mais ou menos uma versão menor a cada 2–3 semanas. Não há
  CHANGELOG em arquivo; as notas ficam nas Releases do GitHub.
- **[V]** Não há garantia formal de estabilidade de hooks nem de API. Cada versão menor nova vira
  item de conferência no backlog.

## Hooks
`CONFIG.DH.id` é `"daggerheart"`.

| Hook | Argumentos | Onde | Cancelável | Usado pelo módulo |
|---|---|---|---|---|
| `daggerheart.preUseAction` | `(action, config)` | `module/data/action/baseAction.mjs` | sim | sim |
| `daggerheart.postUseAction` | `(action, config)` | idem; depois de `resourceUpdates.updateResources()`, antes do chat | sim | sim |
| `daggerheart.pre<Passo>Action` / `post<Passo>Action` | `(action, config)` | idem, por passo do workflow (`Roll`, `Damage`, `Save`, `Effects`, `Cost`, `Uses`…) | sim | não |
| `daggerheart.preRoll` / `preRollDuality` / `preRollFate` | `(config, message)` | `module/dice/dhRoll.mjs` | sim | não |
| `daggerheart.postRollConfiguration` / `postDualityRollConfiguration` / `postFateRollConfiguration` | `(roll, config, message)` | idem | sim | `postDualityRollConfiguration` |
| `daggerheart.postRoll` / `postRollDuality` / `postRollFate` | `(config, message)` | idem | sim | `postRollDuality` |
| `daggerheart.preTakeDamage` / `postCalculateDamage` / `postTakeDamage` | `(actor, args)` / `(actor, updates)` | `module/documents/actor.mjs` | — | não |
| `daggerheart.preTakeHealing` / `postTakeHealing` | idem | idem | — | não |

- **[V]** `renderDhCharacterCreation` e `renderItemBrowser` **não** são do sistema: são os hooks
  automáticos `render<Classe>` do ApplicationV2 (`DhCharacterCreation`,
  `module/applications/characterCreation/characterCreation.mjs`; `ItemBrowser`,
  `module/applications/ui/itemBrowser.mjs`). Quebram se o sistema renomear a classe.
- **[V]** Os nomes e a ordem dos argumentos são iguais em 2.10.0, 2.11.0 e 2.12.1.

## O `config` dos hooks mudou na 2.12 (risco)
- **[V]** PRs #2441 e #2534: o `config` virou a classe `MoveContext` (`module/data/action/move-context.mjs`).
  - `config.data` agora é só um `pick` de `experiences`, `traits`, `rules` e `action` (sem `parent`).
  - `config.data.getRollData()` virou `config.getRollData()`.
  - `config.actor`, `config.item`, `config.action`, `config.roll`, `config.costs`, `config.targets`
    e `config.source` existem.
  - `config.resourceUpdates` é um `ResourceUpdateMap`.
- O módulo lê `config.data?.parent` em `scripts/edgeheart-character.js` (hook `postRollDuality`),
  com alternativa em `config.source.actor`. Ver B-001 no backlog.
- **[V]** (2026-11-01, auditoria de `docs/spec/compat-2-12.md`) A 2.12 **não grava mais**
  `config.roll.result` (`{duality, total…}`; existia até a 2.11.4 em `module/dice/dualityRoll.mjs`).
  O resultado fica em `config.evaluated` (a instância da rolagem, gravada em `dhRoll.mjs`
  `buildEvaluate`): `config.evaluated.withHope`, `.withFear`, `.isCritical`. Na 2.10/2.11
  `config.evaluated` não existe. Leitura tolerante: ADR 0007.
- **[V]** `roll.data` (rolagem do `postDualityRollConfiguration`) continua sendo o `getRollData()` do
  ator (proxy de `actor.system`), com `roll.data.parent` = ator; o próprio sistema usa
  (`dualityRoll.mjs`, `handleTriggers`).

## Itens: mudanças 2.10 → 2.12 que afetam o módulo
- **[V]** Desde a **2.11.0**, arma e armadura guardam as features em `system.itemFeatures`
  (`TypedObjectField` por valor: `{ [valor]: { value, actionIds, effectIds } }`;
  `module/data/item/weapon.mjs`, `armor.mjs`). `DhItem.migrateData` (`module/documents/item.mjs`)
  converte `weaponFeatures`/`armorFeatures` ao carregar. As ações e os efeitos da feature só são
  criados quando a mudança vem em `system.itemFeatures` (`module/data/item/helpers.mjs`,
  `updateItemFeatures`). O gerador do módulo ainda grava o formato antigo (C212-03).
- **[V]** Na 2.12, algumas features de arma aplicam a regra por `rollModifiers` e não por
  ActiveEffect (`module/config/itemFeatures.mjs`: `selfCorrecting` `sc6`, `serrated` `sc8`,
  `brutal` `br`, `powerful` `pw`; `massive` tem `pw` e ainda um efeito). `weapon.mjs` (`prepareDerivedData`) monta `system.rollModifiers`,
  `dice/damageRoll.mjs` aplica no dano e `dice/die/baseDie.mjs` implementa o modificador. Na 2.10
  essas features criavam um efeito com `changes: []`, só de rótulo. Arma com `effectIds: []`
  nelas é o esperado (conferido no rebuild do B-011, Spec `correcoes-1-39` 5.2).
- **[V]** `system.actions` é `ActionCollectionField` (`module/data/fields/action-collection-field.mjs`),
  `ActionCollection extends Collection`.
- **[V]** Item `class`: `classItems`, `inventory.*` e `characterGuide.suggested*` viraram
  `DocumentUUIDField` (uuid de compêndio continua aceito).
- **[V]** `CONFIG.DH.ACTOR.abilities` virou `CONFIG.DH.ACTOR.traits`, com `abilities` como alias
  (`module/config/actorConfig.mjs`); cada entrada ganhou `short`.
- **[V]** O schema do personagem perdeu `system.rules.attack.*` (2.12).

## `CONFIG.DH`
- **[V]** `CONFIG.DH = SYSTEM` (`module/config/system.mjs`). Chaves: `id`, `ENCOUNTER`, `GENERAL`,
  `DOMAIN`, `ACTOR`, `RESOURCE`, `ITEM`, `SETTINGS`, `EFFECTS`, `ACTIONS`, `FLAGS`, `DICESONICE`,
  `HOOKS`, `TRIGGER`, `ITEMBROWSER`, `LOOKUP`, `lore`.
- **[V]** Domínios: `CONFIG.DH.DOMAIN.domains` (`module/config/domainConfig.mjs`), entradas
  `{id, label, src, description, color}`. `allDomains()` junta os do Homebrew
  (`game.system.settings.homebrew.domains`) com os do sistema.
- **[V]** Homebrew: setting de mundo `daggerheart.Homebrew` (`DhHomebrew`,
  `module/data/settings/Homebrew.mjs`); o campo `domains` aceita `{id, label, src, description, color, invertText}`.
  **O módulo usa este caminho** (`ensureHomebrewDomains` em `scripts/main.js`).
- **[V]** A wiki (`Module-Builder-Information`) documenta registros no `init`:
  `CONFIG.DH.GENERAL.attributionSources`, `CONFIG.DH.ITEM.weaponFeatures` / `armorFeatures`,
  `CONFIG.DH.RESOURCE.character.custom`, `CONFIG.DH.ACTOR.adversaryTypes`.

## Tipos de documento (`system.json`)
- **Actor:** `character`, `companion`, `adversary`, `npc`, `environment`, `party`.
- **Item:** `ancestry`, `community`, `class`, `subclass`, `feature`, `domainCard`, `loot`,
  `consumable`, `weapon`, `armor`, `beastform`, `transformation`.
- **ChatMessage:** `dualityRoll`, `fateRoll`, `adversaryRoll`, `damageRoll`, `abilityUse`, `tagTeam`, `systemMessage`.

## Ações
- **[V]** Classes em `module/data/action/*.mjs`. Tipos: base, attack, countdown, damage, healing,
  summon, effect, macro, beastform, transform, evolution, grouped.
- **[V]** `system.actions` é um `ActionCollection` (Collection por `_id`; `.get(id)` funciona). Salvo
  como objeto por `_id`.
- **[V]** `cost`: lista de `{key (padrão "hope"), itemId, value, scalable, step, consumeOnSuccess}`.
  `uses`: `{value, max (fórmula), recovery, consumeOnSuccess}`.
- **[V]** `action.workflow` é um `Map` congelado; um passo roda sozinho com
  `action.workflow.get("damage").execute(config)`.

## Fichas e API pública
- **[V]** `game.system.api = {applications, data, models, documents, macros, dice, fields}`
  (`daggerheart.mjs`), atribuído no `init` do sistema. Leia no seu `init` ou depois.
- **[V]** Fichas: `game.system.api.applications.sheets.actors.{Character, Adversary, Companion,
  Environment, NPC, Party}`, todas ApplicationV2 + HandlebarsApplicationMixin. O módulo herda
  `Character` e `Party` e registra com `Actors.registerSheet(MODULE_ID, Classe, {types, makeDefault, label})`.
- **[V]** Diálogos usados pelo módulo: `game.system.api.applications.dialogs.TagTeamDialog`.
- **[V]** Outras mudanças 2.10 → 2.12: arquivos de ficha renomeados (#2478; as exportações do
  `game.system.api` não mudaram), `DhToken` → `DhTokenDocument` (#2436),
  `CONFIG.DH.GENERAL.range.*.short` virou chave de i18n e o código foi para `shortKey` (#2561).

## Wiki
`https://github.com/Foundryborne/daggerheart/wiki`: páginas **Module-Builder-Information**,
**Triggers**, **Homebrew-Guide** e **Theming-and-Style-Rules**. Editada pela última vez em
2026-09-03; pode estar atrás do código.

## Level Up e Item Browser (conferido em 2026-11-01, 2.12.1, para `docs/spec/organizacao-e-filtros.md`)
- **[V]** Level Up de personagem: `DhCharacterLevelUp` (`module/applications/levelup/characterLevelup.mjs`),
  base `DhlevelUp` (`levelup.mjs`), exportada como `game.system.api.applications.levelup.CharacterLevelup`.
  Tem `this.actor` e `this.levelup` (cartas escolhidas em `levels.*.achievements.domainCards.*.uuid`
  e `levels.*.choices.domainCard.*.data`).
- **[V]** A janela não lista cartas: o botão abre `ui.compendiumBrowser` (instância única de
  `ItemBrowser`, `daggerheart.mjs`) com `folder: "domains"` e filtro de domínio e nível. A carta entra
  por arrastar; o `_onDrop` recusa duplicada pelo **nome** do item do ator.
- **[V]** O Item Browser só carrega compêndios (`game.packs.map(p => p.getDocuments({ type__in }))`,
  `itemBrowser.mjs`). Menus em `module/config/itemBrowserConfig.mjs` (`domainCards`: `domainCard`;
  `equipments`: `armor, weapon, consumable, loot`). Classe da janela: `compendium-browser`.
- **[V]** O passo de equipamento da criação abre o mesmo Item Browser (`characterCreation.mjs`
  `viewCompendium`, `equipments.folders.weapons/armors`); as sugestões da classe vêm do item de classe.

## Clones das cartas oficiais e bundle publicado (conferido em 2026-11-02, 2.10.13 / 2.12.1 / `v14` 2.12.3, Spec `correcoes-1-39`)
- **[V]** O sistema renomeia ações de cartas oficiais entre versões menores, sem aviso. Exemplo:
  Blighting Strike (`src/packs/domains/domainCard_Blighting_Strike_CEOM585jIX8V9PHz.json`):
  `With Hope`/`With Fear` até a 2.10.11, `Damage (With Hope)`/`Damage (With Fear)` a partir da
  **2.10.12** (commit `bda013f7`). O `actionNames`/`patch` das cartas clonadas do módulo depende
  desses nomes: confira a cada versão nova (todos os clones casam na 2.12.1, depois do BLD-02).
- **[V]** Para conferir pacotes: os JSON de origem estão em `src/packs/<pack>/*.json` no repositório
  do sistema (`system.actions` é objeto por `_id`; `effects` é lista).
- **[V]** O `system.zip` da Release traz o código empacotado em `build/daggerheart.js` (rollup, sem
  minificar). Na 2.12.1 a classe continua `class ItemBrowser`, então o hook `renderItemBrowser` vale.
  O `styles/daggerheart.css` não usa `@layer` nem `!important` em `.item-container`.
- **[V]** Item Browser 2.12.1: `loadItems` troca a lista com
  `element.querySelector('.item-list').innerHTML = …`. Os filtros e a busca do sistema escondem
  linhas com `li.hidden`, não com classe nem `style`.
