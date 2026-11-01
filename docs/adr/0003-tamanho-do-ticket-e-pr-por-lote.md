# 0003 — Tamanho do ticket, um commit por ticket e PR por lote

Status: Aceita (pedido do usuário, 2026-11-01)
Data: 2026-11-01

## Contexto

Diffs grandes escondem regressões. O `scripts/main.js` tem cerca de 5 mil linhas e quase toda
mudança de conteúdo passa por ele. O dono do repositório revisa por PR, e um PR por ticket geraria
PRs demais.

## Decisão

1. **Limite do ticket:** até **~500 linhas** de diff e até **10 arquivos**.
2. **Margem automática:** até 30% acima (**650 linhas / 13 arquivos**) é exceção automática. O
   Arquiteto registra a exceção na seção "Exceções" da Spec (ticket, números, motivo) e o ticket
   segue. Acima disso, o Arquiteto divide o ticket ou emenda a Spec.
3. **Contagem** (o Examinador aplica sempre igual, com `git diff --numstat` e
   `git diff -M --name-status` contra a base do ticket):
   - **linhas** = adicionadas + removidas em código: `scripts/**`, `templates/**`, `styles/**`,
     `lang/*.json`, `module.json`, `tools/**`, `tests/**`, `.github/**`, `package.json`;
   - **contam só nos arquivos:** conteúdo e texto (`data/*.json`, `journals/**`, `docs/**`,
     `CHANGELOG.md`, `CLAUDE.md`, `.claude/**`);
   - **não contam em nenhum dos dois:** arquivos gerados (`packs/**`, `babele/pt-BR/**`) e binários
     de arte (`assets/**`). Eles continuam listados no PR;
   - **remoção pura** (arquivo apagado sem substituto) e **movimento puro** (`R100`) não contam.
4. **Um ticket = uma issue = um commit** na branch do lote, com stage só dos arquivos do ticket.
5. **PR por lote:** a cada 10 tickets commitados (ou no fim do épico, ou quando o usuário pedir), o
   DevOps abre um PR da branch `<usuário>/lote-<NN>-<slug>` contra a `main`, com um `Closes #N` por issue e a
   lista de conferências no Foundry pendentes. O merge é do usuário, e o próximo lote só começa
   depois dele.
6. **WIP 1:** um ticket em implementação ou revisão por vez. Paralelo só com o par marcado na Spec,
   sem nenhum arquivo em comum, cada um num worktree próprio do Orca.
7. **Reprovação:**
   - achado real → volta para a Fábrica;
   - só tamanho, dentro da margem → o Arquiteto registra a exceção e o ticket segue;
   - só conferência no Foundry → o ticket é commitado e a conferência vai para a lista do PR;
   - estourou o escopo → o Arquiteto divide o ticket ou emenda a Spec.
8. O ticket aprovado no gate vale como o plano exigido para mudanças em mais de três arquivos.

## Consequências

- Features grandes de conteúdo (por exemplo, 20 cyberwares novos) viram vários tickets em sequência.
- O dono revisa um PR por lote, com o histórico de um commit por ticket dentro dele.

## O que os agentes NÃO podem fazer

- Juntar dois tickets num mesmo commit.
- Incluir arquivo fora do escopo do ticket, inclusive para "aproveitar e arrumar".
- O Examinador aprovar diff acima da margem ou com arquivo fora do escopo.
- Abrir o próximo lote antes do merge do anterior.
