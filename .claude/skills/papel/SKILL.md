---
name: papel
description: Controlador abre um papel do time (criativo, arquiteto, fabrica, examinador, devops) num terminal próprio do Orca, entrega o pedido e acompanha até o worker_done. É o jeito padrão de acionar o time; subagente só quando for necessário.
argument-hint: <papel> <pedido, ex. "/implementar hum HUM-03">
---

Abra o papel e entregue o pedido: $ARGUMENTS

O time roda em terminais do **Orca**, um por papel. Não use a Agent tool para acionar papéis. Ela só
entra quando for necessário: uma busca ampla e rápida em que você só precisa da conclusão.

1. **Executável e guia.** Use `orca` (ou o valor de `ORCA_CLI_COMMAND`, se existir). Na primeira vez
   na sessão, carregue os guias versionados: `orca skills get orca-cli` e
   `orca skills get orchestration`. Use as flags que o guia mostrar; não invente comando.
2. **Worktree.** Todo trabalho de um lote acontece no worktree do lote (`docs/TIME.md`, "Branch,
   versão e release"). Ache com `orca worktree list --json`. Se ainda não existe, peça ao DevOps
   (`/papel devops criar a branch do lote NN`) depois de confirmar com o usuário. Para um ticket em
   paralelo marcado na Spec, crie um worktree filho: `orca worktree create --name <ticket>
   --parent-worktree <lote> --json`.
3. **WIP.** Confira `docs/backlog.md` ("Lote atual"): só um ticket em implementação ou revisão por
   vez, salvo o par paralelo marcado na Spec.
4. **Terminal do papel.** Um terminal novo **por tarefa**: a sessão do papel encerra depois do
   `worker_done`, e reaproveitar o terminal dá `agent_unconfigured`.
   `orca terminal create --worktree <sel> --title "<papel> <ticket>" --command "claude --agent <papel>" --json`
5. **Entregar e supervisionar** (orquestração do Orca):
   - uma vez por lote: `orca orchestration run-create --objective "Lote NN: <slug>" --json`
     (depois de reiniciar, `run-use --id <run>`);
   - `orca orchestration worker-start --terminal <handle> --task-title "<ticket> <papel>" --spec "<pedido>" --json`;
   - `orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json`;
   - em worktree que não é o atual, passe `--worktree id:<repoId>::<caminho>` no `worker-start`
     (senão dá `terminal_worktree_mismatch`);
   - se o `worker-start` responder `agent_unconfigured`, a sessão do papel naquele terminal acabou:
     abra um terminal novo para o papel (passo 4) e reenvie.

   O pedido (`--spec`) começa pelo comando da skill do papel (`/implementar …`, `/revisao …`,
   `/prd-feature …`, `/commit …`, `/lote …`) e traz só o contexto que não está nos documentos.
6. **Perguntas e escalonamentos.** Pergunta técnica que o papel não resolve vai para o Arquiteto;
   decisão de produto vai para o usuário. Responda pelo mecanismo de `ask/reply` do guia.
7. **Resultado.** Ao receber o `worker_done`, leia o resumo, atualize `docs/backlog.md` (estado do
   item e "Lote atual") e decida o próximo passo pelo fluxo (`docs/TIME.md`). Mantenha o comentário
   do worktree em dia: `orca worktree set --worktree <sel> --comment "<ticket>: <estado>" --json`.
   Feche o terminal do papel só se ele não for usado de novo neste lote.

Se o `orca` não responder, diga o erro exato ao usuário e pare. Não troque por subagentes por conta própria.
