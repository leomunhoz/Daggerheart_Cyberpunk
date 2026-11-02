# Spec: correcoes-1-39
PRD: nenhum (via rápida, B-013 e B-014) · ADRs: 0003, 0004, 0005, 0007 · Status: Rascunho
Sistema conferido: Daggerheart 2.10.13, 2.12.1 (tag e `system.zip` da Release) e `v14` (2.12.3) · Foundry 14

## Resumo

Investigação INV-02 (2026-11-02) de dois bugs da v1.39.0 (`main` em `28e7778`), relatados no
Foundry v14 + Daggerheart 2.12.1.

- **Bug A (gerador), B-013:** o `buildPacks()` quebra na etapa das Competências com
  `Cannot read properties of undefined (reading 'damage')`. **Causa confirmada [V]:** o Daggerheart
  **2.10.12** renomeou as ações da carta oficial **Blighting Strike** de `With Hope`/`With Fear` para
  `Damage (With Hope)`/`Damage (With Fear)`. A carta **Corruption Spike** (Blackwall) clona a
  Blighting Strike e procura essas ações pelo nome antigo. O patch recebe `undefined` e o build para.
  É a única carta que quebra. Ticket **BLD-02**.
- **Bug B (filtro), B-014:** com `gearFilter = true`, armas e armaduras do sistema continuam no
  Item Browser e no passo de equipamento da criação. **Causa ainda não confirmada.** A hipótese do
  índice sem `type` caiu (dados do console do usuário e código [V]). O código do filtro bate com o
  `ItemBrowser` da 2.12.1 em todos os pontos conferidos. A hipótese mais forte é **CSS velho no
  cache do navegador** [I] (seção 3.2). Os comandos de console da seção 3.3 decidem a causa. Ticket
  **FIL-03**, condicional.

**Ação do usuário, independente dos tickets:** o build quebrado já apagou e regravou parte dos
compêndios do módulo **no disco**. O console mostra `cyberware 0`, e o Localize não rodou, então o
`babele/pt-BR` não bate com a base. **Reinstale a v1.39.0** pelo Foundry (ou restaure `packs/` e
`babele/pt-BR/` da `main`) antes de testar qualquer coisa. Sem isso, cyberware, adversários,
ambientes e diários ficam vazios.

## 1. Contexto do código

### Bug A
- `scripts/main.js:2541-2548`: `rb("Corruption Spike", { clone: "Blighting Strike", actionNames:
  { "Spellcast Roll": …, "With Hope": "Dano (Esperança)", "With Fear": "Dano (Medo)" }, patch })`.
  O patch faz `cardAction(c, "Dano (Esperança)").damage.main.value.bonus = null`.
- `scripts/main.js:2275` `cloneOfficialCard`: renomeia cada ação por
  `actionNames[action.name] ?? OFFICIAL_ACTION_NAMES[action.name] ?? action.name`. Com o nome novo
  do sistema, nenhuma chave casa, a ação fica `Damage (With Hope)` e `cardAction` devolve `undefined`.
- `scripts/main.js:2489` `cardAction = (c, name) => Object.values(c.actions).find(a => a.name === name)`.
- `scripts/main.js:2829` `importDomainCards`, laço `competency.cards.map(card => …)`: chama
  `card.patch(c)` sem proteção (`:2851`). Uma exceção derruba a etapa toda (BLD-01 avisa a etapa).
- **A pilha relatada é da v1.38.1 [V].** As linhas `main.js:2542/2839/2847/4965` batem exatamente
  com `git show v1.38.1:scripts/main.js`: o patch, o `map`, a chamada do patch e o
  `await importDomainCards()` direto no `buildPacks`, sem o `runBuildSteps`. O navegador rodou o
  `main.js` da 1.38.1 vindo do cache. Depois de Ctrl+F5 o usuário confirmou a 1.39.0 carregada
  (`BUILD_STEPS.length = 11`). O código da Corruption Spike é **igual** nas duas versões
  (`main.js:2542-2546` hoje), então o bug A vale para a 1.39.0.
