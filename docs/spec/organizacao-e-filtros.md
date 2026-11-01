# Spec: organizacao-e-filtros
PRD: `docs/prd/organizacao-e-filtros.md` (aprovado, respostas na seção 9.1) · ADRs: 0003, 0004, 0005,
0007 · Status: Aprovada (gate 2026-11-01)
Sistema conferido: Daggerheart 2.12.1 (`../daggerheart-src`, tag `2.12.1`) · Foundry 14

## Resumo

- **B-002 (ORG):** o nome de origem do cyberware no `main.js` **não muda**. Ele é a chave do glossário,
  do `content-en.json` e, depois da localização, do Babele. O custo entra como prefixo `[n] ` no
  **último passo do gerador** (`edgeheart-localize.js`), no nome em inglês da base e no nome pt-BR do
  Babele ao mesmo tempo. As pastas de Tier já ordenam por nome (`sorting: "a"`), então o prefixo
  sozinho põe a lista na ordem de custo, com desempate alfabético na língua de quem lê. Não precisa
  do campo `sort`.
- **B-003 (LVL):** o sistema não tem uma "lista de cartas" dentro da janela de Level Up. As cartas
  são escolhidas no **Item Browser** (`ui.compendiumBrowser`), que a janela abre filtrado por domínio
  e nível. O filtro esconde nele as cartas que o personagem já tem, enquanto uma janela de Level Up
  de personagem estiver aberta. Usa o mesmo método do filtro de classes que o módulo já tem: uma
  classe CSS na linha, sem tocar no sistema.
- **B-004/B-005 (FIL):** o Item Browser só lista itens de compêndio
  (`game.packs.map(pack => pack.getDocuments(...))`). Por isso, "item do módulo" = **uuid começando
  por `Compendium.edgeheart-cyberpunk.`**. O passo de equipamento da criação abre esse mesmo Item
  Browser. A setting é de mundo, ligada por padrão, e **vale sem recarregar** (R15, seção 3.4).

## 1. Contexto do código

Linhas da versão 1.38.1.

| Onde | O que importa |
|---|---|
| `scripts/main.js:41-47` `makeFolder` | Pastas criadas com `sorting: "a"` (alfabética) por padrão; as de Tier do Cyberware usam o padrão (`:4723-4725`). |
| `scripts/main.js:4403-4483` `CYBER_ART`, `CYBERWARE` | 60 definições `{ n, name (pt), cost, choice?, … }`. Só o nº 2 (Acesso Neural, `choice: "competency"`) tem custo variável: o texto diz "1–3". |
| `scripts/main.js:4479-4484` `cyberDescription` | Primeira linha do texto: `Custo Cibernético ${def.choice === "competency" ? "1–3" : def.cost}`. A mesma expressão aparece em `cyberwareTable` (`:4800`) e `cyberwareTableEn` (`:4834`). |
| `scripts/main.js:4486-4495` `buildCyberwareItem` | `_id = stableId(\`cyberware:${n}\`)`, `name: def.name`, flags `cyberware, cyberCost, tier, number…`. |
| `scripts/main.js:4721-4735` `importCyberware` | A arte vem pelo **número** (`CYBER_ART[def.n - 1]`), não pelo nome. Os Eidolons ficam na pasta própria. |
| `scripts/edgeheart-localize.js:96-110` `names()` | Nome de origem (pt) → `{en, pt}` pelo glossário (`data/glossary-pt-BR.json`, seção `cyberware`). Nome fora do glossário vai para a lista de "desconhecidos" e fica igual nas duas línguas. |
| `scripts/edgeheart-localize.js:85-87` `contentFor` | Texto em inglês de `data/content-en.json` pelo **nome em inglês** do glossário. |
| `scripts/edgeheart-localize.js:153-198` `translateItemData` | Devolve `update.name` (base em inglês), `entry.name` (pt-BR) e `enName` (chave da entrada do Babele, `:202-218`). |
| `scripts/edgeheart-babele.js` | O Babele casa a entrada pelo nome do documento no compêndio (chave = `enName`); ações e efeitos pelo nome em inglês. |
| `scripts/edgeheart-character.js:27-33` `isAction` | Acha **ações** por `flags.actionIds` / nome da ação, nunca pelo nome do item. Nenhuma regra acha cyberware pelo nome do item (`Humanity.cyberware` usa a flag `cyberware`). |
| `scripts/edgeheart-character.js:1406-1434` | Filtro atual: `EDGEHEART_PACK_UUID`, `CREATION_ONLY_TYPES`, `edgeheartCreationOpen`, `filterItemBrowser` (põe ou tira a classe `eh-hidden` da linha), hook `renderItemBrowser` com `MutationObserver` na `.item-list`. |
| `scripts/edgeheart-character.js:404-438` `EdgeheartLevelup` | Só troca a setting de mundo `LevelTiers` do sistema (opções de avanço). Não mexe na escolha de cartas: **não conflita** com B-003. |
| `styles/edgeheart.css:188` | `.compendium-browser .item-container.eh-hidden { display: none !important; }` |
| `module.json:54` | `esmodules`: `main.js`, `edgeheart-character.js`, `edgeheart-crew.js`, `edgeheart-babele.js`. |

