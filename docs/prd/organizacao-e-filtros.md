# PRD: Organização do Cyberware, Level Up sem repetição e filtro de conteúdo
Backlog: B-002, B-003, B-004, B-005 · Status: Aprovado (gate 2026-11-01) · Data: 2026-11-01

## 1. Problema
Quatro incômodos, todos de "achar o que importa na hora":

- **B-002.** Os 60 cyberwares ficam no compêndio sem ordem útil. Quem monta o personagem precisa abrir
  um por um para saber quanto custa de Carga Cibernética. O custo é a informação que decide a compra
  (Rolagem de Humanidade, risco de Ciberpsicose).
- **B-003.** No Level Up, as cartas que o personagem já escolheu continuam aparecendo na lista.
  O jogador precisa lembrar o que já tem e corre o risco de escolher de novo.
- **B-004.** Armas, itens e consumíveis do Daggerheart base aparecem misturados com os do Edgeheart
  (Item Browser, equipamento da criação). Numa mesa cyberpunk isso é ruído. A criação já esconde as
  classes que não são do Edgeheart; falta o mesmo para equipamento.
- **B-005.** Nem toda mesa quer o filtro (alguma pode misturar fantasia e cyberpunk). Ele precisa de
  um botão nas configurações do módulo.

Pedidos literais do usuário (`docs/backlog.md`):
- B-002: "Organizar todas as cyberwares dentro de seu respectivo tier por custo de cyberload e mostrar
  custo na frente do nome. Ex.: braço mecânico - custo 0."
- B-003: "Cartas já escolhidas na evolução de personagem não serem mostradas."
- B-004: "Filtrar armas, itens e consumíveis que não sejam do módulo."
- B-005: "Adicionar a opção de ativar ou desativar o filtro na configuração do módulo."

## 2. Objetivo
- Quem escolhe cyberware vê o custo de Carga Cibernética sem abrir o item, e a lista vem em ordem
  de Tier e de custo.
- Quem sobe de nível só vê cartas que ainda pode escolher.
- Quem compra ou escolhe equipamento vê só o que é do Edgeheart, se a mesa quiser.
- O mestre (ou cada jogador, conforme Q3) liga e desliga o filtro sem mexer em código.

## 3. Quem usa e quando
- **Jogador, criação de personagem:** passo de equipamento (filtro B-004); a escolha de cartas
  (já filtrada por classe).
- **Jogador, ficha / aba Chrome:** instala cyberware a partir do compêndio ou do Item Browser (B-002).
- **Jogador, Level Up:** janela de evolução, escolha de carta (B-003).
- **Mestre:** Item Browser e compêndios ao montar loja ou loot (B-004); configurações do módulo
  (B-005).
- **Telas:** compêndio **Edgeheart SRD › Itens › Cyberware**, Item Browser, criação de personagem,
  janela de Level Up, configurações do módulo.

## 4. Regra do PDF
- **Cap. 2, p. 41–44 (Cyberware).** O cyberware tem **Custo Cibernético** que soma na Carga
  Cibernética (cap. 3, p. 51). O PDF dá a faixa de custo por Tier:
  - Tier 1: "Custo 0–1" (features pequenas, utilidades, armas menores ou Acesso de Carta);
  - Tier 2: "Custo 1–2" (PV, Estresse, Evasão, Armadura, atributos);
  - Tier 3: "Custo 2–3" (combate mais forte, Acesso Total);
  - Tier 4: "Custo 3+" (grande mudança de identidade).
  Isso confirma que o custo varia dentro do Tier, então ordenar por custo dentro do Tier faz sentido.
- **Em aberto no PDF:** o PDF não define nome nem ordem de exibição. Formato do nome, ordem e
  agrupamento são decisões de interface (perguntas Q1, Q2, Q4).
- **Level Up e Competências** (acesso por cyberware): o PDF não fala da janela de Level Up do
  Foundry. A regra de "não repetir carta" vem do jogo base (uma carta só pode ser tomada uma vez).
  O caso das cartas de Competência liberadas por cyberware ou multiclasse é a pergunta Q7.
- **Filtro de equipamento:** não é regra do PDF, é conforto de mesa.

