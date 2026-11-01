# CLAUDE.md

Módulo **Edgeheart - Cyberpunk Homebrew** (`edgeheart-cyberpunk`) para **Foundry VTT v14** e o
sistema **Daggerheart** (Foundryborne, ≥ 2.10). Adapta o PDF do Edgeheart (AllenDGray14) para o
Foundry, em inglês e português.

O repositório é do **Leo Munhoz** (`leomunhoz/Daggerheart_Cyberpunk`). Nós corrigimos bugs e
acrescentamos coisas **sem quebrar o que já existe**.

## Regras invioláveis

1. **Nada do sistema Daggerheart é modificado.** Use só o que ele expõe: hooks
   (`daggerheart.*` e `render<Classe>`), `CONFIG.DH`, `game.system.api` (fichas para herdar,
   modelos, diálogos) e as configurações de Homebrew. Não copie arquivos do sistema para cá, não
   faça monkey-patch de protótipo do sistema e não importe arquivos internos dele por caminho
   (`systems/daggerheart/module/...`). Referência: `docs/referencias/daggerheart-sistema.md`.
2. **Não edite o `README.md`.** Ele é do dono do repositório.
3. **Não refatore o código existente.** Cada mudança fica no escopo do ticket. Arrumar código
   vizinho "aproveitando" é proibido (ADR 0003).
4. **Não edite arquivos gerados à mão.** Eles saem do gerador `buildPacks()`, que roda dentro do
   Foundry:
   - `packs/**` (LevelDB dos compêndios);
   - `babele/pt-BR/**` (tradução escrita por `scripts/edgeheart-localize.js`).

   Para mudar conteúdo, mude a fonte (`scripts/main.js`, `data/*.json`, `journals/**`) e marque o
   ticket com **Rebuild: sim** (ADR 0005).
5. **IDs estáveis.** O `_id` dos documentos vem de `stableId(chave)` em `scripts/main.js`. Mudar
   a chave de um item existente troca o uuid e quebra personagens já criados (subclasse,
   cartas). Nunca renomeie chave existente; acrescente.
6. **Ações achadas por id.** As automações acham ações por `isAction(action, nomeOriginal)`,
   usando `flags.edgeheart-cyberpunk.actionIds`. Mudar o nome de origem (português no `main.js`)
   de uma ação automatizada quebra a automação. Se precisar mudar, troque também todas as
   referências e os mapas `*_ACTIONS`.
7. **Duas línguas sempre.** Texto de interface vai em `lang/en.json` **e** `lang/pt-BR.json`,
   sob `EDGEHEART.*`, pelo helper `t()`. Nada de texto de interface fixo no código.
8. **Não commite o PDF** (`assets/Edgeheart - The Homebrewery.pdf`) nem qualquer arquivo que não
   seja do ticket. Tudo dentro de `assets/` vai para o `module.zip` da release.
9. **Nunca mexa no que o dono publica:** tag, Release do GitHub, `.github/workflows/release.yml`
   e o campo `manifest`/`download` do `module.json` só mudam com pedido explícito do usuário.

## Como o módulo é montado

Mapa completo em `docs/mapa-do-codigo.md`. Resumo:

| Arquivo | Papel |
|---|---|
| `scripts/main.js` | Conteúdo em código (classes, cartas, armas, cyberware, adversários, diários) e o gerador `api.buildPacks()`; hooks de `ready` (Homebrew, pastas, cena inicial) |
| `scripts/edgeheart-character.js` | Ficha Edgeheart (herda a ficha do sistema), Humanidade, Ciberpsicose, cyberware, Eidolons, Kill Chain, Cover, Level Up |
| `scripts/edgeheart-crew.js` | Ficha da Crew (herda a ficha Party), Edge, Movimentos, veículos |
| `scripts/edgeheart-babele.js` | Mapeamentos do Babele (tradução dos compêndios) |
| `scripts/edgeheart-localize.js` | Último passo do gerador: base em inglês e `babele/pt-BR` |
| `templates/*.hbs`, `styles/*.css` | Abas Chrome e Crew; tema da ficha |
| `lang/`, `data/glossary-pt-BR.json`, `data/content-en.json` | Interface nas duas línguas; glossário e textos em inglês do conteúdo |

