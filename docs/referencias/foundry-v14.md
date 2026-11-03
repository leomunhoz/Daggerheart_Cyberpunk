# Foundry VTT v14: o que o módulo usa

Pesquisado em 2026-11-01 em `https://foundryvtt.com/api/v14/` e nas notas de versão.
**[V]** = conferido na página citada. **[I]** = conhecimento ou inferência, sem página.

## Versão
- **[V]** v14 estável desde 14.359 (2026-04-01). Última: 14.369 (2026-10-08). O `module.json`
  declara mínimo `14`, verificado `14.368`. https://foundryvtt.com/releases/

## Manifesto (`module.json`)
https://foundryvtt.com/article/module-development/
- **[V]** `esmodules` (carregados em ordem), `styles`, `languages[] {lang, name, path}`,
  `packs[] {name, label, path, type, system, ownership}` (Actor e Item **exigem** `system`),
  `packFolders[] {name, sorting, color, packs, folders}`, `relationships.systems`,
  `socket: true`, `compatibility {minimum, verified, maximum}`.
- Compêndio novo no `module.json` só aparece depois de reiniciar o servidor do Foundry.

## Ciclo de hooks
- **[V]** `init`: antes de tudo. https://foundryvtt.com/api/v14/functions/hookEvents.init.html
- **[I]** Ordem: `init` → `i18nInit` → `setup` → `ready`.
  - `init`: settings, `CONFIG`, fichas, helpers e partials do Handlebars.
  - `i18nInit`: `game.i18n` pronto (o sistema monta `game.system.settings.homebrew` aqui).
  - `setup`: documentos e coleções existem; canvas e UI não.
  - `ready`: tudo carregado; CRUD de documentos, `game.user`, `game.users.activeGM`.

## Settings
https://foundryvtt.com/api/v14/classes/foundry.helpers.ClientSettings.html
- **[V]** `game.settings.register(ns, key, {name, hint, scope, config, requiresReload, type, choices, default, onChange})`.
  Escopos `world`, `user` (por jogador) e `client` (por navegador). `set` é assíncrono.
- **[V]** (14.369, `client/helpers/client-settings.mjs:327-328`, `client/hooks.mjs:1448`) Hook
  `clientSettingChanged(key, value, options)`: disparado só para setting de **cliente**, logo depois do
  `onChange` registrado; `key` = `"<namespace>.<chave>"`. Serve para reagir a uma setting sem mexer no
  registro dela. Setting de mundo: o `onChange` roda em **todos** os clientes (`client/documents/setting.mjs:41-51`).

## Compêndios
https://foundryvtt.com/api/v14/classes/foundry.documents.collections.CompendiumCollection.html
- **[V]** `CompendiumCollection`: `locked`, `configure(config)` (async), `getDocuments(query)`,
  `getIndex({fields})`, `importDocument`, `migrate()`.
- **[V]** Formato LevelDB (pasta com `CURRENT`, `MANIFEST-*`, `*.ldb`, `*.log`).
- **[I]** O LevelDB fica travado (`LOCK`) enquanto o mundo está aberto. Feche o mundo antes de
  commitar `packs/`.
- **[V]** Ferramenta oficial `@foundryvtt/foundryvtt-cli` (`fvtt package unpack|pack`) converte
  LevelDB ↔ JSON/YAML. **Não está adotada** aqui (dependência nova; ver ADR 0004).
  https://github.com/foundryvtt/foundryvtt-cli

- **[V]** `index` (coleção mínima do compêndio), `indexed` (já indexado?), `indexFields`. A página
  não diz se o índice já vem carregado no `ready` **[I]** nem se a entrada de Item traz `type` **[I]**
  (conferido em 2026-11-02, Spec `release-1-39`).
- **[V]** (console do usuário, 2026-11-02, Foundry 14 + Daggerheart 2.12.1) Depois do `ready`, os
  compêndios Item do módulo estavam com `indexed = true`, e a entrada do índice trazia `type`.
