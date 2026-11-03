# PRD: Visual do módulo e Level Up do Edgeheart
Backlog: B-016, B-017, B-018, B-019 · Status: Rascunho · Data: 2026-11-02

Referências: `docs/referencias/design-atual.md` (inventário do Arquiteto), `docs/referencias/edgeheart-pdf.md`,
artefato visual aprovado https://claude.ai/artifact/QYoWtertbZFkB7KR6vDWKN, seção "Decisões do usuário
sobre o artefato (2026-11-02)" do `docs/backlog.md`.

## 1. Problema

1. O Level Up do Daggerheart ainda oferece Atributos, PV, Estresse e Evasão, que o PDF manda tirar do
   avanço porque vêm do Cyberware. O módulo já filtra essas opções, mas a janela não conta isso a quem
   joga, não mostra de onde vêm as melhorias e não inclui a Humanidade nem o Cyberware.
2. A janela de Level Up é do sistema (pergaminho, Montserrat) e destoa da Ficha Edgeheart.
3. Só a Ficha Edgeheart tem o tema cyberpunk. Ficha da Crew (ciano, cantos arredondados), diálogos do
   módulo e cards de chat parecem partes de outro produto.
4. A barra de Medo é a do sistema (caveira em círculo azul, gradiente roxo) e não combina com o clima.

## 2. Objetivo

Level Up que segue o PDF e explica as regras da mesa, com a cara da Ficha Edgeheart; as demais telas do
módulo no mesmo tema; e uma barra de Medo cyberpunk. **A Ficha Edgeheart atual não muda**: o tema dela é
a referência (decisão do usuário).

## 3. Quem usa e quando

- **Jogador**: ao subir de nível (botão de Level Up da ficha), ao rolar Humanidade, ao ver o chat, ao
  responder diálogos de cyberware.
- **Mestre**: barra de Medo (muda o valor), diálogos de Edge/Eidolon, Ficha da Crew, ajustes de Humanidade.
- **Telas**: janela de Level Up; barra de Medo (HUD); diálogos do módulo; Ficha da Crew; chat.

## 4. Regra do PDF

| Regra | Fonte | Observação |
|---|---|---|
| Subir de nível/Tier não dá mais as opções de PV, Estresse, Evasão, Limiares de Dano e Atributos; essas melhorias vêm do Cyberware. Continuam cartas de Competência mais fortes, features de classe/subclasse e opções de Tier mais alto. | Overview, PDF p. 4–7 (`journals/campaign-frame/02-visao-geral.html`) | Limiares: ver Q2 |
| "Cyberware replaces part of the normal advancement structure… still gain class features, Competency card options, Experiences, and narrative growth as normal." | Cyberware, p. 41 (`journals/en/srd/26-cyberware.html`) | |
| Cyberware por Tier: T1 custo 0–1; T2 1–2 (PV, Estresse, Evasão, Armadura, Atributos, Meio Acesso); T3 2–3 (Acesso Total); T4 3+ | p. 41–42 | O Level Up não oferece cyberware hoje (Q5) |
| Dado de Humanidade começa em d6 e avança **uma vez por nível** (d4→d6→d8→d10→d12) com vínculo, objetivo, recuperação ou esperança genuína | Mecânicas, p. 51 (`journals/srd/32-mecanicas.html`) | Hoje é o botão ↑ da aba Chrome (Q3) |
| Multiclasse | o PDF não fala | O módulo a remove por causa dos Acessos Cibernéticos; decisão do módulo, mantida |

O PDF deixa em aberto: se o Level Up deve conceder cyberware; se a Humanidade é passo do avanço; os
Limiares de Dano em termos de implementação.

## 5. Requisitos

**Level Up (B-016)**
- R1 — A janela de Level Up de um personagem Edgeheart oferece só as opções que o PDF mantém:
  Experiência, Carta de Domínio, Subclasse, Proficiência. Atributos, PV, Estresse, Evasão e Multiclasse
  não aparecem como opção (comportamento já existente, a preservar).
