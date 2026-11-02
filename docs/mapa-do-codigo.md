# Mapa do código

Onde fica cada coisa no módulo (versão 1.38.1). Os nomes são os símbolos de topo do arquivo; ache
com `grep -n "<nome>" scripts/<arquivo>`. Linhas mudam, nomes não. Quem mantém é o Arquiteto.

## Carregamento
`module.json` → `esmodules` na ordem: `main.js`, `edgeheart-character.js`, `edgeheart-crew.js`,
`edgeheart-babele.js`. O `edgeheart-localize.js` só é importado pelo gerador. CSS:
`styles/edgeheart.css`, `styles/edgeheart-sheet-theme.css`.

## `scripts/main.js` (~5 mil linhas): conteúdo e gerador

| Seção | Símbolos |
|---|---|
| Compêndios e ids | `PACKS`, `getOrCreatePack`, `makeFolder`, `stableId` (ids estáveis; **não mude chaves**) |
| Helpers de ação e efeito | `targetEffect`, `featureAction`, `buildAttackAction`, `gear`, `gearCondition`, `CPR()` (arte em `assets/cpr/`), `ICON_PNG()`, `CARD_ART()`, `ICONS` |
| Armas e armaduras | `W`, `A`, `PRIMARY_WEAPONS`, `SECONDARY_WEAPONS`, `ARMORS`, `buildWeaponData`, `buildArmorData`, `importWeaponsAndArmor` |
| Consumíveis, loot, veículos | `C`, `L`, `CONSUMABLES`, `LOOT`, `V`, `VEHICLES`, `VEHICLE_ACTIONS`, `buildVehicleData`, `importLootAndConsumables` |
| Classes e subclasses | `RUNNER`, `INFILTRATOR`, `SOLO`, `AUGMENTED`, `TECH`, `BROKER`, `RECLAIMER`, `TRAUMA_DOC`, `WARDEN`, `CLASSES`, `KILL_CHAIN_ACTIONS`, `COVER_ACTIONS`, `CHROME_ACTIONS`, `importClassesAndSubclasses`, `importClass` |
| Trajetórias e afiliações | `LIFE_PATHS`, `AFFILIATIONS`, `importLifePathsAndAffiliations` |
| Cartas de Competência | `buildCardAction`, `NETWORK_CARDS` … `MEDTECH_CARDS`, `BLACKWALL_CARDS`, `REDLINE_CARDS`, `cloneOfficialCard`, `OFFICIAL_ACTION_NAMES`, `COMPETENCIES`, `ensureHomebrewDomains` (Homebrew do sistema), `importDomainCards` |
| Adversários e ambientes | `adversaryAttack`, `adversaryAction`, `threatAction`, `threatFeature`, `ADVERSARIES`, `ENVIRONMENTS`, `THREAT_AUTOMATION`, `automateThreatFeature`, `importAdversaries`, `importEnvironments` |
| Cyberware e Eidolons | `CYBERWARE`, `CYBER_ART`, `BONUS`, `buildCyberwareItem`, `cyberEffect`, `EIDOLONS`, `EW`, `EF`, `buildEidolonParts`, `buildEidolonItem`, `importCyberware` |
| Diários e tabelas | `JOURNALS`, `TABLE_NAMES`, `cyberwareTable`, `competencyCards`, `loadJournalsEn`, `importJournals` |
| Orquestração | `clearPacks`, `repairPackFolders`, `stampActionIds` (grava `flags.actionIds`), `buildPacks` (gerador; só GM e com o Foundry em inglês) |
| `ready` | `api = { buildPacks, repairPackFolders }`, `ensureHomebrewDomains`, `repairPackFolders`, `ensureStartScene` |

O conteúdo é escrito em português; nomes de classes, subclasses e features ficam no original.

## `scripts/edgeheart-character.js`: ficha e regras do personagem