## 5. Requisitos

### B-002 — Cyberware organizado por Tier e custo, com o custo no nome
- R1 — Dentro de cada Tier, os cyberwares aparecem do **menor para o maior custo** de Carga
  Cibernética. Desempate: ordem alfabética (Q4 define onde isso vale).
- R2 — O nome mostrado ao jogador traz o custo na frente, no formato decidido em Q1.
  Exemplo do usuário: "Braço Mecânico - Custo 0".
- R3 — Vale para os 60 cyberwares do compêndio, nas duas línguas. Eidolons (Cyberware Especial) ficam
  como estão, na pasta própria, salvo decisão em Q2.
- R4 — O custo no nome é o **custo base** do item. Quando o custo muda por escolha ou efeito (ex.:
  Sincronia do Eidolon), o nome não muda sozinho.
- R5 — Personagens que já têm cyberware instalado não perdem nada: o item continua funcionando,
  com o comportamento decidido em Q5 para o nome.
- R6 — Escolhas, ações e automações dos cyberwares continuam funcionando como hoje (nada que dependa
  do nome pode quebrar).

### B-003 — Level Up sem cartas já escolhidas
- R7 — Na janela de Level Up, cartas que o personagem **já possui** não aparecem na lista de escolha.
- R8 — Se não sobrar nenhuma carta elegível, a janela mostra a lista vazia sem erro, e o jogador
  consegue concluir o Level Up da forma que ela já permite hoje.
- R9 — O comportamento para cartas de Competência vindas de cyberware ou multiclasse é o de Q7.

### B-004 — Filtrar conteúdo que não é do módulo
- R10 — Com o filtro ligado, **armas, itens e consumíveis** que não são do Edgeheart não aparecem nas
  telas escolhidas em Q1b (ver Q2). Armaduras e loot seguem Q2b.
- R11 — O filtro **esconde, não apaga**: nada é removido do mundo, do compêndio do sistema ou de
  fichas existentes. Itens que o personagem já tem continuam na ficha.
- R12 — Com o filtro desligado, tudo aparece como no Daggerheart sem o módulo.
- R13 — O filtro não mexe nas classes da criação (já filtradas hoje); esse comportamento fica como
  está, e o interruptor de B-005 só controla o que é novo (Q3b pergunta se deve controlar as classes
  também).

### B-005 — Opção nas configurações
- R14 — Existe uma opção nas configurações do módulo para ligar e desligar o filtro, com título e
  descrição claros, nas duas línguas.
- R15 — Mudar a opção vale sem recarregar o Foundry, ou avisa que é preciso recarregar (decisão do
  Arquiteto, por limite técnico).
- R16 — Escopo (mundo ou jogador) e padrão (ligado/desligado) conforme Q3 e Q6.

## 6. Fora do escopo
- Mudar custo, texto ou regra de qualquer cyberware.
- Mudar o Level Up além de esconder cartas já escolhidas (sem nova regra de progressão).
- Filtrar adversários, ambientes, classes, subclasses ou Competências (as classes já são filtradas).
- Apagar ou mover itens do sistema Daggerheart.
- Filtro por Tier, raridade ou busca avançada.

## 7. Critérios de aceite
- CA1 — Dado o compêndio de Cyberware, quando o jogador abre a lista de um Tier, então os itens vêm do
  menor para o maior custo de Carga, e itens de mesmo custo em ordem alfabética.
- CA2 — Dado o cyberware "Braço Mecânico" (custo 0), quando ele aparece na lista em pt-BR, então o
  nome mostrado segue o formato de Q1 (ex.: "Braço Mecânico - Custo 0"), e o equivalente em inglês
  na língua en.
- CA3 — Dado cada um dos 60 cyberwares, quando comparo o custo no nome com o custo no texto do item,
  então são iguais.
- CA4 — Dado um personagem com cyberware já instalado antes desta versão, quando abro a ficha na
  versão nova, então o item continua instalado, com a Carga Cibernética igual à de antes e
  nenhuma ação ou escolha perdida.
- CA5 — Dado um personagem que já tem a carta X, quando abre o Level Up e chega à escolha de cartas,
  então X não aparece na lista.