- Por que só aparece agora: os compêndios publicados foram gerados na **2.10.8** (Spec
  `release-1-39`, D5), antes da renomeação. Ninguém gerou numa versão ≥ 2.10.12 até agora.

### Bug B
- `scripts/edgeheart-browser-filters.js:80-143`: `GEAR_TYPES`, `isForeignGear`, `hasModuleGear`,
  `requestIndex`, `moduleGearEntries`, `filterGear`, setting `gearFilter`, hook `renderItemBrowser`
  com `MutationObserver` em `.item-list` (`childList`).
- `styles/edgeheart.css:194`: `.compendium-browser .item-container.eh-hidden-gear { display: none !important; }`.
  **O JS só põe a classe; quem esconde é o CSS.**
- O `styles/edgeheart.css` da v1.38.1 **não tem** essa regra [V] (`git show v1.38.1:styles/edgeheart.css`:
  só a `eh-hidden` do filtro de classes).

## 2. API do sistema e do Foundry usada

| Item | Onde foi conferido | Veredito |
|---|---|---|
| Nomes das ações da Blighting Strike | `src/packs/domains/domainCard_Blighting_Strike_CEOM585jIX8V9PHz.json` em 2.10.13, 2.12.1 e `v14`: `Spellcast Roll`, `Damage (With Hope)`, `Damage (With Fear)`. Histórico: `d6c78650` (2.10.0) ainda `With Hope`; **`bda013f7` (entrou na 2.10.12)** renomeia | **quebra** (causa do bug A) [V] |
| Efeito `Blightning Strike` (grafia do sistema) | mesmo arquivo, 2.12.1 | ok, `effectNames` casa [V] |
| Todas as outras cartas clonadas (`clone`, `actionNames`, `effectNames`, `patch`) | script de conferência rodando `cloneOfficialCard` e cada `patch` contra `src/packs/domains` (2.10.13, 2.12.1, `v14`) e `data/void-blood.json` | ok: só a Corruption Spike falha nas três [V] |
| Consumíveis clonados (`CONSUMABLES[].clone`) | `src/packs/items` (2.12.1, `v14`) | ok, todos encontrados [V] |
| Features de adversário clonadas (`clone: { adversary, feature }`) | `src/packs/adversaries` (2.12.1, `v14`) | ok, todas encontradas [V]. Se faltasse uma, `cloneAdversaryFeature` só avisa e não quebra (`main.js:4053`) |
| `importCyberware`, `importEnvironments` | `main.js:4728`, `:4354` | não leem compêndio do sistema; sem risco de clone [V] |
| `ItemBrowser`: classe da janela `compendium-browser`, `selectedMenu.data.type`, `.item-list`, `.item-container[data-item-uuid]` | `module/applications/ui/itemBrowser.mjs` (`DEFAULT_OPTIONS.classes`, `selectFolder`, `loadItems`) e `templates/ui/itemBrowser/itemContainer.hbs`, `itemBrowser.hbs` (2.12.1) | ok [V] |
| Menus de equipamento (`type: ['weapon']`, `['armor']`, …) | `module/config/itemBrowserConfig.mjs` (2.12.1) | ok [V] |
| `loadItems` troca a lista por `innerHTML` (dispara `childList`); os filtros do sistema usam `li.hidden`, sem tirar classe | `itemBrowser.mjs` `loadItems`, `_onInputFilterBrowser` | ok [V] |
| Criação: passo de equipamento abre `ui.compendiumBrowser.open({ folder: "equipments.folders.weapons", render: { noFolder: true }, filter })` | `module/applications/characterCreation/characterCreation.mjs` `viewCompendium` | ok, mesma janela [V] |
| Nome da classe no bundle publicado (`build/daggerheart.js` do `system.zip` 2.12.1): `class ItemBrowser`, sem `ItemBrowser$1` | `system.zip` da Release 2.12.1 | ok, o hook `renderItemBrowser` existe [V] |
| CSS do sistema com `!important` ou `@layer` em `.item-container` | `styles/daggerheart.css` do `system.zip` 2.12.1: sem `@layer`, sem `!important` em `.item-container` | ok [V] |
| Índice dos compêndios Item do módulo (`indexed`, `type` na entrada) | console do usuário, 2026-11-02: todos `indexed = true`, com `type` (armors 25, weapons 64, consumables 40, loot 48) | ok, `hasModuleGear` dá `true` [V] |
| Cache HTTP dos arquivos do módulo pelo Foundry | não documentado | [I]. Evidência indireta: a pilha do bug A veio da 1.38.1 com a 1.39.0 instalada |

