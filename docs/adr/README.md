# ADRs

Decisões de arquitetura e de processo. Formato:

```markdown
# NNNN — <decisão>
Status: Proposta | Aceita (<data e origem>) | Adiada | Substituída por NNNN
Data: AAAA-MM-DD
## Contexto
## Decisão
## Consequências
## O que os agentes NÃO podem fazer
```

Uma ADR aceita não é reescrita: ganha uma seção `## Emenda (AAAA-MM-DD)` ou é substituída.

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-docs-como-pasta-de-documentos-internos.md) | `docs/` guarda PRDs, Specs, ADRs e referências, fora do `module.zip` | Aceita |
| [0002](0002-fluxo-backlog-prd-spec-gate-unico-issues.md) | Fluxo backlog → PRD → Spec → gate único → issues, com via rápida | Aceita |
| [0003](0003-tamanho-do-ticket-e-pr-por-lote.md) | Ticket ≤ ~500 linhas e 10 arquivos (+30% automático); um commit por ticket; PR a cada 10 | Aceita |
| [0004](0004-testes-em-tres-niveis.md) | Teste red em três níveis: checagem estática, Node com stub, roteiro no Foundry | Aceita |
| [0005](0005-modulo-nao-modifica-o-sistema-e-packs-gerados.md) | Só a API pública do sistema; packs e Babele são gerados; ids estáveis | Aceita |
| [0006](0006-versao-e-changelog-no-padrao-do-dono.md) | Versão e CHANGELOG no padrão atual do repositório; release é do dono | Aceita |
| [0007](0007-leitura-tolerante-a-versao-do-sistema.md) | Campo novo do sistema primeiro, antigo como reserva, enquanto o `minimum` cobrir a versão antiga | Aceita |
