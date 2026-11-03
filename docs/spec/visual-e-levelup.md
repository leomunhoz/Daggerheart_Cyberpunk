# Spec: visual-e-levelup
PRD: docs/prd/visual-e-levelup.md · ADRs: 0003, 0004, 0005, **0008 (Proposta)**, **0009 (Proposta)** · Status: **Aprovada no gate (2026-11-02)**; ADRs 0008 e 0009
aguardam a confirmação do usuário
Sistema conferido: Daggerheart **2.12.3** (clone `../daggerheart-src`, branch `v14`, commit `746f26f`) ·
Foundry **14.369** (código do cliente instalado, `resources/app/client/**`)

Backlog: B-016 (Level Up do PDF), B-017 (Level Up no tema), B-018 (outros menus), B-019 (barra de Medo).
Referências: `docs/referencias/design-atual.md` (inventário, citado como **[inv §n]**), artefato visual aprovado
https://claude.ai/artifact/QYoWtertbZFkB7KR6vDWKN (resumo no PRD).
**[V]** = conferido no código; **[I]** = inferência.

**Base do design:** as respostas do gate (seção 0). A Ficha Edgeheart de personagem **não muda** (CA21): nenhum
ticket toca `styles/edgeheart-sheet-theme.css`, `styles/edgeheart.css` nem `templates/chrome-tab.hbs`; no
`SheetFx`, só o filtro de uma linha do `refreshAll` que tira a Ficha da Crew (achado A1, THM-02), que não muda
nada na ficha de personagem.

## 0. Decisões do gate (usuário, 2026-11-02)

| Q | Resposta | Efeito nesta Spec |
|---|---|---|
| Q1 | **(a)** usar a setting `sheetFx` atual para o tema fora da ficha; **sem** setting `uiTheme` | THM-01 não registra setting nem chaves de idioma; o `<body>` segue a `sheetFx` pelo hook `clientSettingChanged`; o registro da `sheetFx` não muda. A1 vira parte do THM-02 |
| Q2 | **(a)** manter o +1 por nível dos Limiares e avisar no painel | LUP-01 como estava (linha "automático") |
| Q3 | **(b)** só um lembrete | LUP-02 vira texto no `aside` com botão que abre a aba Chrome; sem `closeDhCharacterLevelUp`, sem `WeakMap`, sem linha no resumo; o bloco `SYS://03` do LUP-03 estiliza o lembrete |
| Q4 | barra de Medo com setting de **mundo** (`fearTheme`, `scope: "world"`), só CSS + hook `renderFearTracker` | FEAR-01 com `scope: "world"`; ADR 0009 como estava |
| Q5 | **(a)** painel com atalho ao compêndio | LUP-01 como estava |
| Q6 | **(b)** empacotar as fontes | THM-04 fica |
| Q7 | **(a)** caveira-vírus nova do Codex | ART-01 fica |
| Q8 | **1240px** no Level Up Edgeheart | LUP-01 chama `app.setPosition({ width: 1240 })` na primeira marcação (obrigatório) |

---

## 1. Contexto do código

| O quê | Onde | Papel nesta Spec |
|---|---|---|
| Tema da ficha (tokens, chanfro, cantoneira `SYS://NN`, scanline) | `styles/edgeheart-sheet-theme.css:4-50, 117-149, 70-76` | referência visual; tokens copiados (ADR 0008 item 4); **não muda** |
| `SheetFx.apply` / `refreshAll` | `scripts/edgeheart-character.js:565-577`, `:642-646` | `apply` não muda; `refreshAll` ganha o filtro da Crew (A1, THM-02) |
| Setting `sheetFx` (cliente, `full`/`static`/`off`) | `edgeheart-character.js:1202-1208`; textos em `lang/*.json` `EDGEHEART.Settings.SheetFx` | governa também o tema fora da ficha (Q1 a); **registro não muda**; só o texto do `Hint` (THM-01) |
| Setting `edgeheartLevelup` (mundo) e `EdgeheartLevelup` | `edgeheart-character.js:1196-1201`, `:389-440` | decide se o Level Up é do Edgeheart (R1, R6); `LEVELUP_REMOVED` em `:397` |
| `Humanity.isEdgeheart`, `die`, `isLost`, `summary`, `advance` | `edgeheart-character.js:42-46, 48, 144, 148-187, 211-231` | passo Humanidade (LUP-02) reusa `advance` sem mudar |
| `Humanity` exportado | `edgeheart-character.js:41` (`export const Humanity`) | importado por `scripts/edgeheart-levelup.js` |
| Diálogos `DialogV2` do módulo | `edgeheart-character.js:263` (Buffer), `:452` (escolha de cyberware: atributo, Experiência, Competência, Tactical Mesh), `:939` (Pick), `:1035` (Sincronizar sem Soul Bond), `:1135` (Eidolon inutilizado); `scripts/edgeheart-crew.js:135` (confirmar Movimento), `:198` (Plan B), `:256` (Back Me Up) | recebem `classes` (THM-01) |
| Cards de chat (`div.eh-chat`, `.eh-outcome.eh-ok/.eh-bad`, `.eh-crew-chat`) | `edgeheart-character.js:283-289, 526-528, 1048`; `edgeheart-crew.js:230-238, 529, 585` | só CSS (THM-03) |
| Ficha da Crew (`classes: ["edgeheart-sheet", "edgeheart-crew"]`, classe `EdgeheartCrewSheet`) | `edgeheart-crew.js:378-431`, `templates/crew-tab.hbs` | só CSS (THM-02) |
| Hooks do Level Up já usados (LVL-01) | `scripts/edgeheart-browser-filters.js:79-80` | mesmo padrão; o arquivo **não muda** |
| Abrir o compêndio de cyberware | `edgeheart-character.js:757-761` (`#openCyberware`) | mesmo código no painel do Level Up |
| `tools/check.mjs` (regras 1–7) | `tools/check.mjs:5-14` | ganha regra 8 (tokens) e 9 (`url()` do CSS) |
| Stub do Foundry | `tests/helpers/foundry-stub.mjs` | testes nível 2 das funções puras novas |

**Achados:**
- **A1 — `SheetFx.refreshAll` também pega a Ficha da Crew → entra no THM-02 (reavaliado no gate).** Ele aplica o
  `SheetFx` a toda janela com `edgeheart-sheet` (`:644`), e a Crew tem essa classe (`edgeheart-crew.js:383`).
  Trocar a `sheetFx` com a Crew aberta põe `eh-theme`/`eh-fx`, rodapé `CHAR://NODE`, camada de glitch e o timer
  de rajadas na Crew até ela fechar, e roda `Humanity.summary` num ator `party` [I, pela leitura]. Com a Q1 (a),
  trocar a `sheetFx` é **o mesmo gesto** que liga e desliga o tema da Crew (roteiro C4/C5): o defeito deixa de ser
  um canto raro e aparece em todo teste do THM-02, e o CSS da Crew teria de brigar com as regras
  `.edgeheart-sheet.eh-theme` da ficha. Correção mínima, no THM-02: em `refreshAll` (`:644`), pular janela com
  `edgeheart-crew` (`… contains("edgeheart-sheet") && !app.element.classList.contains("edgeheart-crew")`). Uma
  linha, sem mudar `apply`, `decorate`, o registro da setting nem a ficha de personagem (a ficha não tem
  `edgeheart-crew`, CA21). Fica registrado na ADR 0008 (emenda do gate).
- **A2 — O filtro de opções do Level Up vale para o mundo inteiro.** A setting `LevelTiers` é do mundo
  (`EdgeheartLevelup.apply`), então personagens sem a Ficha Edgeheart também perdem Atributos/PV/etc. quando
  `edgeheartLevelup` está ligado. É o comportamento atual e fica. O CA7 vale para o **visual e os painéis**:
  sem Ficha Edgeheart não há tema nem painel.

## 2. API do sistema e do Foundry usada

### 2.1 Foundry 14.369 (`resources/app/client/applications/api/`)

