# Design atual do módulo, Level Up e barra de Medo (inventário do lote 05)

Levantado em 2026-11-02 pelo Arquiteto para o artefato de referência visual (B-021) e para os
PRDs de B-016 a B-019. Módulo na `main` `60b1bb1` (v1.39.2). Sistema conferido no clone
`../daggerheart-src`, branch `v14`, **2.12.3** (`system.json:5`); caminhos do sistema são relativos
a esse clone. **[V]** = conferido no código; **[I]** = inferência.

O sistema não traz o `.css` compilado no repositório, só o LESS (`styles/daggerheart.less`); as
citações de estilo do sistema são do LESS.

---

## 1. Tokens visuais do tema Edgeheart

Dois arquivos, os dois carregados para todos os documentos (`module.json`, `"styles"`):

- `styles/edgeheart-sheet-theme.css`: o **tema cyberpunk** (amarelo/preto). Só vale em
  `.edgeheart-sheet.eh-theme` (`:6`), isto é, na Ficha Edgeheart de personagem com a setting
  `sheetFx` diferente de `off`. As classes `eh-theme`, `eh-fx` e `eh-psycho` são postas por
  `SheetFx.apply` (`scripts/edgeheart-character.js:565-577`).
- `styles/edgeheart.css`: componentes da aba Chrome, da aba Crew, cards de chat e filtros. Usa um
  segundo conjunto de cores (ciano/verde/vermelho), **anterior ao tema** e sem ligação com ele.

### 1.1 Cores do tema (`edgeheart-sheet-theme.css`)

| Variável | Valor | Linha | Uso |
|---|---|---|---|
| `--eh-y` | `#fcee0a` (amarelo) | 7 | cor principal: bordas, títulos, aba ativa, glow |
| `--eh-y-rgb` | `252 238 10` | 8 | para `rgb(... / alfa)` |
| `--eh-hot` | `#ff2a4f` | 9 | vermelho: botões de ação das features, rótulo dos limiares |
| `--eh-hot-rgb` | `255 42 79` | 10 | |
| `--eh-cyan` | `#19e3ff` | 11 | declarada; usada só como cor de glitch (`edgeheart-character.js:629`) |
| `--eh-bg` | `#060709` | 12 | fundo da janela |
| `--eh-panel` | `#0c0e11` | 13 | sidebar, fundo de atributos e botões de janela |
| `--eh-text` | `#e8f1f2` | 14 | texto |
| `--eh-dim` | `#8d9aa0` | 15 | texto secundário, Esperança vazia |
| `--deep-black` | `#030304` | 33 | |
| texto em fundo amarelo | `#000` | 45, 155, 180 | botões do sistema, aba ativa, rótulos de status |

**Modo Ciberpsicose** (`.eh-psycho`, `:59-67`): as mesmas variáveis com outra cor:
`--eh-y #ff1f3d` (`255 31 61`), `--eh-hot #ff5a6e`, `--eh-text #ffe6e9`, glow mais forte.
Botões das features ficam `#7a0014` (`:171`).

**Variáveis do sistema sobrescritas** (`:17-50`), para a ficha herdada se pintar sozinha:
`--golden*` (→ amarelo com alfa .06/.25/.4/.6/.08), `--golden-filter` (filtro que pinta ícones
SVG de amarelo, `:25`; versão vermelha em `:65`), `--dark-blue*` (→ `#060709` com alfas), `--beige*`
(→ texto), `--red`/`--medium-red` (→ `--eh-hot`), `--dh-trait-color-bg/border`,
`--dh-window-button-color-bg/text`, `--dh-button-color-bg` (amarelo) / `-text` (`#000`),
`--color-border`, `--color-fieldset-border`, `--color-text-emphatic` (amarelo),
`--color-text-subtle` (dim), `--color-text-primary`. `color-scheme: dark` (`:17`).

**Cores das cores de glitch** (`edgeheart-character.js:629`): normal `--eh-y, --eh-y, #19e3ff,
#ff2a4f`; psicose `#ff1f3d, #ff5a6e, #ffffff, #19e3ff`. Separação RGB do título: `#00f0ff` e
`#ff003c` (`theme.css:250-252`).

### 1.2 Cores de `edgeheart.css` (componentes, fora do tema)

| Variável / valor | Linha | Uso |
|---|---|---|
| `--eh-neon: #00e5ff` | 4 | selo do cabeçalho, pip atual da Humanidade, custo do cyberware, Acesso Total, pips de Edge, `.eh-edge-cost` (`#00e5ff` fixo em 225) |
| `--eh-danger: #ff3860` | 5 | Ciberpsicose/Perdido, alertas, pílula de estado, lixeira |
| `--eh-ok: #3ddc97` | 6 | Estável, chance de controle alta, sucesso no chat (`#3ddc97` fixo em 180) |
| `#ffb020` | 61, 98, 122, 136 | risco médio, alerta de aviso, cyberware com escolha pendente |
| `rgba(255,255,255,.04/.05/.08/.12)` | 55, 121, 129, 107 | fundos de stat, hover, chip, contador |
| `rgba(255,56,96,.08)` / `rgba(255,176,32,.06)` | 96, 98 | fundo dos alertas |

Essas variáveis estão em `.edgeheart-sheet` (`:3`), então valem também na Ficha da Crew
(que tem a classe `edgeheart-sheet`, `scripts/edgeheart-crew.js:383`), mas **o tema amarelo não**:
a Crew não passa por `SheetFx`.