- **[I]** O navegador pode manter arquivos de módulo (`.js`, `.css`) de uma versão antiga em cache
  depois da atualização: a pilha de um erro veio do `main.js` da 1.38.1 com a 1.39.0 instalada.
  Depois de atualizar o módulo, use Ctrl+F5 (Spec `correcoes-1-39`).

## Notificações
https://foundryvtt.com/api/v14/classes/foundry.applications.ui.Notifications.html
- **[V]** `ui.notifications.info|warn|error|success(message, options)` devolvem a notificação.
  Opções dos exemplos: `permanent`, `console`, `localize`, `format`, `progress`.
- **[V]** Barra de progresso: `const n = ui.notifications.info(msg, { progress: true })` e
  `ui.notifications.update(n, { pct, message })`. `remove(n)`, `has(n)` e `clear()`.

## Aplicações e fichas
https://foundryvtt.com/api/v14/classes/foundry.applications.apps.DocumentSheetConfig.html
- **[V]** `DocumentSheetConfig.registerSheet(documentClass, scope, sheetClass, options)`. O módulo
  usa o atalho `foundry.documents.collections.Actors.registerSheet(...)`.
- **[I]** `ApplicationV2` e `HandlebarsApplicationMixin` em `foundry.applications.api`.
- **[V]** Hooks de render: `render<NomeDaClasse>(app, element: HTMLElement, context, options)`,
  disparado para cada classe da herança, **antes** de o elemento entrar no DOM.
  https://foundryvtt.com/api/v14/functions/hookEvents.renderApplicationV2.html
- **[V]** (14.369, `client/applications/api/application.mjs:1612-1636`) `changeTab(tab, group)` lança erro se a
  aba não está no DOM: renderize antes (`await sheet.render({ force: true })`).
- **[V]** (14.369, `application.mjs:600, 657, 1101-1108`) `setPosition` dentro do hook de render da primeira
  renderização vale: `options.position` é o próprio `#position` e o `setPosition` do fim do render o reaplica.
- **[I]** `renderChatMessageHTML(message, html: HTMLElement)` substituiu o `renderChatMessage` (jQuery) na v13.

## Comunicação jogador → mestre
- **[V]** `User#query(nome, dados, {timeout})` → Promise; handler em `CONFIG.queries[nome]`. Nomes de
  módulo levam prefixo: `edgeheart-cyberpunk.character`, `edgeheart-cyberpunk.crew` (o módulo já
  faz assim). https://foundryvtt.com/api/v14/classes/foundry.documents.User.html
- **[V]** `game.socket` no canal `module.edgeheart-cyberpunk` exige `"socket": true` (o manifesto tem).

## Mudanças v13 → v14 que importam para módulos
https://foundryvtt.com/releases/14.359
- **[V]** Cenas com **Levels** (o `ensureStartScene` do módulo já usa `levels` e `initialLevel`).
- **[V]** Measured Templates removidos em favor de Regions.
- **[V]** Active Effects V2: duração e expiração, efeitos direto em compêndio, o core não define mais `origin`.
- **[I/não conferido]** `ActiveEffect#changes` teria ido para `ActiveEffect#system.changes`.
- **[V]** TinyMCE removido (só ProseMirror). `objectsEqual` → `foundry.utils.equals`. `parseHTML`
  retorna `null`. Chaves `-=`/`==` em `updateSource` obsoletas (`DataFieldOperator`).

## Testes
- **[V]** Não há framework oficial. O padrão da comunidade é o Quench (Mocha dentro do Foundry):
  https://github.com/Ethaks/FVTT-Quench. Não adotado (ADR 0004).

## Ambiente de desenvolvimento
O gerador grava em `modules/edgeheart-cyberpunk/` dentro da pasta de dados do Foundry. Para o
rebuild cair neste repositório, a pasta do módulo no Foundry precisa **ser** este checkout (link
simbólico/junction de `Data/modules/edgeheart-cyberpunk` para cá). O usuário confirma o caminho
antes do primeiro rebuild.