| API | Conferido em | Uso |
|---|---|---|
| `DialogV2.confirm/input/wait/prompt(config)`; `config.classes` é concatenado com `DEFAULT_OPTIONS.classes = ["dialog"]` | `dialog.mjs:167-169, 346-405`; `application.mjs:440-485` (`#mergeApplicationOptions`: arrays concatenam; `classes` sem repetição) | THM-01 |
| Hook `render<Classe>` em todo render, para a classe e as ancestrais; `close<Classe>` ao fechar | `application.mjs:591-592, 1039-1040, 1674-1715` | LUP-01, LUP-02, FEAR-01 (o `close` não é usado nesta Spec) |
| Hook `clientSettingChanged(key, value, options)`: disparado por `ClientSettings#set` de setting de **cliente**, logo depois do `onChange` registrado; `key` = `"<namespace>.<chave>"` | `client/helpers/client-settings.mjs:130, 327-328` (`#setClient`); `client/hooks.mjs:1448` (hook documentado) | THM-01: o `<body>` segue a `sheetFx` sem mexer no registro dela |
| `ApplicationV2#changeTab(tab, group)` (lança erro se a aba não existe no DOM; exige a janela renderizada) e `tabGroups` | `application.mjs:1612-1636`, `:282` | LUP-02: botão do lembrete abre a aba Chrome (`changeTab("chrome", "primary")`, como `#openChrome`, `edgeheart-character.js:755`) |
| Setting de mundo: `Setting#_onUpdate`/`_onCreate` chamam o `onChange` em **todos** os clientes | `client/documents/setting.mjs:41-51` | FEAR-01: `fearTheme` de mundo redesenha a barra de todos |
| Render parcial troca só o elemento de cada PART (`replaceWith`) ou, com `root: true`, os filhos do elemento da janela; nó fora das PARTS fica | `handlebars-application.mjs:191-218` | painel lateral do Level Up (ADR 0009 item 2) |
| `game.settings.register` (`scope: "world"`, `onChange`) | `docs/referencias/foundry-v14.md` (ClientSettings) | `fearTheme` |
| `ApplicationV2#render`, `#setPosition` (mescla em `#position`) | `application.mjs:600, 657, 1101-1108` | redesenhar `ui.resources`; largura 1240 do Level Up (Q8) |

### 2.2 Daggerheart 2.12.3 (`../daggerheart-src`)

| API / campo | Conferido em | Uso |
|---|---|---|
| `DhCharacterLevelUp` (hook `renderDhCharacterLevelUp`) exportado como `game.system.api.applications.levelup.CharacterLevelup` | `module/applications/levelup/characterLevelup.mjs:5`; `module/applications/levelup/_module.mjs:1` | LUP-01..03 |
| `app.actor` | `levelup.mjs:6-9` | ator do Level Up |
| `app.levelup.startLevel` = `level.current + 1`, `app.levelup.endLevel` = `level.changed` | `module/data/levelup.mjs:7-9, 73-75, 101-103` | nível de destino (LUP-01, LUP-02) |
| `save` chama `await actor.levelUp(...)` e **depois** `this.close()`; "Cancel" é `data-action="close"` | `levelup.mjs:473-488`; `templates/levelup/tabs/footer.hbs` | contexto: o módulo **não grava nada** no Level Up (Q3 b); o avanço de Humanidade é feito depois, na aba Chrome |
| `actor.levelUp` grava `system.levelData.level.current = level.changed` | `module/documents/actor.mjs:679-689` | depois do Level Up, a aba Chrome libera o avanço no nível novo (`Humanity.summary().canAdvance`, `edgeheart-character.js:156`) |
| Tier inativo: `fieldset.tier-container.inactive`; checkboxes fora do nível atual vêm `disabled` | `templates/levelup/tabs/advancements.hbs`; `module/data/levelup.mjs:239, 251` | CA9 já vem do sistema; o CSS só apaga |
| `system.tier` do personagem: nível 1 → 1; senão o Tier cujo `levels.start..end` contém o nível, na setting `LevelTiers` | `module/data/actor/character.mjs:306-312` | mesma regra para o Tier de destino (LUP-01) |
| Limiares: `major = base + level.current`, `severe = base + level.current` (ou `level*2` sem armadura), fixo no `prepareDerivedData`; **sem setting de Homebrew** para desligar | `module/data/actor/character.mjs:716-731` | Q2: a opção (b) não tem caminho pela API pública |
| `FearTracker` (hook `renderFearTracker`), alias `DhFearTracker`, `id: 'resources'`, `window.frame: false`, PART `resources` com `root: true` | `module/applications/ui/fearTracker.mjs:13, 27-53`; `module/applications/ui/_module.mjs:6`; `daggerheart.mjs:115, 374-375` | FEAR-01, FEAR-02 |
| `ui.resources.maxFear` = `game.system.settings.homebrew.maxFear`; `game.system.settings.appearance.displayFear` (`token`/`bar`/`hide`) | `fearTracker.mjs:56-66, 74, 95-100`; `module/data/settings/Homebrew.mjs:63-69`; `Appearance.mjs:9` | FEAR-02 (número de segmentos) |

### 2.3 Seletores do sistema que o CSS usa (conferir a cada versão menor, ADR 0009 item 6)

- Level Up (`templates/levelup/tabs/*.hbs`): `.application.levelup`, `.window-content`, `section.tab-navigation`,
  `.levelup-tab-container > a.advancements|a.selections`, `section.tab.advancements|selections|summary`,
  `.tiers-container`, `fieldset.tier-container(.inactive) > legend`, `.checkbox-group-container`,
  `.checkbox-grouping-coontainer(.multi)` (com o erro de digitação do sistema), `input.selection-checkbox`,
  `.checkbox-group-label`, `.levelup-summary-container`, `.increase-container`, `section.tab-footer button`.
- Medo (`templates/ui/fearTracker.hbs`): `#resources`, `#resource-fear.fear-tracker(.isGM)`, `.fear-tokens`,
  `a.fear-token(.inactive)` com `style="filter: hue-rotate(...)"` inline, `i.fear-token.fa-skull`,
  `.resource-bar.fear-bar` com `--fear-percent`, `progress.progress-bar`, `h4.label`, `.controls a`, `.fear-header`.

## 3. Design

### 3.1 Tema fora da ficha (ADR 0008) — THM-01..04

- **Sem setting nova (Q1 a): o tema fora da ficha segue a `sheetFx`** (cliente, `full`/`static`/`off`). O registro
  da `sheetFx` (`edgeheart-character.js:1202-1208`: chave, `choices`, padrão e `onChange: SheetFx.refreshAll`)
  **não muda**. `scripts/edgeheart-ui-theme.js` (novo):
  - `uiThemeFlags(mode) → { on, fx }` (pura, exportada): `full` → `{ on: true, fx: true }`, `static` →
    `{ on: true, fx: false }`, `off` (ou qualquer outro valor) → `{ on: false, fx: false }`;
  - `isSheetFxKey(key)` (pura, exportada): `key === "edgeheart-cyberpunk.sheetFx"`;
  - `applyBodyClasses(mode)`: `document.body.classList.toggle("eh-ui-on", on)` e `toggle("eh-ui-fx", fx)`;
  - `Hooks.once("ready", …)` chama `applyBodyClasses(game.settings.get(MODULE_ID, "sheetFx"))`;
  - `Hooks.on("clientSettingChanged", (key, value) => …)` chama `applyBodyClasses(value)` quando
    `isSheetFxKey(key)` — hook público do Foundry 14.369, disparado logo depois do `onChange` da setting (2.1).
    Vale na hora, sem recarregar e sem re-render. **Mínimo que se tocaria no registro, se o hook sumir numa
    versão futura:** nada além de acrescentar uma chamada ao `onChange` existente; hoje não é preciso.
  - Texto: só o **valor** de `EDGEHEART.Settings.SheetFx.Hint` muda (en e pt-BR), para dizer que o visual vale
    também para diálogos, Ficha da Crew, cards de chat e Level Up. Nenhuma chave nova, nenhuma renomeada. Partida:
    "Cyberpunk theme for the sheet and the module's windows (dialogs, Crew, chat cards, Level Up)…" / "Tema
    cyberpunk da ficha e das janelas do módulo (diálogos, Crew, cards de chat, Level Up)…", com o resto da frase
    atual.