## 2. API do sistema e do Foundry usada

| Uso | Conferido em (Daggerheart 2.12.1, salvo indicação) | Veredito |
|---|---|---|
| Level Up de personagem: classe `DhCharacterLevelUp` (base `DhlevelUp`), `this.actor`, `this.levelup` | `module/applications/levelup/characterLevelup.mjs` l. 5; `levelup.mjs` l. 6-21 | [V] |
| Exportada como `game.system.api.applications.levelup.CharacterLevelup` | `module/applications/_module.mjs` (`export * as levelup`), `levelup/_module.mjs` | [V] |
| Hooks `renderDhCharacterLevelUp` e `closeDhCharacterLevelUp` | hooks automáticos `render<Classe>`/`close<Classe>` do ApplicationV2 (`docs/referencias/foundry-v14.md`) | [V] Foundry; nome da classe [V] |
| A janela abre o Item Browser para escolher carta: `viewCompendium` → `ui.compendiumBrowser.open({ folder: "domains", filter: { "level.max", "system.domain" } })` | `levelup.mjs` l. 360-383 | [V] |
| A carta entra no Level Up por arrastar para `.levelup-card-selection .card-preview-container`; o sistema **recusa** duplicada pelo **nome** (`this.actor.items.find(x => x.name === item.name)`) e pelo uuid já escolhido no próprio Level Up | `levelup.mjs` `_onDrop` l. 236-276 | [V]. Hoje a carta repetida aparece na lista e só dá erro ao soltar. |
| Cartas escolhidas no Level Up em andamento: `levelup.levels[n].achievements.domainCards[k].uuid` e `levelup.levels[n].choices.domainCard[k].data` (lista de uuids) | `levelup.mjs` l. 261-270, 405-414 | [V] |
| `ui.compendiumBrowser = new applications.ui.ItemBrowser()` (uma instância só) | `daggerheart.mjs` l. 390 | [V] |
| Item Browser lista **só compêndios**: `game.packs.map(pack => pack.getDocuments({ type__in: selectedMenu.data.type }))` | `module/applications/ui/itemBrowser.mjs` l. 253 | [V] |
| Linha: `.item-container[data-item-uuid]` com `.item-list-name`; lista `.item-list`; menu `selectedMenu.data.type` | `templates/ui/itemBrowser/itemContainer.hbs`; `itemBrowser.hbs` l. 38; `itemBrowser.mjs` l. 227-234 | [V] (mesmo da auditoria de `compat-2-12`) |
| Menus: `domainCards` com `type: ['domainCard']`; `equipments` com `['armor','weapon','consumable','loot']` e subpastas `weapons`, `armors`, `consumables`, `loots` | `module/config/itemBrowserConfig.mjs` l. 555-600, 632-633 | [V] |
| Passo de equipamento da criação: `viewCompendium` abre o mesmo Item Browser (`folder: "equipments.folders.weapons"` / `armors`, filtro `system.tier: 1`) | `module/applications/characterCreation/characterCreation.mjs` l. 428-458 | [V] |
| Sugestões da classe na criação (`characterGuide.suggested*`, `inventory.take/choiceA/choiceB`) vêm do item de classe, **não** do Item Browser | `characterCreation.mjs` `getEquipmentSuggestions` (l. 396-410), `module/data/item/class.mjs` `fetchSuggestedGear`/`fetchInventoryChoices` | [V]. Ver Q1. |
| Origem de um item embutido: `item._stats.compendiumSource` (uuid do compêndio de onde veio) | Foundry v14, `DocumentStatsField` (`docs/referencias/foundry-v14.md`); o sistema usa em `characterCreation.mjs` l. 535-545 | [V] |
| Setting de mundo com `onChange`: roda em todos os clientes conectados quando o mestre muda | `docs/referencias/foundry-v14.md` (`ClientSettings#register`) | [I] (comportamento conhecido do Foundry; confirmado no roteiro N3, passo F4) |
| Ordem do compêndio: pasta com `sorting: "a"` ordena os itens por nome | Foundry v14, `Folder#sorting` (`"a"` alfabética, `"m"` manual) | [V] Foundry docs; [I] que o nome usado é o já traduzido pelo Babele (conferido no roteiro O2) |
| Babele: entrada casada pelo nome do documento no compêndio | `scripts/edgeheart-babele.js` e `edgeheart-localize.js` `entryKey` | [V] no módulo; regra do Babele [I] (é a que o módulo já usa para todos os compêndios) |

