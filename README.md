# Edgeheart – Cyberpunk para Daggerheart (Demo v0.4 — "ficha completa")

Essa leva foi montada pra você conseguir **criar um personagem do zero** no fluxo normal de criação do Foundry, usando só conteúdo Edgeheart. Todo o schema foi confirmado direto do código-fonte do sistema (você mandou o .zip do `daggerheart`) — inclusive extraí os compêndios oficiais localmente pra conferir os campos, sem precisar mais me mandar exports manuais.

## Compêndios criados
- **Edgeheart: Classes** — Runner (Competência: Network)
- **Edgeheart: Subclasses** — Breach Specialist, Net Diver (linkedClass certo)
- **Edgeheart: Life Paths** (substitui Ancestry) — as 6 origens do PDF: Corpo-Raised, Streetborn, Nomad, Military Surplus, Black-Clinic Survivor, Wasteland Native
- **Edgeheart: Affiliations** (substitui Community) — as 8 conexões do PDF: Corporate Asset, Gang-Tied, Nomad Convoy, Mercenary Network, Black Clinic, Fixer Network, Resistance Cell, Data Cult
- **Edgeheart: Armas** — 8 primárias + 8 secundárias Tier 1, com ataque/dano automáticos
- **Edgeheart: Armaduras** — 5 Tier 1, com thresholds/score automáticos
- **Edgeheart: Cartas de Competência** — as 12 cartas do domínio **Network** (nível 1 a 5), certas pro Runner
- **Edgeheart: Adversários** — Neon Claw Ganger (exemplo)

Com isso dá pra ir no fluxo de criação de personagem do sistema Daggerheart e escolher: Classe (Runner) → Subclasse → Life Path → Affiliation → Arma/Armadura → Cartas de domínio Network do nível certo. É a primeira leva com **tudo que uma ficha pede**.

## Instalação e uso
1. Substitua a pasta `edgeheart-cyberpunk` em `[SeuFoundryData]/Data/modules/` por essa.
2. Ative/recarregue o mundo.
3. Como GM, rode a macro **"Importar Edgeheart (Núcleo)"** (Macros).
4. Crie um personagem novo e siga o fluxo de criação até o fim.

## O que ainda falta pra virar 100% "Edgeheart"
- **Life Path/Affiliation** estão usando os tipos `ancestry`/`community` do sistema (é o jeito de funcionar no fluxo de criação sem mexer no código do sistema) — na ficha eles vão aparecer com o rótulo "Ancestry"/"Community" mesmo, só o conteúdo é Edgeheart. Se isso incomodar, dá pra trocar os textos da UI via um arquivo de tradução (`lang/pt-BR.json`) do próprio módulo — met dizendo se quer isso.
- Features de arma/armadura (tipo "Scatter") só em texto, não como ActiveEffect.
- Faltam: cyberware/loot/consumíveis do PDF, Eidolons, veículos, outras 7 classes + 14 subclasses, resto das 10 competências, bestiário completo, macros de Breach/Humanity/Overclock.

Testa a criação de personagem do início ao fim e me diz o que travou.

## Fix v0.4.1
- **Cartas de domínio agora entram**: o campo `domain` das domainCards é validado contra uma lista fixa do sistema. A macro agora registra "Network" no **Homebrew Settings** do próprio Daggerheart (Configurações do Sistema → Homebrew → aba Domains) antes de criar as cartas — você deve ver "Network" aparecer lá depois de rodar.
- **A macro agora limpa os compêndios antigos antes de recriar**, então pode rodar quantas vezes quiser sem duplicar itens.

## v0.5 — Itens iniciais e sugestões de personagem
- **Itens de classe do Runner**: criei "Illegal Cyberdeck" e "Stolen Access Shard" como itens de verdade (`loot`), linkados em `inventory.choiceA` da classe — na criação de personagem devem aparecer como escolha (pegue 1 dos 2), igual o livro básico faz com os itens de classe.
- **Sugestões de personagem** (`characterGuide`): preenchi com traits recomendados (Knowledge 2, Instinct 1, Agility 1, Finesse -1) e arma/armadura sugeridas (Scrap Launcher, Tactical Drone, Synthleather Jacket) — **atenção**: o PDF do Edgeheart não define isso por classe (só o livro básico tem essa seção), então esses valores são uma sugestão nossa pra um Runner "hacker", não algo tirado do PDF. Se quiser outra combinação, é só pedir que eu troco.

