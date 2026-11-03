# 0008 — Tema do módulo fora da ficha: classe própria, chave no `<body>` e CSS novo
Status: Aceita (2026-11-02, gate do usuário, com as respostas Q1–Q8)
Data: 2026-11-02

## Contexto

O tema cyberpunk (amarelo `#fcee0a`, vermelho `#ff2a4f`, preto `#060709`, Rajdhani/Chakra Petch,
cantos chanfrados, cantoneira `SYS://NN`) só existe em `styles/edgeheart-sheet-theme.css`, escopado em
`.edgeheart-sheet.eh-theme` (`:6`). Quem põe `eh-theme` é `SheetFx.apply`
(`scripts/edgeheart-character.js:565-577`), governado pela setting de cliente `sheetFx`.

O PRD `visual-e-levelup` (B-017, B-018, B-019) leva o tema a outras telas: diálogos do módulo
(`DialogV2`), Ficha da Crew, cards de chat, janela de Level Up e barra de Medo. O usuário decidiu que a
**Ficha Edgeheart não muda** (CA21). Fatos que pesam:

- `SheetFx.refreshAll` (`edgeheart-character.js:642-646`) aplica o `SheetFx` a **toda** janela com a
  classe `edgeheart-sheet`, e a Ficha da Crew também tem essa classe (`edgeheart-crew.js:383`). Usar
  `eh-theme` na Crew a deixaria presa ao `sheetFx` e à decoração da ficha de personagem.
- `styles/edgeheart.css` tem um segundo conjunto de cores (ciano/verde) e cantos arredondados, usado
  pela aba Chrome; mexer nele muda a ficha.
- Os diálogos não têm classe própria. A API do Foundry aceita `classes` nas opções de
  `DialogV2.confirm/input/wait` e concatena com `["dialog"]` (conferido no Foundry 14.369:
  `client/applications/api/application.mjs:459-477`, `dialog.mjs:167-169, 346-405`).
- Cards de chat já têm a classe do módulo `.eh-chat` (HTML do módulo).

## Decisão

1. **Arquivos novos, nada reescrito.** O tema fora da ficha mora em CSS novo
   (`styles/edgeheart-ui-theme.css`; Level Up e Medo em arquivos próprios) e em script novo
   (`scripts/edgeheart-ui-theme.js`). `edgeheart-sheet-theme.css`, `edgeheart.css` e a Ficha Edgeheart não
   mudam. No `SheetFx`, a **única** mudança permitida é o filtro de uma linha do item 8.
2. **Duas chaves de escopo, as duas obrigatórias em toda regra:**
   - uma **classe no `<body>`**, `eh-ui-on` (e `eh-ui-fx` para animação), posta por
     `scripts/edgeheart-ui-theme.js` no `ready` e no hook `clientSettingChanged` da `sheetFx` (item 3).
     Trocar a setting vale na hora, sem re-render;
   - uma **classe do módulo no elemento**: `.edgeheart-dialog` (diálogos), `.edgeheart-crew` (Ficha da
     Crew, já existe), `.eh-chat` (cards, já existe), `.eh-levelup` (Level Up, ADR 0009).
   Exemplo: `body.eh-ui-on .edgeheart-dialog .dialog-content { … }`. Regra sem as duas chaves é proibida.
   **Exceção: a barra de Medo** tem setting própria, **de mundo** (`fearTheme`, Q4), e o visual usa só a
   classe `.eh-fear`, que o hook põe em `#resources` conforme essa setting (ADR 0009). A animação dela segue
   o item 7 (exige `body.eh-ui-fx`, isto é, a `sheetFx` de cada um). As variáveis do item 4 também valem em
   `#resources.eh-fear`.
3. **A setting de cliente `sheetFx` (já existe) governa o tema fora da ficha** (Q1 a, gate de 2026-11-02);
   não há setting nova. `full` → `eh-ui-on` + `eh-ui-fx`; `static` → `eh-ui-on`; `off` → nenhuma. O
   **registro** da `sheetFx` (`edgeheart-character.js:1202-1208`: chave, `choices`, padrão, `onChange`) não
   muda: o script novo lê a setting no `ready` e escuta o hook público `clientSettingChanged(key, value)`,
   filtrando `key === "edgeheart-cyberpunk.sheetFx"` (Foundry 14.369: `client/helpers/client-settings.mjs:327-328`,
   disparado logo depois do `onChange`; `client/hooks.mjs:1448`). Só o **texto** do `Hint` da `sheetFx` muda,
   para dizer que ela vale também para as janelas do módulo.
