---
name: prd-feature
description: Criativo escreve o PRD de uma feature do módulo Edgeheart em docs/prd/, fiel ao PDF, com R1.., CA1.. e Q1... Use quando um item do backlog foi triado para a via completa.
argument-hint: <B-xxx ou nome da feature>
---

Escreva o PRD de: $ARGUMENTS

1. Leia o item em `docs/backlog.md`, `docs/referencias/edgeheart-pdf.md` e as páginas do PDF que
   tratam do assunto (texto em `journals/srd/` e `journals/en/srd/`). Veja no `CHANGELOG.md` se o
   módulo já fez algo parecido.
2. Crie `docs/prd/<feature-em-kebab-case>.md` com o modelo de `docs/prd/README.md`.
3. Regras:
   - requisitos R1, R2… curtos; critérios de aceite CA1, CA2… no formato "Dado …, quando …, então …";
   - a seção 4 cita a página do PDF e diz o que o PDF deixa em aberto;
   - a seção 8 lista os textos novos de interface (inglês e português) e o que fica no original;
   - perguntas Q1, Q2…: uma decisão por pergunta, com opções e a sua recomendação. Não invente
     requisito para fugir de uma pergunta.
4. Status `Rascunho`. Só vira `Aprovado` no gate único, com o OK do usuário.
5. Devolva o caminho e as perguntas. O próximo papel é o Arquiteto.
