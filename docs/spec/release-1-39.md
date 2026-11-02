# Spec: release-1-39
PRD: nenhum (via rápida, B-008 e B-009) · ADRs: 0003, 0004, 0005, 0006 · Status: Aprovada (decisões
do usuário em 2026-11-02, gate feito; emenda D5 no REL-01, mesma data)
Sistema conferido: Daggerheart 2.12.1 (mesma auditoria de `compat-2-12`) · Foundry 14

## Resumo

Lote 02, que fecha a versão **1.39.0** (lote 01 + lote 02). Origem: a investigação INV-01 (2026-11-02),
que viu que o `buildPacks()` **apaga os 14 compêndios antes de recriar** (`clearPacks`) e não avisa
nada entre "building" e "Done". Se o gerador para no meio, os compêndios ficam vazios ou pela metade,
e ninguém sabe onde parou. Com os compêndios de equipamento vazios, o filtro do FIL-01 esconde todo
o equipamento de fora, e o Item Browser fica sem nenhuma arma.

- **BLD-01:** o gerador mostra o progresso (barra de progresso do Foundry e uma linha no console por
  etapa) e, se uma etapa falha, uma mensagem de erro que fica na tela e diz em que compêndio parou.
  Mesma ordem, mesmo conteúdo.
- **FIL-02:** o filtro de equipamento só esconde itens de fora quando o Edgeheart tem algum item
  daquele tipo nos compêndios dele. Com os compêndios vazios, nada some.
- **REL-01 (sem código):** o commit de versão `v1.39.0` atualiza o `module.json` e o
  `CHANGELOG.md`. **Sem rebuild** (emenda D5): os `packs/` e o `babele/pt-BR/` ficam como estão na
  `main`; o rebuild vai para a versão seguinte (B-011).

### Decisões do usuário (2026-11-02)
- D1: via rápida, sem PRD. Os dois tickets foram decididos direto pelo usuário (gate feito).
- D2: BLD-01 mostra o progresso de cada compêndio e uma mensagem clara de falha
  (`ui.notifications` e console, texto em `lang/en.json` e `lang/pt-BR.json` pelo `t()`), dizendo
  em que compêndio parou. A ordem das etapas e o conteúdo gerado não mudam. Nada de refatorar fora
  do `buildPacks`.
- D3: FIL-02 é uma salvaguarda do FIL-01. Com os compêndios de equipamento do Edgeheart vazios
  (por exemplo, depois de um build interrompido), o filtro não esconde nada.
- D4: o lote fecha com o rebuild do usuário e o commit de versão `v1.39.0` (MINOR: o lote 01 trouxe
  coisas novas, ADR 0006). O `CHANGELOG.md` cobre os lotes 01 e 02. *(Rebuild substituído pela D5.)*

#### Emenda (2026-11-02, decisão do usuário)
- D5: a `v1.39.0` sai **sem rebuild**. Os compêndios ficam os da `main` (gerados no Daggerheart
  2.10.8); o sistema migra os itens ao carregar (`weaponFeatures`/`armorFeatures` → `itemFeatures`,
  `compat-2-12` seção 5.1, item 3 [I]). O rebuild, o commit `chore(packs)` e o custo `[n]` do ORG-01
  nos compêndios vão para uma versão seguinte (backlog B-011). O ORG-01 e o C212-03 já estão no
  gerador (`scripts/main.js`) e aparecem no próximo rebuild. O usuário confere atualizando o módulo
  pelo Foundry depois da Release.

## 1. Contexto do código

Linhas da `main` em `7b3abb4`.