- **CSS novo `styles/edgeheart-ui-theme.css`** (entra no fim de `module.json.styles`):
  1. tokens (`--eh-y`, `--eh-y-rgb`, `--eh-hot`, `--eh-hot-rgb`, `--eh-cyan`, `--eh-bg`, `--eh-panel`, `--eh-text`,
     `--eh-dim`) com os valores de `edgeheart-sheet-theme.css:7-15`, no seletor
     `:is(.edgeheart-dialog, .edgeheart-crew, .eh-chat, .application.levelup.eh-levelup, #resources.eh-fear)`;
  2. **diálogos** (`body.eh-ui-on .application.edgeheart-dialog`): fundo `--eh-bg` com scanline e grade como
     `theme.css:70-76`, borda 1px amarela e glow `0 0 22px` amarelo/.22, cabeçalho Chakra Petch itálico caixa
     alta, corpo Rajdhani, `select`/`input` com borda amarela e canto reto, botões chanfrados (6px) amarelos com
     texto `#000`, botão padrão com glow; variante `.eh-danger` com `--eh-y: #ff1f3d` (igual ao modo psicose,
     `theme.css:59-67`) para o Eidolon inutilizado;
  3. Crew (THM-02) e chat (THM-03) no mesmo arquivo, em seções separadas.
- **Diálogos:** as 8 chamadas da tabela 1 ganham `classes: ["edgeheart-dialog"]`; a do Eidolon inutilizado,
  `["edgeheart-dialog", "eh-danger"]`. A classe vai sempre (é só marca); quem liga o visual é a classe do
  `<body>`.
- **Ficha da Crew (THM-02):** a correção do achado A1 (uma linha no `refreshAll`) e só CSS em
  `body.eh-ui-on .edgeheart-crew`: troca as variáveis do sistema como a
  ficha faz (`--golden*`, `--dark-blue*`, `--beige*`, `--color-*`, `--dh-button-*`, `theme.css:17-50`) dentro do
  escopo da Crew; fundo scanline, borda e glow da janela; `fieldset` com cantoneira 14×14 e `SYS://NN` por
  `counter`; legendas Chakra Petch; cartões de Movimento e campos com canto chanfrado e `border-radius: 0`;
  pílulas retas; **ciano** (`--eh-neon: var(--eh-cyan)`) só nos pips de Edge e no custo; Edge sem saldo com
  opacidade .6 (como hoje). Estrutura, ações e templates não mudam.
- **Cards de chat (THM-03):** só CSS em `body.eh-ui-on .eh-chat`: fundo `--eh-panel`, borda esquerda 3px amarela,
  canto chanfrado, `h3` Chakra Petch, linha de cálculo Rajdhani; resultado com **ícone e texto** —
  `.eh-outcome.eh-ok::before` = `\f00c` (check) em `#3ddc97` e `.eh-bad::before` = `\f071` (alerta) em
  `--eh-hot`, Font Awesome do Foundry. O texto do resultado já é diferente em cada caso (CA14). Cards da Crew:
  custo de Edge em chip ciano chanfrado, botões chanfrados.
- **Fontes (THM-04, Q6 b):** `assets/fonts/` com Rajdhani 500/600/700 e Chakra Petch 700 itálico em WOFF2 e os
  `OFL.txt` das duas famílias; `styles/edgeheart-fonts.css` com `@font-face` (`font-display: swap`) apontando
  para `../assets/fonts/*.woff2`, **depois** dos outros CSS no `module.json` (a última `@font-face` com os
  mesmos descritores vence, então a ficha passa a usar o arquivo local com a mesma fonte; o `@import` do
  `theme.css` fica, ADR 0008 item 1).

### 3.2 Level Up do Edgeheart (ADR 0009) — LUP-01..03

**Quando vale:** janela `DhCharacterLevelUp` com `Humanity.isEdgeheart(app.actor)` **e**
`game.settings.get(MODULE_ID, "edgeheartLevelup")`. Função pura: `isEdgeheartLevelup({ isEdgeheart, enabled })`.
Fora disso, nada é tocado (CA7). O tema (LUP-03) exige também `body.eh-ui-on` (isto é, `sheetFx` ≠ `off`).

**Script novo `scripts/edgeheart-levelup.js`** (em `module.json.esmodules`), `import { Humanity } from
"./edgeheart-character.js"`:

- `Hooks.on("renderDhCharacterLevelUp", (app, element) => …)`: se vale, `element.classList.add("eh-levelup")`
  e monta/atualiza `aside.eh-lvl-aside` como **último filho de `.window-content`** (fora das PARTS). Em todo
  render: atualiza o conteúdo do `aside`. Nada é posto dentro das PARTS do sistema.
- Layout (CSS funcional, vale com ou sem tema): `.application.levelup.eh-levelup .window-content` em grid
  `minmax(0, 1fr) 240px`; as PARTS do sistema na coluna 1; o `aside` na coluna 2 ocupando todas as linhas.
- **Largura (Q8): 1240px.** Na **primeira** marcação (o elemento ainda não tinha `eh-levelup`), o hook chama
  `app.setPosition({ width: LEVELUP_WIDTH })`, `LEVELUP_WIDTH = 1240` (API pública do `ApplicationV2`). Renders
  seguintes não mexem na posição (o usuário pode redimensionar). Só no Level Up Edgeheart; o do sistema fica com
  a largura dele. [V] O hook roda antes do `setPosition(options.position)` do fim do render, mas na primeira
  renderização `options.position` **é** o `#position` da janela (`application.mjs:657`) e `setPosition` grava nele
  (`:1101-1108`), então a largura 1240 fica (`:600`).

**Painel "Vem do Cyberware" (LUP-01, R2, CA2):**
- título "Comes from Cyberware" / "Vem do Cyberware";
- 5 linhas riscadas (`<s>`), na ordem de `LEVELUP_REMOVED` (`edgeheart-character.js:397`, exportado neste
  ticket): Traits/Atributos, Hit Points/PV, Stress/Estresse, Evasion/Evasão, Multiclass/Multiclasse;
- 1 linha "automático" (Q2 a): "Damage Thresholds +1 per level (automatic)" / "Limiares de Dano +1 por nível
  (automático)";
- nota curta: "In Edgeheart these come from Cyberware (PDF, Cyberware, p. 41)." / "No Edgeheart, isso vem do
  Cyberware (PDF, Cyberware, p. 41).".
- Funções puras: `removedAdvancements() → LEVELUP_REMOVED` (cópia) e `thresholdNote(mode)` (só `"auto"` hoje).

**Painel "Cyberware do Tier" (LUP-01, R4, Q5 a):**
- Tier de destino: `tierOf(app.levelup.endLevel, tiers)` com a mesma regra do `system.tier`
  (`character.mjs:306-312`), lendo `game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.LevelTiers).tiers`
  (setting pública que o módulo já usa);
- texto do custo por Tier do PDF (p. 41–42): T1 0–1, T2 1–2, T3 2–3, T4 3+ (`cyberCostRange(tier)` pura);
- botão "Open the Cyberware compendium" / "Abrir o compêndio de Cyberware": mesmo código de
  `#openCyberware` (`game.packs.get("edgeheart-cyberpunk.edgeheart-cyberware")?.render(true)`, aviso
  `Cyberware.PackMissing` se não houver). Não concede nada.

**Lembrete de Humanidade (LUP-02, R3, CA3–CA5, Q3 b):** bloco `div.eh-lvl-humanity` (`SYS://03`) no `aside`.
**Só lembra; não grava nada.** O avanço continua sendo feito na aba Chrome, depois de terminar o Level Up, pela
`Humanity.advance` atual (sem mudança).
- `humanityReminder({ die, lost, advancedAt, targetLevel })` (pura):
  - `lost` → `{ show: false }` (só o mestre restaura, pela aba Chrome);
  - `die >= 12` → `{ show: true, reason: "max", from: 12 }` (CA5: "d12 (máximo)", sem botão);
  - `advancedAt === targetLevel` → `{ show: true, reason: "already", from: die }` (CA4: o avanço deste nível já
    foi usado; o botão fica, para o mestre que queira ajustar);
  - senão → `{ show: true, reason: "next", from: die, to: próximo passo }` (CA3).
  `targetLevel` = `app.levelup.endLevel`; é a regra de `Humanity.summary().canAdvance` (`:156`) olhando o nível de
  destino, sem o caso do mestre (o lembrete é o mesmo para os dois).
