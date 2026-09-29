# Changelog

## v1.32.0
- **Ficha Edgeheart com tema cyberpunk:** preto e amarelo neon, cantos chanfrados, códigos "SYS://" nas seções, Esperança em chips e a Carga Cibernética com ícone de engrenagem. Glitches animados aparecem em rajadas curtas nas bordas, e o centro da ficha fica estável para leitura. Em **Ciberpsicose**, a ficha fica vermelha, a borda pulsa e os glitches ficam mais fortes e frequentes. Cada jogador escolhe nas configurações entre tema com glitch, tema sem animação ou o visual original do Daggerheart.
- **Cartas de Competência em neon:** as 11 artes ganharam fundo escuro com grade e o sigilo aceso na cor de cada Competência (Assault agora é índigo). As pastas do compêndio e a faixa das cartas usam as mesmas cores.
- **Arte nova** no padrão do módulo para os 8 veículos, os 10 Eidolons (retrato e token), o ambiente Eidolon Deployment Zone e as primeiras 8 armas.
- **Remover cyberware** direto da aba Chrome (lixeira em cada linha; Shift+clique remove sem perguntar). Eidolons também, quando não estão sincronizados.
- **O mestre pode trazer de volta** um personagem perdido para a Ciberpsicose: a seta de subir a Humanidade o devolve ao d4.

## v1.31.0
Correções de uma bateria de testes completa: as 18 subclasses criadas e levadas do nível 1 ao 10 pelas janelas do sistema, com todas as ações usadas em combate; os 60 cyberwares instalados e desinstalados; os 10 Eidolons mobilizados até o Disabled; Redline, Blackwall, Humanidade, Ciberpsicose e a Ficha da Crew; e tudo de novo como jogador.
- **Fearmask** (Ghost): "Steal Fear" quebrava, igual à Night Terror oficial que ela copia (cobra um contador que a carta não tem). Agora o custo é o Medo roubado do mestre, 1 por alvo Horrified, e o dano rola 1d6 por Medo.
- **Riot Lieutenant › Point-Blank Blast**: a cópia do Skull Splitter oficial perdia o marcador da feature, e as duas ações quebravam. As features copiadas de adversários oficiais agora trazem o contador junto.
- **Cargas que não gastavam**: Daemon Army › Daemon Defends, Hephaestus Reconstruction Engine e Ares Redline Kernel davam erro ao gastar Cargas/fichas do próprio item.
- **Chassi Metamórfico**: as três opções (+1 Evasão, +1 Armadura, +4 Limiares) viraram efeitos para ligar no próprio cyberware, em vez de ajuste manual.
- **Pedidos do jogador ao mestre** (Estabilizar e os botões da Crew) agora esperam a resposta e avisam o jogador se o mestre não responder, em vez de o clique não fazer nada.
- **Nomes em inglês**: 28 nomes de ações que tinham ficado em português na base em inglês (ex.: "Rolagem de Interface (13)" → "Interface Roll (13)").
- Drain Signal e Siphon Strike (Redline) apontavam para um ícone que não existe.
- **Arte das armas:** as 64 armas ganharam arte própria (do módulo Edgeheart de Dan Weaver), no lugar dos ícones genéricos.

## v1.30.2
- **Imagens mais leves:** retratos e tokens dos adversários e as artes das cartas de Competência passaram de PNG para WebP, com a mesma aparência e o fundo transparente. As 89 imagens caíram de 25 MB para 4,6 MB, o que deixa o download do módulo menor e o carregamento mais rápido para os jogadores.

## v1.30.1
- O módulo agora se chama **Edgeheart - Cyberpunk Homebrew**.
- **Instalação por link:** o `module.json` tem os links de manifesto e download, e uma automação do GitHub monta o pacote a cada Release publicada. O link para instalar e atualizar pelo Foundry é `https://github.com/leomunhoz/Daggerheart_Cyberpunk/releases/latest/download/module.json` (funciona com o repositório público).

