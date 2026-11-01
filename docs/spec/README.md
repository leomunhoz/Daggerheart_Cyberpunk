# Specs

Uma Spec por feature, em `docs/spec/<feature>.md`, escrita pelo Arquiteto. A Spec diz **o como**:
design, quebras e tickets. O slug do arquivo é o nome do épico (`Épico: <slug>` no corpo da issue).

## Modelo

```markdown
# Spec: <feature>
PRD: docs/prd/<feature>.md · ADRs: <lista> · Status: Rascunho | No gate | Aprovada | Aprovada em parte
Sistema conferido: Daggerheart <versão> · Foundry <versão>

## 1. Contexto do código
<arquivos, funções e hooks envolvidos, com caminho:linha>

## 2. API do sistema e do Foundry usada
<cada hook/classe/campo, com o arquivo do sistema onde foi conferido (ADR 0005)>

## 3. Design
<o que muda e o que não muda; dados salvos (flags, settings) novos ou alterados>

## 4. Quebras e migração
<nenhuma, ou o que quebra para mesas existentes e como migra>

## 5. Perguntas técnicas para o usuário
- Q1 — ...

## 6. Tickets
### <ID>-01: <tipo>(<escopo>): <resumo>
- Requisitos: R1, CA1
- Escopo: <arquivos>
- Testes red: <nível 1|2|3 (ADR 0004)>: <caso que falha antes da mudança e por quê>
- Critério de pronto: <verificável>
- Depende de: <tickets, ADRs ou "nada">
- Rebuild: sim | não
- Tamanho estimado: <~linhas> linhas, <n> arquivos
- Paralelo com: <ticket, ou "nenhum">

## 7. Exceções
| Ticket | Linhas | Arquivos | Motivo | Data |
|---|---|---|---|---|
```

**ID do ticket:** sigla curta do épico + número (`HUM-01`, `CREW-03`). Na via rápida, o ID é o do
backlog (`B-012`).