- R2 — A janela diz ao jogador, num painel lateral "Vem do Cyberware", quais melhorias saíram do avanço
  (Atributos, PV, Estresse, Evasão, Multiclasse, riscados) e o que continua automático (Limiares +1, salvo Q2).
- R3 — Um passo "Humanidade" propõe avançar o Dado de Humanidade um passo (ex.: d6 → d8), no máximo
  uma vez por nível, mostrando o dado atual e o novo (sujeito a Q3). O limite por nível é o mesmo da aba
  Chrome: avançar num lugar vale no outro. O mestre continua podendo ignorar o limite.
- R4 — Um painel "Cyberware do Tier" resume o Tier ativo e dá atalho ao compêndio de Cyberware (sujeito a
  Q5); não concede cyberware sozinho.
- R5 — O resumo final mostra linhas "antigo → novo" e a Humanidade quando avançada.
- R6 — Personagens que não usam a Ficha/regra Edgeheart, e mesas com a setting "Level Up do Edgeheart"
  desligada, veem o Level Up original do sistema, sem mudança.
- R7 — Nada do sistema é modificado: só CSS escopado, hook `renderDhCharacterLevelUp` e settings oficiais
  de Homebrew (regra 1 do CLAUDE.md).

**Janela de Level Up no tema (B-017)**
- R8 — A janela de Level Up de personagem Edgeheart usa o tema da ficha: fundo preto com scanline,
  amarelo `#fcee0a`, Rajdhani/Chakra Petch, cantos chanfrados e cantoneira `SYS://NN` por passo.
- R9 — Passos numerados: 01 Avanço, 02 Escolhas, 03 Humanidade (proposta), 04 Resumo.
- R10 — O Tier ativo tem caixas chanfradas com as opções; Tiers bloqueados aparecem apagados.
- R11 — O tema respeita `prefers-reduced-motion` e a setting de visual (Q1).

**Outros menus (B-018)**
- R12 — Diálogos do módulo ganham o tema: Buffer Cortical, escolha de cyberware (atributo, Experiência,
  Competência, Tactical Mesh), escolha de feature (Pick), Sincronizar sem Soul Bond, Movimento de Edge
  (confirmação), Back Me Up, Plan B. O diálogo de Eidolon inutilizado usa a variante vermelha.
- R13 — A Ficha da Crew usa o tema amarelo, cantos chanfrados e cantoneira; ciano só como destaque
  (Edge, custo). Estrutura e funções não mudam.
- R14 — Cards de chat do módulo (Rolagem de Humanidade, Ciberpsicose, Plan B e demais da Crew) usam o
  tema; resultado positivo e negativo continuam distinguíveis (não só pela cor).
- R15 — Todo texto novo existe em inglês e português (`EDGEHEART.*`).
- R16 — O tema é escopado por classe própria do módulo: nada fora das telas do módulo muda de aparência.

**Barra de Medo (B-019)**
- R17 — Modo tokens: cada ponto de Medo é uma caveira-vírus em hexágono vermelho `#ff2a4f`, com glow e
  tremida leve; ponto vazio é só o contorno apagado.
- R18 — Modo barra: 12 segmentos inclinados, com caveira na ponta; usa o valor máximo de Medo da mesa.
- R19 — A tremida desliga com `prefers-reduced-motion`; o `hue-rotate` do sistema é anulado.
- R20 — Clicar para ajustar o Medo (mestre) funciona como no sistema nos dois modos e nas posições.
- R21 — Modo "ocultar" do sistema continua oculto. Quem desligar o visual (Q4) vê a barra original.

**Produção de arte**
- R22 — Ícones e imagens (ex.: a caveira-virus) são **gerados pelo Codex**, com pedido completo (uso,
  tamanho em px, formato, fundo transparente, paleta do tema). Botões, molduras e overlays são CSS/SVG
  feitos pelo Claude (Fábrica). Todo asset vai para `assets/` e entra no `module.zip`.

## 6. Fora do escopo

