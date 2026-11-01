# 0006 — Versão e CHANGELOG no padrão do dono

Status: Aceita (gate 2026-11-01)
Data: 2026-11-01

## Contexto

O histórico do repositório usa um commit por versão, `vX.Y.Z: <resumo em português>`, com
`module.json` (`version`) e uma seção nova no topo do `CHANGELOG.md` (`## vX.Y.Z`, itens com o
começo em negrito, escritos para quem joga). A release é publicada criando uma Release no GitHub com
a tag; o `release.yml` monta `module.json` e `module.zip`.

O nosso fluxo faz um commit por ticket (ADR 0003), com Conventional Commits.

## Decisão

1. Commits de ticket: `<tipo>(<escopo>): <resumo> (<ticket>)`, em português, no imperativo.
2. Fim do lote: um commit `vX.Y.Z: <resumo>` com o `version` do `module.json` e a seção do
   `CHANGELOG.md` no estilo atual. SemVer como o dono já usa: PATCH para correção, MINOR para
   conteúdo ou feature nova. O DevOps propõe o número; o usuário confirma.
3. Tag e Release do GitHub: só o usuário (ou o dono), depois do merge. O DevOps não cria tag.
4. `compatibility` do `module.json` (Foundry e sistema) muda só com conferência no Foundry
   registrada no PR.

## Consequências

- O `CHANGELOG.md` continua legível para quem joga; os detalhes técnicos ficam nos commits e PRs.

## O que os agentes NÃO podem fazer

- Criar tag, Release ou mudar `manifest`/`download` do `module.json`.
- Subir a versão em commit de ticket.