## 3. Design

### 3.1 BLD-02: Corruption Spike com os nomes novos e patch tolerante

1. **Nomes:** no `actionNames` da Corruption Spike, trocar `"With Hope"`/`"With Fear"` por
   `"Damage (With Hope)"`/`"Damage (With Fear)"`. O `minimum` é 2.11.0 (`module.json`), depois da
   renomeação (2.10.12). A reserva com o nome antigo estaria morta, então não entra (ADR 0007,
   item 4). Os nomes de destino (`Dano (Esperança)`, `Dano (Medo)`) não mudam, e os `actionIds` e o
   Babele também não (regra 6 do `CLAUDE.md`).
2. **Tolerância (ADR 0007):** o bloco do clone dentro do `map` de `importDomainCards` (clone,
   `setDamageType`, `patch`) vira uma função exportada `cloneCompetencyCard(card, officials)`, que
   devolve o `c`. O resto do `importDomainCards` fica igual. Na função:
   - um `actionNames` cuja chave não existe na carta oficial gera
     `console.warn("Edgeheart | <carta>: ação oficial \"<chave>\" não encontrada em <clone> (nomes: …)")`.
     A próxima renomeação do sistema aparece no console, sem quebrar nada;
   - o `card.patch(c)` roda em `try/catch`. Se falhar, `console.warn` com o nome da carta e o
     erro, e a carta segue com a cópia oficial sem o ajuste. O build **não para**, porque parar
     depois do `clearPacks` deixa os compêndios vazios, que é o pior resultado (B-008).
   - Texto só de console, sem `ui.notifications`. É o mesmo padrão do aviso "Carta oficial não
     encontrada" (`main.js:2848`), então não entra chave em `lang/`.
3. `COMPETENCIES` ganha `export`, para o teste pegar a definição real da Corruption Spike.
4. **O que não muda:** a ordem das etapas, o conteúdo das outras cartas, o `cloneOfficialCard`
   (usado também pelos consumíveis), os ids e as flags.

### 3.2 Bug B: hipóteses

| # | Hipótese | Situação |
|---|---|---|
| H0 | Índice sem `type` ou não carregado faz o `hasModuleGear` desligar o filtro | **Descartada [V].** Pelo código, entrada sem `type` **conta** como item (`edgeheart-browser-filters.js:91-95`, "para não desligar o filtro à toa"). E o console do usuário mostra índices carregados e com `type` |
| H1 | **CSS velho no cache.** O navegador usou o `edgeheart.css` da 1.38.1, que não tem a regra `.eh-hidden-gear`, e o JS novo (`edgeheart-browser-filters.js`, arquivo que não existia na 1.38.1 e por isso não tinha cache) pôs a classe sem efeito. Resultado: setting ligada, linhas com a classe e nada some | **Mais provável [I].** Evidência [V]: o `main.js` da 1.38.1 rodou do cache com a 1.39.0 instalada (pilha do bug A). Não se sabe se o bug B foi visto antes ou depois do Ctrl+F5 |
| H2 | O observer não está na `.item-list` atual. A lista foi trocada sem disparar `renderItemBrowser`, ou o hook falhou antes de ligar o observer | Improvável [I]. No 2.12.1 todo `render` dispara o hook, e o `loadItems` só troca o `innerHTML` da lista [V]. Outro módulo que mexa no Item Browser pode causar isso |
| H3 | Erro dentro do `filterGear` ou do `filterOwnedCards` (o observer de cartas roda antes) interrompe o laço | Improvável [I]. O console mostraria o erro |
| H4 | Seletor, `data-item-uuid`, tipo do menu ou classe da janela diferentes na 2.12.1 | **Descartada [V]** (tabela da seção 2) |
| H5 | No passo de equipamento, o que aparece são as **sugestões da classe** (`characterGuide`), dentro da própria janela de criação e não no Item Browser | Só vale se as armas medievais aparecem **fora** do Item Browser. O FIL-01 não cobre essa parte, por escopo |