- Mudar a Ficha Edgeheart de personagem (decisão do usuário).
- Editar template, LESS, PARTS ou classe do sistema; copiar arquivos dele (regra 1).
- Novas regras de jogo além das do PDF; a Multiclasse não volta ao Level Up.
- Item Browser, tela de criação, Configurações do Foundry, barra de progresso do build.
- Auditoria PDF × módulo (B-020).

## 7. Critérios de aceite

Roteiros no Foundry (nível 3, ADR 0004); o que for lógica puro (limite por nível, filtro de opções) pode ter teste.

- CA1 — Dado personagem Edgeheart com Level Up do Edgeheart ligado, quando abro a janela de Level Up,
  então o passo Avanço não oferece Atributos, PV, Estresse, Evasão nem Multiclasse.
- CA2 — Dado a mesma janela, quando olho o painel lateral, então vejo "Vem do Cyberware" com esses cinco
  itens riscados e os Limiares como automático (ou conforme Q2).
- CA3 — Dado personagem sem avanço de Humanidade no nível, quando chego ao passo 03, então vejo o Dado
  atual e o novo (d6 → d8) e posso aceitar ou pular (conforme Q3).
- CA4 — Dado Humanidade já avançada neste nível (pela aba Chrome ou pelo Level Up), quando abro o passo 03,
  então a proposta aparece indisponível; o mestre ainda pode forçar.
- CA5 — Dado Dado de Humanidade d12, quando abro o passo 03, então não há proposta de avanço.
- CA6 — Dado o passo 04, quando abro o resumo, então vejo linhas "antigo → novo" para as escolhas e a
  Humanidade (d6 → d8) se avançada.
- CA7 — Dado Level Up de personagem que não é Edgeheart ou setting desligada, quando abro a janela, então
  ela é idêntica ao sistema (sem tema, sem painéis novos).
- CA8 — Dado janela de Level Up Edgeheart, quando olho o visual, então há fundo preto com scanline,
  amarelo, fontes do tema, cantos chanfrados e `SYS://01..04` nos passos.
- CA9 — Dado Tiers 2–4, quando o personagem está no Tier ativo, então suas caixas ficam em destaque e os
  Tiers bloqueados apagados e não marcáveis.
- CA10 — Dado sistema operacional com `prefers-reduced-motion`, quando abro Level Up, Medo ou Crew, então nenhuma animação roda.
- CA11 — Dado que o Buffer Cortical, a escolha de cyberware, Edge/Back Me Up/Plan B e Sincronizar sem Soul
  Bond aparecem, quando abertos, então usam o tema; o de Eidolon inutilizado usa o vermelho.
- CA12 — Dado diálogo que não é do módulo (ex.: apagar documento), quando abre, então não tem tema nosso.
- CA13 — Dado Ficha da Crew, quando abro, então fundo, bordas e cantoneira seguem o tema, ciano só em
  destaque, e Edge, Movimentos e campos funcionam como antes.
- CA14 — Dado uma Rolagem de Humanidade, de Ciberpsicose e um Plan B no chat, quando aparecem, então usam o
  tema, e sucesso/falha se distinguem por texto e não só por cor.
- CA15 — Dado Medo = 5 de 12 no modo tokens, quando vejo a barra, então 5 caveiras-vírus vermelhas em
  hexágono com glow e 7 contornos apagados, sem hue-rotate do sistema.
- CA16 — Dado modo barra, quando o Medo é 5 de 12, então 5 de 12 segmentos inclinados estão cheios, com
  caveira na ponta.
- CA17 — Dado mestre, quando clica num ponto ou usa +/-, então o Medo muda e a barra se redesenha com o tema
  (a cada render).
- CA18 — Dado modo "ocultar" do sistema, quando o mundo carrega, então a barra segue oculta.
- CA19 — Dado a opção de visual da barra desligada (Q4), quando recarrego, então a barra é a original.
- CA20 — Dado qualquer tela com tema, quando troco o idioma para en e pt-BR, então todo texto novo aparece
  no idioma e `npm run verify` passa.