**Cores das Competências** (`scripts/main.js:2790-2802`, gravadas no Homebrew do sistema por
`ensureHomebrewDomains`, `:2812`): Network `#0098b8`, Aegis `#b89a00`, Assault `#4a3de0`, Ghost
`#8a64e0`, Chrome `#7d8c99`, Systems `#1f6fe0`, Influence `#d62d86`, Frontier `#d96f00`, Medtech
`#00a868`, Redline `#c4102c`, Blackwall `#c21aa6`. Pasta de compêndios "Edgeheart SRD" `#00e5ff`
(`module.json`, `packFolders`).

### 1.3 Fontes

- **Rajdhani** 500/600/700 e **Chakra Petch** itálico 700, do **Google Fonts** por `@import`
  (`theme.css:4`). Não há arquivo de fonte no módulo; sem internet cai no fallback.
- Corpo da ficha: `"Rajdhani", Montserrat, sans-serif` (`:52`); títulos, legendas, abas,
  rótulos com peso 700 e `letter-spacing: .4px` (`:100-104`); nomes de itens 600 (`:105`).
- Nome do personagem: `"Chakra Petch"` itálico 700, caixa alta, amarelo, `text-shadow 0 0 10px`
  (`:89-97`).
- Textos de decoração (`SYS://`, `ID://`): `600 10px/1 "Rajdhani", monospace` (`:145`, `:188`);
  rodapé 9px (`:207`).
- `edgeheart.css` não define fonte; herda (no tema, Rajdhani; fora do tema, a do sistema).
- Sistema (referência): Cinzel (títulos), Montserrat (corpo), Overpass (descrição), em
  `styles/less/utils/fonts.less:138-150`.

### 1.4 Tamanhos

Tema: título de seção de atalhos 20px (`theme.css:111`), Esperança 15px (`:174`), decoração 9–10px.
Componentes (`edgeheart.css`): valor de stat 24px (`:58`), contagem de Edge 20px (`:207`), rótulo
11px caixa alta (`:59`), chips/custos 11–12px (`:68-69, :131, :144`), pips de Humanidade 8×8 (`:64`),
pips de Edge 34×34 círculo com ícone 16px (`:201-205`), imagens de cyberware 26×26 (`:123`) e de
Eidolon 40×40 (`:237`), stat com `min-height: 72px` (`:56`).

### 1.5 Bordas, cantos e sombras

- **Canto chanfrado** (assinatura do tema): `clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px),
  calc(100% - 6px) 100%, 0 100%, 0 6px)` em Esperança, domínios, limiares, valores de status, selo,
  marca de tier (`:117-120`), aba ativa (`:158`); 5px nos botões de feature (`:168`). `border-radius: 0`.
- **Seção com cantoneira e código**: `fieldset.drop-section` com borda 1px, cantoneira de 14×14 com
  3px amarelos no canto superior esquerdo (`::before`, `:129-137`) e o texto `SYS://01`, `SYS://02`…
  no canto superior direito (`::after` com `counter`, `:138-149`); fundo `linear-gradient(180deg,
  amarelo .045, transparent 60%)` (`:126`).
- **Janela**: borda 1px amarela e `box-shadow: 0 0 0 1px #000, 0 0 22px amarelo/.22` (`:54-55`);
  psicose `28px /.45` (`:66`). Botões do cabeçalho com borda amarela e canto reto (`:82-86`).
- **Sidebar**: borda direita amarela, `inset -6px 0 12px -8px amarelo/.5` (`:77-81`).
- **Glow**: título `0 0 10px /.35`; títulos de seção `0 0 8px` (`:113`); Esperança cheia `0 0 6px /.6`
  (`:176`); hover do botão de feature `0 0 10px vermelho/.6` (`:170`).
- Componentes (`edgeheart.css`) usam **cantos arredondados** (4–6px, pílulas 999px, pips 50%), que
  destoam do tema chanfrado.

### 1.6 Fundos, gradientes e efeitos

- **Fundo da janela** (`theme.css:70-76`): scanlines horizontais `repeating-linear-gradient(0deg,
  branco/.018 0 1px, transparent 1px 3px)` + grade de 28px em amarelo/.035 + `--eh-bg`.
- **Sidebar**: `linear-gradient(180deg, amarelo/.05, transparent 30%), --eh-panel` (`:78`).
- **Código de barras**: `.eh-barcode`, `repeating-linear-gradient(90deg, …)` amarelo/.75 (`:196-199`).
- **Decoração** criada por JS (`edgeheart-character.js:579-595`): no retrato, `ID://XXXX-YY`,
  `SYS://ONLINE`, `USR://<CLASSE>` + código de barras (`.eh-deco-id`, `theme.css:184-195`); no rodapé
  da janela, código de barras + `CHAR://NODE` / `SYS://ONLINE` (ou `SYS://BREACH` em psicose)
  (`.eh-deco-foot`, `:200-214`).
- **Glitch** (modo `full`): camada `.eh-glitch` com riscos e faixas em pontos aleatórios perto das
  bordas, `mix-blend-mode: screen`, animação `eh-g-flash` (`theme.css:217-243`); rajada a cada
  ~0,7–1,4 s (psicose ~0,15–0,3 s) (`edgeheart-character.js:598-635`).
- **Título RGB** (`eh-title-rgb`, 7 s; 2,2 s em psicose, `theme.css:246-253`).
- **Pulso da psicose** (`eh-psycho-pulse` 1,6 s, borda pulsando, `inset 0 0 60px` vermelho,
  `:256-266`).
