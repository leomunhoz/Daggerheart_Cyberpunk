# Backlog

Porta de entrada de todo pedido, bug ou pendência (ADR 0002). Quem cuida é o Controlador.

- **Estados:** `bruto` → `triado` → `em PRD` → `em Spec` → `no gate` → `aprovado` → `em execução` → `feito` (ou `descartado`).
- **Via:** `rápida` (bug ou ajuste pequeno, vai direto para a issue) ou `completa` (PRD → Spec → gate).
- Um item por linha na tabela; detalhes na seção do item, abaixo.

| ID | Título | Tipo | Via | Estado | Issue / Spec |
|---|---|---|---|---|---|
| B-001 | Atualizar o módulo para o Daggerheart 2.12 | fix | completa (só Spec) | aprovado | Spec `compat-2-12`; issues #1 (C212-01), #2 (C212-02), #3 (C212-03) |
| B-002 | Cyberware organizado por tier e por custo, com o custo no nome | feat | completa | aprovado | PRD + Spec `organizacao-e-filtros` (ORG-01 #4) |
| B-003 | Level up não mostra cartas que o personagem já escolheu | feat | completa | aprovado | LVL-01 #5 |
| B-004 | Filtrar armas, itens e consumíveis que não são do módulo | feat | completa | aprovado | FIL-01 #6 |
| B-005 | Opção nas configurações do módulo para ligar/desligar o filtro (B-004) | feat | completa | aprovado | FIL-01 #6 |
| B-006 | Risco: `CONFIG.DH.ACTOR.abilities` virou alias de `traits` na 2.12 | fix | — | bruto | `docs/spec/compat-2-12.md` (Q4) |
| B-007 | Teste de fumaça lista os esmodules fixos; ler do `module.json` | test | rápida | bruto | achado no LVL-01 |

## Lote atual

**Lote 01** — branch `gabrielctorres/lote-01-compat-e-filtros`, worktree Orca `lote-01-compat-e-filtros`.

| Ordem | Ticket | Issue | Estado |
|---|---|---|---|
| 1 | C212-01 | #1 | commitado `95148fa`, push feito; conferência no Foundry pendente |
| 2 | C212-03 | #3 | aprovado (red nível 3: precisa do Foundry) |
| 3 | LVL-01 | #5 | commitado `ac06132`, push feito; conferência no Foundry pendente (L1-L4) |
| 4 | ORG-01 | #4 | APROVADO (100%), commitado; rebuild e conferência O1-O4 pendentes (depois do C212-03) |
| 5 | FIL-01 | #6 | aprovado; **próximo a implementar** |
| 6 | C212-02 | #2 | aprovado (depois do roteiro nível 3 do usuário) |

Commits: `8debcae` chore(time), `8a1937f` docs(planejamento).

**Pausa (2026-11-01, pedido do usuário):** trabalho parado ao fim do dia. Para retomar:
1. FIL-01 (`/implementar organizacao-e-filtros FIL-01`, terminal novo da Fábrica no worktree do lote).
2. C212-03 precisa do usuário: `buildPacks()` no Foundry 2.12.1 em inglês, com o módulo apontando para
   este worktree; o resultado do comando de conferência da Spec decide o red.
3. Depois do C212-03: rebuild dos compêndios (cobre C212-03 e ORG-01) e commit `chore(packs)`.
4. Usuário roda os roteiros nível 3 (compat-2-12 passos 1-13; L1-L4; O1-O4; F1-F5) e então C212-02.
5. `/lote 01` (PR contra a `main`, com confirmação do usuário).

**Autorização do usuário (2026-11-01, vale só para o lote 01):** ticket APROVADO vira commit e push na branch do lote sem nova confirmação. O PR continua pedindo confirmação.

## Itens

### B-001 — Conferir o módulo no Daggerheart 2.12 (MoveContext nos hooks)
- **Origem:** pesquisa do sistema em 2026-11-01. O Daggerheart 2.12.0/2.12.1 (lançado em
  2026-11-01) trocou o `config` que os hooks `daggerheart.*` recebem por uma classe `MoveContext`:
  `config.data` virou só `experiences`, `traits`, `rules` e `action`. O `module.json` exige
  `>= 2.10.0`, sem teto.
- **Ponto de atenção:** `scripts/edgeheart-character.js`, hook `daggerheart.postRollDuality`, lê
  `config.data?.parent`. Na 2.12 esse campo não existe mais; o código cai no `config.source.actor`,
  que ainda existe. Pode estar funcionando. Não está confirmado.
- **Pedido do usuário (2026-11-01):** "Atualize o módulo para funcionar com o 2.12."
- **Triagem:** via completa **sem PRD**. Não há regra nova para quem joga; o requisito é "tudo o que
  funciona na 2.10/2.11 continua funcionando na 2.12". O Arquiteto escreve a Spec direto
  (`docs/spec/compat-2-12.md`), com a auditoria de todo uso da API do sistema e os tickets. Passa
  pelo gate como qualquer Spec.
- **Requisitos (do Controlador, para a Spec):**
  - R1 — Todos os hooks e campos do sistema que o módulo usa funcionam na 2.12.1.
  - R2 — O módulo continua funcionando na versão mínima declarada, ou a Spec propõe subir o mínimo
    (pergunta para o gate).
  - CA1 — Rolar com Medo com todo o Estresse marcado pede a Rolagem de Humanidade na 2.12.
  - CA2 — Ações com custo, Kill Chain, Cover, Integrated Chrome, Eidolons, veículos e os Movimentos
    da Crew funcionam na 2.12 (roteiro no Foundry).

### B-002 — Cyberware organizado por tier e por custo, com o custo no nome
- **Pedido:** "Organizar todas as cyberwares dentro de seu respectivo tier por custo de cyberload e
  mostrar custo na frente do nome. Ex.: braço mecânico - custo 0."
- **Atenção para a Spec:** nome de item entra no Babele e em buscas por nome; mudar o nome tem
  efeito na tradução e talvez em personagens já criados (pergunta técnica para o Arquiteto).

### B-003 — Level up não mostra cartas que o personagem já escolheu
- **Pedido:** "Cartas já escolhidas na evolução de personagem não serem mostradas."
- **Atenção:** a janela de level up é do sistema; só dá para mexer por hook de render (ADR 0005).

### B-004 — Filtrar armas, itens e consumíveis que não são do módulo
- **Pedido:** "Filtrar armas, itens e consumíveis que não sejam do módulo." Hoje o módulo já filtra
  as classes na criação de personagem e mexe no Item Browser (`renderItemBrowser`).
- **Em aberto:** em que telas o filtro vale (Item Browser? passo de equipamento da criação?
  compêndios?). Pergunta do Criativo para o usuário.

### B-005 — Opção para ligar/desligar o filtro
- **Pedido:** "Adicionar a opção de ativar ou desativar o filtro na configuração do módulo."
- **Em aberto:** padrão ligado ou desligado; vale para o mundo todo ou por jogador.

### B-006 — Alias `CONFIG.DH.ACTOR.abilities` (risco da auditoria 2.12)
- **Origem:** auditoria de `docs/spec/compat-2-12.md` (seção 2.3) e Q4 do gate de 2026-11-01. O
  usuário decidiu **não** trocar agora.
- **Fato [V]:** na 2.12 o sistema renomeou `CONFIG.DH.ACTOR.abilities` para `traits` e manteve
  `abilities` como alias (`module/config/actorConfig.mjs`, `export const abilities = traits`).
- **Onde o módulo usa:** `scripts/edgeheart-crew.js` (Back Me Up: lista e rótulo do atributo) e
  `scripts/main.js` (descrição dos veículos no gerador).
- **Risco:** se uma versão futura tirar o alias, o Back Me Up e o gerador quebram.
- **Gatilho para triar:** a próxima conferência de versão do sistema, ou o sistema anunciar a
  remoção do alias. Correção provável: `CONFIG.DH.ACTOR.traits ?? CONFIG.DH.ACTOR.abilities` (ADR 0007).

### B-007 — Teste de fumaça com lista fixa de esmodules
- **Origem:** relatório da Fábrica no LVL-01 (2026-11-01). `tests/smoke.test.mjs` importa uma lista fixa de
  scripts; o `scripts/edgeheart-browser-filters.js` novo não entra. Ler a lista de `module.json.esmodules`.
- **Via:** rápida (só `tests/smoke.test.mjs`).