4. **Tokens duplicados, não compartilhados.** As variáveis (`--eh-y`, `--eh-y-rgb`, `--eh-hot`,
   `--eh-hot-rgb`, `--eh-cyan`, `--eh-bg`, `--eh-panel`, `--eh-text`, `--eh-dim`) são declaradas de novo
   em `edgeheart-ui-theme.css`, só nos elementos do item 2, com os mesmos valores. Uma regra nova do
   `npm run check` confere que os valores são iguais aos de `edgeheart-sheet-theme.css`. Isso evita mudar o
   seletor do tema da ficha (CA21) e evita refatorar (ADR 0003).
5. **Diálogos:** cada chamada `DialogV2` do módulo ganha `classes: ["edgeheart-dialog"]` (o de Eidolon
   inutilizado, `["edgeheart-dialog", "eh-danger"]`). Só a opção é acrescentada; conteúdo, botões e
   retorno não mudam. Diálogo que não é do módulo nunca recebe a classe (CA12).
6. **Ciano e verde** ficam só como destaque e estado (Edge, custo; sucesso/falha), redefinidos dentro do
   escopo do item 2. O estado de sucesso/falha nunca depende só da cor (CA14).
7. **Movimento:** toda animação fica sob `body.eh-ui-fx` (inclusive a da barra de Medo) e é desligada por
   `@media (prefers-reduced-motion: reduce)`.
8. **A Ficha da Crew sai do `SheetFx.refreshAll`** (achado A1 da Spec, reavaliado no gate). Como a `sheetFx`
   passa a ligar o tema da Crew, trocar a setting com a Crew aberta deixaria nela o `eh-theme`, o rodapé
   `CHAR://NODE` e o glitch da ficha de personagem. O filtro de `refreshAll` (`edgeheart-character.js:644`)
   ganha `&& !app.element.classList.contains("edgeheart-crew")`. É a única linha do `SheetFx` que muda; a
   ficha de personagem não tem essa classe e se comporta igual (CA21).

## Consequências

- Os valores do tema existem em dois arquivos; a regra do `check` impede que se separem.
- A tela que ainda não tem a classe do módulo não fica temática por acidente: o tema só chega onde o
  módulo marca.
- Uma só chave para o visual: quem põe a `sheetFx` em `off` perde o tema na ficha **e** fora dela; não há
  como ter um sem o outro (escolha do gate). Como o padrão é `full`, o tema novo aparece para todos ao
  atualizar o módulo.
- A Ficha da Crew deixa de receber o `SheetFx` da ficha de personagem (item 8); o CSS da Crew não precisa
  conviver com `eh-theme`.
- Se uma versão futura do Foundry tirar o hook `clientSettingChanged`, o mínimo a tocar no registro da
  `sheetFx` é acrescentar uma chamada ao `onChange` existente (emenda desta ADR).
- Um terceiro script e um terceiro CSS entram no `module.json` (e no `module.zip`).

## O que os agentes NÃO podem fazer

- Mudar seletor, variável ou regra de `styles/edgeheart-sheet-theme.css` ou de `styles/edgeheart.css` para
  "reaproveitar" o tema.
- Escrever regra do tema novo sem a classe do `<body>` **e** a classe do módulo no elemento.
- Pôr `edgeheart-dialog` (ou qualquer classe do tema) em diálogo, janela ou elemento que não é do módulo,
  salvo os da ADR 0009.
- Mudar o registro da `sheetFx` (chave, `choices`, padrão, `onChange`) ou criar outra setting para o tema
  fora da ficha.
- Mexer no `SheetFx` além do filtro do item 8.

## Revisão do gate (2026-11-02)

A ADR ainda não tinha sido aceita; o texto foi ajustado às respostas do usuário:
- Q1 (a): item 3 trocado (de `uiTheme` nova para a `sheetFx` existente, pelo hook `clientSettingChanged`);
  item 2 aponta para o hook; a última proibição virou "não mudar o registro da `sheetFx`".
- A1: vira o item 8 (filtro da Crew no `refreshAll`), com a exceção no item 1; consequência antiga
  ("Crew pode receber `eh-theme`") substituída.
- Q4 (mundo): exceção do item 2 diz que a setting da barra é de mundo e que a animação dela segue o item 7.