- `prefers-reduced-motion: reduce` desliga glitch e animações (`:268-272`).
- Setting `sheetFx` (cliente): `full` "Theme with animated glitches" / "Tema com glitch animado",
  `static` "Theme without animation" / "Tema sem animação", `off` "Original Daggerheart look" /
  "Visual original do Daggerheart" (`edgeheart-character.js:1202-1208`).

### 1.7 Ícones (Font Awesome 6, `fa-solid`, o do Foundry)

| Onde | Ícones |
|---|---|
| Selo do cabeçalho | `fa-heart-pulse` (Humanidade), `fa-gear` (Carga), ícone da escolha: `fa-gears` (Atributo Calibrado), `fa-star` (Public Persona), padrão `fa-list-check` (`edgeheart-character.js:730-731`; `main.js:1340`, `:1631`) |
| Aba Chrome | `fa-heart-pulse`, `fa-plus-minus`, `fa-anchor`, `fa-shield-halved`, `fa-brain`, `fa-skull`, `fa-hand-holding-heart`, `fa-power-off`, `fa-dice`, `fa-arrow-up`, `fa-arrow-down`, `fa-microchip`, `fa-plus`, `fa-gun`, `fa-network-wired`, `fa-trash`, `fa-robot`, `fa-plug-circle-xmark`, `fa-plug-circle-bolt`, `fa-screwdriver-wrench`, `fa-circle-info`, `fa-triangle-exclamation`, `fa-circle-question` (`templates/chrome-tab.hbs`) |
| Aba Crew | `fa-bolt`, `fa-circle-plus`, `fa-people-group`, `fa-id-card`, `fa-circle-question`; movimentos `fa-handshake`, `fa-people-arrows`, `fa-person-running`, `fa-route`, `fa-fire` (`edgeheart-crew.js:24-31`) |
| Cards de chat da Crew | `fa-heart`, `fa-person-walking-arrow-right`, `fa-dice`, `fa-skull`, `fa-bolt`, `fa-box-open` (`edgeheart-crew.js:208-234`) |
| Esperança no tema | o glifo é trocado para `\f2db` (`fa-microchip`) por CSS (`theme.css:175`) |
| Botão no diretório de Atores | `fa-microchip` (`edgeheart-character.js:1398`) |

### 1.8 Imagens de `assets/` ligadas à interface

- Efeito de Ciberpsicose: `assets/cpr/status/beserker_addiction.svg` (`edgeheart-character.js:15`).
- Item "Acessos Cibernéticos": `assets/cpr/cyberware/interface_plugs.svg` (`:379`).
- Suprimento da Crew: `assets/cpr/gear/carryall.svg` (`edgeheart-crew.js:49`).
- Ícones das Competências: `assets/icons/competency-*.png`; arte das cartas
  `assets/art/competencies/*.webp` (`main.js:2790-2802`).
- Cena de abertura: `assets/art/scenes/edgeheart-start.jpg`, fundo `#140e1f` (`main.js:5067-5071`).
- Na ficha aparecem as imagens dos próprios itens (cyberware, Eidolons), não há imagem de moldura.
- **Candidatos para a barra de Medo** já no módulo (não usados na interface hoje):
  `assets/cpr/dlc/cyberware/cyberskull.svg` (caveira cyber), `assets/cpr/programs/worm.svg` (vírus),
  `assets/cpr/default/default-demon.svg`, `assets/cpr/netrunning/Demon.png`,
  `assets/cpr/netrunning/Black_Ice.png`. Licença/origem dos `cpr/` não foi conferida aqui.

---

## 2. Telas, menus e diálogos do módulo

Legenda de design: **sim** = tema Edgeheart completo; **parcial** = componentes do módulo
(`edgeheart.css`) sem o tema amarelo; **não** = padrão do Foundry/sistema.

| # | Tela | Arquivo(s) | Design |
|---|---|---|---|
| 2.1 | Ficha Edgeheart (personagem) | `edgeheart-character.js:651-785`, `templates/chrome-tab.hbs`, os dois CSS | sim |
| 2.2 | Ficha da Crew (Grupo) | `edgeheart-crew.js:378-431`, `templates/crew-tab.hbs`, `edgeheart.css:196-231` | parcial |
| 2.3 | Diálogos do módulo (DialogV2) | ver 2.3.x | não |
| 2.4 | Cards de chat | `edgeheart.css:177-182, 228-231` | parcial |
| 2.5 | Level Up (janela do sistema) | sistema; o módulo só filtra o Item Browser e as opções | não |
| 2.6 | Item Browser (filtros) | `edgeheart-browser-filters.js`, `edgeheart-character.js:1408-1436` | não (só esconde linhas) |
| 2.7 | Criação de personagem (sistema) | `edgeheart-character.js:1438-1468` | não (só troca a lista de atributos sugeridos) |
| 2.8 | Botão no diretório de Atores | `edgeheart-character.js:1392-1406`, `edgeheart.css:185` | não |
| 2.9 | Configurações do módulo | `edgeheart-character.js:1189-1210`, `edgeheart-browser-filters.js:128-135` | não (tela padrão do Foundry) |
| 2.10 | Barra de progresso do build | `main.js:5030-5061` (`ui.notifications` com `progress`) | não |
| 2.11 | Pastas dos compêndios | `edgeheart.css:243-247` (sombra no nome) | ajuste mínimo |