- UI: título "Humanity" / "Humanidade"; "d6 → d8"; texto "After finishing the Level Up, you can advance your
  Humanity die once at the new level, in the Chrome tab." / "Ao terminar o Level Up, você pode avançar o Dado de
  Humanidade uma vez no nível novo, na aba Chrome."; dica do PDF p. 51 ("vínculo, objetivo, recuperação ou
  esperança genuína"); botão "Open the Chrome tab" / "Abrir a aba Chrome". Motivos `max`/`already` com texto
  próprio. Sem caixa de marcar, sem estado guardado, nada no resumo do sistema (R5/CA6 ficam fora desta versão:
  a linha no resumo só existia com o passo da Q3 a).
- Botão: `const sheet = app.actor.sheet; await sheet.render({ force: true });` e, se a ficha renderizada tem a aba
  (`sheet.element?.querySelector('[data-group="primary"][data-tab="chrome"]')`),
  `sheet.changeTab("chrome", "primary")` — o mesmo par de `#openChrome` (`edgeheart-character.js:755`);
  `changeTab` lança erro sem a aba (2.1), daí a conferência. O Level Up continua aberto.
- Level Up de vários níveis de uma vez: o lembrete fala de **um** avanço no nível final (é o que a aba Chrome
  permite).

**Tema da janela (LUP-03, R8–R11, CA8–CA10):** só CSS em `styles/edgeheart-levelup.css`, sob
`body.eh-ui-on .application.levelup.eh-levelup`:
- janela: fundo `--eh-bg` com scanline e grade, borda e glow amarelos, cabeçalho como o dos diálogos; fonte
  Rajdhani no corpo, Chakra Petch itálico nos títulos;
- passos numerados por CSS: `a.advancements::before` "SYS://01", `a.selections::before` "SYS://02", lembrete de
  Humanidade (`.eh-lvl-humanity`) "SYS://03", `.levelup-summary-container::before` "SYS://04" (decoração, sem tradução, como o
  `SYS://` da ficha);
- Tiers: `fieldset.tier-container` com chanfro 6px, cantoneira 14×14, legenda amarela; Tier ativo com
  fundo `linear-gradient(180deg, amarelo/.045, transparent 60%)`; `.inactive` com `opacity: .35`,
  `filter: grayscale(1)` e `pointer-events: none` (os checkboxes já vêm `disabled` do sistema);
- checkboxes quadrados com borda amarela; marcado com fundo amarelo; grupo `.multi` com borda chanfrada;
- resumo: linhas "antigo → novo" com a seta em amarelo; rodapé com botões chanfrados amarelos (texto `#000`) e
  desabilitado apagado;
- `aside`: painéis com cantoneira; itens riscados em `--eh-dim` com `fa-xmark` vermelho; "automático" com
  `fa-gears` amarelo; lembrete de Humanidade com o dado grande (Chakra Petch), a seta e o botão chanfrado;
- animação (glow pulsando no Tier ativo) só com `body.eh-ui-fx` e fora de `prefers-reduced-motion: reduce`.

### 3.3 Barra de Medo (ADR 0009) — FEAR-01, FEAR-02

- **Setting nova `fearTheme`** (**mundo**, `scope: "world"`, `Boolean`, padrão `true`, `config: true`; Q4), em
  `scripts/edgeheart-fear.js`: "Edgeheart Fear tracker" / "Barra de Medo do Edgeheart", com dica de que vale para a
  mesa toda. Só o mestre muda. `onChange` → `ui.resources?.render()`: em setting de mundo o Foundry chama o
  `onChange` em todos os clientes (`setting.mjs:41-51`), então a barra de todos troca sem recarregar.
- `Hooks.on("renderFearTracker", (app, element) => …)`: `element.classList.toggle("eh-fear", enabled)` e
  `element.style.setProperty("--eh-fear-max", String(app.maxFear ?? game.system.settings.homebrew.maxFear))`
  (FEAR-02). Funções puras: `fearClasses(enabled)` e `fearBarVars(max)`. Modo `hide` do sistema não renderiza
  nada; o módulo não muda isso (CA18).
- **CSS novo `styles/edgeheart-fear.css`**, tudo sob `#resources.eh-fear`:
  - fundo de pergaminho do sistema trocado por painel escuro translúcido (`--eh-bg` com alfa .85) e borda
    vermelha fina; `.fear-header` (modo livre) em Rajdhani com "FEAR://" decorativo;
  - **tokens (FEAR-01, R17, R19, CA15):** `a.fear-token` com `filter: none !important` (anula o `hue-rotate`
    inline), tamanho 2,5rem como no sistema, forma de hexágono (`clip-path: polygon(25% 0, 75% 0, 100% 50%,
    75% 100%, 25% 100%, 0 50%)`), fundo vermelho escuro; `i.fa-skull` escondido; `::before` com o ícone do
    módulo por `mask-image: url("../assets/ui/fear-skull-virus.svg")` e `background-color: var(--eh-hot)`;
    glow por `filter: drop-shadow(0 0 6px rgb(var(--eh-hot-rgb) / .7))` no `.fear-tokens`; tremida leve
    (`translate` de até 1px, 2–3 s, atraso diferente por `nth-child`) só nos ativos e só com `body.eh-ui-fx`
    (a setting de mundo decide o visual; a `sheetFx` de cada um decide a animação, ADR 0008 item 7);
    `.inactive`: só o contorno do hexágono (camada interna escura), ícone com opacidade .2, sem glow nem tremida;
    hover do GM (`.isGM`) com glow mais forte;
  - **barra (FEAR-02, R18, CA16):** `.fear-bar` sem gradiente roxo; `progress` invisível (fica para leitura de
    tela); faixa com `repeating-linear-gradient(90deg, …)` de `--eh-fear-max` segmentos
    (`calc(100% / var(--eh-fear-max))`, separador 3px) inclinados (`skewX(-18deg)`), cheios em `--eh-hot` até
    `--fear-percent` (que o sistema já põe) e vazios em contorno; caveira (mesmo `mask-image`) em
    `left: var(--fear-percent)`; `h4.label` em Rajdhani; `.controls a` chanfrados;
  - `@media (prefers-reduced-motion: reduce)` ou sem `body.eh-ui-fx` (`sheetFx` = `static`/`off`): sem tremida
    nem pulso (CA10).
- Sem a classe `eh-fear` (setting desligada), nenhuma regra vale: barra original (CA19).

### 3.4 Arte (ART-01, R22, Q7 a)

Um ícone só: a caveira-vírus, monocromático para ser usado como **máscara** (a cor vem do CSS: vermelho nos
tokens e na barra). Hexágono, contorno, glow e segmentos são CSS da Fábrica. Pasta nova `assets/ui/` (entra no
`module.zip` com o resto de `assets/`). Pedido completo no ticket ART-01.

### 3.5 Dados salvos

| Nome | Tipo | Escopo | Novo? |
|---|---|---|---|
| `edgeheart-cyberpunk.sheetFx` | setting `String` (`full`/`static`/`off`) | cliente | **existente, mesmo registro**; passa a governar também o tema fora da ficha (Q1 a); só o texto do `Hint` muda |
| `edgeheart-cyberpunk.fearTheme` | setting `Boolean` | **mundo** | novo (FEAR-01) |
| `flags.edgeheart-cyberpunk.humanityDie`, `humanityAdvancedAt` | flags do ator | — | **existentes, mesmo formato**; o Level Up não as grava (só a aba Chrome, por `Humanity.advance`) |

Nenhuma flag, setting, `stableId` ou nome de ação existente muda. Nenhum compêndio muda (**Rebuild: não** em
todos os tickets).

### 3.6 Idiomas

Chaves novas sob `EDGEHEART.Settings.FearTheme.*` e `EDGEHEART.Levelup.Panel.*` (o grupo `EDGEHEART.Levelup` já
existe com `Applied`/`Restored`). Muda só o **valor** de `EDGEHEART.Settings.SheetFx.Hint` (THM-01). Textos de partida
no PRD §8; "Level Up", "Tier", "Crew", "Edge" e "Fear" seguem o glossário. `SYS://NN` e `FEAR://` são decoração,
sem tradução (como na ficha).

