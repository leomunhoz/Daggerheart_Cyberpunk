// Tradução dos compêndios pelo Babele (opcional). Os compêndios são em inglês; com o Foundry em
// português, o Babele aplica babele/pt-BR/<compêndio>.json. Aqui entram só os campos do Daggerheart
// e do módulo que o Babele não conhece sozinho. As ações, experiências etc. são achadas pelo nome em
// inglês (keys: ["name"]), então os IDs gerados a cada build não importam.
const MODULE_ID = "edgeheart-cyberpunk";
const FLAGS = `flags.${MODULE_ID}`;

// Coleção { id: { name, description } } (ações do sistema, experiências), casada pelo nome original.
const byName = (path, mapping = { name: "name", description: "description" }) =>
  ({ path, converter: "structured", container: "keyed", keys: ["name"], mapping });
// Um objeto só com nome e descrição (o ataque embutido das armas e dos adversários).
const single = path => ({ path, converter: "structured", cardinality: "one", mapping: { name: "name", description: "description" } });

// Vai no "mapping" de cada arquivo de tradução (o gerador escreve), não global: assim não mexe em
// traduções de outros módulos para o Daggerheart.
const PART_MAPPING = { description: "system.description", actions: byName("system.actions"), attack: single("system.attack") };

export const ITEM_MAPPING = {
  // O padrão do Babele é system.description.value; no Daggerheart a descrição é o próprio campo.
  description: "system.description",
  ...PART_MAPPING,
  // Perguntas de história e conexões das classes (listas de textos).
  backgroundQuestions: { path: "system.backgroundQuestions", converter: "edgeheartList" },
  connections: { path: "system.connections", converter: "edgeheartList" },
  // Flags do módulo com texto que aparece na tela.
  pick: { path: `${FLAGS}.pick`, converter: "structured", cardinality: "one", mapping: { title: "title", prompt: "prompt", options: { path: "options", converter: "edgeheartLabels" } } },
  vehicleName: `${FLAGS}.vehicle.baseName`,
  // Peças do Eidolon (armas, features e estrutura) guardadas no item até mobilizar; casadas pelo nome.
  eidolonParts: { path: `${FLAGS}.eidolon.parts`, converter: "document", documentType: "Item", cardinality: "many", mapping: PART_MAPPING }
};

export const ACTOR_MAPPING = {
  description: "system.description",
  motivesAndTactics: "system.motivesAndTactics",
  impulses: "system.impulses",
  attack: single("system.attack"),
  experiences: byName("system.experiences"),
  potentialAdversaries: { path: "system.potentialAdversaries", converter: "structured", container: "keyed", keys: ["label"], mapping: { label: "label" } },
  // Features dos adversários e ambientes: itens embutidos, com as mesmas regras dos itens.
  items: { path: "items", converter: "document", documentType: "Item", cardinality: "many", mapping: ITEM_MAPPING }
};

Hooks.once("babele.init", babele => {
  babele.register({ module: MODULE_ID, lang: "pt-BR", dir: "babele/pt-BR" });
  // { chave: texto } (ex: as opções do Calibrar Atributo): troca só os textos que têm tradução.
  const labels = (value, translation) => (value && translation ? { ...value, ...translation } : value);
  labels.extract = value => ({ ...(value ?? {}) });
  // Lista de textos: a tradução substitui a lista inteira quando tem o mesmo tamanho.
  const list = (value, translation) => (Array.isArray(value) && Array.isArray(translation) && translation.length === value.length ? translation : value);
  list.extract = value => [...(value ?? [])];
  babele.registerConverters({ edgeheartLabels: labels, edgeheartList: list });
});