Nada novo do sistema é importado por caminho, sobrescrito ou copiado (ADR 0005).

## 3. Design

### 3.1 B-002: custo no nome do cyberware (ORG-01)

1. **Fonte (`main.js`)**: a definição `CYBERWARE` e o `name` de origem não mudam. Entra um helper
   `cyberCostLabel(def)` = `def.choice === "competency" ? "1–3" : String(def.cost)`. Ele passa a
   ser usado em `cyberDescription`, no lugar da mesma expressão (uma linha), e grava a flag nova
   `flags.edgeheart-cyberpunk.costLabel` em `buildCyberwareItem`. Eidolons não recebem a flag
   (R3: ficam como estão).
2. **Localização (`edgeheart-localize.js`)**: função nova exportada
   `withCostLabel(name, flags)` → `"[<costLabel>] <name>"` quando `flags.costLabel` existe e o
   nome ainda não tem o prefixo; senão devolve `name`. Em `translateItemData`, depois de `names()`:
   `enName` e `entry.name` passam por ela. Assim:
   - glossário e `content-en.json` continuam casando pelo nome sem custo (o `names()` e o
     `contentFor` recebem o nome de origem antes do prefixo);
   - a base em inglês fica `[0] Ocular Overlay` e a entrada do Babele tem chave `[0] Ocular Overlay`
     e nome `[0] Sobreposição Ocular`.
3. **Ordem (R1, CA1)**: as pastas de Tier têm `sorting: "a"`. `[0] …` < `[1–3] …` < `[1] …` < `[2] …`
   < `[3] …` < `[4] …` (o maior custo é 4; nenhum custo tem dois dígitos). Dentro do mesmo custo, a
   ordem é alfabética no nome mostrado, em cada língua. **Não se usa o campo `sort`**: com
   ordenação manual, o desempate ficaria preso à ordem de uma língua só.
4. **O que não muda**: `stableId` (pelo número), arte (pelo número), `flags.actionIds` (nomes das
   ações), `isAction`, flags existentes (`cyberCost` continua número), diários e tabela de rolagem
   (os rótulos dos links continuam sem custo; fora do pedido), aba Chrome (Q4 = a).
5. **Cyberware já instalado (Q5 = a, R5, CA4)**: o item embutido é uma cópia e mantém o nome dele.
   Nada procura cyberware pelo nome do item, então a Carga, as escolhas e as ações seguem iguais.
   Sem migração.
6. **Acesso Neural**: o nome fica `[1–3] Acesso Neural` (igual ao texto, CA3); a posição é logo
   **antes** dos itens de custo 1 (depois dos de custo 0). O `localeCompare` (root, `en` e `pt-BR`)
   ignora a pontuação `]` no primeiro nível de comparação, então `[1–3` vence `[1] ` pelo `–`;
   conferido no Node pela Fábrica. Aceito sem mudar código (emenda de 2026-11-01, seção 5).

### 3.2 Arquivo novo de filtros do Item Browser

Os dois filtros novos ficam em `scripts/edgeheart-browser-filters.js`, registrado no `esmodules`
depois de `edgeheart-character.js`. O filtro de classes que já existe **não é tocado** (ADR 0003,
Q3b = a). Para nenhum filtro desfazer o outro, cada um usa a **sua** classe CSS na linha
(`eh-hidden` = classes, já existe; `eh-hidden-owned` = Level Up; `eh-hidden-gear` = equipamento), e
cada classe tem a sua regra `display: none` em `styles/edgeheart.css`. A linha some se tiver
qualquer uma das três.