## v1.30.0
- **Interface nas duas línguas:** todos os textos da Ficha Edgeheart (aba Chrome), da Ficha da Crew, das mensagens de chat, dos avisos, dos botões, das configurações e dos veículos saíram do código e foram para `lang/pt-BR.json` e `lang/en.json`. Cada jogador vê a interface no idioma do seu Foundry. Em português, os estados dos veículos e do Eidolon seguem o glossário (Danificado, Inutilizado), e o item de acesso se chama "Acessos Cibernéticos" (em inglês, "Cyber Access").
- **Diário "Adversários Extras":** página nova no Edgeheart SRD com os 14 adversários fora do PDF, agrupados por facção, com o modelo oficial de cada um e um quadro de como montar um combate pelo orçamento de pontos do Daggerheart.
- **Ambientes:** os adversários extras entram nos adversários possíveis dos ambientes que combinam com eles (Polícia na rua e na guerra de gangues, Ava Biodyne no cerco à clínica clandestina, daemons nos ambientes digitais de Tier 4).
- **Aviso de risco ao instalar cyberware:** quando a chance de manter o controle na Rolagem de Humanidade cai abaixo de 50%, aparece um aviso com a Carga, o Dado de Humanidade e a chance.
- A seção de Competências da aba Chrome explica o que fazer quando ainda está vazia.
- Removido o código de migração dos compêndios antigos (versões até a 1.15, com a macro de importação), que não era mais usado.

## v1.29.1
- **Redline e Blackwall** ganharam sigilos próprios, no mesmo estilo das outras Competências, com ícone e arte de carta novos. Agora as 11 Competências seguem o mesmo padrão.
- **Cores sem repetir:** cada Competência tem uma cor que não se confunde com as outras nem com os domínios oficiais (Network ciano, Aegis violeta, Assault verde militar, Ghost lavanda, Chrome prata-azulado, Systems azul, Influence magenta, Frontier marrom, Medtech verde, Redline vinho, Blackwall rosa-neon). Ghost e Chrome usam texto escuro no banner.
- **Pastas do compêndio de cartas:** na cor da sua Competência, e os níveis em ordem numérica (o Nível 10 vinha logo depois do 1). O nome das pastas ganhou sombra para continuar legível nas cores claras.
- **Cena de abertura:** na primeira vez que o GM abre um mundo com o módulo, a cena "Edgeheart" é criada e ativada, com a arte de abertura em 16:9 e o fundo do Foundry no mesmo roxo escuro da imagem. Se for apagada, não volta.
- **Arte dos adversários:** os 25 com as versões novas sem fundo (Neon Claw Ganger e Sitil Security Guard com arte nova; o token da Sitil Security Guard agora é vermelho). Tokens enquadrados a partir do topo do personagem. 
- **14 adversários novos (fora do PDF):** Polícia (City Patrol Officer, Patrol Sergeant, Riot Squad, Riot Lieutenant), Esquadrão Antipsicose (Operator e Commander), Chrome Maw (Scrapper, Gunner, Stalker), Ava Biodyne (Response Medic, Response Gunner, Security Specialist) e daemons (Blackwall Warden Daemon, Theoi Avatar). Cada um usa os números e as features de um adversário oficial da mesma função (Sellsword, Head Guard, Archer Squadron, Fire Titan, Cursed Merfolk, Fallen Warlord, Jagged Knife Lackey, Skeleton Archer, Panther, Entombed Necropriest, Centaur Warden, Elite Soldier, Vault Guardian Gaoler, Oracle of Doom), com a automação oficial e o texto relido para o cenário. O "Call the Squad" do Commander invoca dois Operators.