## v0.6 — Correções pedidas

**1) Arma 1M/2M sumindo/voltando a opção de secundária**
Isso é comportamento do **próprio sistema Daggerheart** (código da ficha, não do módulo) — ele olha o campo `burden` da arma primária equipada e mostra/esconde o slot de secundária. Já confirmei que nossas armas têm `burden` certo (`oneHanded`/`twoHanded`). Se na prática o slot não está voltando quando você troca pra uma arma de uma mão, isso é um comportamento/bug do sistema em si, não algo que eu consiga corrigir via módulo — vale conferir se você está na versão mais recente do sistema Daggerheart instalada no seu Foundry.

**2) Escolha de poção (Vida ou Vigor) igual o livro básico**
Implementado — e do jeito certo: em vez de criar poções novas, o `choiceA` da classe Runner agora aponta direto pros itens **oficiais** `Minor Health Potion` e `Minor Stamina Potion` do compêndio `daggerheart.consumables` (não duplica nada, usa o que o sistema já tem). O item de classe (Cyberdeck/Access Shard) passou pro `choiceB`, que é o slot que o livro básico usa pra isso.

**3) Automatizar habilidades de Life Path/Affiliation**
Revisei as 14 features (6 Life Paths x2 + 8 Affiliations x1). A maioria é narrativa, situacional, ou depende de mecânica (tokens, rerolls condicionados, "uma vez por sessão") que eu não tenho um exemplo confirmado de como o sistema modela — automatizar errado quebra a ficha (foi o que aconteceu com o campo `domain`). Só uma dava pra automatizar com o padrão que já confirmei:
- **Hard as Nails** (Wasteland Native): agora é um ActiveEffect de verdade, dá +Proficiência nos dois damage thresholds automaticamente.

As outras 13 continuam só como texto. Se você quiser, me manda um export de algum Item oficial que tenha uma habilidade parecida com alguma dessas (reroll, token por sessão, condicional de HP) que eu uso de referência pra automatizar com segurança — mesma lógica que resolveu o problema do `domain` das cartas.

**4) Itens iniciais do livro básico**
Coberto pelo item 2 (poção Vida/Vigor é o item universal que o livro básico dá a todo personagem, independente de classe).

## v0.7 — Recomendação por subclasse
Confirmei no código-fonte: o schema de `subclass` só tem `spellcastingTrait`, `features` e `linkedClass` — **não existe** campo nativo de sugestão de atributos/itens por subclasse (só a classe tem esse campo). Então, em vez de inventar algo que a ficha não vai ler, coloquei a recomendação **na própria descrição de cada subclasse** (aparece pro jogador na hora de escolher):

- **Breach Specialist** (Knowledge, ofensivo): Knowledge +2, Agility +1, Instinct +1, Finesse −1 · Scrap Launcher + Combat Knife + Ballistic Vest
- **Net Diver** (Instinct, suporte/controle): Instinct +2, Finesse +1, Agility +1, Strength −1 · Smartbow + Tactical Drone + Synthleather Jacket

A sugestão mecânica da classe (que a ficha realmente usa no assistente de criação) ficou como uma média-base entre as duas, com uma nota apontando pra descrição da subclasse escolhida.

Sobre itens diferentes por subclasse: o `choiceB` (Cyberdeck/Access Shard) também é um campo só da classe — não dá pra ter opções diferentes por subclasse sem mexer no código da ficha (isso é candidato natural pra quando a gente for construir a ficha "Cyberpunk Character" customizada). Por ora, as duas subclasses compartilham a mesma escolha.