### 3.3 Comandos de console para o usuário (F12, como GM, depois de Ctrl+F5)

Abra o Item Browser na pasta **Weapons** (pelo botão do diretório de compêndios) e rode:

```js
const app = ui.compendiumBrowser, el = app.element, list = el?.querySelector(".item-list");
const rows = [...(list?.querySelectorAll(".item-container[data-item-uuid]") ?? [])];
const foreign = rows.filter(r => !r.dataset.itemUuid.startsWith("Compendium.edgeheart-cyberpunk."));
const cssRule = [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.selectorText?.includes("eh-hidden-gear")); } catch { return false; } });
const f = await import("/modules/edgeheart-cyberpunk/scripts/edgeheart-browser-filters.js");
console.table({
  version: game.modules.get("edgeheart-cyberpunk").version,
  gearFilter: game.settings.get("edgeheart-cyberpunk", "gearFilter"),
  menuTypes: JSON.stringify(app.selectedMenu?.data?.type),
  rows: rows.length,
  foreign: foreign.length,
  marked: foreign.filter(r => r.classList.contains("eh-hidden-gear")).length,
  visibleForeign: foreign.filter(r => getComputedStyle(r).display !== "none").length,
  cssRule,
  observer: !!list?.ehGearObserver,
  isForeignOk: f.isForeignGear({ uuid: foreign[0]?.dataset.itemUuid, types: app.selectedMenu?.data?.type, enabled: true })
});
```

Leitura (repita na criação de personagem, passo de equipamento, botão de arma primária):

| Resultado | Causa | O que fazer |
|---|---|---|
| `marked = foreign` e `visibleForeign = 0` | Funciona. O bug foi o cache (H1) | Nada no código. FIL-03 não roda (Q2) |
| `marked = foreign`, `visibleForeign > 0`, `cssRule = false` | H1: CSS velho | Ctrl+F5 ou limpar o cache. Se voltar depois de atualizações, FIL-03 variante **A** (Q2) |
| `marked = foreign`, `visibleForeign > 0`, `cssRule = true` | Outra regra de CSS ganha (outro módulo ou tema) | Rode `getComputedStyle(el.querySelector(".eh-hidden-gear")).display` e mande a lista de módulos ativos. FIL-03 variante **A** |
| `marked = 0` e `observer = false` | H2: o observer não está na lista atual | FIL-03 variante **B** |
| `marked = 0`, `observer = true`, `isForeignOk = true` | H3: erro no `filterGear`, ou `enabled` falso | Mande os erros do console e o resultado de `f.hasModuleGear(game.packs.filter(p => p.metadata.packageName === "edgeheart-cyberpunk" && p.documentName === "Item").flatMap(p => [...p.index.values()]), ["weapon"])` |
| As armas medievais aparecem na janela de criação, e não no Item Browser | H5 | Fora do FIL-01. Item novo de backlog (sugestões da classe), via completa |

### 3.4 FIL-03 (condicional): variantes

- **A (independente do CSS):** além da classe, `filterGear` grava
  `row.style.display = "none"` nas linhas de fora e limpa (`""`) nas outras. O sistema não mexe em
  `style.display`, só em `hidden` [V], então um CSS velho ou outra regra não desfazem o filtro. A
  regra do `edgeheart.css` continua.
- **B (observer na janela):** o `MutationObserver` passa para `app.element`, com
  `{ childList: true, subtree: true }`, ligado uma vez por janela (marcador na própria janela) e
  filtrando só quando a mutação atinge uma `.item-list`. Assim ele sobrevive à troca da parte
  `list`. Vale para os dois filtros (gear e owned) **só** se o dado do console mostrar que o
  owned também falha. Senão, só o gear.

