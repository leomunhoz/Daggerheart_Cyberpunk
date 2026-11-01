---
name: revisao
description: Examinador revisa um ticket implementado (padrões, Spec, ADRs, regras do módulo), roda npm run verify e dá APROVADO (nota ≥ 80% e zero achados) ou REPROVADO com o motivo classificado. Use depois de /implementar.
argument-hint: <spec ou "rapida"> <ticket>
---

Revise o ticket: $ARGUMENTS

1. **Diff.** `git diff` e `git diff --stat` contra o último commit da branch do lote (os arquivos do
   ticket ainda não estão commitados). Confirme:
   - só arquivos do escopo do ticket mudaram;
   - tamanho pela ADR 0003, com `git diff --numstat` e `git diff -M --name-status`: linhas em código,
     conteúdo e texto só nos arquivos, gerados e arte fora, remoção pura e `R100` fora;
   - nenhum arquivo proibido: `README.md`, `packs/**`, `babele/pt-BR/**`, `.github/**`, o PDF,
     `version`/`manifest`/`download` do `module.json`.
2. **Quatro eixos, 25% cada.**
   - **Padrões:** `CLAUDE.md` (regras invioláveis e convenções), sem dependência nova, sem
     refatoração fora do escopo, texto de interface nas duas línguas.
   - **Spec:** faz o que o ticket pede (ou o item da via rápida), cumpre o critério de pronto e não
     faz nada a mais.
   - **ADR:** respeita as ADRs aceitas em `docs/adr/`.
   - **Módulo e sistema:** só API pública do sistema e do Foundry, conferida em `docs/referencias/`;
     chaves de `stableId`, flags, settings e nomes de ação automatizada preservados; registro no
     `init`, `game.system.api` fora do topo do arquivo.
3. **Testes.** Rode `npm run verify` e cole o resumo. Confira que o teste red do ticket existe e que
   falharia sem a mudança: leia o teste contra o código antigo (`git show HEAD:<arquivo>`) e a saída
   red do relatório da Fábrica. Não use `git stash` nem `checkout` (você não altera estado do git).
   Roteiro nível 3: confira que está completo e claro; ele não conta como executado.
4. **Veredito.**

```markdown
## Revisão <spec> <ticket>
Nota: <0–100>%  (Padrões x/25 · Spec x/25 · ADR x/25 · Módulo e sistema x/25)
Verify: <check ok/erro · testes n passou / n falhou>
Tamanho: <linhas> linhas, <arquivos> arquivos (limite 500/10, margem 650/13)
Veredito: APROVADO | REPROVADO
Motivo da reprovação: achado real | só tamanho (dentro da margem) | só conferência no Foundry | estouro de escopo
Conferência no Foundry pendente: <roteiro, ou "nenhuma">

### Achados
1. `arquivo:linha` — <problema>. Regra: <fonte>. Cenário de falha: <entrada → resultado errado>.
```

APROVADO exige nota ≥ 80%, zero achados e `npm run verify` passando. Um ticket cujo único pendente
é a conferência no Foundry é APROVADO com a conferência listada (ela vai para o PR). Não corrija
nada; os achados voltam para a Fábrica.