## v0.8 — Ícones, pastas e ajuste de recomendação
- **Sugestão de atributo saiu da classe**: o campo da classe (`characterGuide`) agora fica neutro/vazio — a recomendação de verdade mora só na descrição de cada subclasse, então se uma subclasse futura precisar de atributos diferentes, é só editar a carta dela.
- **Arma de duas mãos não recomenda mais secundária**: Scrap Launcher e Smartbow são as duas armas primárias recomendadas (Breach Specialist e Net Diver) e as duas são de duas mãos — removi a sugestão de arma secundária dos dois textos. Se um dia eu sugerir uma primária de uma mão, aí sim entra a sugestão de secundária junto.
- **Ícones customizados**: não tenho gerador de imagem neste ambiente, então desenhei **15 ícones SVG à mão** (estilo cyberpunk, vetorial, ficam nítidos em qualquer tamanho): 1 pra classe Runner, 6 Life Paths, 8 Affiliations. Ficam em `assets/icons/` dentro do próprio módulo.
- **Pastas e subpastas em todos os compêndios**:
  - Armas → "Tier 1" > "Primary" / "Secondary"
  - Armaduras → "Tier 1"
  - Classes → "Runner" (contém a classe + Hope/Class Features)
  - Subclasses → "Runner" > "Breach Specialist" / "Net Diver" (cada uma com suas features)
  - Life Paths → 1 subpasta por Life Path (item + suas 2 features dentro)
  - Affiliations → 1 subpasta por Affiliation (item + sua feature dentro)
  - Cartas de Competência → "Network"
  - Itens de Classe → "Runner"
  - Adversários → "Tier 1"

## v0.9 — Pastas seguindo exatamente o padrão do SRD oficial
Abri o `.zip` do sistema de novo e conferi a estrutura de pastas dos compêndios oficiais (`daggerheart.classes`, `.subclasses`, `.domains`, `.items`, `.ancestries`, `.communities`, `.adversaries`) pra copiar o padrão certinho, em vez de inventar uma organização própria:

- **Classes**: pasta "Class Items" > "Runner" (Cyberdeck/Access Shard, que saíram do pack separado de loot e foram pra dentro do pack de Classes, igual o SRD faz) · pasta "Class Features" > "Runner" (Hope/Class Features) · a própria classe "Runner" fica **solta na raiz** (é assim que o SRD faz com o item de classe).
- **Subclasses**: pasta de topo "Runner" (contém as 2 subclasses em si) · pasta "Subclass Features" > "Foundation Features"/"Specialization Features"/"Mastery Features" > "Runner" (as features de cada subclasse).
- **Armas**: "Primary Weapons" > "Physical Weapons"/"Magical Weapons" > "Tier 1" (separei as armas `phy` das `tech` pra bater com a separação Physical/Magical do SRD) · "Secondary Weapons" > "Tier 1" (sem separar físico/mágico, igual o oficial).
- **Armaduras**: "Tier 1" direto na raiz.
- **Cartas de Competência**: "Network" > "Level 1" a "Level 5".
- **Life Paths / Affiliations**: uma única pasta flat "Life Path Features" / "Affiliation Features" com todas as features — os itens principais (Life Path/Affiliation) ficam soltos na raiz, sem pasta, igual ancestries/communities oficiais.
- **Adversários**: "Tier 1" direto na raiz.

O pack separado "Edgeheart: Itens de Classe" saiu do módulo — os 2 itens (Cyberdeck/Access Shard) agora moram dentro do próprio pack de Classes, no lugar certo.

## v1.0 — Agrupamento "Edgeheart SRD" na barra lateral
Usei o campo `packFolders` do manifesto (o mesmo recurso que o próprio sistema Daggerheart usa pra criar a pasta "Daggerheart SRD" na barra lateral de compêndios) — sem precisar de nenhum código, é declarado direto no `module.json`. Não depende de rodar a macro; aparece assim que o módulo é ativado.

Estrutura na barra lateral:
- **Edgeheart SRD** (pasta de topo)
  - Edgeheart: Adversários (solto, igual o SRD faz com adversaries/environments)
  - **Character Options**
    - Edgeheart: Life Paths
    - Edgeheart: Affiliations
    - Edgeheart: Classes
    - Edgeheart: Subclasses
    - Edgeheart: Cartas de Competência
  - **Items**
    - Edgeheart: Armaduras
    - Edgeheart: Armas

