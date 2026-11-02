# 0004 — Teste red em três níveis

Status: Aceita (gate 2026-11-01)
Data: 2026-11-01

## Contexto

O fluxo pede teste red antes do código. O módulo não tem build nem testes, e os agentes não têm um
Foundry rodando. Conferido em 2026-11-01:
- os cinco scripts carregam no Node 24 com um stub pequeno dos globais (`Hooks`, `game`, `CONFIG`,
  `foundry.utils`), porque o código só lê `game.system.api` dentro dos hooks;
- o que é exportado (`Humanity`, `isAction`, `Crew`, `Vehicle`, `ITEM_MAPPING`, `ACTOR_MAPPING`,
  `localizePacks`) dá para testar fora do Foundry;
- o `main.js` não exporta nada; o conteúdo só é verificável pelo texto do arquivo ou no Foundry.

Não existe framework de teste oficial do Foundry. O padrão da comunidade é o módulo Quench (Mocha
dentro do Foundry), que exigiria instalar algo no mundo de teste.

## Decisão

Sem dependências novas. Três níveis:

1. **Nível 1, checagem estática** (`npm run check`, `tools/check.mjs`): sintaxe, JSON, paridade
   `en`/`pt-BR`, chaves `EDGEHEART.*` usadas que existem, `module.json` coerente, caminhos fixos de
   arte que existem, uma tradução do Babele por compêndio. Um ticket pode acrescentar uma regra
   nova a esse arquivo (é assim que se escreve o red de um bug "estático").
2. **Nível 2, unidade no Node** (`npm test`, `node --test`, stub em `tests/helpers/foundry-stub.mjs`):
   para lógica exportada. Se a lógica do bug não é exportada, o ticket pode **exportar** a função ou
   constante existente (acrescentar `export`, sem mudar o corpo). Isso conta no tamanho do ticket e
   não é refatoração.
3. **Nível 3, roteiro no Foundry:** passos numerados num mundo de teste (Foundry v14, Daggerheart na
   versão do `docs/referencias/daggerheart-sistema.md`, módulo ativo), com o resultado esperado e o
   resultado atual (que mostra o bug). Pode ser um trecho para o console (F12). Quem roda é o
   usuário; o roteiro vai para a lista de conferências do PR do lote.

**Qual usar:** o mais baixo que reproduz o problema. Ficha, rolagem, chat, compêndio, Babele e
hooks do sistema em geral são nível 3. Todo ticket roda `npm run verify` no fim, mesmo quando o red
é nível 3.

**Red de verdade:** o teste (ou o roteiro) é escrito antes do código e falha pelo motivo esperado.
No nível 3, o "falha" é o resultado atual descrito no roteiro.

## Consequências

- Bugs de ficha e de rolagem dependem da conferência do usuário no Foundry; o PR do lote junta
  todas.
- Os testes do nível 2 crescem com o tempo; o stub cresce só o necessário para cada teste.
- Adotar Quench, ou o `@foundryvtt/foundryvtt-cli` para extrair os packs em JSON, fica para uma ADR
  futura, se o usuário aprovar a dependência.

## O que os agentes NÃO podem fazer

- Apagar, pular ou afrouxar um teste ou uma regra do `check` para ficar green.
- Dizer que algo foi conferido no Foundry sem o usuário ter rodado o roteiro.
- Mudar o corpo de uma função só para deixá-la testável.