## 4. Quebras e migração

Nenhuma. Setting nova com padrão; `sheetFx` com o mesmo registro; flags existentes no mesmo formato; nenhum
arquivo do sistema, nenhum template do módulo existente, nenhum CSS existente muda. **Mudança de comportamento
esperada:** como a `sheetFx` já vem `full`, quem atualizar o módulo vê o tema novo nos diálogos, na Crew, no chat e
no Level Up sem fazer nada; quem não quiser põe a `sheetFx` em `off` (o que também tira o tema da ficha — é o
efeito da Q1 a). A barra de Medo o mestre desliga em `fearTheme` (mundo). Risco: seletores do sistema (2.3) mudarem numa versão menor e o visual se desfazer sem
erro; a conferência fica no roteiro de cada versão.

## 5. Perguntas técnicas para o usuário (respondidas no gate de 2026-11-02)

**Respondidas: ver seção 0.** O texto abaixo fica como registro das opções que o gate tinha; onde ele diz
"Base", vale a resposta da seção 0.

- **Q1 — setting do tema fora da ficha.** Base: (b) `uiTheme` nova. (a) `sheetFx`: THM-01 não registra setting,
  `applyBodyClasses` lê `sheetFx` (−15 linhas, sem chaves de idioma novas). (c) sempre ligado: THM-01 põe
  `eh-ui-on`/`eh-ui-fx` sempre. Tickets afetados: THM-01 (e, por dependência, THM-02, THM-03, LUP-03).
- **Q2 — Limiares.** Base: (a) manter +1 e avisar. [V] o +1 é fixo no `prepareDerivedData` do sistema
  (`character.mjs:716-731`), **sem setting de Homebrew**: (b) só seria possível com um efeito em cada personagem
  anulando o nível, o que mexe em regra e em personagens existentes — a Spec **não** recomenda; se o gate quiser,
  vira PRD/Spec própria. (c) = (a) para a Spec. Afeta só o texto do LUP-01.
- **Q3 — Humanidade no Level Up.** Base: (a) passo no Level Up (LUP-02). (b) lembrete: LUP-02 vira só um texto no
  `aside` com botão que abre a aba Chrome (`actor.sheet.render(true)` + `changeTab("chrome")`), ~100 linhas a
  menos, sem `closeDhCharacterLevelUp`. (c) nada: LUP-02 sai e o LUP-03 não estiliza o bloco `SYS://03`.
- **Q4 — barra de Medo.** Base: setting de **cliente** e só CSS + hook. Mundo: `fearTheme` com `scope: "world"`
  (mesmo tamanho). Subclasse em `CONFIG.ui.resources`: a ADR 0009 proíbe; seria outra ADR. Se o gate recusar a
  barra, saem FEAR-01, FEAR-02 e ART-01.
- **Q5 — cyberware no Level Up.** Base: (a) painel com atalho (LUP-01). (b) oferecer cyberware: fora desta Spec
  (mexe em Carga e Humanidade; precisa de PRD). (c) nada: o LUP-01 perde o painel "Cyberware do Tier" (−40 linhas).
- **Q6 — fontes offline.** Base: (b) empacotar (THM-04). Licença: as duas famílias são distribuídas pelo Google
  Fonts sob a **SIL Open Font License 1.1** [I, a Fábrica confirma no `OFL.txt` baixado do repositório
  `google/fonts` antes de commitar]. (a) manter o `@import`: THM-04 sai e a regra 9 do `check` (`url()` do CSS)
  passa para o FEAR-01.
- **Q7 — ícone do Medo.** Base: (a) Codex (ART-01). (b) `assets/cpr/...cyberskull.svg`/`worm.svg`: ART-01 sai; o
  FEAR-01 aponta para o arquivo escolhido **depois** de o usuário confirmar a licença dos `cpr/`.
- **Q8 (nova, técnica) — largura do Level Up.** Com o painel lateral de 240px, aceitar a janela mais larga
  (`app.setPosition({ width: 1240 })` na primeira abertura) ou manter 1000 e apertar os Tiers? *Recomendação:*
  1240, só no Level Up do Edgeheart. Afeta o LUP-01 (2 linhas).

## 6. Tickets

### 6.0 Resumo, ordem e paralelos

WIP 1 (ADR 0003): um ticket por vez; "Paralelo com" marca o que **pode** rodar junto, sem arquivo em comum, cada
um no seu worktree. `lang/*.json`, `module.json` e `scripts/edgeheart-character.js` são os pontos de conflito mais
comuns. Tabela atualizada com as respostas do gate (seção 0).

| Ordem | Ticket | Título | Tamanho | Depende de (tickets) | Paralelo com |
|---|---|---|---|---|---|
| 1 | ART-01 | Caveira-vírus da barra de Medo (Codex) | 0 linhas, 1 arquivo (arte) | — | qualquer um |
| 1 | THM-01 | Tema fora da ficha pela `sheetFx` e diálogos do módulo | ~285, 9 | — | ART-01 |
| 2 | LUP-01 | Level Up Edgeheart: painéis "Vem do Cyberware" e "Cyberware do Tier", 1240px | ~305, 7 | — (pela ordem, depois do THM-01: `lang`, `module.json`, `edgeheart-character.js`) | THM-03 |
| 3 | THM-02 | Ficha da Crew no tema e Crew fora do `SheetFx.refreshAll` (A1) | ~215, 3 | THM-01 | LUP-02, LUP-03, FEAR-01, FEAR-02, THM-04 |
| 4 | LUP-02 | Lembrete de Humanidade no Level Up | ~130, 5 | LUP-01 | THM-02, THM-03, FEAR-02, THM-04 |
| 5 | THM-03 | Cards de chat no tema | ~90, 1 | THM-01 | LUP-01, LUP-02, LUP-03, FEAR-01, FEAR-02, THM-04 |
| 6 | LUP-03 | Janela de Level Up no tema | ~250, 1 | THM-01, LUP-01, LUP-02 | THM-02, THM-03, FEAR-01, FEAR-02, THM-04 |
| 7 | FEAR-01 | Barra de Medo: setting de mundo `fearTheme` e modo tokens | ~255, 6 | THM-01, ART-01 | THM-02, THM-03, LUP-03 |
| 8 | FEAR-02 | Barra de Medo: modo barra | ~130, 3 | FEAR-01 | THM-02, THM-03, LUP-02, LUP-03, THM-04 |
| 9 | THM-04 | Fontes Rajdhani e Chakra Petch no módulo | ~110, 4 (+6 de `assets/`) | THM-01 | THM-02, THM-03, LUP-02, LUP-03, FEAR-02 |

Mudanças em relação à versão do gate: THM-01 −25 (sem setting nem chaves novas); THM-02 +15 e +2 arquivos (A1:
uma linha em `edgeheart-character.js` e um teste de texto), por isso deixa de ser paralelo do LUP-01 e troca de
ordem com ele; LUP-02 −120 (lembrete, Q3 b); LUP-03 −10 (bloco `SYS://03` menor); FEAR-01 +5 (dica da setting de
mundo e a chave `body.eh-ui-fx` na animação). Nenhum ticket passa de ~500 linhas / 10 arquivos.

Sequência sugerida (um por vez): ART-01 (Codex, corre enquanto o resto anda) → THM-01 → LUP-01 → THM-02 → LUP-02 →
THM-03 → LUP-03 → FEAR-01 → FEAR-02 → THM-04. São 10 tickets: um lote (PR) inteiro, ADR 0003 item 5.

**Aprovação parcial:** o Level Up funcional (LUP-01, LUP-02) não depende do tema; o tema (THM-*) não depende do
Level Up; a barra (FEAR-*, ART-01) só depende de THM-01 pelos tokens e pela classe `eh-ui-fx`. Se as ADRs 0008/0009
não forem confirmadas, só o ART-01 sai do gate (os outros dependem de uma das duas).

---

### ART-01: chore(assets): caveira-vírus da barra de Medo (Codex)
- Requisitos: R17, R18, R22, CA15, CA16, CA22 · **Q7 (a)**, Q4 (só se a barra entrar)
- Quem faz: **Codex** num terminal do Orca (decisão do usuário). A Fábrica não desenha; o Examinador confere o
  arquivo; o DevOps commita.
