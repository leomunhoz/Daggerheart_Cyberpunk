# Edgeheart — Cyberpunk Homebrew

Módulo para **Foundry VTT** que adapta o **Edgeheart** para o sistema **Daggerheart**, em inglês e português. Edgeheart é um campaign frame cyberpunk inspirado em Armored Core, criado por AllenDGray14.

> *O mundo acabou há quatro anos. As corporações sobreviveram. As gangues herdaram as ruas. E em algum lugar além da Black Wall, algo ainda está acordado.*

Os jogadores são mercenários na New Dark Age: pegam contratos sujos, instalam cromo e arriscam a própria humanidade a cada upgrade. O módulo traz esse cenário para dentro do Daggerheart sem trocar o jogo. O personagem continua sendo criado, rolando e subindo de nível pelo fluxo normal do sistema; só o conteúdo é Edgeheart.

## O que tem

- **9 classes e 18 subclasses:** Runner, Infiltrator, Solo, Augmented, Tech, Broker, Reclaimer, Trauma Doc e Warden.
- **11 Competências (domínios), com 21 cartas cada:** Network, Ghost, Assault, Chrome, Systems, Influence, Frontier, Medtech e Aegis, das classes, e Redline e Blackwall, acessadas pelo cyberware. Cada uma com sigilo, cor e arte de carta próprios. As cartas copiam a automação das cartas oficiais equivalentes (o Redline copia o domínio Blood do The Void).
- **Ficha Edgeheart:** Dado de Humanidade, Carga Cibernética, Ciberpsicose e a aba Chrome, com o cyberware, os Eidolons e os acessos a Competências.
- **Ficha da Crew:** Reputação, Edge e os Movimentos de Edge, no Grupo do próprio sistema.
- **60 cyberwares**, que substituem os avanços de PV, Estresse, Evasão e atributos e dão acesso a outras Competências.
- **Trajetórias e Afiliações** no lugar de Ancestralidade e Comunidade.
- **64 armas e 25 armaduras dos Tiers 1 a 4**, com ataque e dano automáticos; as características iguais às oficiais (Reliable, Deadly, Paired, Shifting, Fortified…) usam a automação do sistema.
- **40 consumíveis e 40 itens de loot**, com as tabelas de rolagem do PDF.
- **8 veículos**, com ataque, Manobrar, Cargas e os estados Damaged/Disabled.
- **10 Eidolons** (Cyberware Especial), mobilizados pela Ficha Edgeheart: PV, Evasão, Limiares, Armadura, armas e token próprios, Custo de Sincronia, Competency Link, Soul Bond e as escolhas do Disabled.
- **Level Up do Edgeheart**, que pode ser ligado ou desligado nas configurações.
- **39 adversários e 16 ambientes** dos Tiers 1 a 4, com retrato e token. São os 25 do PDF e 14 extras (Polícia, Esquadrão Antipsicose, Chrome Maw, Ava Biodyne e daemons), montados sobre adversários oficiais da mesma função.
- **Diários** com o PDF inteiro, com links para os itens, e uma página de adversários extras com o guia de montagem de combates.
- **Cena de abertura**, criada e ativada na primeira vez que o mestre abre o mundo com o módulo.

## Idiomas

Os compêndios são em inglês, com o texto original do PDF. Com o módulo **[Babele](https://foundryvtt.com/packages/babele)** ativo e o Foundry em **Português (Brasil)**, tudo aparece traduzido: itens, cartas, adversários, diários e tabelas. A interface do módulo (fichas, botões, mensagens de chat) segue o idioma de cada jogador.

Os nomes de classes e subclasses ficam no original do PDF nas duas línguas.

## Requisitos

- Foundry VTT **v14**
- Sistema **Daggerheart 2.10** ou superior
- Recomendado: **Babele**, para jogar em português

## Instalação

Há duas maneiras:

### 1. Pelo Foundry, com o link do manifesto (recomendado)

Em *Add-on Modules → Install Module*, cole no campo *Manifest URL*:

```
https://github.com/leomunhoz/Daggerheart_Cyberpunk/releases/latest/download/module.json
```

O Foundry baixa e instala sozinho, e avisa quando houver versão nova.

### 2. Manual, baixando o zip

Baixe o arquivo pelo link direto:

```
https://github.com/leomunhoz/Daggerheart_Cyberpunk/releases/latest/download/module.zip
```

Descompacte em `Data/modules/edgeheart-cyberpunk` (a pasta tem que ter esse nome) e reinicie o Foundry. Nesse modo, cada atualização é feita baixando o zip de novo. Todas as versões ficam na [página de releases](https://github.com/leomunhoz/Daggerheart_Cyberpunk/releases).

## Como usar

1. Ative o módulo no mundo. Os compêndios aparecem prontos na pasta **Edgeheart SRD** da barra de compêndios.
2. Na primeira vez, a cena de abertura é criada e ativada.
3. Crie um personagem: ele já nasce com a Ficha Edgeheart, e a criação mostra só as classes do Edgeheart. Um Grupo novo já nasce com a Ficha da Crew.

## Princípio do projeto

**Nada do sistema Daggerheart é modificado.** O módulo usa só o que o sistema oferece: itens, efeitos, ganchos, fichas adicionais e as configurações de Homebrew. Um mundo sem o módulo não é afetado.

## Versões

O histórico está no [CHANGELOG](CHANGELOG.md). Uma nova versão é publicada criando uma *Release* no GitHub com a tag da versão (por exemplo `v1.30.1`): uma automação monta o `module.json` e o `module.zip` e anexa os dois à release.

## Créditos

Conteúdo original do Edgeheart: **AllenDGray14**. Daggerheart é marca da Darrington Press. As cartas de Redline copiam a automação do domínio Blood do módulo [The Void (unofficial)](https://github.com/brunocalado/the-void-unofficial), de Bruno Calado, sob licença GPL-3.0; o The Void é material de playtest da Darrington Press. Projeto de fã, sem fins comerciais.

---

## English

**Edgeheart — Cyberpunk Homebrew** brings the Edgeheart cyberpunk campaign frame by AllenDGray14 to the Daggerheart system on Foundry VTT v14: 9 classes, 11 Competencies, 60 cyberware, Eidolons, vehicles, 39 adversaries, 16 environments, the Edgeheart and Crew sheets, and the full SRD in journals. The compendiums are in English (the original PDF text); Brazilian Portuguese is available through Babele. Nothing in the Daggerheart system is modified.

**Install:** paste `https://github.com/leomunhoz/Daggerheart_Cyberpunk/releases/latest/download/module.json` in Foundry's *Install Module → Manifest URL*, or download `https://github.com/leomunhoz/Daggerheart_Cyberpunk/releases/latest/download/module.zip` and extract it to `Data/modules/edgeheart-cyberpunk`.
