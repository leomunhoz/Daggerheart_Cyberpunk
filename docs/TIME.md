# Time de desenvolvimento

Cada papel é um agente em `.claude/agents/` e roda num **terminal próprio do Orca**:

- O Controlador abre o papel com `/papel <papel> <pedido>`: cria o terminal no worktree do lote
  (`orca terminal create --command "claude --agent <papel>"`), entrega o pedido e acompanha pela
  orquestração do Orca (`worker-start --terminal …` e `check --wait` até o `worker_done`).
- **Subagente (Agent tool) só quando for necessário:** uma busca ampla e rápida em que só a
  conclusão importa (o Arquiteto pode usar `Explore`). Papel do time nunca roda como subagente, e os
  papéis não abrem subagentes entre si.
- O usuário também pode abrir um papel direto num terminal do Orca: `claude --agent <papel>`.

| Papel | Agente | Função | Não faz |
|---|---|---|---|
| Controlador | sessão principal (regras no `CLAUDE.md`) | Triagem e backlog, escolhe a via, fila e WIP, abre os papéis no Orca (`/papel`), gate único, issues (`/issue`), leva dúvidas ao usuário | Não lê código, não implementa, não commita |
| Criativo | `criativo` | PRD (`/prd-feature`): o quê e o porquê, na visão de quem joga e de quem mestra, fiel ao PDF | Código, Spec |
| Arquiteto | `arquiteto` | Lê o código, o sistema e a API do Foundry; escreve a Spec com os tickets e as ADRs; registra exceções de tamanho; divide tickets | Implementar |
| Fábrica | `fabrica` | Implementa um ticket (`/implementar`): teste red, mínimo de código até green, `npm run verify` | PRD, Spec, git |
| Examinador | `examinador` | Revisa (`/revisao`): padrões, Spec, ADR e regras do módulo; roda `npm run verify`. APROVADO só com nota ≥ 80% e zero achados | Corrigir |
| DevOps | `devops` | Um commit por ticket (`/commit`), push do lote, PR a cada 10 tickets (`/lote`), commit de versão | Código |

## Fluxo

O fluxo segue a ADR 0002.

```
pedido ─► docs/backlog.md (Controlador, item B-xxx) ─► triagem
   via rápida ──────────────────────────────────────────────┐
   via completa ─► /prd-feature (Criativo)   docs/prd/<feature>.md      R1.., CA1.., Q1..
                ─► Spec + ADRs (Arquiteto)   docs/spec/<feature>.md, docs/adr/NNNN-*.md
                ─► gate único (usuário)      responde Q1, Q2…; aprovação parcial permitida
                                                            │
   ─► /issue (Controlador) ◄────────────────────────────────┘  uma issue por ticket aprovado
   ─► /implementar (Fábrica)   red ─► green ─► npm run verify
   ─► /revisao (Examinador)    APROVADO │ REPROVADO (ver "Ticket reprovado")
   ─► /commit (DevOps)         um commit por ticket na branch do lote, push
   ─► /lote (DevOps)           a cada 10 tickets: PR contra a main ─► merge pelo usuário
```

### 1. Ideia → backlog
Todo pedido entra em `docs/backlog.md` como `B-xxx`. O Controlador faz a triagem e escolhe a via:
- **Via rápida:** bug ou ajuste pequeno. A descrição do ticket (escopo, teste red, critério de
  pronto) vai direto na issue. Não cria ADR, não muda formato de dados salvo (flags, settings,
  ids estáveis) e não muda API usada por outros arquivos; se precisar, vira via completa.
- **Via completa:** feature nova. Passa pelos passos 2 a 4.

### 2. PRD (Criativo)
`docs/prd/<feature>.md`: o quê e o porquê. Requisitos (R1, R2…), critérios de aceite (CA1, CA2…)
e perguntas para o usuário (Q1, Q2…). A fonte de regra é o PDF do Edgeheart
(`docs/referencias/edgeheart-pdf.md`).

### 3. Spec e ADRs (Arquiteto)
`docs/spec/<feature>.md`: o como. Design, quebras e a lista de tickets. Decisões de arquitetura
viram ADRs em `docs/adr/`. Cada ticket traz:
- escopo (arquivos);
- testes red (nível 1, 2 ou 3 da ADR 0004);
- critério de pronto;
- dependências;
- **Rebuild:** sim/não (ADR 0005);
- tamanho: até ~500 linhas e 10 arquivos (ADR 0003). Até 30% acima (650 linhas / 13 arquivos)
  é **exceção automática**, registrada pelo Arquiteto na seção "Exceções" da Spec.

### 4. Gate único
O usuário aprova PRD, Spec e ADRs de uma vez, respondendo às perguntas (Q1, Q2…), uma decisão por
pergunta. Pode aprovar só parte:
- só vira issue o ticket aprovado cujas dependências (tickets e ADRs) também estejam aprovadas;
- ADR devolvida continua `Proposta`, e nenhum ticket que dependa dela vira issue;
- o que voltou passa de novo pelo gate, só na parte alterada.