### 2.1 Ficha Edgeheart

- Classe `EdgeheartCharacterSheet extends game.system.api.applications.sheets.actors.Character`,
  `classes: ["edgeheart-sheet"]` (`edgeheart-character.js:654-656`). O sistema já põe
  `daggerheart`, `dh-style`, `character` (`character-sheet.mjs:21` [V]).
- Rótulo: "Edgeheart Sheet" / "Ficha Edgeheart".
- **Abas** (`:682-691`): `features` (Features) → **Chrome** (nova, rótulo fixo "Chrome") →
  `loadout`, `inventory`, `biography`, `effects` do sistema (`character-sheet.mjs:161` [V]).
- **Cabeçalho** (do sistema, retemado) + **selo** `a.eh-header-badge` depois da seção de recursos
  (`:720-735`): `♥ d6 | ⚙ 3 | ⚙⚙ Agility | ★ Feared` e, se for o caso, `CYBERPSYCHOSIS`/`CIBERPSICOSE`
  ou `LOST`/`PERDIDO` em vermelho. Clique abre a aba Chrome. Borda ciano arredondada fora do tema;
  com tema, chanfrado (`theme.css:117`).
- **Sidebar, Esperança, atributos, limiares, features**: estrutura do sistema; o tema muda cores,
  fontes, chanfros, cantoneira `SYS://NN` em cada `fieldset.drop-section`, botões de feature vermelhos.
- **Decoração**: `ID://…` no retrato, código de barras e `CHAR://NODE` no rodapé, glitch.
- **Aba Chrome** (`templates/chrome-tab.hbs`), coluna com `gap 8px`:
  1. **fieldset "Humanity / Humanidade"** (`:6-80`), ícone `fa-heart-pulse`. Grade de 4 colunas:
     - `d6` grande + rótulo "Humanity/Humanidade" + 5 pips (d4…d12; atual em ciano com glow);
     - número da Carga + "Cyber Load/Carga Cibernética" + campo `±` de modificador (editável);
     - `NN%` colorido (verde ≥70, laranja ≥40, vermelho) + "Control/Controle" + ícones âncora/escudo;
     - pílula de estado "Stable/Estável", "Cyberpsychosis/Ciberpsicose", "Lost/Perdido".
     - Alertas: "In Cyberpsychosis/Em Ciberpsicose" (`fa-brain`) + texto; "Lost to
       Cyberpsychosis/Perdido para a Ciberpsicose" (`fa-skull`) + "Death Move: Cyberpsycho./Movimento
       de Morte: Cyberpsycho."
     - Botões (linha): principal "Humanity Roll/Rolagem de Humanidade" (`fa-dice`) ou, em psicose,
       "Stabilize/Estabilizar" (`fa-hand-holding-heart`) + `fa-power-off` só do mestre; depois
       `fa-arrow-up` (avançar) e `fa-arrow-down` (reduzir), quadrados de 34px.
  2. **fieldset "Cyberware"** (`:83-112`) com contador e `+` na legenda (abre o compêndio). Linhas:
     imagem 26px, nome (link), chips `T1`, `fa-gun` (weaponware), `fa-network-wired` (acesso), botão
     laranja "Choose/Escolher" se pendente, custo em caixa ciano, lixeira. Vazio: "No cyberware. Click
     + and drag an item onto the sheet." / "Nenhum cyberware. Clique em + e arraste um item para a ficha."
  3. **fieldset "Eidolons"** (`:115-151`, só se houver) com "+N Load/+N Carga" na legenda. Linha:
     imagem 40px, nome, "Sync · HP x/y · Evasion · Thresholds · Armor" / "Sincronia · PV · Evasão ·
     Limiares · Armadura", link de Competência, pílula "Synced/Sincronizado" ou "Overclock",
     "Disabled/Inutilizado"; coluna de ações: checkbox "Soul Bond", "Mobilize/Mobilizar" ou
     "Unsync/Dessincronizar", consertar (`fa-screwdriver-wrench`), lixeira.
  4. **fieldset "Competencies/Competências"** (`:153-175`): chips "Network *Full*" / "*Total*",
     "*Half*"/"*Meio*", "*1 card*"/"*1 carta*"; alerta laranja de bloqueio; alerta "Cards outside
     your access/Cartas fora do acesso" com lista.
  5. `details` "How it works/Como funciona" com 6 itens de ajuda (`:177-187`).

### 2.2 Ficha da Crew

- `EdgeheartCrewSheet extends …actors.Party`, `classes: ["edgeheart-sheet", "edgeheart-crew"]`
  (`edgeheart-crew.js:381-388`). Rótulo "Crew Sheet" / "Ficha da Crew".
- Abas: **Crew** (nova, inicial) → `partyMembers`, `inventory`, `notes` do sistema
  (`:397-403`; `party-sheet.mjs:71` [V]). Cabeçalho do sistema.
