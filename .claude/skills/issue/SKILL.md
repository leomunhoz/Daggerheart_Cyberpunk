---
name: issue
description: Controlador cria uma issue em leomunhoz/Daggerheart_Cyberpunk para um ticket aprovado no gate ou um item da via rápida (ADR 0002), sempre com confirmação do usuário.
argument-hint: <ticket da Spec, ex. HUM-03, ou item do backlog, ex. B-012>
---

Crie a issue de: $ARGUMENTS

Repositório: `leomunhoz/Daggerheart_Cyberpunk` (do dono). Todo comando `gh` leva
`--repo leomunhoz/Daggerheart_Cyberpunk`.

1. **Pré-condições** (ADR 0002):
   - via completa: o ticket foi aprovado no gate, e as dependências (tickets e ADRs) também;
   - via rápida: o item do backlog tem escopo, teste red e critério de pronto. Se faltar, peça ao
     Arquiteto (`/papel arquiteto …`) antes.
2. **Rascunho.**
   - Título: `<id>: <tipo>(<escopo>): <resumo>` (ex.: `HUM-03: fix(humanidade): rolar Humanidade ao rolar com Medo sem Esperança`).
   - Labels: só as existentes no repositório (decisão do usuário, 2026-11-01): `bug` para `fix`,
     `enhancement` para `feat`, `documentation` para `docs`; `chore` e `test` sem label. Nunca crie
     label nova.
   - Corpo: começa com `Épico: <slug-da-spec>` (ou `Via: rápida`), depois **Objetivo**, **Arquivos**, **Depende de**, **Teste red (nível)**, **Critério de
     pronto**, **Rebuild**, **Links** (seção do PRD, ticket da Spec, ADRs). Bug da via rápida também
     traz **Comportamento atual** e **Comportamento esperado**.
3. **Duplicatas e labels.**
   - `gh issue list --repo leomunhoz/Daggerheart_Cyberpunk --state all --search "<termos>"`
   - Use só `bug`, `enhancement` ou `documentation` (já existem no repositório).
4. **Confirmação.** Mostre o rascunho ao usuário e só crie depois do OK. Grave o corpo num arquivo
   no scratchpad:
   `gh issue create --repo leomunhoz/Daggerheart_Cyberpunk --title "<título>" [--label "bug|enhancement|documentation"] --body-file <arquivo>`
5. Atualize `docs/backlog.md` com o número da issue e devolva o link.

O Controlador não lê código para escrever a issue. Falta de contexto técnico vai para o Arquiteto.