- Escopo: `assets/ui/fear-skull-virus.svg` (pasta nova). Mais nada.
- **Pedido para o Codex (copiar inteiro):**
  > Crie um ícone SVG para o módulo Edgeheart (Foundry VTT, cyberpunk). **Uso:** cada ponto de Medo da barra de
  > Medo do mestre e a ponta da barra de Medo; o CSS do módulo usa o SVG como **máscara** (`mask-image`) e pinta
  > a cor, então o desenho tem de funcionar como silhueta de uma cor só. **Assunto:** uma caveira humana de
  > frente, "infectada": metade do crânio com placas e trilhas de circuito, e em volta 6 a 8 espinhos curtos de
  > vírus (haste reta com ponta em bola ou losango) saindo do contorno, como uma coroa de proteínas. Órbitas
  > vazias grandes, maxilar curto, sem pescoço. **Estilo:** flat, linhas retas e cantos chanfrados a 45°
  > (linguagem "tech" do tema), sem gradiente, sem sombra, sem texto, sem moldura e **sem hexágono** (o
  > hexágono é feito em CSS). Detalhes internos (órbitas, nariz, dentes, circuitos) como **recortes vazados**,
  > para aparecer na máscara. **Tamanho:** `viewBox="0 0 64 64"`, desenho centrado com margem de 4px; tem de
  > ler bem a 40px (ponto de Medo) e a 24px (ponta da barra): traço mínimo equivalente a 3px em 64. **Formato:**
  > SVG 1.1 limpo, só `<path>`/`<polygon>`, sem `<image>`, sem raster embutido, sem `<style>`, sem fontes, sem
  > `id`s de editor, **fundo transparente**, `fill="#ff2a4f"` em todas as formas (vermelho do tema), menos de
  > 8 KB. **Paleta do tema** (referência, só o vermelho entra no arquivo): amarelo `#fcee0a`, vermelho
  > `#ff2a4f`, ciano `#19e3ff`, fundo `#060709`. **Arquivo:** `assets/ui/fear-skull-virus.svg`. Entregue também
  > uma prévia PNG 256×256 fora do repositório (só para conferência), com o ícone em `#ff2a4f` sobre `#060709`.
- Testes red: **nível 1** — o FEAR-01 (regra 9 do `check`, ou a do THM-04) falha enquanto o arquivo não existe.
  Neste ticket: conferência do Examinador — SVG abre no navegador, `viewBox` 0 0 64 64, só `path`/`polygon`, sem
  raster, fundo transparente, < 8 KB.
- Critério de pronto: arquivo em `assets/ui/`, prévia aprovada pelo usuário (no gate do ticket ou no PR),
  `npm run verify` verde.
- Depende de: Q7 (a). Rebuild: não.
- Tamanho estimado: 0 linhas contadas (binário de arte, ADR 0003), 1 arquivo.
- Paralelo com: qualquer ticket.

### THM-01: feat(tema): tema Edgeheart fora da ficha pela setting `sheetFx` e diálogos do módulo
- Requisitos: R11, R12, R15, R16, CA10, CA11, CA12, CA20, CA21 · **Q1 (a)**
- Escopo: `scripts/edgeheart-ui-theme.js` (novo), `styles/edgeheart-ui-theme.css` (novo), `module.json`
  (`esmodules` e `styles`, no fim), `lang/en.json` e `lang/pt-BR.json` (só o **valor** de
  `EDGEHEART.Settings.SheetFx.Hint`), `scripts/edgeheart-character.js` (só `classes` nas 5 chamadas `DialogV2`;
  o registro da `sheetFx` **não** muda), `scripts/edgeheart-crew.js` (só `classes` nas 3 chamadas),
  `tools/check.mjs` (regra 8), `tests/ui-theme.test.mjs` (novo).
- Design: 3.1 (classes do `<body>` pela `sheetFx`, hook `clientSettingChanged`, tokens, diálogos). ADR 0008.
- Testes red:
  - **nível 2** `tests/ui-theme.test.mjs`: (1) `uiThemeFlags("full")` → `{on: true, fx: true}`, `"static"` →
    `{true, false}`, `"off"` → `{false, false}`, `undefined` → `{false, false}`; `isSheetFxKey` aceita
    `"edgeheart-cyberpunk.sheetFx"` e recusa `"edgeheart-cyberpunk.edgeheartLevelup"` e `"core.sheetFx"` — falha
    antes porque o arquivo não existe; (2) teste de texto: em `edgeheart-character.js` e `edgeheart-crew.js`, o
    número de `DialogV2.(confirm|input|wait)(` é igual ao de `"edgeheart-dialog"` (5 e 3) e
    `edgeheart-character.js` tem exatamente um `"eh-danger"` — falha antes (0 classes); (3) teste de texto: o
    bloco `register(MODULE_ID, "sheetFx"` de `edgeheart-character.js` continua com `onChange: () =>
    SheetFx.refreshAll()` e os 3 `choices` (guarda do "registro não muda"; passa antes e depois).
  - **nível 1** regra 8 do `check`: os 9 tokens de `edgeheart-ui-theme.css` têm os mesmos valores de
    `edgeheart-sheet-theme.css:7-15` — falha antes (arquivo novo ausente).
  - **nível 3** (roteiro T1–T6): T1 com `sheetFx = full`, abrir "Escolher" de um cyberware de atributo: diálogo
    preto com scanline, borda amarela, botão chanfrado (antes: diálogo padrão); T2 Rolagem de Humanidade com
    Buffer Cortical que muda o resultado: diálogo no tema; T3 Eidolon com o último PV marcado: diálogo vermelho;
    T4 Crew: gastar Edge (confirmação), Plan B e Back Me Up no tema; T5 apagar um Item qualquer: diálogo do
    Foundry **sem** tema (CA12); T6 trocar a `sheetFx` para `off` nas configurações e salvar: os mesmos diálogos
    sem tema e a ficha no visual original, **sem recarregar**; de volta a `static`: tema sem animação; com
    `prefers-reduced-motion` nenhuma animação. Ficha Edgeheart: comparar antes/depois em cada modo, igual (CA21).
- Critério de pronto: red verde; diálogos do módulo no tema com `sheetFx` ≠ `off`; nenhum diálogo de fora muda;
  `git diff` sem linha no registro da `sheetFx`; `npm run verify` verde.
- Depende de: nada (ADR 0008 confirmada). Rebuild: não.
- Tamanho estimado: ~285 linhas (JS 30, CSS 170, lang 4, check 25, teste 46, `classes` 8, `module.json` 2),
  9 arquivos.
- Paralelo com: ART-01.

### LUP-01: feat(levelup): painéis "Vem do Cyberware" e "Cyberware do Tier" no Level Up do Edgeheart
- Requisitos: R1 (preservar), R2, R4, R6, R7, R15, CA1, CA2, CA7, CA20 · **Q2 (a)**, **Q5 (a)**, **Q8 (1240px)**
- Escopo: `scripts/edgeheart-levelup.js` (novo), `styles/edgeheart-levelup.css` (novo; nesta etapa só layout
  e legibilidade sem tema), `module.json` (`esmodules` e `styles`), `lang/en.json`, `lang/pt-BR.json`,
  `scripts/edgeheart-character.js` (só `export` em `LEVELUP_REMOVED`, `:397`, ADR 0004 item 2),
  `tests/levelup-panel.test.mjs` (novo).