| Onde | O que importa |
|---|---|
| `scripts/main.js:12-27` `PACKS` | 14 compêndios: chave → `{ name, label (pt), type }`. |
| `scripts/main.js:30-36` `getOrCreatePack` | Lança `Error` se o compêndio não existe; destrava. |
| `scripts/main.js:4904-4912` `clearPacks` | Apaga documentos e pastas dos 14 compêndios, **antes** de qualquer importação. |
| `scripts/main.js:4954-4992` `buildPacks` | Só GM, só em inglês com Babele. `info(Build.Started)`; `try { clearPacks; importWeaponsAndArmor (→ equipment); importLootAndConsumables; importClassesAndSubclasses(equipment); importLifePathsAndAffiliations; importDomainCards; importCyberware; importAdversaries; importEnvironments; importJournals } finally { Hooks.off(stampHook) }`; depois `localizePacks`, aviso `Build.Unknown`, trava os 14 e `info(Build.Done)`. Se algo lança, o erro sobe sem mensagem do módulo e os compêndios ficam destravados e incompletos. |
| `scripts/main.js` (importações) | Compêndios de cada etapa (por `getOrCreatePack`): armas e armaduras (l. 502-503); consumíveis, loot e tabelas (l. 731-751); classes e subclasses (l. 2931-2932); trajetórias e afiliações (l. 1968-1969); cartas (l. 2831); cyberware (l. 4729); adversários (l. 4329); ambientes (l. 4355); diários (l. 4880). |
| `scripts/main.js:5028` | `mod.api = { buildPacks, repairPackFolders }`. |
| `lang/*.json:308-314` `EDGEHEART.Build` | `OnlyGM`, `NeedEnglish`, `Started`, `Unknown`, `Done`. |
| `scripts/edgeheart-browser-filters.js` `isForeignGear`, `filterGear`, setting `gearFilter`, hook `renderItemBrowser` | FIL-01. `filterGear` lê a setting e põe `eh-hidden-gear` nas linhas de outra fonte. Não olha se o Edgeheart tem itens. |
| `scripts/edgeheart-localize.js:351,360` | O módulo já usa `pack.documentName`. |
| `scripts/main.js:4922` `repairPackFolders` | O módulo já usa `pack.metadata.packageName`. |
| `tests/helpers/foundry-stub.mjs` | `ui.notifications` só com `info/warn/error`; `game.packs` é um `Map` vazio; `t()` devolve a chave. |
| `tests/cyberware-cost-name.test.mjs` | Já importa `scripts/main.js` com o stub: dá para testar exportações do `main.js` no nível 2. |

## 2. API do sistema e do Foundry usada

| Uso | Conferido em | Veredito |
|---|---|---|
| `ui.notifications.info(msg, { progress: true })` devolve a notificação; `ui.notifications.update(notification, { pct, message })` atualiza barra e texto | https://foundryvtt.com/api/v14/classes/foundry.applications.ui.Notifications.html (`notify`, `update`, exemplo com `progress`) | [V] |
| `ui.notifications.error(msg, { permanent: true })` (fica na tela até fechar) | mesma página (exemplo com `permanent`) | [V] uso; [I] comportamento (o nome diz), conferido no roteiro B3 |
| `ui.notifications.remove(notification)` | mesma página | [V] |
| `CompendiumCollection#index`, `#indexed`, `#getIndex({ fields })` | https://foundryvtt.com/api/v14/classes/foundry.documents.collections.CompendiumCollection.html | [V] |
| O índice já vem carregado no `ready` | não documentado | [I]. FIL-02 não depende disso: se `indexed` for falso, pede `getIndex()` (seção 3.2) |
| Entrada do índice de Item com `type` | não documentado na página | [I]. FIL-02 trata entrada sem `type` como "algum item" (seção 3.2) |
| `pack.title` (rótulo do compêndio) | Foundry v14 `CompendiumCollection#title` | [I]. Com fallback para `PACKS[key].label` |
| `pack.documentName`, `pack.metadata.packageName` | já usados no módulo (seção 1) | [V] no módulo |
| Item Browser: `selectedMenu.data.type`, linhas `.item-container[data-item-uuid]` | `docs/spec/organizacao-e-filtros.md`, seção 2 | [V] (2.12.1) |

Nada do sistema é importado por caminho, sobrescrito ou copiado (ADR 0005). Nenhum hook novo do
sistema.

## 3. Design

### 3.1 BLD-01: progresso e falha do gerador

**Lista de etapas.** O corpo do `try` do `buildPacks` vira uma lista exportada `BUILD_STEPS`, na
**mesma ordem** de hoje. Cada etapa é `{ packs: [chaves de PACKS] | phase: "Clear" | "Localize", run(ctx) }`:

| # | Etapa | `packs` / `phase` | `run` (chamadas de hoje, sem mudança) |
|---|---|---|---|
| 1 | Limpar | `phase: "Clear"` | `clearPacks()` |
| 2 | Armas e armaduras | `weapons`, `armors` | `ctx.equipment = await importWeaponsAndArmor()` |
| 3 | Consumíveis, loot, tabelas | `consumables`, `loot`, `rolltables` | `importLootAndConsumables()` |
| 4 | Classes e subclasses | `classes`, `subclasses` | `importClassesAndSubclasses(ctx.equipment)` |
| 5 | Trajetórias e afiliações | `ancestries`, `communities` | `importLifePathsAndAffiliations()` |
| 6 | Cartas | `domains` | `importDomainCards()` |
| 7 | Cyberware | `cyberware` | `importCyberware()` |
| 8 | Adversários | `adversaries` | `importAdversaries()` |
| 9 | Ambientes | `environments` | `importEnvironments()` |
| 10 | Diários | `journals` | `importJournals()` |
| 11 | Localização | `phase: "Localize"` | `Hooks.off("preCreateItem", ctx.stampHook)` e o `localizePacks(...)` de hoje (mesmos argumentos); guarda `ctx.unknown` |

- O `Hooks.off` continua também no `finally` (tirar duas vezes não faz mal). Assim o hook sai antes
  da localização, como hoje, e sai mesmo se uma etapa falhar.
- O que vem depois da lista não muda: aviso `Build.Unknown` (com `ctx.unknown`), travar os 14,
  `info(Build.Done)` e o `console.log` final.
- As funções `import*`, `clearPacks`, `getOrCreatePack` e o `edgeheart-localize.js` **não são
  tocados**.

**Executor puro.** `export async function runBuildSteps(steps, ctx, report)` roda as etapas em
ordem. Antes de cada uma, chama `report.step(step, index, total)`. Se uma lança, chama
`report.fail(step, index, total, error)` e **relança o mesmo erro** (as etapas seguintes não rodam).
Não fala com o Foundry: o `buildPacks` passa o `report`.

**O `report` do `buildPacks`:**
- Início: `const bar = ui.notifications.info(t("Build.Started"), { progress: true })` (troca o
  `info(Build.Started)` de hoje).
- `step`: `ui.notifications.update(bar, { pct: index / total, message: t("Build.Step", { step: index + 1, total, packs: label }) })`
  e `console.log("Edgeheart | Build <n>/<total>: <label>")`.
- `fail`: `ui.notifications.remove(bar)`,
  `ui.notifications.error(t("Build.Failed", { step: index + 1, total, packs: label }), { permanent: true })`
  e `console.error("Edgeheart | Build parou na etapa <n>/<total> (<label>).", error)`.
- Fim sem erro: `update(bar, { pct: 1 })` antes do `Build.Done`.
- `label`: `phase` → `t("Build.Phase.<phase>")`; `packs` → os títulos dos compêndios separados por
  vírgula (`game.packs.get(\`${PACK_SCOPE}.${PACKS[k].name}\`)?.title ?? PACKS[k].label`). Função
  exportada `stepLabel(step)`.

**Depois da falha** o erro sobe do `buildPacks` (como hoje) e os compêndios ficam como estão
(destravados, incompletos). A mensagem diz para rodar o gerador de novo. Não se tenta desfazer nem
travar: refazer tudo é o caminho certo, e travar esconderia um compêndio pela metade.

**Textos novos (`EDGEHEART.Build.*`, nas duas línguas):**

| Chave | en | pt-BR |
|---|---|---|
| `Step` | `Edgeheart: step {step}/{total}, {packs}...` | `Edgeheart: etapa {step}/{total}, {packs}...` |
| `Failed` | `Edgeheart: the build stopped at step {step}/{total} ({packs}). The compendiums are incomplete. See the console (F12) and run buildPacks() again.` | `Edgeheart: o gerador parou na etapa {step}/{total} ({packs}). Os compêndios estão incompletos. Veja o console (F12) e rode o buildPacks() de novo.` |
| `Phase.Clear` | `clearing the compendiums` | `limpando os compêndios` |
| `Phase.Localize` | `English base and pt-BR translation` | `base em inglês e tradução pt-BR` |

O console fica em português, como o resto dos logs do módulo (convenção atual).

### 3.2 FIL-02: o filtro não esconde nada sem equipamento do Edgeheart

- **Função pura nova** em `scripts/edgeheart-browser-filters.js`:
  `export function hasModuleGear(entries, types)` → `true` se alguma entrada tem `type` em
  `types ∩ GEAR_TYPES`, **ou** não tem `type` (índice sem o campo: conta como "há item", para não
  desligar o filtro à toa). Lista vazia → `false`.