- **Aba Crew** (`templates/crew-tab.hbs`):
  1. fieldset **"Edge"** (`fa-bolt`): 3 pips redondos de 34px com raio (`fa-bolt`), cheios em ciano
     com glow; "N / 3"; `details` "Once per scene, the Crew gains 1 Edge when…" / "Uma vez por cena, a
     Crew ganha 1 Edge quando…" com 4 itens.
  2. fieldset **"Edge Moves/Movimentos de Edge"** (`fa-people-group`) + selo "Crew agrees/Crew
     concorda". Cartões: ícone, nome (Teamwork, Back Me Up, Get Them Out, Plan B, All In), pílula
     "N Edge", botão "Spend/Gastar" ou "Announce/Anunciar" (custo 0); texto; Plan B lista as 4
     contingências (Hidden Cache, Inside Access, Sabotage Package, Escape Vector). Sem Edge: opacidade .6.
  3. fieldset **"Crew"** (`fa-id-card`) + selo "Tier N": grade 2 colunas com campos de texto
     "Reputation/Reputação +N" (largura total, placeholder "Never Leave Anyone Behind"),
     "Code/Código", "Fixer", "Base".
  4. `details` "How it works/Como funciona" com 6 itens.

### 2.3 Diálogos do módulo

Todos são `foundry.applications.api.DialogV2` (`confirm`, `input` ou `wait`) com HTML simples; **sem
classe própria** e sem tema. Para estilizar, hoje não há seletor: precisaria passar `classes:
["edgeheart-dialog"]` nas opções (API do DialogV2, a conferir na Spec).

| Diálogo | Onde | Título (en / pt-BR) | Conteúdo e botões |
|---|---|---|---|
| Buffer Cortical | `edgeheart-character.js:263-266` | "Cortical Buffer" / "Buffer Cortical" | "Humanity Roll: **X** vs Load **Y**. Mark 1 Stress to add +1 and stay in control?" / "…Marcar 1 Estresse para somar +1 e manter o controle?"; Sim/Não do Foundry |
| Escolha de cyberware: atributo | `:454-460` | "<Cyberware>: choose the trait" / "escolha o atributo" | `select` "Trait/Atributo" (6 atributos); OK |
| … Experiência / Arquivo Neural | `:462-483` | "…: choose the Experience" / "escolha a Experiência" | `select` "Experience/Experiência" (com "New Experience (+2)/Nova Experiência (+2)") + texto "Name of the new Experience/Nome da nova Experiência" |
| … Competência | `:485-496` | "…: choose the Competency" / "escolha a Competência" | `select` "Competency/Competência" (9) + `select` "Access/Acesso": "Cost 1: Card Access", "Cost 2: Half Access", "Cost 3: Full Access" / "Custo 1: Acesso de Carta"… |
| … Tactical Mesh | `:498-503` | idem | `select` "Half Access to/Meio Acesso a" Aegis/Influence |
| Escolha de feature (Pick) | `:935-949` | título do item: "Atributo Calibrado", "Public Persona" (`main.js:1340`, `:1631`) | texto do prompt + um botão por opção (ex.: Beloved, Feared, Famous) |
| Sincronizar sem Soul Bond | `:1034-1039` | "Sync without Soul Bond" / "Sincronizar sem Soul Bond" | texto (`lang/en.json:148`); Sim/Não |
| Eidolon inutilizado | `:1135-1140` | "<Item> is Disabled" / "<Item> está Inutilizado" | texto com 3 itens (`lang/en.json:162`); botões fixos "Stay Inside", "Hard Disconnect", "Emergency Overclock" |
| Confirmar Movimento de Edge | `edgeheart-crew.js:135-138` | "<Move>: N Edge" | "Does the Crew agree to spend **N Edge** on **Move**?" / "A Crew concorda em gastar…"; Sim/Não |
| Contingência do Plan B | `edgeheart-crew.js:195-204` | "Plan B: choose the contingency" / "escolha a contingência" | texto + lista; 4 botões; largura 480 |
| Back Me Up: atributo | `edgeheart-crew.js:253-261` | "Back Me Up: reaction trait" / "atributo da reação" | "Which trait does the character use to save the situation?"; 6 botões de atributo; largura 420 |
| All In | `edgeheart-crew.js:149-156` | — | abre o `TagTeamDialog` **do sistema** sem custo de Esperança (não é diálogo do módulo) |

Kill Chain, Cover e Veículos **não têm diálogo**: agem por hooks de ação e mensagens de chat
(`edgeheart-character.js:795-896`; `edgeheart-crew.js:538-590`). A Rolagem de Humanidade também não
tem diálogo de configuração: rola direto e manda o card (`:250-294`).

### 2.4 Cards de chat

`div.eh-chat` com `h3` de título, linha de cálculo, notas em itálico e `p.eh-outcome` verde (`.eh-ok`)
ou vermelho (`.eh-bad`) (`edgeheart-character.js:283-289`). Crew: `div.eh-chat.eh-crew-chat` com ícone,
nome, pílula "N Edge" e `.eh-card-buttons` de largura total (`edgeheart-crew.js:237`). Botão
"Stabilize (an ally spends 1 Hope)" no card de psicose (`:310-313`). O tema amarelo **não** chega ao chat.

### 2.6 Item Browser

Janela do sistema (`ItemBrowser`, classe `compendium-browser`). O módulo só põe classes em linhas
`.item-container`: `eh-hidden` (criação Edgeheart, só itens do módulo), `eh-hidden-owned` (Level Up,
cartas já possuídas), `eh-hidden-gear` (setting `gearFilter`), todas `display: none !important`
(`edgeheart.css:187-194`). Nenhum elemento visual novo.

### 2.9 Configurações