- Design: 3.2 (quando vale, `aside`, largura 1240, painéis, `tierOf`, `cyberCostRange`). ADR 0009.
- Testes red:
  - **nível 2** `tests/levelup-panel.test.mjs`: `isEdgeheartLevelup` (4 combinações; só `true/true` vale);
    `removedAdvancements()` = `["trait","hitPoint","stress","evasion","multiclass"]`; `tierOf` com os Tiers
    padrão do sistema (níveis 1→1, 2→2, 4→2, 5→3, 8→4, 10→4); `cyberCostRange(1..4)` = `0–1`, `1–2`, `2–3`, `3+`;
    `thresholdNote("auto")` devolve a chave do aviso "automático"; `LEVELUP_WIDTH === 1240`. Falham antes:
    arquivo e export não existem.
  - **nível 3** (roteiro L1–L6): L1 personagem Edgeheart nível 1, mestre muda o nível para 2, abrir o Level Up:
    hoje não há painel e a janela tem 1000px; esperado janela de 1240px e `aside` com 5 itens riscados, Limiares
    "+1 por nível (automático)" e "Cyberware do Tier 2 — custo 1–2" (CA2); L2 o passo de Avanço não oferece
    Atributos, PV, Estresse, Evasão nem Multiclasse (CA1, regressão); L3 botão do painel abre o compêndio de
    Cyberware; L4 marcar e desmarcar opções e trocar de aba: o `aside` não duplica nem some, e a largura não volta
    a 1240 depois de o usuário redimensionar; L5 personagem com a ficha do sistema, ou `edgeheartLevelup`
    desligado: janela igual à do sistema, largura dele (CA7); L6 trocar idioma en/pt-BR (CA20).
- Critério de pronto: red verde; painel e largura só no Level Up Edgeheart; nenhum seletor do sistema estilizado
  fora de `.eh-levelup`; `npm run verify` verde.
- Depende de: ADR 0009; Q2, Q5, Q8. Pela ordem: depois do THM-01 (mesmos `lang`, `module.json` e
  `edgeheart-character.js`). Rebuild: não.
- Tamanho estimado: ~305 linhas (JS 155, CSS 50, lang 34, teste 63, export 1, `module.json` 2), 7 arquivos.
- Paralelo com: THM-03 (não com THM-02: os dois tocam `edgeheart-character.js`).

### THM-02: feat(tema): Ficha da Crew no tema Edgeheart e fora do `SheetFx.refreshAll`
- Requisitos: R13, R16, CA10, CA13, CA21 · **Q1 (a)**, achado A1
- Escopo: `styles/edgeheart-ui-theme.css` (seção "Crew"), `scripts/edgeheart-character.js` (**uma linha**:
  o filtro de `SheetFx.refreshAll`, `:644`, A1), `tests/ui-theme.test.mjs` (um teste de texto).
- Design: 3.1 (Crew) e achado A1. Nenhuma mudança em `edgeheart-crew.js`, `crew-tab.hbs`, `edgeheart.css`, em
  `SheetFx.apply`/`decorate` nem no registro da `sheetFx`.
- Testes red:
  - **nível 2** (texto) `tests/ui-theme.test.mjs`: o corpo de `refreshAll()` em `edgeheart-character.js` exclui
    `edgeheart-crew` — falha antes (o filtro só olha `edgeheart-sheet`).
  - **nível 3** (roteiro C1–C5): C1 abrir a Ficha da Crew com `sheetFx = full`: hoje ciano e cantos
    arredondados; esperado fundo preto com scanline, bordas amarelas, cantoneira `SYS://NN` nos 3 fieldsets,
    cartões chanfrados, ciano só nos pips de Edge e no custo; C2 marcar/desmarcar Edge, usar Teamwork e Plan B,
    editar Reputação/Código/Fixer/Base: funciona como antes (CA13); C3 abas `partyMembers`, `inventory`, `notes`
    legíveis; C4 `sheetFx = off`: Crew como hoje; C5 (A1) com a Crew **e** uma Ficha Edgeheart abertas, trocar a
    `sheetFx` `full` → `static` → `off` → `full`: hoje a Crew ganha o rodapé `CHAR://NODE` e glitch; esperado a
    Crew segue só o tema novo, sem `CHAR://NODE`, sem glitch e sem erro no console, e a Ficha Edgeheart muda
    como hoje (CA21). Mais `npm run verify`.
- Critério de pronto: red verde; C1–C5 descritos para o PR; nenhum seletor sem `body.eh-ui-on .edgeheart-crew`;
  `git diff` em `edgeheart-character.js` = 1 linha no `refreshAll`; `npm run verify` verde.
- Depende de: THM-01. Rebuild: não.
- Tamanho estimado: ~215 linhas (CSS 200, JS 1, teste 14), 3 arquivos.
- Paralelo com: LUP-02, LUP-03, FEAR-01, FEAR-02, THM-04 (não com THM-03: mesmo CSS; não com LUP-01:
  `edgeheart-character.js`).

### LUP-02: feat(levelup): lembrete de Humanidade no Level Up do Edgeheart
- Requisitos: R3, R15, CA3, CA4, CA5, CA20 · **Q3 (b)**. R5/CA6 (linha no resumo) ficam fora (seção 0).
- Escopo: `scripts/edgeheart-levelup.js`, `styles/edgeheart-levelup.css` (layout do bloco, sem tema),
  `lang/en.json`, `lang/pt-BR.json`, `tests/levelup-humanity.test.mjs` (novo).
- Design: 3.2 (lembrete: `humanityReminder`, botão para a aba Chrome). Sem `closeDhCharacterLevelUp`, sem
  `WeakMap`, sem nó no resumo, nenhuma gravação; `Humanity.advance` intacta.
- Testes red:
  - **nível 2** `tests/levelup-humanity.test.mjs`: `humanityReminder` — d6, nível de destino 2, sem avanço →
    `{show, reason: "next", from 6, to 8}` (CA3); d10 → `to 12`; `advancedAt === targetLevel` → `"already"` (CA4);
    `advancedAt` de um nível anterior → `"next"`; d12 → `"max"` (CA5); `lost` → `show: false`. Falham antes (a
    função não existe).
  - **nível 3** (roteiro H1–H5): H1 Level Up Edgeheart d6: bloco `SYS://03` com "d6 → d8", o texto do lembrete e
    o botão (hoje não existe); H2 clicar no botão: abre a Ficha Edgeheart na aba Chrome e o Level Up continua
    aberto; H3 terminar o Level Up e, na aba Chrome, usar o ↑: dado vira d8 e card de chat (comportamento atual);
    H4 personagem d12: "d12 (máximo)", sem botão (CA5); H5 nada muda no ator só por abrir/fechar o Level Up
    (conferir as flags antes e depois).
- Critério de pronto: red verde; nenhuma gravação no ator pelo Level Up; `git diff` sem linha em
  `edgeheart-character.js`; `npm run verify` verde.
- Depende de: LUP-01; Q3. Rebuild: não.
- Tamanho estimado: ~130 linhas (JS 55, CSS 15, lang 18, teste 42), 5 arquivos.
- Paralelo com: THM-02, THM-03, FEAR-02, THM-04 (não com FEAR-01: `lang`).

### THM-03: feat(tema): cards de chat do módulo no tema
- Requisitos: R14, R16, CA14, CA20 · **Q1 (a)**
- Escopo: `styles/edgeheart-ui-theme.css` (seção "Chat"). Mais nada.
- Design: 3.1 (chat).
- Testes red: **nível 3** (roteiro K1–K5): K1 Rolagem de Humanidade que mantém o controle e outra que falha:
  hoje verde/vermelho sem ícone; esperado card no tema, ✔ e texto "mantém o controle" vs. ⚠ e texto de
  Ciberpsicose (CA14); K2 card de Ciberpsicose com o botão "Estabilizar": botão chanfrado e clicável; K3 Plan B
  e Get Them Out: chip de Edge ciano, botões funcionando; K4 Sincronização sem Soul Bond: sucesso/falha no
  tema; K5 `sheetFx = off`: cards como hoje; cards do sistema (rolagem de ataque) sem mudança.
- Critério de pronto: K1–K5 para o PR; só seletores `body.eh-ui-on .eh-chat…`; `npm run verify` verde.
- Depende de: THM-01. Rebuild: não.
- Tamanho estimado: ~90 linhas, 1 arquivo.
- Paralelo com: LUP-01, LUP-02, LUP-03, FEAR-01, FEAR-02, THM-04 (não com THM-02: mesmo CSS).

### LUP-03: feat(levelup): janela de Level Up do Edgeheart no tema da ficha
- Requisitos: R8, R9, R10, R11, R16, CA8, CA9, CA10, CA21 · **Q1 (a)**, **Q3 (b)** (bloco `SYS://03` = lembrete)
- Escopo: `styles/edgeheart-levelup.css` (seção "tema", toda sob `body.eh-ui-on .application.levelup.eh-levelup`).
  Mais nada.