## v1.1 — Mais automação de verdade
Fui atrás especificamente disso no código-fonte e destravei duas coisas:
- **Custo de Hope/Stress em ações é um padrão confirmado** (`cost: [{key:"hope"/"stress", value:N}]`), usado centenas de vezes no sistema.
- **Existe um valor calculado `spellcastModifier`** no personagem, que resolve sozinho qual trait usar como "Interface" baseado na subclasse equipada — essencial pra automatizar cartas de domínio que servem pra mais de uma subclasse (como as do Network, que servem tanto pro Breach Specialist quanto pro Net Diver).

Automatizado nessa leva:
- **Synthleather Jacket** e **Riot Shell**: bônus/penalidade de Evasão (+1/−1) agora aplicam de verdade quando a armadura é equipada (ActiveEffect, igual o "Heavy" da armadura oficial).
- **Threat Prediction** (carta Network): bônus de Evasão = metade do Interface trait, calculado automaticamente via `spellcastModifier` — funciona certo pra qualquer subclasse do Runner.
- **Alley Reflexes** (Streetborn) e **Combat Reactions** (Military Surplus): agora têm uma ação de verdade que consome 2 Hope / 1 Stress quando clicada (o efeito de "vantagem"/"reroll" em si ainda é só texto, mas o custo do recurso já é real).

O resto das features continua como texto — automatizar mais depende de padrões que ainda não confirmei no código (rerolls automáticos, aplicação de status como Vulnerable via ação, resource tokens por sessão). Se quiser, sigo destravando isso aos poucos, é só apontar qual.

## v1.1.1 — Fix: erro de importação (`_id ... must be a valid 16-character alphanumeric ID`)
As duas ações de custo criadas na v1.1 (**Alley Reflexes** e **Combat Reactions**, em `costAction()`) usavam IDs escritos à mão (`"alleyreflexes1"`, `"combatreactions1"`). O schema `ActionField` do sistema Daggerheart exige que o campo `_id` de cada ação seja um `DocumentIdField` — ou seja, exatamente 16 caracteres alfanuméricos, no mesmo formato que o Foundry gera com `foundry.utils.randomID()`. IDs "legíveis" como esses (com menos ou mais de 16 caracteres) sempre vão estourar essa validação na hora de criar o Item.

- `costAction()` e a função irmã `buildFeatureAction()` (ainda não usada em nenhum lugar, mas tinha o mesmo padrão) agora geram o `_id` com `foundry.utils.randomID()` em vez de receber uma string fixa.
- Rode a macro **"Importar Edgeheart (Núcleo)"** de novo — ela já limpa os compêndios antigos antes de recriar, então não duplica nada.

## v1.2.0 — Tradução completa para PT-BR
Todo o conteúdo visível ao jogador/mestre agora está em português: nome e descrição da classe (Corredor), das 2 subclasses (Especialista em Brechas, Mergulhador de Rede), das 6 Trajetórias, das 8 Afiliações, das 16 armas, das 5 armaduras, das 12 cartas de domínio Rede, dos itens de classe e do adversário de exemplo — incluindo os textos das ações automatizadas (Reflexos de Beco, Reações de Combate) e das pastas dos compêndios (Itens de Classe, Talentos de Classe, Fundação/Especialização/Maestria, Trajetória, Afiliação, Armas Primárias/Secundárias, Nível 1 etc.).

O que ficou como estava de propósito:
- Chaves internas usadas pelo sistema para lookup (`Agility`, `Strength`, `Melee`, `Far`, `Two-Handed`, `oneHanded`/`twoHanded`, tipos como `spell`/`ability`/`minion`) — são valores de configuração, não texto exibido, e traduzi-los quebraria o `TRAIT_MAP`/`RANGE_MAP` do módulo.
- "Zero-Day" e "Rootkill" — termos técnicos/trocadilhos já usados como jargão em português também.
- "Firewall", "Feed", "Spyware", "Payload" e "Chillax" — mantidos como empréstimos comuns na fala de tecnologia/gíria em português.

Rode a macro **"Importar Edgeheart (Núcleo)"** de novo para recriar os compêndios com o conteúdo traduzido (ela limpa os antigos antes).

## v1.5.0 — Nomes do PDF, ícones cyberpunk e criação só com conteúdo Edgeheart