- **Entradas:** os índices dos compêndios de Item do módulo:
  `game.packs.filter(p => p.metadata.packageName === MODULE_ID && p.documentName === "Item")`,
  todas as entradas de `p.index`. Inclui o cyberware (weaponware) e qualquer outro compêndio de
  Item do módulo.
- **Índice ainda não carregado:** se algum desses compêndios tem `indexed === false`, o filtro pede
  `p.getIndex()` uma vez só (promessa guardada por compêndio) e, quando chega, chama `filterGear`
  de novo em `ui.compendiumBrowser`. Enquanto não chega, conta como sem itens: não esconde nada.
- **Em `filterGear`:** `enabled = setting && hasModuleGear(entradas, types)`. O `isForeignGear`,
  a setting, os hooks e o observer não mudam.
- **Por tipo:** com um build parado depois das armas e antes do loot, a lista de Armas continua
  filtrada, e a de Loot mostra tudo. No menu com os quatro tipos, basta haver um item do Edgeheart
  de qualquer deles.
- **Sem texto novo e sem aviso:** o filtro só deixa de esconder. Quem avisa do build quebrado é o
  BLD-01.
- **Depois de um rebuild na mesma sessão** o índice do compêndio acompanha a criação dos documentos
  [I], e o próximo render volta a filtrar. Conferido no roteiro F7.

### Dados salvos
Nenhum. Sem flag, setting ou id novo.

## 4. Quebras e migração
Nenhuma. O BLD-01 não muda o que o gerador grava, e o FIL-02 só deixa de esconder quando o módulo
não tem itens. Sem rebuild (D5), a `v1.39.0` leva os compêndios da `main` (gerados na 2.10.8); o
sistema migra as features ao carregar, como já acontece na `main` hoje.

## 5. Perguntas técnicas para o usuário
Nenhuma nova. As decisões estão no Resumo (D1-D4). O número `v1.39.0` foi proposto pelo
Controlador. Pela ADR 0006, o usuário confirma o número no commit de versão (REL-01).

## 6. Tickets

Ordem: BLD-01 ∥ FIL-02 (sem arquivo em comum), depois REL-01. O REL-01 não tem rebuild (D5); o
primeiro rebuild com o gerador do BLD-01 é o do B-011.

### BLD-01: fix(gerador): buildPacks mostra o progresso e diz em que compêndio parou
- Requisitos: D2
- Escopo: `scripts/main.js` (só o `buildPacks` e, logo acima dele, `BUILD_STEPS`, `runBuildSteps`
  e `stepLabel` exportados), `lang/en.json`, `lang/pt-BR.json` (4 chaves em `EDGEHEART.Build`),
  `tests/build-progress.test.mjs` (novo). Se o teste precisar de `ui.notifications.update/remove`,
  o próprio teste sobrescreve, sem mexer no stub.
- Testes red (nível 2):
  (1) `BUILD_STEPS` tem 11 etapas. A ordem de `phase`/`packs` é a da tabela 3.1, e toda chave de
  `PACKS` aparece numa etapa exatamente uma vez (nenhum compêndio fica sem etapa ou repetido).
  (2) `runBuildSteps` com 4 etapas falsas, a 3ª lançando `new Error("x")`: `report.step` é chamado
  com índices 0, 1, 2 e `total` 4; `report.fail` uma vez, com a 3ª etapa, índice 2 e o mesmo erro;
  a 4ª não roda; a promessa rejeita com o mesmo erro.
  (3) Sem erro: as 4 rodam em ordem, com o mesmo `ctx` (a 1ª grava `ctx.a`, a 2ª lê), e
  `report.fail` não é chamado.
  (4) `stepLabel`: `{ phase: "Clear" }` → `"EDGEHEART.Build.Phase.Clear"` (o stub devolve a chave);
  `{ packs: ["weapons", "armors"] }`, com `game.packs` vazio → `"Edgeheart: Armas, Edgeheart: Armaduras"`
  (fallback do `label`); com um compêndio falso com `title` no `game.packs` → o `title`.
  **Falha hoje:** `BUILD_STEPS`, `runBuildSteps` e `stepLabel` não existem.
  Nível 1: o `npm run check` reprova chave usada e ausente ou sem par `en`/`pt-BR`.
  Nível 3: roteiro B1-B4.