## v1.29.0
- **Texto original em inglês:** a versão em inglês agora usa o texto do PDF em tudo: descrições, ações e efeitos dos itens, cyberware e Eidolons (com as peças), armas, armaduras, loot, consumíveis, veículos, cartas, classes, subclasses, Life Paths, Afiliações, adversários, ambientes e tabelas (`data/content-en.json`).
- Os 51 diários também têm versão em inglês (`journals/en`), incluindo as tabelas, os statblocks, as páginas de classe e as de Competência.
- Os diários em português perderam as glosas em inglês, e as boas-vindas foram reescritas (conteúdo atual, como ativar o Babele e crédito ao The Void).
- O diário "Edgeheart: Campaign Frame" agora se chama "Edgeheart: Cenário de Campanha" em português.
- **Arte dos adversários:** os 25 agora têm retrato (com fundo transparente) e token redondo com aro na cor da facção.
- **Ícones das Competências:** Network, Aegis, Assault, Ghost, Chrome, Systems, Influence, Frontier e Medtech ganharam sigilos próprios. Redline e Blackwall continuam com os ícones anteriores.
- **Cartas de Competência no padrão das oficiais:** cada Competência tem a sua cor no Homebrew do sistema (o banner da carta usa essa cor, e Chrome usa texto escuro, como Bone) e uma arte própria: degradê na cor da Competência com o sigilo branco no centro. Todas as cartas da Competência usam essa arte, como as oficiais.

## v1.28.0
- **Duas línguas (Babele):** os compêndios agora são em inglês e o módulo traz a tradução completa para português em `babele/pt-BR`. Com o Babele ativo e o Foundry em Português (Brasil), tudo aparece traduzido. Classes e subclasses mantêm o nome em inglês.
- Os nomes seguem o glossário revisado (`data/glossary-pt-BR.json`): Competências (Rede, Assalto, Cromo...), termos (Cadeia de Abate, Disfarce, Brecha, Equipe, Ímpeto, GELO Negro, dano tecno...), cartas, features, cyberware, armas, armaduras, loot, veículos, adversários e ambientes.
- Traduzidos também: ações e efeitos dos itens, ataques e experiências dos adversários, features dos adversários e ambientes, peças dos Eidolons, perguntas e conexões das classes, páginas dos diários, tabelas, pastas e nomes dos compêndios.
- As automações funcionam nas duas línguas.
- Por enquanto as descrições em inglês usam o texto em português; o texto original do PDF entra na próxima versão.