- Classe, subclasses, features e cartas usam os nomes originais do PDF (Runner, Breach Specialist, Net Diver, Zero-Day, Exploit, Deep Dive, Personal Firewall, Bare Metal...), inclusive quando citados nos textos. As Competências também: Network, Aegis etc. As descrições continuam em português.
- As features de classe do Runner: "Hold Your Breach" e "Exploit".
- A subclasse aparece como "Signal Ghost" na lista da página 8 do PDF e como "Net Diver" na seção dela; ficou "Net Diver".
- Ícones do pacote em `assets/cpr` para classe, subclasses, features, efeitos, cartas de Network e Aegis, itens de classe e o símbolo das Competências.
- Ao criar um personagem com a Ficha Edgeheart, o navegador de compêndios aberto pela criação mostra só as classes, subclasses, Trajetórias e Afiliações do Edgeheart. Personagens com a ficha padrão continuam vendo tudo.
- Reimporte o conteúdo (macro de importação) para aplicar. Personagens já criados mantêm os itens antigos até serem trocados.
- Todos os ícones do conteúdo importado vêm agora do pacote em `assets/cpr`: Trajetórias, Afiliações e seus talentos, armas (e o ícone do ataque), armaduras, os 60 cyberwares, as ações e efeitos das cartas (inclusive as copiadas das cartas oficiais), o adversário de exemplo, o efeito de Ciberpsicose, o item "Acessos Cibernéticos" e a macro de importação.

## v1.6.0 — Diários do Edgeheart

- Novo compêndio **Edgeheart: Diários**, no mesmo formato dos diários do sistema, com o PDF inteiro traduzido:
  - **Bem-vindo ao Edgeheart:** o módulo, a Ficha Edgeheart e os créditos.
  - **Edgeheart Campaign Frame:** proposta, visão geral do mundo, princípios de jogador e de mestre, sessão zero.
  - **Edgeheart SRD:** introdução, Crew e Edge, as 9 classes (com subclasses, perguntas, conexões e dilemas), Trajetórias e Afiliações, equipamento (armas e armaduras dos Tiers 1 a 4, loot, consumíveis), cyberware, Eidolons, Humanidade/Ciberpsicose/Hacking, veículos, ameaças (ambientes e adversários dos Tiers 1 a 4) e as 12 Competências com todas as cartas.
- O texto de cada página fica em `journals/<diário>/<página>.html`. As páginas de cyberware, Network e Aegis são geradas dos próprios itens do módulo, com link para cada item.
- A feature de classe do Runner passa a se chamar "Hold Your Breach", como no PDF, e os Hacks usam os nomes originais (Open/Lock, Loop/Spoof, Pull Data, Jam, Expose, Command).

## v1.7.0 — Classe Warden

- Nova classe **Warden** (Competência Aegis, Evasão 9, PV 7), com as subclasses **Bulwark** (Força) e **Riotbreaker** (Presença).
- Features: Not Today (reação, 3 Esperança), Guardian Protocol (marca um aliado com o efeito Guarded Asset), Impact Frame (+1 Armadura automático), Hard to Break, Unbreakable Frame, Crowd Control, Hard Stop (Imobilizado) e Break the Line (Vulnerável), com usos por descanso e custos automatizados.
- O PDF não traz build sugerida; atributos e equipamento seguem o padrão do Daggerheart, com o atributo de Interface da subclasse em +2.
- Na criação da Ficha Edgeheart, o Warden aparece junto com o Runner. O diário ganhou links para a classe e as subclasses.

## v1.8.0 — Classe Solo e Competência Assault

- Nova classe **Solo** (Competência Assault, Evasão 11, PV 6), com as subclasses **Deadeye** (Acuidade) e **Shock Trooper** (Força).
- **Kill Chain Die:** a feature Kill Chain mostra o dado atual na ficha (e no selo do cabeçalho) e tem três ações: Rolar, Aumentar (d4 → d6 → d8 → d10 → d12 → d20) e Resetar. O dado volta a d4 sozinho no fim da cena; No Way Back o ajusta para d10.
- **Competência Assault:** as 21 cartas, releituras das cartas oficiais de Blade, com a automação copiada delas (incluindo o Assault-Synced, ativo com 4+ cartas de Assault no loadout).
- A página de Assault do diário agora é gerada das cartas do compêndio, com links.
