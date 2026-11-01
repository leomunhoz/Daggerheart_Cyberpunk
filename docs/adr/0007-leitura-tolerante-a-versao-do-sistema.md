# 0007 — Leitura tolerante à versão do sistema

Status: Aceita (gate 2026-11-01)
Data: 2026-11-01

## Contexto

O Daggerheart lança uma versão menor a cada 2–3 semanas e muda campos sem aviso. Da 2.10 para a
2.12: o `config` dos hooks virou `MoveContext` (sem `config.data.parent`), o resultado da rolagem saiu
de `config.roll.result.duality` para `config.evaluated` (a própria rolagem), as features de arma e
armadura passaram de `weaponFeatures`/`armorFeatures` para `itemFeatures` (2.11) e
`CONFIG.DH.ACTOR.abilities` virou alias de `traits`. O `module.json` declara `minimum: "2.10.0"` e
há mesas em versões diferentes.

Opções: (a) subir o `minimum` a cada versão e ler só o campo novo; (b) ler por número de versão
(`game.system.version`); (c) ler o campo novo e cair no antigo na mesma expressão.

## Decisão

1. Enquanto o `minimum` declarado for anterior à versão que mudou um campo, o código lê **o campo
   novo primeiro e o antigo como reserva**, na mesma expressão
   (ex.: `config.evaluated ? config.evaluated.withFear : config.roll?.result?.duality === -1`).
2. **Não** se compara número de versão do sistema no código.
3. O formato que o módulo **grava** (gerador, `createEmbeddedDocuments`, `update`) segue o schema do
   sistema em uso, conferido no próprio schema (ex.: `schema.has("itemFeatures")`), não a versão.
4. Subir o `minimum` é decisão do gate (pergunta Q na Spec). Quando sobe, o ticket que sobe pode
   apagar as reservas que ficaram mortas, no mesmo escopo.
5. Cada versão menor nova do sistema vira item de conferência no backlog; a Spec de conferência
   lista todo uso da API com veredito (ok / quebra / risco) e o arquivo do sistema (ADR 0005).
6. Packs publicados são gerados numa versão do sistema ≤ ao `minimum` declarado, ou o `minimum`
   sobe junto, porque pack gerado numa versão mais nova pode gravar campos que a antiga não lê.

## Consequências

- Uma correção de compatibilidade serve às mesas antigas e novas, sem subir o `minimum`.
- O código acumula reservas; elas saem quando o gate subir o `minimum`.
- Testes do nível 2 de hooks usam os dois formatos de `config` (o antigo e o novo).

## O que os agentes NÃO podem fazer

- Trocar uma leitura antiga pela nova sem reserva enquanto o `minimum` ainda cobre a versão antiga.
- Ramificar o código por `game.system.version`.
- Subir o `minimum` do `module.json` sem decisão do gate.
