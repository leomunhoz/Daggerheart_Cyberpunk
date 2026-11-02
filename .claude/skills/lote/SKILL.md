---
name: lote
description: DevOps abre o PR do lote contra a main - a cada 10 tickets commitados, no fim do épico ou quando o usuário pedir - com um Closes por issue, as conferências no Foundry pendentes e o passo de rebuild. Só com confirmação do usuário.
argument-hint: <NN>
disable-model-invocation: true
---

Abra o PR do lote: $ARGUMENTS

1. **Pré-condições.**
   - Todos os tickets do lote estão commitados e a branch `<usuário>/lote-<NN>-<slug>` está publicada.
   - `npm run verify` passa na ponta da branch.
   - Se algum ticket tem `Rebuild: sim`, o commit `chore(packs)` já existe. Senão, pare e peça ao
     usuário para rodar o gerador (`docs/TIME.md`, "Branch, versão e release").
   - O commit de versão (`vX.Y.Z: …`) é o último, se o usuário quiser versão neste lote.
2. **Coletar.** `git log --oneline main..HEAD` → lista de tickets e issues (`Refs #N` nos corpos).
   Das revisões e do backlog, junte os roteiros de conferência no Foundry pendentes.
3. **Corpo do PR** (português; use a skill `pr` se disponível):
   - **Resumo** do lote, em poucas linhas, para quem joga e para o dono do repositório;
   - **Tickets:** um item por commit, com o link da issue;
   - **Conferir no Foundry antes do merge:** checklist com os roteiros nível 3, cada um com mundo,
     passos e resultado esperado;
   - **Rebuild:** se houve, o comando rodado e a versão do Foundry e do sistema usadas;
   - **Fora do zip:** se o lote mexeu em `docs/`, `tools/`, `tests/` ou `.claude/`, diga que essas
     pastas não entram no `module.zip`;
   - `Closes #N`, um por linha, para cada issue.
4. Mostre o título e o corpo ao usuário. Só com o OK:
   `gh pr create --repo leomunhoz/Daggerheart_Cyberpunk --base main --head <usuário>/lote-<NN>-<slug> --title "Lote <NN>: <resumo>" --body-file <arquivo no scratchpad>`
5. Devolva o link. O merge é do usuário, e o próximo lote só começa depois dele.