- CA6 — Dado um personagem que nunca escolheu a carta Y, quando abre o Level Up, então Y aparece
  como hoje.
- CA7 — Dado um personagem sem nenhuma carta elegível sobrando, quando abre a escolha de cartas,
  então a janela abre sem erro e mostra a lista vazia.
- CA8 — Dado o filtro ligado, quando abro o Item Browser (ou outra tela de Q2) e listo armas, itens e
  consumíveis, então só aparecem os do Edgeheart.
- CA9 — Dado o filtro ligado, quando o personagem já tem uma arma do Daggerheart base na ficha,
  então ela continua na ficha e funciona.
- CA10 — Dado o filtro desligado, quando abro as mesmas telas, então a lista é a do Daggerheart sem
  filtro.
- CA11 — Dado o filtro ligado ou desligado, quando abro a criação de personagem, então as classes
  continuam filtradas como hoje (salvo decisão de Q3b).
- CA12 — Dado a tela de configurações do módulo, quando abro, então vejo a opção do filtro com título
  e descrição na língua do Foundry, em en e pt-BR.
- CA13 — Dado a opção desligada por quem tem permissão (Q3), quando outro usuário abre o Item
  Browser, então vê o resultado conforme o escopo escolhido (mundo: igual ao do mestre; jogador: o
  próprio valor).
- CA14 — Dado que o filtro está no padrão de Q6, quando instalo o módulo num mundo novo, então a opção
  começa nesse valor.

Roteiro de conferência (Foundry): abrir cada tela com a opção ligada e desligada, como mestre e como
jogador; subir de nível um personagem com cartas; abrir um personagem antigo com cyberware.

## 8. Idiomas
Textos novos em `lang/en.json` e `lang/pt-BR.json` (sob `EDGEHEART.*`):

| Onde | Inglês | Português |
|---|---|---|
| Título da opção (proposta) | "Hide non-Edgeheart gear" | "Ocultar equipamento que não é do Edgeheart" |
| Descrição (proposta) | "Hides weapons, items and consumables from other sources in the Item Browser and character creation." | "Oculta armas, itens e consumíveis de outras fontes no Item Browser e na criação de personagem." |
| Nome do cyberware (proposta, Q1) | "Mechanical Arm - Cost 0" | "Braço Mecânico - Custo 0" |

Nomes de cyberware, Tiers e Competências ficam como no PDF e no glossário. A palavra do custo no
nome depende de Q1.

## 9. Perguntas para o usuário

- **Q1 — Formato do nome com custo.** Qual formato exato?
  - (a) `Braço Mecânico - Custo 0` / `Mechanical Arm - Cost 0` (o do seu exemplo, custo no **fim**).
  - (b) `[0] Braço Mecânico` / `[0] Mechanical Arm` (custo curto na **frente**).
  - (c) `Custo 0 - Braço Mecânico` / `Cost 0 - Mechanical Arm`.
  - Nota: seu pedido diz "na frente do nome" mas o exemplo põe o custo depois. **Recomendo (b)**: o
    custo fica na frente e a lista ordena sozinha mesmo em telas que ordenam por nome. Se você quer
    exatamente o exemplo, (a).

- **Q1b — Telas do filtro (B-004).** Em que telas o filtro vale?
  - (a) Só no Item Browser.
  - (b) Item Browser e passo de equipamento da criação de personagem.
  - (c) (b) mais as listas de compêndio da barra lateral.
  - (d) (b) mais lojas e seleção de loot, se existirem.
  - **Recomendo (b):** é onde o jogador escolhe. Esconder compêndios da barra lateral atrapalha quem
    quer buscar de propósito.

- **Q2 — Quais tipos de item o filtro cobre.** O backlog fala em armas, itens e consumíveis.
  - (a) Só esses três.
  - (b) Esses três mais armaduras e loot.
  - **Recomendo (b)**, para não sobrar armadura de fantasia em mesa cyberpunk. (Em R10 chamei de Q2b.)

