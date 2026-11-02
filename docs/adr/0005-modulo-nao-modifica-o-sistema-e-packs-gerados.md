# 0005 — O módulo não modifica o sistema; packs e Babele são gerados

Status: Aceita (gate 2026-11-01)
Data: 2026-11-01

## Contexto

O README do dono diz: "Nada do sistema Daggerheart é modificado. O módulo usa só o que o sistema
oferece". O código segue isso: as fichas herdam `game.system.api.applications.sheets.actors.Character`
e `.Party`, as automações usam os hooks `daggerheart.preUseAction`, `postUseAction`,
`postRollDuality` e `postDualityRollConfiguration`, e as Competências entram pelo Homebrew do sistema.

O sistema muda rápido (2.10 → 2.12 entre setembro e novembro de 2026; a 2.12 reescreveu o `config`
que os hooks recebem, agora `MoveContext`).

Os compêndios são gerados: `api.buildPacks()` (em `scripts/main.js`) apaga e recria os 14
compêndios a partir do código, com `_id` de `stableId(chave)`, grava `flags.actionIds` e no fim
chama `localizePacks` (`scripts/edgeheart-localize.js`), que deixa a base em inglês e escreve
`babele/pt-BR/*.json` pelo `FilePicker`. Só roda no Foundry, como GM, com o Foundry em inglês.

## Decisão

1. **API pública só.** O módulo usa hooks, `CONFIG.DH`, `game.system.api`, documentos e settings do
   sistema. Proibido: editar ou copiar arquivos do sistema, importar arquivos internos dele por
   caminho, sobrescrever método de protótipo de classe do sistema. Se algo só der para fazer assim,
   vira pergunta no gate.
2. **Compatibilidade.** Uso novo de API do sistema é conferido no código-fonte da versão atual
   (`docs/referencias/daggerheart-sistema.md`) e anotado na Spec com o arquivo do sistema.
3. **Fontes vs. gerados.** Conteúdo muda na fonte (`scripts/main.js`, `data/*.json`, `journals/**`,
   `data/glossary-pt-BR.json`). `packs/**` e `babele/pt-BR/**` nunca são editados à mão.
4. **Rebuild.** Ticket que muda conteúdo de compêndio tem `Rebuild: sim`. Antes do PR do lote, o
   usuário roda no Foundry (em inglês, como GM, com este checkout como pasta do módulo):
   `await game.modules.get("edgeheart-cyberpunk").api.buildPacks()`, fecha o mundo e o DevOps
   commita `packs/` e `babele/pt-BR/` num commit `chore(packs)` separado.
5. **Ids estáveis.** Chave de `stableId` existente não muda. Nome de origem de ação automatizada
   (lido por `isAction`) não muda sem trocar todas as referências no mesmo ticket.
6. **Dado salvo.** Flags (`flags.edgeheart-cyberpunk.*`) e settings existentes mantêm nome e
   formato. Mudança de formato exige via completa e migração no `ready` descrita na Spec.

## Consequências

- Uma atualização do sistema pode quebrar hooks sem aviso; cada nova versão menor do sistema vira
  item no backlog para conferência.
- Todo lote com conteúdo depende de um passo manual do usuário no Foundry.

## O que os agentes NÃO podem fazer

- Editar `packs/**` ou `babele/pt-BR/**` à mão, ou commitar packs gerados com o Foundry em português.
- Commitar `packs/**/LOCK`, `LOG` ou `LOG.old` (já estão no `.gitignore`).
- Trocar chave de `stableId`, nome de flag ou de setting existentes na via rápida.