## v1.27.1
- Preparação para a versão bilíngue: as automações (Kill Chain, Cover, Takedown, Integrated Chrome, Calibrar Atributo, Public Persona, No Way Back e os estados dos veículos) agora reconhecem as ações pelo ID, não pelo nome. Renomear ou traduzir uma ação não quebra mais nada.
- Itens antigos, já nas fichas, continuam funcionando pelo nome.
## v1.27.0
- **Eidolons:** os 10 do PDF (Hermes-Arrow, Bulldog, Atlas-Breaker, Wraith-9, Apollo-Lancet, Cordon-6, Horizon-Mirage, Athena-Pallas, Ares-Tyrant e Forge-Saint) como **Cyberware Especial**, na pasta "Eidolons" do compêndio de Cyberware.
- **Mobilizar** pela aba Chrome da Ficha Edgeheart, no mesmo padrão do Beastform do sistema: enquanto sincronizado, PV, Evasão, Limiares e Armadura são os do Eidolon; as armas embutidas entram equipadas usando a Interface do piloto; as features viram itens da ficha; e o token troca. As armas e a armadura do piloto ficam guardadas.
- **Custo de Sincronia** soma na Carga Cibernética (e na Rolagem de Humanidade) só enquanto sincronizado. O **Competency Link** libera as cartas pelos Acessos Cibernéticos.
- **Soul Bond:** sem ele, sincronizar marca 2 Estresse e pede a Rolagem de Humanidade contra a Carga com o Custo de Sincronia; se falhar, a sincronização não acontece.
- **Disabled** (último PV do Eidolon): diálogo com Stay Inside (as peças do Eidolon ficam bloqueadas), Hard Disconnect (2 Estresse, Rolagem de Humanidade e dessincroniza) e Emergency Overclock (os PV voltam a ser do piloto e cada ação marca 1 PV).
- **Dessincronizar** guarda no Eidolon os PV e a Armadura marcados, e devolve tudo ao piloto. **Consertar** limpa o dano e o Disabled.
- O diário de Eidolons ganhou links para os itens.
## v1.26.0
- **Veículos:** os 8 do PDF (Street Bike, Nomad Buggy, Armored Sedan, Crew Van, Interceptor, War Rig, Corporate AV, Ghost Runner), na pasta **Veículos** do compêndio de Loot. São itens de inventário que não ocupam os espaços de arma, e podem ficar na ficha do motorista ou no Inventário da Crew.
- Cada veículo tem **Ataque do Veículo** (atributo e dano do veículo, com Proficiência), **Manobrar**, **Manter Funcionando** (1 Estresse), **Sofrer Dano Sério** e **Consertar**.
- **Damaged e Disabled:** o primeiro dano sério deixa o veículo Damaged: o nome mostra o estado, Ataque e Manobrar recebem −2 no diálogo de rolagem, e a Característica é bloqueada. O segundo deixa Disabled, com tudo bloqueado menos Consertar.
- **Cargas:** Swift e Heavy como bônus que o jogador liga; Armored e Soaring 1x por cena; Cargo 1x por descanso; Off-Road e Connected em texto.
- **Características:** Dust Runner e Road Crusher fazem o alvo marcar Estresse; Hard Cover é +2 de Evasão ligável; Mobile Kit 1x por descanso; Autopilot Ghost é uma Rolagem de Interface (14) que deixa Escondido.
- O diário de Veículos ganhou links para os itens.
## v1.25.0
- **Loot e Consumíveis:** três compêndios novos, nas mesmas pastas do SRD oficial: **Consumíveis** e **Loot** em Itens, **Tabelas** na raiz do Edgeheart SRD.
- **40 consumíveis**, cada uso gastando 1 da quantidade, como as poções oficiais. Minor Health Patch, Minor Stamina Injector, Major Health Patch e Redline Dose copiam a automação da poção oficial equivalente. Os outros têm curas, "alvo marca Estresse", Vulnerável, Imobilizado, Escondido, +1d6 e custos de Estresse.
- **40 itens de loot:** vantagens como opção no diálogo de rolagem (Climbing Filament, Clean Needle, Mag Boots…), usos de 1x por descanso ou por sessão, custos de Esperança ou Estresse e dados. O resto fica só com o texto.
- **Tabelas de rolagem** "Loot do Edgeheart" e "Consumíveis do Edgeheart" (1d10, como as oficiais); a descrição diz quantos dados rolar por raridade.
- Os diários de Loot e Consumíveis ganharam links para os itens.
- Em mundos já existentes, compêndios novos do módulo vão sozinhos para a pasta do Edgeheart SRD.
## v1.24.1
- Mais automação nas características situacionais, com peças do próprio sistema:
  - **Vantagem como opção no diálogo de rolagem**, como na armadura oficial Aquatic: Street Icon Fit, Hazard Suit, Gang Colors Jacket e Exo-Riot Plating.
  - **Bônus que o jogador liga quando vale:** Draw do Smartbow (+2), Controlled Fire da Assault Carbine (+1) e Stealth do Armored Bodysuit (+2). Os de ataque só valem para a própria arma, como a Reliable oficial.
  - **+1 de Proficiência como botão de dano extra:** Heavy Pistol, Breach Hammer e Blackwall Emitter (este cobra 1 Estresse).