- **Q2c — Organizar o cyberware: ordem, subpasta ou os dois?** (era a sua dúvida sobre "organizar")
  - (a) Só a **ordem** dentro da pasta do Tier (compêndio).
  - (b) **Subpasta por custo** dentro de cada Tier (ex.: Tier 1 › Custo 0, Custo 1).
  - (c) Os dois.
  - **Recomendo (a)**: com o custo no nome, a ordem já resolve; subpastas viram muitos cliques para
    poucos itens por custo. Observação: Eidolons seguem na pasta própria em todas as opções.

- **Q3 — Escopo da opção.** A opção vale para quem?
  - (a) **Mundo** (só o mestre muda; todos veem o mesmo).
  - (b) **Por jogador** (cada um escolhe).
  - (c) Mundo define o padrão e o jogador pode sobrescrever.
  - **Recomendo (a):** a mesa joga o mesmo cenário; evita jogador vendo lista diferente do mestre.

- **Q3b — Interruptor e classes.** O interruptor também controla o filtro de classes da criação (que
  hoje é fixo)?
  - (a) Não, as classes ficam sempre filtradas (não mexe no que existe).
  - (b) Sim, um interruptor para tudo.
  - **Recomendo (a):** não muda o comportamento atual (ADR 0003).

- **Q4 — Onde a ordenação por custo vale.**
  - (a) Só na ordem do compêndio.
  - (b) No compêndio e na lista da aba Chrome da ficha (cyberware instalado).
  - **Recomendo (a)**, salvo se você quiser a aba Chrome ordenada também; lá a ordem de instalação
    costuma importar mais.

- **Q5 — Cyberwares já instalados (nome antigo).** O que acontece com o nome em personagens
  existentes?
  - (a) Ficam com o **nome antigo** (sem custo); só os itens novos do compêndio têm o custo no nome.
  - (b) Todos são **renomeados** automaticamente ao carregar o mundo.
  - (c) Ficam com o nome antigo e o mestre tem um botão "atualizar nomes".
  - **Recomendo (a):** não toca personagem existente; o custo já aparece na aba Chrome. (b) dá
    consistência mas altera dados do jogador sem pedido.

- **Q6 — Padrão do filtro.**
  - (a) **Ligado** (mesas novas já veem só o Edgeheart).
  - (b) **Desligado** (comportamento atual preservado até alguém ligar).
  - **Recomendo (a)** para mundos novos e **desligado para mundos já existentes**, para não sumir
    conteúdo de quem já joga. Se só puder uma: (b).

- **Q7 — Level Up e cartas de Competência vindas de cyberware ou multiclasse.** B-003 também vale
  para elas?
  - (a) Sim, qualquer carta que o personagem já tem some da lista, venha de onde vier.
  - (b) Só cartas escolhidas por Level Up; as liberadas por cyberware/multiclasse seguem aparecendo.
  - **Recomendo (a):** carta é carta; repetir não faz sentido. Atenção: se o cyberware for removido
    e a carta tiver sido tomada por acesso dele, o Arquiteto precisa avaliar o efeito.

## 9.1 Respostas do usuário (gate 2026-11-01)

| Pergunta | Resposta |
|---|---|
| Q1 — Formato do nome | (b) `[0] Braço Mecânico` / `[0] Mechanical Arm` |
| Q1b — Telas do filtro | (b) Item Browser e passo de equipamento da criação |
| Q2 — Tipos de item | (b) armas, itens, consumíveis, armaduras e loot |
| Q2c — Organizar | (a) só a ordem por custo dentro da pasta do Tier |
| Q3 — Escopo da opção | (a) mundo (só o mestre muda) |
| Q3b — Interruptor e classes | (a) não; as classes da criação continuam sempre filtradas |
| Q4 — Onde ordenar | (a) só no compêndio; a aba Chrome fica como está |
| Q5 — Cyberware já instalado | (a) mantém o nome antigo |
| Q6 — Padrão do filtro | **ligado sempre** (inclusive em mundos que já usam o módulo) |
| Q7 — Cartas no Level Up | (a) qualquer carta já possuída some, venha de onde vier |

Fica para o Arquiteto: R15 (vale sem recarregar ou pede recarga).

## 10. Ajustes de mesa
| Data | Observação | Ajuste pedido | Status |
|---|---|---|---|
| | | | |
