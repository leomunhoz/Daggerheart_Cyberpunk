# 0009 — Janelas do sistema (Level Up e barra de Medo): só CSS escopado e hook de render
Status: Aceita (2026-11-02, gate do usuário, com as respostas Q1–Q8)
Data: 2026-11-02

## Contexto

O PRD `visual-e-levelup` pede o tema e painéis novos em duas janelas que são do Daggerheart:

- **Level Up**: `DhCharacterLevelUp` (`module/applications/levelup/characterLevelup.mjs:5`, base
  `levelup.mjs:5`), `HandlebarsApplicationMixin(ApplicationV2)`, `classes: ['daggerheart', 'dialog',
  'dh-style', 'levelup']`, PARTS `tabs`, `advancements`, `selections`, `summary`, `footer`
  (`levelup.mjs:19-55`), formulário com `submitOnChange` (re-renderiza a cada escolha).
- **Barra de Medo**: `FearTracker` (`module/applications/ui/fearTracker.mjs:13`), `id: 'resources'`,
  `window.frame: false`, PART `resources` com `root: true` (`:27-53`), registrada em
  `CONFIG.ui.resources` (`daggerheart.mjs:115`) e criada no `ready` (`:374-375`). Re-renderiza a cada
  mudança de Medo. A caveira (`fas fa-skull`) e o `hue-rotate` inline são fixos no template
  (`templates/ui/fearTracker.hbs:15-21`).

O Foundry dispara `render<NomeDaClasse>` em todo render, para a classe e as ancestrais, e
`close<NomeDaClasse>` ao fechar (Foundry 14.369, `client/applications/api/application.mjs:591-592,
1039-1040, 1674-1715`). O módulo já usa `renderDhCharacterLevelUp` e `closeDhCharacterLevelUp`
(`scripts/edgeheart-browser-filters.js:79-80`, LVL-01); a Spec `visual-e-levelup` usa só os hooks de render. Sistema conferido: 2.12.3 (`../daggerheart-src`,
branch `v14`).

Opções que existem e foram rejeitadas: trocar `CONFIG.ui.resources` por uma subclasse do módulo; herdar
`DhCharacterLevelUp` e abrir a classe do módulo no lugar da do sistema; copiar os templates do sistema.

## Decisão

1. **Só CSS escopado e hooks públicos.** As duas janelas mudam por:
   - uma classe do módulo posta no elemento no hook de render (`eh-levelup` no Level Up de personagem
     Edgeheart com a setting `edgeheartLevelup` ligada; `eh-fear` na barra com a setting **de mundo**
     `fearTheme` ligada, Q4);
   - CSS do módulo que exige essa classe e a chave do `<body>` da ADR 0008;
   - DOM **do módulo** acrescentado dentro da janela (painel lateral do Level Up, com o lembrete de
     Humanidade), sempre identificado por classe `eh-*`;
   - chamadas públicas do `ApplicationV2` na própria janela, só para posição (`setPosition({ width: 1240 })`
     na primeira marcação do Level Up Edgeheart, Q8).
   Template, LESS, PARTS, `DEFAULT_OPTIONS`, métodos e `CONFIG.ui.resources` do sistema não mudam.
2. **Idempotente a cada render.** Todo hook de render confere se o nó do módulo já existe e só o atualiza;
   nunca duplica. Nó do módulo fica fora das PARTS do sistema (filho direto de `.window-content` no Level
   Up), para o render parcial não apagá-lo. Se algum dia um nó precisar ficar dentro de uma PART, ele é
   recriado em todo render (a Spec atual não põe nada dentro das PARTS).
3. **Estado do módulo fora da instância do sistema.** Se o módulo precisar guardar algo sobre uma janela
   aberta, fica num `WeakMap` do módulo indexado pela janela; nada de propriedade nova no objeto do
   sistema. (Com a Q3 b, a Spec atual não guarda estado nenhum.)
4. **Leitura do objeto da janela: só o que já está documentado na Spec.** No Level Up: `app.actor`,
   `app.levelup.startLevel`, `app.levelup.endLevel`, `app.levelup.levels` (este já usado pelo LVL-01).
   Do ator, só para o botão do lembrete: `app.actor.sheet` (`render`, `changeTab("chrome", "primary")`).
   Na barra: `ui.resources`, `game.system.settings.homebrew.maxFear`,
   `game.system.settings.appearance.displayFear`. Campo novo exige emenda da Spec com o arquivo do sistema.
5. **O Level Up do módulo não grava nada** (Q3 b). O avanço da Humanidade fica na aba Chrome, depois do
   Level Up, pelo caminho que já existe (`Humanity.advance`). Uma gravação futura a partir do Level Up exige
   emenda desta ADR e, mesmo então, só em flags `edgeheart-cyberpunk.*` e só depois do `save` do sistema.
6. **Seletores do sistema usados pelo CSS são listados na Spec** (seção 2) e conferidos a cada versão
   menor do sistema, como em `docs/referencias/daggerheart-sistema.md`.
7. **Sem a classe do módulo, a janela é a do sistema.** Personagem não Edgeheart, setting desligada ou
   visual desligado: nenhuma regra nova vale (CA7, CA19).

## Consequências

- Uma versão do sistema que mude o DOM (ex.: `.tier-container`, `.fear-token`, `.fear-bar`) pode desfazer o
  visual sem dar erro; a lista da seção 2 da Spec é o roteiro de conferência.
- A Humanidade no Level Up é só um lembrete no painel lateral (não é aba do sistema nem passo que grava): o
  jogador ainda precisa ir à aba Chrome depois de terminar. O botão do lembrete leva até lá.
- A barra de Medo é igual para a mesa toda (setting de mundo); só a animação depende de cada cliente
  (`sheetFx`, ADR 0008 item 7).
- A caveira do sistema continua no DOM; o CSS a esconde e mostra o ícone do módulo. Sem o CSS (visual
  desligado), volta a do sistema.

## O que os agentes NÃO podem fazer

- Substituir `CONFIG.ui.resources`, registrar subclasse do Level Up no lugar da do sistema, ou sobrescrever
  método de protótipo de classe do sistema.
- Copiar ou editar `templates/levelup/**`, `templates/ui/fearTracker.hbs` ou LESS do sistema.
- Acrescentar aba ou botão à navegação (`nav.sheet-tabs`) ou ao rodapé do Level Up do sistema.
- Gravar no ator a partir do Level Up (nesta Spec, nada) ou fora das flags do módulo.
- Pôr nó do módulo dentro das PARTS do Level Up (ex.: linha no resumo) sem emenda da Spec.

## Revisão do gate (2026-11-02)

A ADR ainda não tinha sido aceita; o texto foi ajustado às respostas do usuário:
- Q3 (b): saem a linha de Humanidade no resumo (item 1/2), o `WeakMap` como uso atual (item 3 fica como regra
  geral) e a gravação no `closeDhCharacterLevelUp` (item 5 vira "não grava nada"); item 4 ganha
  `app.actor.sheet` para o botão do lembrete.
- Q4: a setting da barra é de **mundo**; decisão "só CSS + `renderFearTracker`" mantida como estava.
- Q8: item 1 permite `setPosition({ width: 1240 })` na primeira marcação.
- Escrever regra CSS para `.levelup` ou `#resources` sem a classe `eh-levelup`/`eh-fear`.