A variante escolhida sai da tabela 3.3. O Controlador traz o resultado e o Arquiteto emenda esta
seção antes do ticket.

## 4. Quebras e migração

Nenhuma. O BLD-02 só muda o gerador: a Corruption Spike volta a sair igual à dos compêndios
publicados (gerados na 2.10.8), com `Dano (Esperança)` d6 e `Dano (Medo)` d10 sem bônus, e o mesmo
`_id` (`cardId`). Os compêndios publicados não mudam com este ticket (`Rebuild: não`). O FIL-03 só
muda o que se esconde na tela.

## 5. Perguntas técnicas para o usuário

- **Q1 — Patch de carta que falha no gerador:** avisar no console e seguir com a cópia oficial sem
  o ajuste (proposto, porque parar deixa os compêndios vazios), ou parar o build?
- **Q2 — FIL-03:** depende do console (3.3). Se der H1 (cache), proponho **não** fazer ticket e só
  orientar o Ctrl+F5 depois de atualizar o módulo (nota no `CHANGELOG.md` da próxima versão). Quer
  mesmo assim a variante A, para o filtro não depender do CSS?
- **Q3 — Ferramenta de conferência dos clones (BLD-03, opcional):** o script usado nesta
  investigação (roda `cloneOfficialCard` e cada `patch` contra os `src/packs` de um clone local do
  sistema e lista nomes que não casam) entra em `tools/`, para a conferência de cada versão nova
  do sistema (ADR 0007, item 5)? Fica fora do `npm run verify`, porque o sistema não está no repo.
- **Q4 — B-011 (rebuild na 2.12.1):** depende do BLD-02. Confirma que o rebuild só roda depois do
  BLD-02 na `main`? As etapas de cyberware em diante nunca rodaram numa 2.12. O BLD-01 avisa onde
  parar, mas pode aparecer outra quebra de schema [I].

### 5.1 Decisões do gate (2026-11-02)

| Pergunta | Resposta do usuário | Efeito |
|---|---|---|
| Q1 | Avisar no console e seguir com a cópia oficial sem o ajuste | BLD-02 segue a proposta |
| Q2 | Console da 3.3: `rows = 0`, `observer = false`, `cssRule = false`, `menuTypes = ["weapon"]`, `isForeignOk = true` | Não é só cache: o seletor não acha as linhas do Item Browser 2.12.1. FIL-03 entra (variante B ou nova), depois do HTML real das linhas |
| Q3 | Sim, BLD-03 entra no lote 03 | Ticket aprovado |
| Q4 | Sim (ordem do fluxo) | B-011 só depois do BLD-02 na `main` |

## 6. Tickets

Ordem: BLD-02 ∥ (FIL-03 depois do console). BLD-03 só se Q3 = sim, depois do BLD-02.

### BLD-02: fix(gerador): Corruption Spike com as ações da 2.10.12+ e patch de carta tolerante
- Requisitos: o `buildPacks()` passa da etapa das Competências na 2.11+/2.12 (bug A, B-013).
- Escopo: `scripts/main.js` (`actionNames` da Corruption Spike; `cloneCompetencyCard` exportada,
  com o bloco do clone tirado do `map` de `importDomainCards`; `export` em `COMPETENCIES`),
  `tests/domain-card-clone.test.mjs` (novo).
- Testes red (nível 2, ADR 0004), com uma Blighting Strike falsa no formato 2.12
  (`Spellcast Roll`, `Damage (With Hope)` d6+1, `Damage (With Fear)` d10+1, efeito
  `Blightning Strike`):
  1. `cloneCompetencyCard(corruptionSpike, [blighting])` não lança e devolve ações
     `Rolagem de Interface`, `Dano (Esperança)` e `Dano (Medo)` com `bonus = null`. Hoje falha: a
     função não existe, e o código atual lança `reading 'damage'`;
  2. uma carta com `patch` que lança devolve a cópia oficial e chama `console.warn` uma vez com o
     nome da carta;
  3. `actionNames` com chave que não existe na oficial chama `console.warn` com a chave;
  4. carta sem `clone` volta igual (sem regressão).