- Critério de pronto: testes verdes; `npm run verify` verde; o `git diff` do `main.js` fica só no
  `buildPacks` e nas três exportações novas (nenhuma função `import*` muda); roteiro B1-B4 no PR.
- Depende de: nada.
- Rebuild: não (o conteúdo gerado é o mesmo; o rebuild do B-011 confere isso).
- Tamanho estimado: ~170 linhas (código ~60, lang ~12, teste ~95), 4 arquivos.
- Paralelo com: FIL-02.

### FIL-02: fix(filtros): filtro de equipamento não esconde nada se o Edgeheart não tem equipamento
- Requisitos: D3
- Escopo: `scripts/edgeheart-browser-filters.js` (`hasModuleGear` exportada, leitura dos índices e
  o pedido de `getIndex`, uma linha em `filterGear`), `tests/gear-filter.test.mjs` (casos novos no
  arquivo do FIL-01; os existentes não mudam).
- Testes red (nível 2), `hasModuleGear`:
  (1) `[]` com `["weapon"]` → false (compêndios vazios).
  (2) `[{ type: "weapon" }]` com `["weapon"]` → true; com `["armor","weapon","consumable","loot"]` → true.
  (3) `[{ type: "weapon" }]` com `["loot"]` → false (build parado antes do loot).
  (4) `[{ type: "domainCard" }, { type: "class" }]` com os quatro tipos → false (só equipamento conta).
  (5) `[{ name: "x" }]` (sem `type`) com `["weapon"]` → true.
  (6) types `["domainCard"]` com `[{ type: "weapon" }]` → false (lista que não é de equipamento).
  **Falha hoje:** `hasModuleGear` não existe. Os testes do FIL-01 continuam verdes sem mudança.
  Nível 3: roteiro F6-F7, e F2 do `organizacao-e-filtros` de novo (regressão).
- Critério de pronto: testes verdes; `npm run verify` verde; com os compêndios cheios, o F2 do
  FIL-01 continua igual; roteiro F6-F7 no PR.
- Depende de: FIL-01 (já na `main`).
- Rebuild: não.
- Tamanho estimado: ~70 linhas (código ~25, teste ~45), 2 arquivos.
- Paralelo com: BLD-01.

### REL-01: v1.39.0 sem rebuild (sem código, sem Fábrica)
Não vira issue de código. É o fecho do lote, feito pelo DevOps depois de BLD-01 e FIL-02 aprovados.
Emendado em 2026-11-02 (D5): **sem rebuild e sem `chore(packs)`**. Os `packs/**` e o
`babele/pt-BR/**` ficam idênticos aos da `main` em `7b3abb4`.
- **Antes do commit (DevOps):** `git diff --stat main -- packs babele` vazio. Se os roteiros B1-B3 e
  F6-F7 rodaram no worktree, os gerados mudaram: com o mundo fechado,
  `git checkout -- packs babele` e conferir de novo. Nada de `packs/**` ou `babele/pt-BR/**` entra
  no lote.
- **Conferência (usuário):** antes do PR, os roteiros deste lote (B1-B4, F6-F7, com a restauração
  acima no fim) e os do lote 01 que não dependem de rebuild (compat-2-12 passos 1-13, L1-L4,
  F1-F5). O O1-O4 (custo `[n]` no nome) vai para o B-011. Depois da Release, o usuário atualiza o
  módulo pelo Foundry e confere que instala e carrega.
- **Commit de versão (DevOps, ADR 0006):** `v1.39.0: filtros do Item Browser, Level Up sem cartas
  repetidas e Daggerheart 2.12`, só com `module.json` (`version: "1.39.0"`, nada mais: `manifest`,
  `download` e `compatibility` ficam como estão) e uma seção nova no topo do `CHANGELOG.md`, no
  estilo das entradas atuais. Rascunho (o DevOps ajusta ao que de fato entrou):

  ```markdown
  ## v1.39.0
  - **Compatível com o Daggerheart 2.12**: a Rolagem de Humanidade volta a aparecer ao rolar com Medo com todo o Estresse marcado. O módulo agora pede o Daggerheart 2.11.0 ou mais novo e foi conferido na 2.12.1.
  - **Level Up sem cartas repetidas**: ao escolher carta no Level Up, o Item Browser esconde as cartas que o personagem já tem ou já escolheu nesse Level Up.
  - **Só equipamento do Edgeheart no Item Browser**: armas, armaduras, consumíveis e loot de outras fontes ficam escondidos, inclusive no passo de equipamento da criação de personagem. Dá para desligar nas configurações do módulo ("Ocultar equipamento que não é do Edgeheart"). Se os compêndios do módulo estiverem vazios, nada é escondido.
  - **Gerador dos compêndios** (ferramenta de desenvolvimento): mostra o progresso de cada compêndio e, se parar no meio, avisa em que compêndio parou. O gerador já ordena os cyberwares por custo, com o custo na frente do nome, e grava as features oficiais de armas e armaduras no formato novo do sistema; os compêndios desta versão ainda não foram refeitos, e isso aparece no próximo rebuild.
  ```
  O rascunho não anuncia o custo `[n]` no nome dos cyberwares nem compêndios regenerados (D5). O
  número é proposta: o usuário confirma antes do commit (ADR 0006, item 2).