## v1.24.0
- **Armas e armaduras dos Tiers 2 a 4:** mais 48 armas (24 primárias e 24 secundárias) e 20 armaduras, somando 64 armas e 25 armaduras. Os compêndios ficam organizados em Tier 1 a 4, como os oficiais.
- **Nomes em inglês, como no PDF**, também no Tier 1 (Assault Carbine, Riot Buckler, Ballistic Vest…). As características continuam em português.
- Características iguais às oficiais usam a **feature do próprio sistema**, com a automação dela: Reliable, Deadly, Paired, Protective, Hooked, Long, Self-Correcting, Flexible, Heavy, Reinforced, Shifting, Impenetrable e Fortified.
- As outras ganham ações no padrão do sistema: o alvo marca Estresse (Scatter, Crater, Pain Loop…), Vulnerável por 1 Esperança (Resonance, Jolt), Imobilizado (Impale, Net), Escondido (Smoke, Blink Cut) e custos de Estresse ou Esperança. Escudos e armaduras pesadas somam Armadura e tiram Evasão ou atributos sozinhos.
- Os diários de armas e armaduras ganharam links para os itens.
## v1.23.0
- **Competências Redline e Blackwall**, com 21 cartas cada. Não pertencem a nenhuma classe: o acesso vem do cyberware (Motor de Overclock Vermelho, Kernel Berserker, Córtex Black ICE, Coprocessador Blackwall).
- **Blackwall** copia a automação do **Dread** oficial, carta a carta, com os números do PDF: Drain Signal com d8 que limpa 2 PV, Blackwall Shroud com marcadores de Esperança, Corrupted Shell com +1 a cada 2 Estresse, Total System Crash com d20 pela Interface, e assim por diante. System Decay, Ghost Fog e Relic Edge ganham ações próprias.
- **Redline** copia a automação do domínio **Blood** do The Void (Blood Spike, Grisly Harpoon, Blood Bind, Parasite of the Will…), ajustada ao PDF. As cartas sem equivalente usam ações no padrão oficial: Pain Conversion (+2 de dano por PV marcado), Redline-Synced (+1 de Evasão a cada 3 PV), Kill-Switch Overdrive (marca 1 a 3 PV e o alvo marca o dobro) e outras.
- As cartas do Blood ficam salvas em `data/void-blood.json`, então o The Void não precisa estar instalado.
## v1.22.0
- **Automação dos Movimentos de Edge**, com botões no card do chat como nos cards de ação do sistema:
  - **Get Them Out:** "Reduzir 1 PV marcado" e "Limpar Vulnerável/Imobilizado" no aliado alvo (ou no token selecionado).
  - **Back Me Up:** "Rolagem de Reação" do personagem selecionado, com o atributo escolhido na hora.
  - **Plan B, Hidden Cache:** cria 3 **Suprimentos** no Inventário da Crew; um personagem pega e usa, e cada uso gasta 1, como as poções oficiais.
  - **Plan B, Sabotage Package:** botão do mestre "Restaurar o sistema (2 Medo)".
- Quando uma **Rolagem em Dupla** sai com Esperança (e passa, se tiver Dificuldade), a Crew recebe um card com o botão **+1 Edge**. A mesa decide, porque o ganho é uma vez por cena.
- Botões de uso único travam depois de usados.
## v1.21.0
- **Crew e Edge.** O Grupo do Daggerheart ganha a **Ficha da Crew**, com uma aba nova:
  - **Edge** de 0 a 3, com a lista do que faz a Crew ganhar Edge;
  - os **Movimentos de Edge** Teamwork, Back Me Up, Get Them Out, Plan B (com as 4 contingências) e All In, que gastam o Edge e mandam o card no chat;
  - Reputação, Código, Fixer e Base.
- A **Reputação** vira uma Experiência de cada membro (+2, e +1 a cada Tier novo da Crew). Usar custa 1 Esperança, como toda Experiência.
- **All In** abre a Rolagem em Dupla do sistema sem custo de Esperança. Quando ela termina, quem rolou limpa 1 Estresse.
- Membros, Recursos da Crew (inventário), Rolagem em Dupla e Rolagem em Grupo continuam sendo os do sistema.
- Grupos novos já nascem com a Ficha da Crew (mesma opção da Ficha Edgeheart). Jogadores que não são donos da Crew gastam Edge pelo mestre.