- CA21 — Dado a Ficha Edgeheart de personagem, quando comparo antes e depois, então ela está igual.
- CA22 — Dado o pacote da release, quando listo `assets/`, então os ícones gerados estão lá.

## 8. Idiomas

Textos novos em `lang/en.json` e `lang/pt-BR.json`, sob `EDGEHEART.*`. Sugestões (en / pt-BR):
"Comes from Cyberware" / "Vem do Cyberware"; "Humanity" / "Humanidade"; "Cyberware of the Tier" /
"Cyberware do Tier"; "Advance Humanity die" / "Avançar o Dado de Humanidade"; "Skip" / "Pular";
"Summary" / "Resumo". Nomes de Competências, features e Eidolons ficam no original. "Level Up", "Tier",
"Crew", "Edge" e "Fear" seguem o glossário existente.

## 9. Perguntas para o usuário

- **Q1 — Tema fora da ficha: qual setting governa?** Opções: (a) a `sheetFx` atual; (b) uma setting nova
  (cliente) só para os menus fora da ficha, com mesmas três opções; (c) sempre ligado. E as cores ciano e
  verde de `edgeheart.css` migram para amarelo e vermelho ou ficam como destaque? *Recomendação:* (b)
  setting nova de cliente, padrão ligada, para quem usa a ficha em "off" não ver Level Up tematizado de
  surpresa. Ciano fica só como destaque (Edge, custo); verde e vermelho seguem como estado de sucesso/falha.
- **Q2 — Limiares de Dano no avanço.** O PDF os tira do avanço; o módulo mantém +1 automático por nível.
  Opções: (a) manter como está; (b) remover o +1 e os Limiares só mudam por cyberware/armadura;
  (c) manter e avisar na janela. *Recomendação:* (a) mais o aviso do painel, que diz "automático". Remover
  exige mexer em regra do sistema e quebra personagens existentes; se o PDF for lido à risca, a Spec
  verifica se a setting de Homebrew permite.
- **Q3 — Humanidade como passo do Level Up.** Opções: (a) passo 03 dentro do Level Up, propondo e
  aceitando; (b) só um lembrete com link para a aba Chrome; (c) nada. *Recomendação:* (a), com o mesmo
  limite "uma vez por nível" da aba Chrome, e com opção de pular; o PDF liga o avanço a eventos
  narrativos, então nunca é automático.
- **Q4 — Barra de Medo: escopo e técnica.** (i) Setting por mundo (mestre) ou por cliente? (ii) Só CSS +
  hook `renderFearTracker`, ou subclasse do módulo em `CONFIG.ui.resources`? *Recomendação:* por
  **cliente**, padrão ligada (é visual, como `sheetFx`), e **só CSS + hook**. A subclasse troca a classe do
  sistema e não é necessária.
- **Q5 — Cyberware no Level Up.** Opções: (a) só painel informativo com atalho ao compêndio; (b) o Level Up
  oferece cyberware do Tier para o jogador pegar; (c) nada, fica só por compra/recompensa.
  *Recomendação:* (a). O PDF diz que as melhorias numéricas vêm do cyberware, mas o custo e a aquisição
  são decisão de mesa (compra, recompensa), e (b) mexeria em Humanidade e Carga.
- **Q6 — Fontes offline.** Opções: (a) manter o `@import` do Google Fonts; (b) empacotar Rajdhani e Chakra
  Petch em `assets/` (licença OFL, a conferir). *Recomendação:* (b), pois o tema passa a valer em mais
  telas e sem rede cairia no fallback; confirmar a licença antes. Se preferir adiar, (a) e abrir item.
- **Q7 — Ícone da barra de Medo.** Opções: (a) caveira-vírus nova gerada pelo Codex (como no artefato);
  (b) reaproveitar `assets/cpr/dlc/cyberware/cyberskull.svg` ou `worm.svg`. A licença dos `cpr/` não foi
  conferida. *Recomendação:* (a). Evita risco de licença e dá o hexágono e o visual do artefato.

## 10. Ajustes de mesa

| Data | Observação | Ajuste pedido | Status |
|---|---|---|---|
| | | | |
