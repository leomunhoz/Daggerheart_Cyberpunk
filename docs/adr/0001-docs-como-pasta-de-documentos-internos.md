# 0001 — `docs/` como pasta de documentos internos

Status: Aceita (pedido do usuário, 2026-11-01)
Data: 2026-11-01

## Contexto

O fluxo do time precisa de lugar para backlog, PRDs, Specs, ADRs e referências. O `README.md` é do
dono do repositório e não pode ser editado. O `release.yml` monta o `module.zip` só com
`module.json README.md CHANGELOG.md scripts styles templates lang packs assets babele data journals`.

## Decisão

1. Os documentos do time ficam em `docs/`. As ferramentas ficam em `tools/` e `tests/` (com o
   `package.json` sem dependências), e os agentes e skills em `.claude/`.
2. Nenhuma dessas pastas entra no `module.zip`; o `release.yml` não muda.
3. `docs/README.md` é o índice; `docs/TIME.md` descreve o time e o fluxo.

## Consequências

- Quem instala o módulo não recebe nada disso.
- Uma pasta nova do módulo (que precise ir para o zip) exige mudar o `release.yml`, e isso é
  decisão do usuário (CLAUDE.md, regra 9).

## O que os agentes NÃO podem fazer

- Editar o `README.md` ou o `release.yml` para acomodar documentos do time.
- Guardar documentos do time em pastas que vão para o zip (`assets/`, `data/`, `journals/`…).
