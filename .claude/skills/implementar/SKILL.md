---
name: implementar
description: Fábrica implementa UM ticket (da Spec ou da via rápida) com teste red primeiro, depois o mínimo de código até green, e npm run verify. Use quando houver um ticket com issue pronto para implementação.
argument-hint: <spec ou "rapida"> <ticket, ex. HUM-03 ou B-012>
---

Implemente o ticket: $ARGUMENTS

1. **Ler.** Leia o ticket (`docs/spec/<feature>.md` ou o item em `docs/backlog.md` / a issue na via
   rápida), as ADRs citadas, `docs/mapa-do-codigo.md` e todo o código no escopo. Pare e devolva ao
   Controlador se:
   - o ticket é ambíguo;
   - precisa de arquivo fora do escopo;
   - a estimativa passa da margem da ADR 0003 (650 linhas / 13 arquivos);
   - outro ticket está em implementação ou revisão e este não é o par paralelo marcado na Spec.
2. **Red.** Escreva o teste do nível pedido (ADR 0004) e mostre que **falha pelo motivo esperado**:
   - nível 1: regra nova em `tools/check.mjs` → `npm run check` falha;
   - nível 2: teste em `tests/<área>.test.mjs` com o stub `tests/helpers/foundry-stub.mjs`
     (amplie o stub só no necessário) → `npm test` falha;
   - nível 3: roteiro numerado (mundo de teste, passos, resultado esperado, resultado atual) e,
     quando der, um trecho para o console do Foundry. Você não roda o Foundry; o roteiro vai para o
     relatório e depois para a lista do PR.
3. **Green.** Escreva o mínimo de código para o teste passar, sem refatorar nada fora do ticket.
   Texto de interface nas duas línguas. Se mudou conteúdo de compêndio, não toque em `packs/` nem
   `babele/pt-BR/`: o ticket tem `Rebuild: sim`.
4. **Verificar.** `npm run verify` inteiro passando. Confira o tamanho:
   `git diff --numstat` e `git diff -M --name-status`, contados como na ADR 0003.
5. **Relatório.** Ticket; arquivos alterados; saída do red; saída do green; saída do
   `npm run verify`; contagem (linhas, arquivos); roteiro nível 3 (se houver); `Rebuild`;
   pendências. Não commite: o próximo passo é `/revisao`.