O conteúdo é escrito em **português** no `main.js`; o gerador grava a base em **inglês** e a
tradução pt-BR para o Babele. Os dados do módulo nos atores ficam em `flags["edgeheart-cyberpunk"]`.

## Verificação

Sem dependências (Node ≥ 22). Detalhes na ADR 0004.

```
npm run check    # nível 1: sintaxe, JSON, chaves de idioma, module.json, caminhos de arte
npm test         # nível 2: node --test com stub do Foundry (tests/helpers/foundry-stub.mjs)
npm run verify   # os dois; obrigatório antes de entregar qualquer ticket
```

O **nível 3** é a conferência no Foundry (roteiro manual escrito no ticket). Os agentes não têm
Foundry: o roteiro vai para a lista de conferências do PR e quem roda é o usuário.

`tools/`, `tests/`, `docs/`, `.claude/`, `package.json` e este arquivo não entram no `module.zip`
(o `release.yml` zipa só as pastas do módulo).

## Convenções de código (as que o código já segue)

- ES modules, sem build e sem dependências. `const MODULE_ID = "edgeheart-cyberpunk"` em cada arquivo.
- Comentários e nomes de conteúdo em português; nomes de classes, subclasses e features no
  original do PDF.
- Registro de settings, sheets e `CONFIG.queries` no `init`; leitura de `game.system.api` no
  `init` ou depois, nunca no topo do arquivo.
- Pedido do jogador ao mestre por `User#query` com nome `edgeheart-cyberpunk.<algo>`.
- Hooks de render recebem `HTMLElement` (ApplicationV2), não jQuery.
- Uma API nova do Foundry ou do sistema só entra depois de conferida na versão em uso
  (`docs/referencias/`). Não invente função.

## Git

- Mensagens e documentos em português.
- Commit de ticket: `<tipo>(<escopo>): <resumo> (<ticket>)`, tipos do Conventional Commits.
- Commit de versão, no padrão do dono: `vX.Y.Z: <resumo>`, com `module.json` (`version`) e
  `CHANGELOG.md` (mesmo estilo das entradas atuais).
- Nunca `--no-verify`, nunca force-push em branch compartilhada, nunca commit direto na `main`.

## Time de desenvolvimento

O time está em `docs/TIME.md` e o fluxo na ADR 0002. Os papéis são agentes em `.claude/agents/` e
rodam em **terminais próprios do Orca** (`claude --agent <papel>`), cada lote no seu worktree do
Orca.

**Subagente (Agent tool) só quando for necessário:** uma busca ampla e rápida em que só a conclusão
importa. Papel do time nunca roda como subagente.

A sessão principal é o **Controlador**:
- Faz a triagem e cuida do `docs/backlog.md`: escolhe a **via rápida** (bug ou ajuste pequeno) ou a
  **via completa** (feature nova).
- Abre cada papel no Orca com `/papel <papel> <pedido>` e acompanha pela orquestração do Orca até o
  `worker_done`: PRD → `criativo` (`/prd-feature`); Spec e ADR → `arquiteto`; ticket → `fabrica`
  (`/implementar`); revisão → `examinador` (`/revisao`); git → `devops` (`/commit`, `/lote`).
- Leva o **gate único** ao usuário (PRD + Spec + ADRs, perguntas Q1, Q2…, aprovação parcial
  permitida) e só depois cria as issues (`/issue`).
- Pede confirmação ao usuário antes de toda ação externa: criar issue ou label, push, abrir PR.
- Não lê código, não implementa e não commita. Pergunta técnica vai para o Arquiteto.