Gatilhos, os mesmos do filtro existente: hook `renderItemBrowser` e um `MutationObserver` próprio
na `.item-list` (a lista é preenchida depois do render). Mais `renderDhCharacterLevelUp` e
`closeDhCharacterLevelUp`, que reaplicam o filtro de cartas em `ui.compendiumBrowser`, e o
`onChange` da setting (3.4).

### 3.3 B-003: cartas já possuídas no Level Up (LVL-01)

- **Quando vale:** a lista do Item Browser é de cartas (`selectedMenu.data.type` contém
  `"domainCard"`) **e** há uma instância de `game.system.api.applications.levelup.CharacterLevelup`
  aberta (`foundry.applications.instances`). Com mais de uma janela aberta, vale a união das cartas
  dos personagens.
- **Carta possuída (Q7 = a, venha de onde vier):** para cada `domainCard` em `actor.items`:
  `_stats.compendiumSource` (uuid) e o nome. Mais os uuids já escolhidos no Level Up em andamento
  (`levels.*.achievements.domainCards.*.uuid` e `levels.*.choices.domainCard.*.data`).
- **Linha escondida:** se o `data-item-uuid` está no conjunto de uuids **ou** se o texto de
  `.item-list-name` é igual ao nome de uma carta possuída. Comparar pelo nome também é a regra que o
  próprio sistema usa para recusar a carta repetida (`levelup.mjs` l. 259), e cobre carta copiada
  de outro compêndio.
- **Funções puras exportadas (nível 2):** `ownedCards(actor, levelup)` →
  `{ uuids: Set, names: Set }`; `isOwnedRow({ uuid, name }, owned)` → boolean.
- **Lista vazia (R8, CA7):** só linhas ficam escondidas; o Item Browser e o Level Up seguem
  funcionando (o Level Up já permite concluir sem carta quando não há o que escolher). Sem mensagem nova.
- **Ao fechar o Level Up**, a classe `eh-hidden-owned` sai de todas as linhas.
- **Cyberware removido depois (nota do PRD, Q7):** a carta tomada pelo acesso é um item do
  personagem; enquanto ele a tiver, ela some da lista. Se ele a apagar, ela volta. Nada a mais a tratar.
- **`EdgeheartLevelup`:** muda só as opções de avanço (setting `LevelTiers`); não interage.

### 3.4 B-004/B-005: filtro de equipamento e setting (FIL-01)

- **Setting** `edgeheart-cyberpunk.gearFilter`: `scope: "world"`, `config: true`, `type: Boolean`,
  **`default: true`** (Q6: ligado sempre, inclusive em mundos existentes, que também caem no
  padrão porque a setting é nova), `name`/`hint` em `EDGEHEART.Settings.GearFilter.Name/Hint`,
  registrada no `init` do arquivo novo.
- **Quando vale:** setting ligada e `selectedMenu.data.type` com algum de `weapon`, `armor`,
  `consumable`, `loot` (Q2 = b). Vale para qualquer abertura do Item Browser: pelo diretório, pelo
  passo de equipamento da criação (`equipments.folders.weapons/armors`) ou por outro botão do
  sistema (Q1b = b fica coberto, porque é a mesma tela).
- **Item do módulo:** `data-item-uuid` começa com `Compendium.edgeheart-cyberpunk.`. O Item Browser
  só carrega compêndios (seção 2), então não precisa de flag nem de `compendiumSource` aqui.
  Cyberware tipo arma (weaponware) e veículos (loot) do módulo continuam aparecendo.
- **Função pura exportada:** `isForeignGear({ uuid, types, enabled })` → boolean.
- **Esconde, não apaga (R11, CA9):** só a classe CSS na linha do Item Browser. Ficha, inventário,
  mundo e compêndios ficam como estão.
- **Classes da criação (Q3b = a, CA11):** o filtro existente continua igual e sem interruptor.
- **R15, decisão: vale sem recarregar.** O filtro não registra nada que precise de recarga: é uma
  classe CSS aplicada a cada render/mutação da lista. O `onChange` da setting chama o filtro em
  `ui.compendiumBrowser` se ele estiver renderizado, e a próxima abertura já lê o valor novo. Como a
  setting é de mundo, o `onChange` roda em todos os clientes [I]; mesmo que não rodasse em algum, o
  próximo render do Item Browser lê o valor certo. Por isso **não** se usa `requiresReload`, que
  pediria recarga a todos por uma mudança que não precisa disso.