## v1.20.0
- **Automação das features de adversários e ambientes no padrão das features oficiais:**
  - "O alvo marca Estresse / perde Esperança / marca Armadura" como dano de recurso na ação (Memory Hook: 2 na falha e 1 no sucesso).
  - Escolhas do texto ("Estresse ou Vulnerável") viram uma ação por opção (Jawbreaker, Black Hand Guns, Camera Sweep…).
  - Ficar Escondido (Crowd Slip, Relocate, Digital Vanish…), Marked/Alvo no personagem atingido, bônus em aliados (Operational Control, Cult Transmission) e no próprio adversário (Frame Pattern, War God Awakens, Role Switch).
  - Bônus situacionais como efeito passivo desligado, que o mestre liga quando vale (Badge Discipline, Cover Shooter, Liability Shield).
  - Ataques com dano extra condicional (Ataque Escondido +1d8, sem cobertura +1d10, contra o Alvo +1d8).
  - Reforços por invocação (Reception Alarm, Contractual Violence, Sterile Kill Team), o Eidolon Drop troca o Black Hand pelo The Raven Eidolon mantendo o Estresse, e Contagens para The Chase, Objective Clock e Containment Protocol.
  - Cyberpsycho e Armor-Piercing Burst copiam as features oficiais Momentum e Acidic Form.

## v1.19.0
- **Todos os adversários do PDF:** mais 19 nos Tiers 2 a 4 (25 no total), do Blood Saint Duelist ao Black Hand e The Raven Eidolon, com ataque padrão e ações nas features.
- **Horde** no padrão oficial (Corporate Response Team e Rival Edgerunner Crew): com metade ou mais dos PV marcados, o ataque padrão passa a usar o dano de horda sozinho.
- **Mecha Structure** (Combat Eidolon Frame, Ares-Tyrant Eidolon) vira resistência a dano físico e techno; **Digital Body** (Hades Shard) vira imunidade a dano físico. O mestre desconsidera nas exceções do texto (outro Eidolon, dispositivo hospedeiro).
- **Todos os ambientes do PDF:** mais 12 nos Tiers 2 a 4 (16 no total), com ações nas features de dano (Ghost Train, Heavy Debris, Black Lightning…) e os Adversários possíveis linkados. O Tier de cada ambiente segue a Dificuldade, como no SRD.
- Os diários ganharam links para todos os adversários e ambientes.

## v1.18.0
- **Adversários do Tier 1:** Neon Claw Ganger (Minion), Sitil Security Guard (Standard), Chrome Maw Bruiser (Bruiser), Tiger Choir Cutter (Skulk), Pocket Drone Handler (Support) e Rookie Edgerunner (Ranged), com ataque padrão automático e ações nas features (custos, ataques, dano, Rolagem de Reação, Vulnerável). O Neon Claw Ganger segue o padrão oficial de Minion: Minion (3) e Group Attack, copiados do Jagged Knife Lackey.
- Novo compêndio **Edgeheart: Ambientes** com os ambientes do Tier 1: Neon Night Market, Low-Sec Data Office, Megablock Stairwell e Street-Level Stakeout, com Impulsos, Dificuldade, features e os Adversários possíveis linkados.
- O adversário de exemplo antigo (Marginal da Garra de Néon) foi substituído pelo Neon Claw Ganger. Os diários ganharam links para os adversários e ambientes do Tier 1.

## v1.17.0
- **Chat no padrão do sistema: uma mensagem por ação.** Features que rolam dado (Takedown, Opening Strike, Integrated Chrome, Chrome Surge, Boost, Drive Off…) rolam dentro do próprio card da ação, como a Rune Ward oficial, em vez de mandar a rolagem numa mensagem separada. As ações de Cover não mandam mais a mensagem "ganhou/gastou Cover": o contador da feature mostra o novo valor.
- Dados que dependem do personagem continuam automáticos no card: d8 no Takedown com Kill Window, d8 no Integrated Chrome com Reinforced Build e Força calibrada, Tier×d6 no Opening Strike.
- O selo do cabeçalho deixa de repetir o Kill Chain Die, e a lista de cyberware da aba Chrome deixa de repetir as cargas: os dois já aparecem na própria feature.

## v1.16.1
- O Cover do Infiltrator não aparece mais no selo do cabeçalho: ele já tem o contador na própria feature Cover Work.