- Critério de pronto: `npm run verify` verde. **N3** (Foundry v14 em inglês, Daggerheart 2.12.1,
  num mundo de teste): `game.modules.get("edgeheart-cyberpunk").api.buildPacks()` passa da etapa
  6/11 (Competências). No console, nenhum aviso de patch ou de ação não encontrada. No compêndio de
  Competências, a Corruption Spike tem `Dano (Esperança)` 1d6 e `Dano (Medo)` 1d10 sem bônus e o
  efeito `Corrompido`. Depois do N3, restaure `packs/` e `babele/pt-BR/` (`git checkout -- packs
  babele`), porque o rebuild de verdade é o B-011. Se uma etapa seguinte parar, anote a etapa e o
  erro do BLD-01 para a Spec do B-011.
- Depende de: nada (ADR 0007).
- Rebuild: não (a saída na 2.10.8 é a mesma; libera o B-011).
- Tamanho estimado: ~120 linhas (~30 no `main.js`, ~90 no teste), 2 arquivos.
- Paralelo com: FIL-03 (sem arquivo em comum).

### FIL-03 (condicional): fix(filtros): equipamento de fora some mesmo com <causa do console>
- Requisitos: com `gearFilter = true` e equipamento do Edgeheart nos compêndios, nenhuma arma ou
  armadura de fora aparece no Item Browser, nem aberto pela criação (bug B, B-014).
- **Só abre depois do console (3.3) e da emenda da seção 3.4 com a variante.**
- Escopo: `scripts/edgeheart-browser-filters.js`, `tests/gear-filter.test.mjs`.
- Testes red (nível 2):
  - variante A: `filterGear` sobre uma lista falsa (stub de `element.querySelector` com linhas de
    `Compendium.daggerheart.weapons.Item.x` e `Compendium.edgeheart-cyberpunk.weapons.Item.y`) deixa
    `style.display = "none"` só na de fora e limpa ao desligar a setting. Hoje falha: só põe a classe.
    Para isso, `filterGear` passa a ser exportada;
  - variante B: o observer ligado em `app.element` refiltra quando a `.item-list` é **trocada**
    (nova `.item-list` sem novo `renderItemBrowser`). Hoje falha: o observer fica na lista velha.
- Critério de pronto: `npm run verify` verde. N3: roteiro F1-F5 da `organizacao-e-filtros` mais o
  comando da seção 3.3 com `visibleForeign = 0`, pelo diretório de compêndios **e** pela criação
  de personagem (passo de equipamento, arma primária e armadura).
- Depende de: resultado do console e emenda da seção 3.4.
- Rebuild: não.
- Tamanho estimado: A ~40 linhas, B ~60 linhas; 2 arquivos.
- Paralelo com: BLD-02.

### BLD-03 (opcional, Q3): chore(tools): conferência dos clones contra um clone local do sistema
- Escopo: `tools/check-official-clones.mjs` (novo). Recebe o caminho do clone do sistema; carrega
  `scripts/main.js` com `tests/helpers/foundry-stub.mjs`; para cada carta, consumível e feature de
  adversário com `clone`, confere se a oficial existe e se as chaves de `actionNames`/`effectNames`
  casam; roda cada `patch` e lista as falhas. Sai com código ≠ 0 se achar algo.
- Testes red: nível 1 (a ferramenta roda no `tools/` atual sem erro de sintaxe). Validação: contra
  a 2.12.1 **antes** do BLD-02, aponta a Corruption Spike; depois, nada.
- Critério de pronto: a ferramenta e uma linha em `docs/mapa-do-codigo.md` (Ferramentas). Fora do
  `npm run verify`.
- Depende de: BLD-02 (precisa do `export` de `COMPETENCIES`).
- Rebuild: não.
- Tamanho estimado: ~70 linhas, 1 arquivo (+1 linha de doc).
- Paralelo com: FIL-03.

## 7. Exceções
| Ticket | Linhas | Arquivos | Motivo | Data |
|---|---|---|---|---|
| — | — | — | nenhuma | 2026-11-02 |
