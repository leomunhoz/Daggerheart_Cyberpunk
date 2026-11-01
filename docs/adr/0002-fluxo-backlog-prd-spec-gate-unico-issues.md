# 0002 — Fluxo backlog → PRD → Spec → gate único → issues

Status: Aceita (pedido do usuário, 2026-11-01)
Data: 2026-11-01

## Contexto

O módulo já funciona e é de outra pessoa. Mudança sem registro do que se quer, de como fazer e de
quais regras valem arrisca quebrar mesas em andamento (personagens, compêndios, traduções).

## Decisão

1. **Backlog.** Todo pedido entra em `docs/backlog.md` como `B-xxx`, cuidado pelo Controlador.
   Estados: `bruto` → `triado` → `em PRD` → `em Spec` → `no gate` → `aprovado` → `em execução` →
   `feito` (ou `descartado`).
2. **Duas vias.**
   - **Rápida:** bug ou ajuste pequeno, um ticket só, sem PRD. A descrição do ticket (escopo,
     teste red, critério de pronto) vai direto na issue. Não pode criar ADR, mudar formato de dado
     salvo (flags, settings, chaves de `stableId`, nomes de ação automatizada) nem mudar API usada
     entre arquivos. Se precisar, vira via completa.
   - **Completa:** feature nova. PRD → Spec (+ ADRs) → gate único → issues.
3. **PRD** (Criativo): o quê e o porquê, com requisitos R1…, critérios de aceite CA1… e perguntas
   Q1…. Todo critério de aceite vira teste (nível 1 ou 2) ou roteiro no Foundry (nível 3, ADR 0004).
4. **Spec** (Arquiteto): contexto do código, design, quebras e tickets (ADR 0003). ADRs novas são
   escritas junto.
5. **Gate único.** O usuário aprova PRD, Spec e ADRs numa rodada, uma decisão por pergunta.
   Aprovação parcial é permitida:
   - só vira issue o ticket aprovado cujas dependências (tickets e ADRs) também estejam aprovadas;
   - ADR devolvida continua `Proposta`, e nenhum ticket que dependa dela vira issue;
   - o que voltou passa de novo pelo gate, só na parte alterada.
6. **Issues** em `leomunhoz/Daggerheart_Cyberpunk`, uma por ticket aprovado, título
   `<id>: <tipo>(<escopo>): <resumo>`, label `epic:<spec>`. Criadas pelo Controlador com
   confirmação do usuário.

7. **Emenda (2026-11-01, decisão do usuário):** a label `epic:<spec>` do item 6 não é criada. As
   issues usam só as labels que já existem no repositório (`bug`, `enhancement`, `documentation`);
   o épico e a via vão no corpo da issue.

## Consequências

- Um gate só reduz idas e vindas e garante PRD, Spec e ADRs coerentes.
- Issues criadas depois do gate não precisam ser reescritas quando a Spec muda.
- O backlog acumula itens `triado` enquanto o lote atual não termina.

## O que os agentes NÃO podem fazer

- Criar issue antes do gate (via completa) ou sem confirmação do usuário (qualquer via).
- Implementar algo sem ticket.
- Usar a via rápida para mudança de formato salvo ou decisão que caberia numa ADR.
- O Controlador ler código ou responder pergunta técnica; ela vai ao Arquiteto.