| Setting | Escopo | Tipo | Rótulo en / pt-BR |
|---|---|---|---|
| `defaultSheet` | mundo | Boolean | "New actors use the Edgeheart sheets" / "Atores novos usam as fichas do Edgeheart" |
| `edgeheartLevelup` | mundo | Boolean | "Edgeheart Level Up" / "Level Up do Edgeheart" |
| `sheetFx` | cliente | 3 opções | "Edgeheart Sheet Look" / "Visual da Ficha Edgeheart" |
| `gearFilter` | mundo | Boolean | "Hide non-Edgeheart gear" / "Ocultar equipamento que não é do Edgeheart" |

Ocultas: `levelTiersBackup`, `levelupApplied` (`edgeheart-character.js:1209-1210`),
`startSceneCreated` (`main.js:5074`). Não há `registerMenu` (nenhuma janela de configuração própria).

---

## 3. Level Up

### 3.1 Janela do sistema [V]

- Classe `DhCharacterLevelUp` (`module/applications/levelup/characterLevelup.mjs:5`), base `DhlevelUp`
  (`levelup.mjs:5`), `HandlebarsApplicationMixin(ApplicationV2)`. Exportada como
  `game.system.api.applications.levelup.CharacterLevelup`. Hooks automáticos: `renderDhCharacterLevelUp`,
  `closeDhCharacterLevelUp`, `renderDhlevelUp`.
- `DEFAULT_OPTIONS` (`levelup.mjs:19-42`): `tag: "form"`, `classes: ["daggerheart", "dialog",
  "dh-style", "levelup"]`, largura 1000, altura auto, redimensionável, ícone `fa-solid fa-arrow-turn-up`.
  Título "{actor} Level Up". Formulário com `submitOnChange`.
- Abre pelo botão `button.level-button.glow[data-action=levelManagement]` (`fa-angles-up`, tooltip
  "Level Up") no cabeçalho da ficha, que só aparece com `levelData.canLevelUp`
  (`templates/sheets/actors/character/header.hbs:23-30`; `character-sheet.mjs:801-810`). Como a Ficha
  Edgeheart herda, o botão é o mesmo.
- **PARTS** (`levelup.mjs:44-55`): `tabs`, `advancements`, `selections`, `summary`, `footer`
  (templates em `templates/levelup/tabs/*.hbs`).
- **Passos (abas)**:
  1. **"Level Advancement"** (`advancements.hbs`): um `fieldset.tier-container` por Tier (inativo com
     opacidade .4), legenda com o nome do Tier; em cada um, uma linha por opção: grupo de checkboxes
     (`input.selection-checkbox`; opções de custo 2 agrupadas em `.multi` com borda) + texto da opção
     em itálico 12px. A aba mostra o contador "selecionadas/máximo".
  2. **"Advancement Choices"** (`selections.hbs`): nova Experiência (campos de texto), atributos a
     aumentar e Experiências a aumentar (campos tagify), seções de Multiclasse, **Domain Cards**
     (prévia da carta; o botão abre o Item Browser e a carta entra por arrastar) e Subclasse.
  3. **"Summary"** (`summary.hbs`): "Level Achievements" (proficiência, limiares Maior/Grave, cartas,
     Experiências) e "Level Advancements" (linhas `antigo → novo`).
  - Rodapé (`footer.hbs`): "Return To Levelup", "To Level {n}" (anterior/próximo), "To Summary",
    "Finish Levelup" (desabilitado até tudo escolhido). Com automação de Level Up desligada:
    "Cancel"/"Save".
- **Visual**: fundo de pergaminho escuro `dh-parchment-dark.png` nos Tiers, legendas 1,375rem negrito,
  rodapé com botões de 40px (`styles/less/dialog/level-up/*.less`); diálogo genérico em
  `styles/less/global/dialog.less:5-29`, fonte Montserrat.
- **Opções padrão** (setting de mundo `LevelTiers`, `module/data/levelTier.mjs:202-430`; 2 escolhas
  por nível): marcações por Tier 2 / 3 / 4:
  trait 3/3/3, hitPoint 2/2/2, stress 2/2/2, experience 1/1/1, domainCard 1/1/1, evasion 1/1/1,
  subclass —/1/1, proficiency —/2/2 (custo 2), multiclass —/2/2 (custo 2). A cada nível também
  entra uma carta de domínio (`domainCardByLevel`) e, ao abrir Tier, Experiência +2 e Proficiência +1
  (`initialAchievements`).
- Grava em `actor.system.levelData` (`module/data/levelData.mjs`) por `actor.levelUp(...)`
  (`module/documents/actor.mjs:476`).

### 3.2 O que o módulo já faz no Level Up

1. **Opções do Edgeheart** (setting `edgeheartLevelup`, padrão ligado;
   `edgeheart-character.js:389-440`). **Sem hook de render**: troca a setting `LevelTiers` do sistema
   (caminho de homebrew oficial) no `ready`, pelo mestre ativo (`:1234-1236`), guardando a original
   em `levelTiersBackup` e restaurando ao desligar. Remove `trait`, `hitPoint`, `stress`, `evasion`,
   `multiclass` (`:397`) e sobe Experiência e Carta extra para 3/3 no Tier 2 e 2/2 nos Tiers 3–4
   (`:398-402`). Ficam: experience, domainCard, subclass, proficiency. O +1 automático dos limiares
   por nível continua (não é opção).
2. **LVL-01** (`edgeheart-browser-filters.js:14-76`): hooks `renderItemBrowser`,
   `renderDhCharacterLevelUp` e `closeDhCharacterLevelUp`. Com uma janela de Level Up aberta, o Item
   Browser esconde as cartas que o personagem já tem ou já escolheu (`eh-hidden-owned`).
