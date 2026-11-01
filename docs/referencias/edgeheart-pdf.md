# PDF do Edgeheart

- **Obra:** *Edgeheart*, campaign frame cyberpunk para Daggerheart, de **AllenDGray14**
  (https://www.reddit.com/user/SnooLobsters9291/). Versão **1.1 (22/08/2026)**, 89 páginas,
  feita na The Homebrewery. Usa o SRD 1.0 e "The Void" sob a Darrington Press Community Gaming
  License; não comercial.
- **Onde está o arquivo:** cópia local em `assets/Edgeheart - The Homebrewery.pdf`. **Não commitar**:
  `assets/` vai inteiro para o `module.zip` (CLAUDE.md, regra 8).
- **Link público:** não encontrado. A tradução italiana está em
  https://homebrewery.naturalcrit.com/share/8W53Ct7iIKlK (credita o autor). O anúncio fica em
  https://www.reddit.com/r/daggerheart/comments/1vupa6d/edgeheart_a_cyberpunk_and_mecha_campaign_frame/
- **Texto já no módulo:** os diários em `journals/srd/` (pt-BR) e `journals/en/srd/` (inglês) têm o
  PDF inteiro, um arquivo por seção. Para citar regra num PRD, prefira a página do PDF.

## Capítulos → onde vivem no módulo

| PDF (página) | Assunto | Módulo |
|---|---|---|
| Overview (4–7) | Termos: dano mágico → Techno, Spellcasting → Interface Roll, Domínios → Competências | `journals/campaign-frame/`, `data/glossary-pt-BR.json` |
| Cap. 1, Passo 1 (9) | Crew, Reputação, Edge e Movimentos de Edge | `scripts/edgeheart-crew.js`, `templates/crew-tab.hbs` |
| Cap. 1, Passo 2 (10–28) | 9 classes (Runner, Infiltrator, Solo, Augmented, Tech, Broker, Reclaimer, Trauma Doc, Warden) e 18 subclasses | `scripts/main.js` (`RUNNER` … `WARDEN`, `importClassesAndSubclasses`); Kill Chain, Cover, Integrated Chrome em `edgeheart-character.js` |
| Cap. 1, Passo 3 (29–30) | Life Paths e Affiliations (no lugar de Ancestralidade e Comunidade) | `main.js` (`LIFE_PATHS`, `AFFILIATIONS`) |
| Cap. 2 (31–36) | Armas primárias, secundárias, armaduras | `main.js` (`PRIMARY_WEAPONS`, `SECONDARY_WEAPONS`, `ARMORS`) |
| Cap. 2 (37–40) | Loot, consumíveis e tabelas | `main.js` (`CONSUMABLES`, `LOOT`); compêndio de tabelas |
| Cap. 2 (41–44) | Cyberware, Custo Cibernético, Acesso de Carta / Meio / Total | `main.js` (`CYBERWARE`, `importCyberware`); `edgeheart-character.js` (`Cyberware`, `AccessClass`, `Humanity.access`) |
| Cap. 2 (45–50) | Eidolons (Cyberware Especial), Soul Bond, Sincronia, Disabled | `main.js` (`EIDOLONS`); `edgeheart-character.js` (`Eidolon`) |
| Cap. 3 (51) | Humanidade (d6 inicial, d4→d12, um avanço por nível), Carga Cibernética, Rolagem de Humanidade, Ciberpsicose, Cyberpsycho | `edgeheart-character.js` (`Humanity`) |
| Cap. 3 (51) | Hacking: Interface Roll, dificuldades, Breach | texto e ações das cartas em `main.js` |
| Cap. 3 (52) | Veículos: Damaged/Disabled, Burdens | `main.js` (`VEHICLES`); `edgeheart-crew.js` (`Vehicle`) |
| Cap. 4 (53–64) | Ambientes e adversários dos Tiers 1–4 | `main.js` (`ADVERSARIES`, `ENVIRONMENTS`, `THREAT_AUTOMATION`) |
| Cap. 5 (65–89) | 11 Competências: Network, Assault, Chrome, Systems, Influence, Ghost, Frontier, Medtech, Aegis, Redline, Blackwall | `main.js` (`*_CARDS`, `COMPETENCIES`, `ensureHomebrewDomains`); Redline copia o Blood do The Void (`data/void-blood.json`) |

## Regras do Cap. 3 mais sensíveis a bug
- A Humanidade sobe **só uma vez por nível** (d4 → d6 → d8 → d10 → d12). O mestre pode ajustar
  fora desse limite (v1.38.1).
- **Rolagem de Humanidade:** obrigatória ao rolar com Medo com todo o Estresse marcado **ou** sem
  Esperança. Resultado maior que a Carga Cibernética = controle; igual ou menor = Ciberpsicose.
- **Ciberpsicose:** sem Dado de Esperança; o Dado de Medo vira d20 e toda rolagem é com Medo;
  features que pedem Estresse não marcam Estresse.
- **Fim:** outro PC em Close gasta 1 Esperança e rola-se a Humanidade de novo. Terminar a cena em
  Ciberpsicose reduz o Dado de Humanidade em um passo; abaixo de d4, o personagem está perdido
  (Death Move: Cyberpsycho).
