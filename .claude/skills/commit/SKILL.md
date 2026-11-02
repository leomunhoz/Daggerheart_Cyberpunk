---
name: commit
description: DevOps commita UM ticket aprovado na branch do lote, com stage só dos arquivos do ticket, e faz push. Também cria a branch do lote e faz os commits de docs, packs e versão. Cada passo com confirmação do usuário.
argument-hint: <ticket | "branch NN slug" | "docs" | "packs" | "versao X.Y.Z">
disable-model-invocation: true
---

Execute: $ARGUMENTS

Confirme com o usuário antes de cada passo que altera estado (branch, commit, push).

**Branch do lote:** o Controlador cria o worktree do lote no Orca a partir da `main`
(`orca worktree create --name lote-<NN>-<slug> --no-parent --json`); o Orca nomeia a branch
`<usuário>/lote-<NN>-<slug>`. Não renomeie. Confira com `git branch --show-current` antes do
primeiro commit.

**Ticket** (`<ticket>`):
1. Pré-condição: existe revisão APROVADO para o ticket; você está na branch `<usuário>/lote-…`, não na `main`.
2. Stage seletivo: `git add <caminhos do ticket>` (os do relatório da Fábrica, conferidos com
   `git status`). Nunca `git add -A` ou `git add .`. Preserve o resto do working tree.
3. Commit: `<tipo>(<escopo>): <resumo> (<ticket>)`, imperativo, português, assunto ≤ 72 caracteres,
   corpo com `Refs #<issue>` e, se houver, "Conferência no Foundry pendente: …".
4. `git push -u origin <usuário>/lote-<NN>-<slug>` (o primeiro push publica a branch).

**Docs** (`docs`): stage de `docs/**` e dos arquivos do time alterados no lote; commit
`docs(<escopo>): <resumo>`.

**Packs** (`packs`): só depois de o usuário dizer que rodou o gerador no Foundry **em inglês** e
fechou o mundo. `git status packs babele` deve mostrar só `.ldb`, `.log`, `CURRENT`, `MANIFEST-*` e
`babele/pt-BR/*.json`; nada de `LOCK`/`LOG`. Commit `chore(packs): regenerar compêndios (lote NN)`.

**Versão** (`versao X.Y.Z`): edite só `version` do `module.json` e acrescente `## vX.Y.Z` no topo do
`CHANGELOG.md`, no estilo das entradas existentes (itens com começo em negrito, para quem joga).
Commit `vX.Y.Z: <resumo>`. Não crie tag.

Nunca force-push, nunca `--no-verify`, nunca commit na `main`.