3. **Acessos Cibernéticos** (`:339-387`): item de classe multiclasse criado pelo módulo; depende de
   `levelupAuto` do sistema (`:361`, `:372`).
4. **Humanidade**: **não** está no Level Up. O avanço é o botão `↑` da aba Chrome, limitado a um por
   nível pela flag `humanityAdvancedAt` (`:156`, `:211-231`); o mestre ignora o limite.

### 3.3 Regras do PDF sobre avanço

| Regra | Fonte (diário) | PDF | No módulo |
|---|---|---|---|
| Subir de nível/Tier **não dá mais** as opções de PV, Estresse, Evasão, **Limiares de Dano** e Atributos; essas melhorias vêm do Cyberware. Continuam: cartas de Competência mais fortes, features de classe/subclasse, opções de Tier mais alto. | `journals/campaign-frame/02-visao-geral.html` ("Avanço de personagem e cyberware"); en: `journals/en/campaign-frame/02-visao-geral.html` | Overview (4–7) | sim, salvo os Limiares (ver Q2) |
| "Cyberware replaces part of the normal advancement structure… still gain class features, Competency card options, Experiences, and narrative growth as normal." | `journals/en/srd/26-cyberware.html` ("Cyberware Character Advancement"); pt `journals/srd/26-cyberware.html` | 41 | sim (Experiência e carta ficam) |
| Tiers de cyberware: T1 custo 0–1, T2 1–2 (PV, Estresse, Evasão, Armadura, Atributos, Meio Acesso), T3 2–3 (Acesso Total), T4 3+ | idem | 41–42 | flag `tier` e chip na aba Chrome; **o Level Up não oferece cyberware** |
| Acesso a Competências por cyberware, Eidolon, licença, evento ou "GM-approved advancement"; Meio Acesso = metade do nível (para cima), Total = até o nível | `journals/en/srd/03-classes.html`; `journals/en/srd/50-competencias.html` | 10, 65 | `Humanity.access`, `AccessClass` |
| Dado de Humanidade começa em d6; avança **só uma vez por nível** (d4→d6→d8→d10→d12) quando há vínculo, objetivo, recuperação ou esperança genuína | `journals/en/srd/32-mecanicas.html`; pt `journals/srd/32-mecanicas.html` | 51 | botão na aba Chrome, fora do Level Up |
| Multiclasse | o PDF não fala; o módulo remove porque os Acessos Cibernéticos ocupam o espaço (`edgeheart-character.js:392-394`) | — | decisão do módulo |

---

## 4. Barra de Medo

### 4.1 No sistema [V]

- Classe **`FearTracker`** (`module/applications/ui/fearTracker.mjs:13`), ApplicationV2 sem moldura
  (`window.frame: false`), exportada como `DhFearTracker` e registrada em `CONFIG.ui.resources`
  (`daggerheart.mjs:115`); instância `ui.resources`, criada no `ready` (`:374-375`).
- `id: "resources"`, `classes: ["daggerheart", "dh-style", "fear-tracker"]`, largura 540
  (`fearTracker.mjs:27-46`). Template `templates/ui/fearTracker.hbs`. Hook automático:
  **`renderFearTracker`** (nome da classe, não do alias).
- DOM: `#resource-fear.fear-tracker[.isGM]`.
  - Modo **tokens** (padrão): `.fear-tokens > a.fear-token[.inactive][data-action=setFear]`, cada
    um com `style="filter: hue-rotate(calc((i/max)*75deg))"` (`fearTracker.hbs:17`) e
    `<i class="fear-token fas fa-skull">` (`:20`): **a caveira é fixa no template**.
  - Modo **barra**: `.resource-bar.fear-bar` com `--fear-percent`, `progress.progress-bar.stress-color`
    e `h4.label` "atual / máx"; GM tem `.controls` com `fa-minus`/`fa-plus` (`:26` em diante).
  - Modo livre: `.fear-header` com alça `fa-grip-vertical` e título; `a.resize-handle`.
- Estilo: `styles/less/ui/resources/resources.less`: fundo de pergaminho com `::before`,
  `backdrop-filter: blur(5px)`; token 2,5rem redondo, borda `1.5px double`, fundo
  `--primary-color-fear: rgba(9, 71, 179, .75)` (`colors.less:86`), inativo em cinza com opacidade .5;
  barra de 30px com gradiente `rgba(2,0,38,1) → rgba(199,1,252,1)`; hover do GM `0 0 8px` cor do Medo.
- Settings: `appearance.displayFear` = `token` / `bar` / `hide` e `appearance.fearPosition` = `free`,
  `topCenter`, `bottomCenter`, `rightTop`, `leftBottom` (`module/data/settings/Appearance.mjs:9-18`;
  `generalConfig.mjs:819-831`); `homebrew.maxFear` (padrão 12, `Homebrew.mjs:63-69`). Valor atual na
  setting de mundo `ResourcesFear`. **Não há** setting nem `CONFIG` para trocar o ícone ou a arte do Medo.

### 4.2 Pode reestilizar sem quebrar a regra 1?

**Sim, por CSS do módulo e pelo hook `renderFearTracker`**, sem tocar no sistema:
- CSS escopado em `#resources.fear-tracker` / `.fear-token` / `.fear-bar` (fundo, bordas, cores, glow,
  scanline, animação). Para não mudar a mesa de quem não quer, o certo é condicionar a uma classe que o
  módulo põe no elemento no hook (ex.: `eh-fear`) e a uma setting de cliente/mundo [I].