- **Textos (`lang/en.json` e `lang/pt-BR.json`)**, do PRD seção 8, com "armaduras e loot"
  (Q2 = b):
  - `Settings.GearFilter.Name`: "Hide non-Edgeheart gear" / "Ocultar equipamento que não é do Edgeheart"
  - `Settings.GearFilter.Hint`: "Hides weapons, armor, consumables and loot from other sources in the
    Item Browser, including the character creation equipment step." / "Oculta armas, armaduras,
    consumíveis e loot de outras fontes no Item Browser, inclusive no passo de equipamento da
    criação de personagem."

### Dados salvos
- Flag nova `flags.edgeheart-cyberpunk.costLabel` (string) nos cyberwares do compêndio. Nenhuma flag
  existente muda.
- Setting nova `edgeheart-cyberpunk.gearFilter` (mundo, Boolean, `true`).

## 4. Quebras e migração
- **Nenhuma migração.** Os nomes dos cyberwares mudam só no compêndio, depois do Rebuild; os itens
  já instalados ficam com o nome antigo (Q5 = a). Ids, flags e nomes de ação não mudam.
- **Rebuild na 2.12:** pela `compat-2-12` (Q3 = sim, Q5 = a), o Rebuild do ORG-01 roda com o sistema
  2.12. Por isso depende do C212-03 (issue #3) já integrado e do `minimum: "2.11.0"` do C212-02.
- Link de diário com o nome antigo do cyberware (`@UUID[...]{Sobreposição Ocular}`) continua
  funcionando: o rótulo é fixo e o uuid não muda.
- Mesas com o filtro de equipamento ligado por padrão param de ver no Item Browser o equipamento
  do Daggerheart base e de outros módulos. Isso é o pedido (Q6); quem não quiser desliga a opção.

## 5. Perguntas técnicas para o usuário
- **Q1 — Kit inicial da classe na criação.** As classes do Edgeheart oferecem no passo de
  equipamento alguns itens **do Daggerheart base**: Tocha, Corda de 15 m e Suprimentos Básicos
  (`inventory.take`), e as Poções Menores de Vida e de Vigor (`choiceA`). Eles vêm do item de classe,
  não do Item Browser, então o filtro não os esconde. Mantém assim? **Recomendo manter:** é o kit que
  a própria classe do Edgeheart define. Se não servirem para o cenário, troque o kit da classe num
  ticket de conteúdo, em vez de esconder (esconder deixaria a escolha da criação vazia).

**Decisões do gate (2026-11-01):** Q1 = manter o kit inicial como está. Tickets ORG-01, LVL-01 e
FIL-01 aprovados.

**Emenda (2026-11-01):** a Fábrica verificou no Node que `localeCompare` (root, `en`, `pt-BR`) põe
`[1–3] Acesso Neural` antes dos `[1] …`, não depois. O usuário decidiu aceitar esse comportamento,
sem mudar código; a seção 3.1 (itens 3 e 6) e o roteiro O2 foram corrigidos. O critério CA1 segue
atendido: `1–3` começa em 1, então a ordem por custo não decresce.

## 6. Tickets

Ordem sugerida: ORG-01 ∥ LVL-01, depois FIL-01. ORG-01 não tem arquivo em comum com nenhum dos outros
dois. LVL-01 e FIL-01 dividem o arquivo novo, então são sequenciais.

### ORG-01: feat(cyberware): custo no nome e ordem por custo dentro do Tier
- Requisitos: R1, R2, R3, R4, R5, R6; CA1, CA2, CA3, CA4
- Escopo: `scripts/main.js` (só `cyberCostLabel` novo, a linha do custo em `cyberDescription`, a
  flag em `buildCyberwareItem` e `export` de `CYBERWARE` e `cyberCostLabel` para o teste),
  `scripts/edgeheart-localize.js` (`withCostLabel` exportada e o uso em `translateItemData`),
  `tests/cyberware-cost-name.test.mjs` (novo). Gerados no Rebuild (não contam):
  `packs/edgeheart-cyberware`, `babele/pt-BR/edgeheart-cyberpunk.edgeheart-cyberware.json`.
- Testes red:
  - **Nível 2:**
    (a) `withCostLabel("Ocular Overlay", { costLabel: "0" })` === `"[0] Ocular Overlay"`; sem
    `costLabel` devolve o nome igual; com o prefixo já presente não duplica. **Falha hoje:** a
    função não existe.
    (b) Para cada um dos 60 `CYBERWARE` (CA3): `cyberCostLabel(def)` é `String(def.cost)`, ou
    `"1–3"` quando `choice === "competency"`, e casa com `/^\d$|^1–3$/` (um dígito: garante a ordem
    alfabética). **Falha hoje:** nada exportado.
    (c) A lista dos nomes com prefixo dos cyberwares de cada Tier, ordenada com `localeCompare`
    (como a pasta `"a"`), sai em custo não decrescente (CA1).
  - **Nível 3 (depois do Rebuild):** roteiro O1-O4 abaixo.
- Critério de pronto: testes verdes; `npm run verify` verde; depois do Rebuild na 2.12, o roteiro
  O1-O4 conferido pelo usuário; o console do gerador não lista nomes de cyberware como "fora do
  glossário".
- Depende de: C212-03 (issue #3) integrado antes do Rebuild; ADR 0005 (Rebuild).
- Rebuild: **sim**.
- Tamanho estimado: ~110 linhas (código ~25, teste ~85), 3 arquivos.
- Paralelo com: LVL-01 ou FIL-01 (sem arquivo em comum).

### LVL-01: feat(levelup): Item Browser esconde cartas que o personagem já tem durante o Level Up
- Requisitos: R7, R8, R9; CA5, CA6, CA7
- Escopo: `scripts/edgeheart-browser-filters.js` (novo: `ownedCards`, `isOwnedRow`, hooks
  `renderItemBrowser`, `renderDhCharacterLevelUp`, `closeDhCharacterLevelUp`, observer),
  `module.json` (só `esmodules`, depois de `edgeheart-character.js`), `styles/edgeheart.css`
  (regra `.compendium-browser .item-container.eh-hidden-owned`),
  `tests/levelup-owned-cards.test.mjs` (novo).
- Testes red (nível 2): com `fakeActor` cujos `items` têm uma `domainCard` "Overclock" com
  `_stats.compendiumSource = "Compendium.edgeheart-cyberpunk.edgeheart-domains.Item.A"`, e um
  `levelup` falso com `levels[2].achievements.domainCards.x.uuid = "…Item.B"` e
  `levels[2].choices.domainCard["0"].data = ["…Item.C"]`:
  (1) `isOwnedRow({ uuid: "…Item.A" })` → true; (2) por nome: `{ uuid: "Compendium.daggerheart.domains.Item.Z", name: "Overclock" }` → true;
  (3) B e C (escolhidas no Level Up) → true; (4) carta nunca escolhida → false (CA6);
  (5) ator sem cartas e levelup vazio → conjuntos vazios, sem erro (CA7).
  **Falha hoje:** o arquivo e as funções não existem.
  Nível 3: roteiro L1-L4.
- Critério de pronto: testes verdes; `npm run verify` verde (o `check` confere o `esmodules`);
  roteiro L1-L4 no PR.
- Depende de: nada.
- Rebuild: não.
- Tamanho estimado: ~150 linhas (código ~75, CSS 1, JSON 1, teste ~75), 4 arquivos.
- Paralelo com: ORG-01.

### FIL-01: feat(filtro): ocultar equipamento que não é do Edgeheart, com opção de mundo
- Requisitos: R10, R11, R12, R13, R14, R15, R16; CA8, CA9, CA10, CA11, CA12, CA13, CA14
- Escopo: `scripts/edgeheart-browser-filters.js` (setting `gearFilter` no `init`,
  `isForeignGear`, uso no mesmo hook/observer do LVL-01, `onChange`), `styles/edgeheart.css` (regra
  `.eh-hidden-gear`), `lang/en.json`, `lang/pt-BR.json` (2 chaves cada),
  `tests/gear-filter.test.mjs` (novo).
- Testes red:
  - **Nível 2:** `isForeignGear`:
    (1) `{ uuid: "Compendium.daggerheart.weapons.Item.x", types: ["weapon"], enabled: true }` → true;
    (2) uuid `Compendium.edgeheart-cyberpunk.edgeheart-weapons.Item.y` → false;
    (3) `types: ["armor"]`, `["consumable"]`, `["loot"]` e o menu `equipments` (os quatro tipos) com
    uuid do sistema → true;
    (4) `types: ["domainCard"]` ou `["class"]` → false (classes ficam com o filtro antigo, CA11);
    (5) `enabled: false` → false (CA10).
    E, com o stub contando os `game.settings.register`: a setting `gearFilter` é registrada com
    `scope: "world"`, `default: true`, `config: true` e sem `requiresReload` (CA12-CA14).
    **Falha hoje:** nada disso existe.
  - **Nível 1:** o `npm run check` já reprova chave `EDGEHEART.*` usada e ausente no `lang`, ou sem
    paridade `en`/`pt-BR` (CA12).
  - **Nível 3:** roteiro F1-F5.
- Critério de pronto: testes verdes; `npm run verify` verde; roteiro F1-F5 no PR.
- Depende de: LVL-01 (arquivo novo, `esmodules` e observer).
- Rebuild: não.
- Tamanho estimado: ~140 linhas (código ~50, lang 4, CSS 1, teste ~85), 5 arquivos.
- Paralelo com: ORG-01.

### Roteiros do nível 3

Mundo de teste: Foundry v14, Daggerheart 2.12.1, módulo com os tickets, Babele ativo para os passos
em pt-BR. Um GM e um jogador.

**ORG (depois do Rebuild):**
- O1. Foundry em inglês: compêndio Cyberware, pasta "Tier 1 — Common". Os nomes começam com `[0]`
  e depois `[1]`, e em cada custo a ordem é alfabética. Ex.: `[0] Ocular Overlay`.
- O2. Foundry em pt-BR com Babele: mesma pasta, `[0] Sobreposição Ocular`; ordem por custo e
  alfabética em português. `[1–3] Acesso Neural` vem logo antes dos `[1]` (depois dos `[0]`).
- O3. Abrir 5 cyberwares ao acaso (um por custo): o número do nome é igual ao "Custo Cibernético"
  da primeira linha do texto (CA3). Pasta de Eidolons sem mudança.
- O4. Personagem criado **antes** do Rebuild, com cyberware: o nome antigo continua, a Carga
  Cibernética na aba Chrome é igual, as escolhas (ex.: Acesso Neural) e as ações funcionam (CA4).
  Arrastar um cyberware novo: entra com `[n]` no nome, a Carga soma o custo, a escolha ao instalar abre.

**LVL:**
- L1. Personagem nível 1 com a carta X. Subir de nível, clicar para escolher carta: o Item Browser
  abre com as cartas do domínio, **sem X** (CA5). Cartas que ele nunca teve aparecem (CA6).
  **Hoje:** X aparece e só dá erro de duplicada ao soltar.
- L2. Escolher a carta Y no Level Up (arrastar): Y some da lista aberta. Tirar Y: Y volta.
- L3. Fechar o Level Up com o Item Browser aberto: X volta a aparecer.
- L4. Personagem com todas as cartas elegíveis do nível: a lista fica vazia, sem erro no console, e
  o Level Up conclui (CA7). Uma carta tomada por Acesso Cibernético também some (Q7).

**FIL:**
- F1. Configurações do módulo: a opção "Hide non-Edgeheart gear" / "Ocultar equipamento que não é
  do Edgeheart", com a descrição, nas duas línguas, ligada num mundo novo **e** num mundo que já
  usava o módulo (CA12, CA14). Só o GM consegue mudar.
- F2. Opção ligada: Item Browser › Equipamento › Armas, Armaduras, Consumíveis e Loot mostram só
  itens do Edgeheart (CA8). Na criação, passo de equipamento, os botões de arma e armadura abrem a
  lista só com itens do Edgeheart.
- F3. Personagem com uma arma do Daggerheart base na ficha: continua na ficha, equipa e ataca (CA9).
- F4. Com o Item Browser aberto no GM **e** no jogador, o GM desliga a opção: as listas dos dois
  voltam a mostrar tudo **sem recarregar** (CA10, CA13, R15). Ligar de novo: escondem de novo.
- F5. Com a opção ligada ou desligada, a criação pela Ficha Edgeheart continua mostrando só as
  classes do Edgeheart (CA11). Com a criação fechada, o Item Browser › Classes mostra todas, como hoje.

## 7. Exceções
| Ticket | Linhas | Arquivos | Motivo | Data |
|---|---|---|---|---|
