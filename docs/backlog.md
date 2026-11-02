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
| B-008 | `buildPacks()` sem progresso nem aviso de onde parou | fix | rápida | aprovado | Spec `release-1-39` (BLD-01) |
| B-009 | Filtro de equipamento esconde tudo se os compêndios do Edgeheart estão vazios | fix | rápida | aprovado | Spec `release-1-39` (FIL-02) |
| B-010 | Versão v1.39.0 sem rebuild (lotes 01 e 02) | chore | rápida | aprovado | Spec `release-1-39` (REL-01, emenda D5, sem issue de código) |
| B-011 | Rebuild dos compêndios na 2.12.1 (`chore(packs)`: C212-03, ORG-01 com custo `[n]`) | chore | rápida | em execução | lote 04 (`gabrielctorres/lote-04-compendios`): rebuild feito em 2026-11-02 no Foundry v14 b369 + Daggerheart **2.12.4**, em inglês, sem erro nos 11 passos; contagens iguais às de antes (cyberware 70, domínios 231...); 60 de 70 cyberwares com custo no nome (59 `[n]` + `[1–3] Neural Access`; os 10 sem custo parecem ser os Eidolons, conferir no O1-O4). N3 (2026-11-02, pelo navegador): B2 ok; O1, O2 e O3 ok (60/60 com custo igual ao "Cyber Cost" do texto; 10 Eidolons sem prefixo); O4 não feito (mundo sem personagem anterior). Self Correcting sem efeito é o esperado na 2.12 (`rollModifiers`, Arquiteto, emenda 5.2 da Spec `correcoes-1-39`), sem ticket. Falta: commit `chore(packs)` (sem as pastas `packs/*/lost/`) e versão |
| B-015 | Traduzir no pt-BR a descrição dos efeitos de features oficiais (ex.: Protective) | fix | — | bruto | sugestão do Arquiteto no B-011 (2026-11-02), opcional |
| B-012 | Sessão de papel encerra sem `worker_done` (DevOps no lote 01, Examinador no FIL-02); e `worker-start` logo após `terminal create` dá `agent_unconfigured` (esperar o Claude abrir); `check --ack` sem o `delivery_id` não confirma e a mensagem antiga volta; terminais somem quando o Orca cai (lote 03) | chore | rápida | bruto | ajustar a skill `/papel` |
| B-013 | `buildPacks()` quebra nas Competências (Corruption Spike) desde o Daggerheart 2.10.12 | fix | rápida | pronto | lote 03: BLD-02 (#11) e BLD-03 (#12), versão v1.39.1 |
| B-014 | Filtro de equipamento ligado e armas/armaduras do sistema aparecem no Item Browser e na criação | fix | rápida | em Spec | Console do Item Browser (2026-11-02, v1.39.1, 2.12.4): Weapons 324/324, Armors 69/69, Consumables 121/121 e Items 150/150 itens de fora marcados, 0 visíveis. É a linha H1 da tabela 3.3 (cache), então o FIL-03 não roda no Item Browser. Falta conferir a criação de personagem (H5) |

## Lote atual

**Lote 04 (compêndios)**: branch `gabrielctorres/lote-04-compendios`, worktree Orca
`lote-04-compendios`, base `main` em `47eae9a` (v1.39.1). Run Orca `run_0b2a60df8d6d`. Só o B-011,
sem código: rebuild feito em 2026-11-02 (Foundry v14 b369, Daggerheart 2.12.4), N3 B2/O1-O3 ok,
O4 pendente (sem personagem antigo no mundo de teste).

| Ordem | Passo | Item | Estado |
|---|---|---|---|
| 1 | `chore(packs)` (sem `packs/*/lost/`) | B-011 | DevOps |
| 2 | `docs` (backlog, emenda 5.2 da `correcoes-1-39`, referência do sistema) | B-011 | DevOps |
| 3 | versão `v1.39.2` (proposta) e `/lote 04` | B-011 | DevOps |

**Lote 02 (release 1.39)**: branch `gabrielctorres/lote-02-release-1-39`, worktree Orca
`lote-02-release-1-39`, base `main` em `7b3abb4` (lote 01 entrou pelo PR #7). Spec
`docs/spec/release-1-39.md`, via rápida, com as decisões do usuário de 2026-11-02 (gate feito).

| Ordem | Ticket | Item | Issue | Estado |
|---|---|---|---|---|
| 1 | BLD-01 | B-008 | #8 | APROVADO 100%, commitado (f8720c1) |
| 1 | FIL-02 | B-009 | #9 | APROVADO 92% (2026-11-02) |
| 2 | REL-01 | B-010 | sem issue (não tem código) | depois de BLD-01 e FIL-02: N3, gerados restaurados, `v1.39.0` (sem rebuild, D5), `/lote 02` |

Pendências do lote 01 que entram no REL-01: os roteiros N3 que não dependem de rebuild
(compat-2-12 passos 1-13; L1-L4; F1-F5). O rebuild (C212-03, ORG-01) e o O1-O4 foram para o B-011.

**Lote 01** (fechado, PR #7): C212-01, C212-02, C212-03, LVL-01, ORG-01, FIL-01, todos aprovados e
na `main`. Detalhes nas Specs `compat-2-12` e `organizacao-e-filtros`.

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

### B-008 — `buildPacks()` sem progresso nem aviso de onde parou
- **Origem:** investigação INV-01 (Arquiteto, 2026-11-02). O gerador apaga os 14 compêndios
  (`clearPacks`) antes de recriar e não avisa nada entre "building" e "Done". Se para no meio, os
  compêndios ficam vazios e não se sabe em qual parou.
- **Decisão do usuário (2026-11-02):** progresso por compêndio e mensagem clara de falha
  (`ui.notifications` e console, nas duas línguas), sem mudar a ordem nem o conteúdo. Ticket BLD-01.

### B-009 — Filtro de equipamento com os compêndios vazios
- **Origem:** INV-01. Com os compêndios de equipamento do Edgeheart vazios, o filtro do FIL-01
  esconde todo o equipamento de fora e o Item Browser fica sem armas.
- **Decisão do usuário (2026-11-02):** salvaguarda: sem equipamento do Edgeheart (por tipo), o
  filtro não esconde nada. Ticket FIL-02.

### B-010 — Rebuild e versão v1.39.0
- Rebuild dos compêndios pelo usuário no Foundry 2.12.1 (cobre C212-03 e ORG-01), commit
  `chore(packs)`, roteiros N3 dos lotes 01 e 02 e commit `v1.39.0` (`module.json` e `CHANGELOG.md`,
  ADR 0006). O número é proposta do Controlador e o usuário confirma. Item REL-01 da Spec
  `release-1-39`.
- **Emenda (2026-11-02, decisão do usuário, D5):** a `v1.39.0` sai **sem rebuild**: só o commit
  `v1.39.0` (`module.json` `version` e `CHANGELOG.md`). Os compêndios ficam os atuais (gerados na
  2.10.8, migrados pelo sistema ao carregar). O rebuild foi para o B-011. O usuário confere
  atualizando o módulo pelo Foundry depois da Release.

### B-011 — Rebuild dos compêndios na 2.12.1 (versão seguinte à 1.39.0)
- **Origem:** emenda D5 da Spec `release-1-39` (2026-11-02). Saiu do REL-01.
- **O que é:** rebuild pelo usuário (Foundry v14 em inglês, Daggerheart 2.12.1, gerador com o
  BLD-01), commit `chore(packs)` só com `packs/**` e `babele/pt-BR/**`, roteiro B2 da
  `release-1-39` (diff dos gerados) e O1-O4 da `organizacao-e-filtros`. Entra nos compêndios o
  que já está no gerador: features oficiais no formato `itemFeatures` (C212-03) e cyberware por
  custo com `[n]` no nome (ORG-01). A versão que sai com ele anuncia essas duas coisas no
  `CHANGELOG.md`.
- **Via:** rápida (sem código; Rebuild: sim).

### B-013 — `buildPacks()` quebra nas Competências na 2.11+/2.12
- **Origem:** relato do usuário (2026-11-02, Foundry v14 + Daggerheart 2.12.1):
  `TypeError: Cannot read properties of undefined (reading 'damage')` em `importDomainCards`.
  Investigação INV-02 (Arquiteto).
- **Causa [V]:** o Daggerheart 2.10.12 renomeou as ações da Blighting Strike (`With Hope` →
  `Damage (With Hope)`); o patch da Corruption Spike (Blackwall) não acha a ação. É a única carta
  com o problema (conferência de todos os clones contra 2.10.13, 2.12.1 e `v14`).
- **Efeito colateral:** o build que quebrou já tinha apagado os compêndios. O mundo do usuário
  ficou com cyberware, adversários, ambientes e diários vazios e sem o Localize. Reinstalar a
  v1.39.0 resolve.
- **Correção:** BLD-02 (nomes novos e patch tolerante, ADR 0007). Opcional: BLD-03 (ferramenta de
  conferência dos clones). Bloqueia o B-011.

### B-014 — Filtro de equipamento não esconde as armas e armaduras do sistema
- **Origem:** relato do usuário (2026-11-02): com `gearFilter = true`, armas e armaduras
  medievais aparecem no Item Browser e no passo de equipamento da criação.
- **Situação:** a hipótese do índice sem `type` caiu (console do usuário e código). A mais forte é
  CSS da 1.38.1 em cache, sem a regra `.eh-hidden-gear` [I]. Comandos de console e tabela de
  decisão na Spec `correcoes-1-39`, seção 3.3. O FIL-03 só abre com o resultado.