- Design: 3.2 (tema da janela) e lista de seletores 2.3.
- Testes red: **nível 3** (roteiro V1–V6): V1 Level Up Edgeheart com `sheetFx = full`: hoje pergaminho e
  Montserrat; esperado fundo preto com scanline, amarelo, Rajdhani/Chakra Petch, Tiers chanfrados, `SYS://01`,
  `SYS://02` nas abas, `SYS://03` no lembrete de Humanidade (dado grande, seta, botão chanfrado) e `SYS://04` no resumo (CA8); V2 Tier 2 ativo em destaque, Tiers
  3–4 apagados e não marcáveis (CA9); V3 marcar opções `.multi` (Proficiência no Tier 3) e ver o grupo; V4 resumo
  e rodapé ("Finish Levelup" desabilitado apagado); V5 `prefers-reduced-motion` e `sheetFx = static`: sem
  animação (CA10); V6 personagem sem Ficha Edgeheart: janela do sistema (CA7); V7 `sheetFx = off`: painéis e
  lembrete legíveis sem tema (layout do LUP-01/02). Ficha Edgeheart igual (CA21).
- Critério de pronto: V1–V6 para o PR; nenhuma regra sem `.eh-levelup`; `npm run verify` verde.
- Depende de: THM-01, LUP-01, LUP-02. Rebuild: não.
- Tamanho estimado: ~250 linhas, 1 arquivo.
- Paralelo com: THM-02, THM-03, FEAR-01, FEAR-02, THM-04.

### FEAR-01: feat(medo): barra de Medo cyberpunk, setting de mundo `fearTheme` e modo tokens
- Requisitos: R17, R19, R20, R21, R15, CA10, CA15, CA17, CA18, CA19, CA20, CA22 · **Q4 (mundo)**, **Q7 (a)**
- Escopo: `scripts/edgeheart-fear.js` (novo), `styles/edgeheart-fear.css` (novo), `module.json` (`esmodules`,
  `styles`), `lang/en.json`, `lang/pt-BR.json`, `tests/fear-theme.test.mjs` (novo).
- Design: 3.3 (setting de mundo, hook, tokens; animação sob `body.eh-ui-fx`). ADR 0009.
- Testes red:
  - **nível 2** `tests/fear-theme.test.mjs`: `fearClasses(true)` → `["eh-fear"]`, `fearClasses(false)` → `[]`;
    teste de texto: `edgeheart-fear.js` registra `fearTheme` com `scope: "world"`; `styles/edgeheart-fear.css` cita
    `../assets/ui/fear-skull-virus.svg` e esse arquivo existe; todo seletor do arquivo contém `#resources.eh-fear`
    e todo bloco com `animation` exige `body.eh-ui-fx`. Falham antes (arquivos não existem).
  - **nível 3** (roteiro M1–M7): M1 mestre com Medo 5 de 12, modo tokens: hoje caveiras redondas azul→roxo;
    esperado 5 caveiras-vírus vermelhas em hexágono com glow e tremida e 7 contornos apagados, sem `hue-rotate`
    (CA15); M2 clicar no 8º ponto e depois no 3º: Medo muda e redesenha no tema (CA17); M3 jogador vê a barra
    no tema e não muda o valor; M4 posições `topCenter`, `bottomCenter`, `rightTop`, `leftBottom` e livre
    (arrastar e redimensionar) sem quebrar o layout; M5 `displayFear = hide`: continua oculta (CA18); M6
    mestre desliga `fearTheme`: a barra original volta **no cliente do jogador também**, sem recarregar (CA19);
    M7 `prefers-reduced-motion`: sem tremida (CA10); M8 jogador com `sheetFx = static`: barra no tema, parada; o
    jogador não vê a setting `fearTheme` para mudar (é de mundo).
- Critério de pronto: red verde; nenhuma regra sem `#resources.eh-fear`; `npm run verify` verde.
- Depende de: THM-01 (tokens), ART-01; Q4, Q7. Rebuild: não.
- Tamanho estimado: ~255 linhas (JS 45, CSS 145, lang 10, teste 53, `module.json` 2), 6 arquivos.
- Paralelo com: THM-02, THM-03, LUP-03 (não com LUP-02: `lang`).

### FEAR-02: feat(medo): modo barra da barra de Medo no tema
- Requisitos: R18, R19, R20, CA10, CA16, CA17 · **Q4 (mundo)**
- Escopo: `scripts/edgeheart-fear.js` (`--eh-fear-max` no hook e `fearBarVars`), `styles/edgeheart-fear.css`
  (seção "barra"), `tests/fear-theme.test.mjs`.
- Design: 3.3 (barra).
- Testes red:
  - **nível 2**: `fearBarVars(12)` → `{ "--eh-fear-max": "12" }`; `fearBarVars(undefined)` → 12 (padrão do
    sistema, `Homebrew.mjs:63-69`); `fearBarVars(0)` → 1 (sem divisão por zero). Falha antes (função não existe).
  - **nível 3** (roteiro B1–B4): B1 `displayFear = bar`, Medo 5 de 12: hoje gradiente roxo; esperado 5 de 12
    segmentos inclinados vermelhos e caveira na ponta (CA16); B2 mestre usa − e +: muda e redesenha (CA17);
    B3 `maxFear` do Homebrew = 8: 8 segmentos; B4 `prefers-reduced-motion` ou `sheetFx = static`: sem animação.
- Critério de pronto: red verde; `npm run verify` verde.
- Depende de: FEAR-01; Q4. Rebuild: não.
- Tamanho estimado: ~130 linhas (JS 15, CSS 90, teste 25), 3 arquivos.
- Paralelo com: THM-02, THM-03, LUP-02, LUP-03, THM-04.

### THM-04: feat(tema): fontes Rajdhani e Chakra Petch empacotadas no módulo
- Requisitos: R8, R12, R13 (fontes sem rede) · **Q6 (b)**
- Escopo: `assets/fonts/rajdhani-500.woff2`, `rajdhani-600.woff2`, `rajdhani-700.woff2`,
  `chakra-petch-700-italic.woff2`, `assets/fonts/OFL-Rajdhani.txt`, `assets/fonts/OFL-ChakraPetch.txt` (binários
  e licenças, não contam), `styles/edgeheart-fonts.css` (novo), `module.json` (`styles`, **por último**),
  `tools/check.mjs` (regra 9), `tests/fonts.test.mjs` (novo).
- Design: 3.1 (fontes). Origem dos arquivos: repositório `google/fonts` (`ofl/rajdhani`, `ofl/chakrapetch`); a
  Fábrica converte TTF → WOFF2 se preciso e anota a origem no topo do CSS.
- Testes red:
  - **nível 1** regra 9 do `check`: todo `url(...)` relativo em `styles/*.css` aponta para arquivo que existe —
    escrita antes, falha com o `edgeheart-fonts.css` apontando para os `.woff2` ainda ausentes.
  - **nível 2** `tests/fonts.test.mjs`: `module.json.styles` termina em `styles/edgeheart-fonts.css`; os 4
    `@font-face` têm `font-family` "Rajdhani"/"Chakra Petch" e os pesos 500/600/700/700 itálico; os dois `OFL`
    existem.
  - **nível 3** (F1–F2): F1 Foundry sem internet (desligar a rede e recarregar): Ficha Edgeheart, diálogos e Level
    Up com Rajdhani/Chakra Petch (hoje caem no fallback); F2 com internet: Ficha Edgeheart igual (CA21).
- Critério de pronto: red verde; licenças OFL no pacote; `npm run verify` verde.
- Depende de: THM-01; Q6 (b). Rebuild: não.
- Tamanho estimado: ~110 linhas contadas (CSS 35, check 25, teste 40, `module.json` 1), 4 arquivos contados
  (+6 de `assets/`, que não contam).
- Paralelo com: THM-02, THM-03, LUP-02, LUP-03, FEAR-02.

## 7. Exceções

| Ticket | Linhas | Arquivos | Motivo | Data |
|---|---|---|---|---|
| — | — | — | Nenhum ticket estimado acima de ~500 linhas / 10 arquivos | 2026-11-02 |