- Trocar a caveira: CSS (`.fear-token i::before { content: … }` com outro glifo do Font Awesome, ou
  esconder o `<i>` e usar `background-image` com um SVG de `assets/`) ou trocar o `<i>` no hook. O
  `hue-rotate` inline de cada token continua lá e muda o tom; o CSS pode anular com `filter: none
  !important` ou aproveitar.
- O elemento é re-renderizado a cada mudança de Medo (onChange da setting), então mudança de DOM tem
  de ser feita **em todo** `renderFearTracker` (igual aos filtros do Item Browser).
- Caso em aberto: substituir `CONFIG.ui.resources` por uma subclasse do módulo. Não é monkey-patch e
  usa API do Foundry, mas troca a classe do sistema. Fica como **pergunta Q4**, não como recomendação.

### 4.3 Medo no módulo hoje

Nenhuma interface. Só regras: Ciberpsicose usa d20 como Dado de Medo e tira o Dado de Esperança
(`edgeheart-character.js:300-305`, `:1228-1232`); rolar com Medo com Estresse cheio ou sem Esperança
dispara a Rolagem de Humanidade (`:1309-1322`); o botão "Restore the system (2 Fear)" do Sabotage
Package gasta 2 de Medo pela setting do sistema (`edgeheart-crew.js:286-292`); ações de adversários e
cartas com custo `fear` (`main.js:3094-3098`, `:2221`).

---

## 5. Viabilidade (uma linha por tela)

| Tela | Como restilizar | Permitido? |
|---|---|---|
| Ficha Edgeheart | já tem tema; ajustes no CSS do módulo | sim |
| Ficha da Crew | aplicar `eh-theme` na Ficha da Crew (ela é do módulo) e reaproveitar o tema | sim |
| Componentes Chrome/Crew (`edgeheart.css`) | alinhar cores/cantos ao tema dentro de `.eh-theme` | sim |
| Diálogos DialogV2 do módulo | passar `classes: ["edgeheart-dialog"]` (ou similar) nas chamadas e escrever CSS escopado; o conteúdo HTML é do módulo | sim |
| Cards de chat do módulo | CSS em `.eh-chat` (o HTML é do módulo) | sim |
| Level Up (`DhCharacterLevelUp`) | CSS escopado em `.application.levelup` + classe posta no `renderDhCharacterLevelUp` só para personagem Edgeheart (`app.actor`) [I]; mudar textos e passos exige DOM no hook | sim por CSS/hook; trocar template, PARTS ou a classe do sistema: **não** |
| Barra de Medo (`FearTracker`) | CSS escopado + `renderFearTracker` | sim; editar `fearTracker.hbs`/LESS do sistema: **não** |
| Item Browser | CSS/hook já usados | sim |
| Criação de personagem | CSS escopado + `renderDhCharacterCreation` | sim |
| TagTeamDialog (All In) | CSS escopado + `renderTagTeamDialog` [I, nome da classe não conferido] | sim por CSS/hook |
| Configurações | só a tela padrão do Foundry; tela própria exigiria `registerMenu` com app do módulo | sim (app nova do módulo) |
| Qualquer coisa que exija copiar template/LESS do sistema, sobrescrever método de protótipo do sistema ou importar `systems/daggerheart/module/...` | — | **não** (regra 1) |

Riscos comuns: os seletores do sistema (`.tier-container`, `.fear-token`, `.checkbox-grouping-coontainer`
com o erro de digitação do sistema) não são API e podem mudar a cada versão menor; cada versão nova
vira item de conferência (como em `daggerheart-sistema.md`). O tema depende do Google Fonts (sem rede,
cai no fallback).

---

## Perguntas

- **Q1.** O tema amarelo deve passar a valer fora da Ficha Edgeheart (Crew, diálogos, Level Up, chat)
  governado pela mesma setting `sheetFx`, ou por uma setting nova? E as cores ciano/verde de
  `edgeheart.css` ficam (Crew hoje é ciano) ou migram para o amarelo/vermelho do tema?
- **Q2.** O PDF tira também os **Limiares de Dano** do avanço; o módulo mantém o +1 automático por
  nível nos limiares (`edgeheart-character.js:390-393`). Isso fica como está ou entra no B-016?
- **Q3.** O avanço do Dado de Humanidade deve entrar como passo do Level Up (o PDF o liga a eventos
  narrativos, "uma vez por nível"), ou continua só no botão da aba Chrome com um lembrete na janela?
- **Q4.** Barra de Medo: restilizar só para a mesa inteira (setting de mundo) ou por usuário (cliente)?
  E vale trocar `CONFIG.ui.resources` por uma subclasse do módulo, ou fica restrito a CSS + hook
  (recomendação do Arquiteto: CSS + hook)?
- **Q5.** O Level Up deve oferecer cyberware (o PDF diz que as melhorias numéricas vêm dele), ou o
  cyberware continua vindo só por compra/recompensa, fora do Level Up?
- **Q6.** Fontes: manter o `@import` do Google Fonts ou empacotar Rajdhani/Chakra Petch em `assets/`
  (licença OFL, a conferir) para funcionar offline?
- **Q7.** Licença dos ícones `assets/cpr/` candidatos à barra de Medo (`cyberskull.svg`, `worm.svg`)
  não foi conferida neste inventário.