- **PR do lote:** `/lote 02` contra a `main`, com confirmação do usuário. Tag e Release continuam
  com o usuário ou o dono (ADR 0006, item 3).
- Rebuild: **não** (D5; vai para o B-011).
- Tamanho: `module.json` (1 linha) e `CHANGELOG.md` (~6 linhas).
- Paralelo com: nenhum (vem por último).

### Roteiros do nível 3

Foundry v14, Daggerheart 2.12.1, um GM. Para B1-B4, Foundry em inglês e módulo do worktree do lote.

**BLD:**
- B1. Rodar `buildPacks()`: aparece uma barra de progresso, e o texto vai de
  `step 1/11, clearing the compendiums...` até `step 11/11, English base and pt-BR translation...`.
  No fim aparece `Edgeheart: compendiums built.` No console há 11 linhas `Edgeheart | Build n/11: …`,
  na ordem da tabela 3.1.
- B2. Depois do B1, `git status` no worktree: só `packs/**` e `babele/pt-BR/**` mudaram. No diff
  do `babele/pt-BR`, nenhuma entrada some ou muda além das esperadas do lote 01 (nomes de cyberware
  com `[n]`, ORG-01). O BLD-01 não muda o conteúdo. Esses gerados **não** entram no lote (D5):
  restaurar no fim, como abaixo.
- B3. Forçar uma falha nas armas. No console, antes de rodar:
  `const orig = Item.createDocuments; Item.createDocuments = function (d, o) { if (o?.pack === "edgeheart-cyberpunk.edgeheart-weapons") throw new Error("teste"); return orig.call(this, d, o); };`
  (vale só nesta sessão e some ao recarregar). Rodar `buildPacks()`: aparece um erro que **fica na
  tela**, `…stopped at step 2/11 (Edgeheart: Weapons, Edgeheart: Armor)…`, e o console mostra o
  erro "teste" com a pilha. A barra some. **Hoje:** só o aviso "building" e um erro solto no console.
- B4. Foundry em pt-BR com Babele: o `buildPacks()` recusa (`NeedEnglish`), como hoje. Em inglês,
  como jogador, aparece o `OnlyGM`, como hoje.

**FIL-02.** Os compêndios do módulo ficam na pasta do módulo (`packs/` do worktree), não no mundo.
Por isso o F6 esvazia os `packs/` do worktree, e o F7 os refaz. Os dois rodam antes do commit
`v1.39.0`, e no fim os gerados voltam ao da `main` (D5).
- F6. Logo depois do B3 (todos os compêndios vazios, porque a limpeza já rodou), sem recarregar e
  com o filtro ligado, abrir Item Browser › Equipamento › Armas: aparecem as armas do Daggerheart
  base (nada some). Recarregar o mundo e abrir de novo: igual. **Hoje:** a lista fica vazia.
- F7. Recarregar (desfaz o patch do B3) e rodar `buildPacks()` até o fim. Na mesma sessão, reabrir
  Item Browser › Armas: aparecem só as armas do Edgeheart, como no F2 do FIL-01. Recarregar o
  mundo: igual.

Se o F6 for o último passo do dia, os `packs/` do worktree ficam vazios. Depois de B1-B3 e F6-F7,
sempre voltar ao estado do commit: `git checkout -- packs babele` (com o mundo fechado). O rebuild
que fica é o do B-011.

## 7. Exceções
| Ticket | Linhas | Arquivos | Motivo | Data |
|---|---|---|---|---|