Depois do gate, o Controlador cria uma issue por ticket (`/issue`), com o título
`<id>: <tipo>(<escopo>): <resumo>` e o épico no corpo (`Épico: <spec>`); labels só as existentes (ver "Issues").

### 5. Execução de um ticket
Cada ticket roda em terminais próprios do Orca (`/papel`), no worktree do lote.

- **Fábrica** (`/implementar`): escreve o teste red, mostra que falha, escreve o mínimo de código
  até ficar green e roda `npm run verify`.
- **Examinador** (`/revisao`): confere padrões, Spec, ADR e as regras do módulo, roda
  `npm run verify`. APROVADO só com nota ≥ 80% e zero achados.
- **DevOps** (`/commit`): um commit por ticket, com stage só dos arquivos dele, e push da branch
  do lote.

**WIP:** um ticket em implementação ou revisão por vez. Quase tudo passa pelo `scripts/main.js`
(5 mil linhas), e dois tickets nele ao mesmo tempo dão conflito. Paralelo só quando a Spec marca o
par e os dois não têm nenhum arquivo em comum; cada um usa um worktree próprio do Orca.

### Ticket reprovado

| Motivo | O que acontece |
|---|---|
| Achado real | Volta para a Fábrica com o achado |
| Só tamanho, dentro da margem de 30% | O Arquiteto registra a exceção na Spec e o ticket segue para o commit |
| Só conferência no Foundry (nível 3) | O ticket é commitado e a conferência vai para a lista do PR |
| Estourou o escopo (arquivo fora da lista, ou acima da margem) | O Arquiteto divide o ticket ou emenda a Spec |

### 6. PR do lote
A cada 10 tickets commitados (ou no fim do épico, ou quando o usuário pedir), o DevOps abre um PR
da branch do lote contra a `main` (`/lote`), com:
- um `Closes #N` por issue;
- as conferências no Foundry pendentes (roteiros nível 3);
- o passo de rebuild dos compêndios, se algum ticket tem **Rebuild: sim**.

O merge é do usuário. O próximo lote só começa depois do merge.

## Branch, versão e release

- **Branch e worktree do lote:** `<usuário>/lote-<NN>-<slug>`, criada pelo Orca quando o Controlador abre o worktree do lote a partir da `main`
  atualizada, num worktree do Orca próprio (`lote-<NN>-<slug>`). Todo o trabalho do lote acontece
  nele: Controlador, papéis, docs e commits. O checkout principal fica na `main`, limpo. Os commits
  dos tickets entram na branch, em ordem. Ticket paralelo (par marcado na Spec) usa um worktree
  filho do lote, e o DevOps traz o commit para a branch do lote.
- **Rebuild dos compêndios** (ADR 0005): antes de abrir o PR, se algum ticket do lote mudou
  conteúdo, o usuário roda o gerador no Foundry e o DevOps commita `packs/` e `babele/pt-BR/` num
  commit `chore(packs): regenerar compêndios (lote NN)`.
- **Versão** (ADR 0006): último commit do lote, `vX.Y.Z: <resumo>`, com `module.json` e
  `CHANGELOG.md` no estilo do dono. A tag e a Release do GitHub (que disparam o `release.yml`)
  são do usuário/dono, depois do merge.

## Issues

Ficam em `leomunhoz/Daggerheart_Cyberpunk` (o repositório do dono). Toda criação de issue ou de
label é uma ação externa: o Controlador mostra o rascunho e só cria com a confirmação do usuário.

- **Título:** ticket da Spec `<id>: <tipo>(<escopo>): <resumo>`; via rápida `<B-xxx>: <tipo>(<escopo>): <resumo>`.
- **Labels:** só as que já existem no repositório (decisão do usuário, 2026-11-01): `bug` para
  `fix`, `enhancement` para `feat`, `documentation` para `docs`; `chore` e `test` ficam sem label.
  O épico e a via vão no corpo (`Épico: <spec>`, `Via: rápida|completa`). Não criar labels novas.
- **Corpo:** objetivo, arquivos, dependências, testes red, critério de pronto, rebuild e links
  (PRD, Spec, ADRs).

## Documentos

```
docs/
  README.md          índice
  TIME.md            este arquivo
  backlog.md         porta de entrada de todo pedido
  mapa-do-codigo.md  onde fica cada coisa no módulo
  prd/               um PRD por feature (modelo em prd/README.md)
  spec/              uma Spec por feature, com os tickets (modelo em spec/README.md)
  adr/               decisões (NNNN-titulo.md, índice em adr/README.md)
  referencias/       Foundry v14, sistema Daggerheart, PDF do Edgeheart
```

Uma ADR aceita não é reescrita: ganha emenda datada ou é substituída por outra.