| Seção | Símbolos |
|---|---|
| Achar ação por id | `isAction` (exportado), `actionKeyIn` |
| Humanidade e Carga | `Humanity` (exportado): `isEdgeheart`, `die`, `cyberware`, `access`, `cardIssues`, `cyberLoad`, `roll`, Ciberpsicose |
| Acessos por cyberware | `AccessClass`, `queueAccessSync` |
| Level Up do Edgeheart | `LEVELUP_SELECTIONS`, `EdgeheartLevelup` (settings `edgeheartLevelup`, `levelTiersBackup`, `levelupApplied`) |
| Escolhas ao instalar | `Cyberware`, `Pick` |
| Pedidos ao mestre | `asOwner`, `handlers`, `CONFIG.queries["edgeheart-cyberpunk.character"]` |
| Tema da ficha | `SheetFx` (setting `sheetFx`) |
| Ficha | `defineSheet` (herda `game.system.api.applications.sheets.actors.Character`, aba Chrome em `templates/chrome-tab.hbs`) |
| Features de classe | `KillChain` (Solo), `Cover` (Infiltrator), `rollFormula`, `IntegratedChrome` (Augmented) |
| Eidolons | `Eidolon` e os ganchos dos Eidolons |
| Ganchos | `updateActor`, `daggerheart.preUseAction` / `postUseAction`, `postDualityRollConfiguration`, `postRollDuality` (Rolagem de Humanidade), `createItem`/`updateItem`/`deleteItem`, `deleteActiveEffect` (fim de cena em Ciberpsicose), `renderChatMessageHTML`, `renderActorDirectory`, `renderItemBrowser`, `renderDhCharacterCreation` |

Settings: `defaultSheet`, `edgeheartLevelup`, `sheetFx` e os internos acima. Dados em
`flags["edgeheart-cyberpunk"]` do ator: `edgeheart`, `humanityDie`, `cyberLoadMod` e afins.

## `scripts/edgeheart-crew.js`: Crew e veículos

| Seção | Símbolos |
|---|---|
| Movimentos de Edge | `MOVE_DEFS`, `move`, `MAX_EDGE` |
| Regras | `Crew` (exportado) |
| Chat e botões | `CARD_BUTTONS`, `cardButtons`, `chatCard`, `CARD_ACTIONS` |
| Pedidos ao mestre | `askGM`, `relay`, `asOwner`, `handlers`, `CONFIG.queries["edgeheart-cyberpunk.crew"]` |
| Ficha | `defineSheet` (herda `…sheets.actors.Party`, aba em `templates/crew-tab.hbs`) |
| Veículos | `VEHICLE`, `Vehicle` (exportado); itens de loot com `flags.vehicle` gerados pelo `main.js` |

Dados em `flags["edgeheart-cyberpunk"].crew` do ator `party`.

## Tradução
- `scripts/edgeheart-babele.js`: `ITEM_MAPPING`, `ACTOR_MAPPING` (exportados), conversores
  `edgeheartLabels` e `edgeheartList`; registra `babele/pt-BR` no `babele.init`.
- `scripts/edgeheart-localize.js`: `localizePacks` (exportado). Lê `data/glossary-pt-BR.json` e
  `data/content-en.json`, grava a base em inglês e escreve `babele/pt-BR/*.json` pelo `FilePicker`.
- `lang/en.json` e `lang/pt-BR.json`: interface, chaves `EDGEHEART.*`, pelo helper `t()` de cada arquivo.

## Dados e textos
- `data/content-en.json`: textos em inglês do conteúdo (`_names` e textos por documento).
- `data/glossary-pt-BR.json`: termos inglês ↔ português.
- `data/void-blood.json`: cartas do domínio Blood (The Void), base do Redline.
- `journals/srd/` (pt-BR), `journals/en/srd/` (inglês), `journals/campaign-frame/`, `journals/welcome/`.

## Gerados (não editar à mão)
- `packs/<compêndio>/` (LevelDB) e `babele/pt-BR/*.json`: saem de `api.buildPacks()` (ADR 0005).

## Ferramentas (fora do zip)
- `tools/check.mjs` (nível 1), `tests/**/*.test.mjs` com `tests/helpers/foundry-stub.mjs` (nível 2).