## v1.16.0
- **Os compêndios vêm prontos dentro do módulo.** É só ativar: a pasta **Edgeheart SRD** aparece sozinha, com tudo organizado como o Daggerheart SRD, e as Competências se registram ao carregar o mundo. A macro "Importar Edgeheart (Núcleo)" não é mais necessária.
- Mundos que usavam a versão antiga recebem um aviso para apagar os compêndios duplicados e a macro; personagens já criados não perdem nada.
- Se a pasta de um compêndio do módulo for apagada, ele volta sozinho para a estrutura do Edgeheart SRD.

## v1.15.1
- Os compêndios ficam na pasta **Edgeheart SRD** da barra de compêndios, com a mesma estrutura do Daggerheart SRD: Adversários e Diários na raiz, **Opções de Personagem** (Trajetórias, Afiliações, Classes, Subclasses, Cartas de Competência) e **Itens** (Armaduras, Armas, Cyberware). Mundos já importados são organizados ao carregar.

## v1.15.0
- **Network** passa a copiar a automação das cartas oficiais: 15 de Arcana e 6 de Bone, Grace, Codex e Midnight. Onde o PDF muda os números, vale o PDF (Firewall em d12, Threat Prediction pela Interface, Hard Shutdown em techno).
- Nas cartas com várias ações, cada ação tem nome próprio (os protocolos do PDF ou a tradução do nome oficial).

## v1.14.0
- Classe **Trauma Doc** (Combat Medic, Street Surgeon) e Competência **Medtech** (releitura de Splendor).

## v1.13.0
- Classe **Reclaimer** (Outrider, Zonebreaker) e Competência **Frontier** (releitura de Sage).
- Surveyed Route e Stunt Driver com rolagem de atributo de verdade.

## v1.12.0
- Classe **Broker** (Fixer, Icon) e Competência **Influence** (releitura de Grace).
- Escolhas de feature (Public Persona, Atributo Calibrado) guardadas e mostradas no selo da ficha.

## v1.11.0
- Classe **Tech** (Rigger, Saboteur) e Competência **Systems** (releitura de Codex; os Protocol Suites são grimórios).

## v1.10.0
- Classe **Augmented** (Reflex Suite, Titan Frame) e Competência **Chrome** (releitura de Bone).
- Atributo Calibrado; a Rolagem de Humanidade trata a Carga como 1 menor.
- Features que "rolam um dado e somam" rolam sozinhas no chat.

## v1.9.0
- Classe **Infiltrator** (Silent Killer, Phantom) e Competência **Ghost** (releitura de Midnight).
- Recurso **Cover** (0 a 3, zera no fim da cena).

## v1.8.0
- Classe **Solo** (Deadeye, Shock Trooper) e Competência **Assault** (releitura de Blade).
- **Kill Chain Die** na ficha (d4 → d20, volta a d4 no fim da cena).

## v1.7.0
- Classe **Warden** (Bulwark, Riotbreaker), com a Competência **Aegis** (releitura de Valor).

## v1.6.0
- Compêndio **Edgeheart: Diários** com o PDF inteiro traduzido, no formato dos diários do sistema.

## v1.5.0
- Nomes de classes, habilidades, cartas e Competências no inglês do PDF.
- Ícones do pacote cyberpunk em todo o conteúdo.
- A criação de personagem com a Ficha Edgeheart mostra só conteúdo Edgeheart.

## v1.2.0 – v1.4.x
- Tradução para o português.
- **Ficha Edgeheart:** Humanidade, Carga Cibernética e Ciberpsicose.
- Os 60 **cyberwares**, com acesso a Competências.
- **Level Up do Edgeheart**.

## v0.4 – v1.1
- Primeira versão jogável: classe Runner, Competência Network, Trajetórias, Afiliações, armas e armaduras de Tier 1 e um adversário de exemplo.
- Macro de importação, pastas no padrão do SRD oficial e agrupamento "Edgeheart SRD" na barra de compêndios.
