# Pokémon Team Analyzer — V1

Team Builder / Pokédex inteligente que analisa a composição de um time **considerando o jogo selecionado**.
HTML + CSS + JavaScript puro, sem frameworks, sem servidor e sem internet: abra o `index.html` no navegador.

## Como rodar

```
abra index.html no navegador (duplo clique)
```

No celular, toque numa sugestão para ver a prévia e toque de novo para adicionar.

Opcional (desenvolvimento):

```bash
node tools/build-data.mjs           # regenera os dados a partir da PokéAPI (usa .cache/ se existir)
node tools/build-data.mjs --refresh # força novo download dos CSVs
node tools/download-sprites.mjs     # baixa sprites para assets/sprites (uso offline)
node tests/engine.test.mjs          # testes do motor (Node 18+)
```

## Publicar (site, app instalável e APK)

O repositório já vem com dois workflows do GitHub Actions, que rodam a cada push na `main`:

| Workflow | Resultado | Link para compartilhar |
|---|---|---|
| `.github/workflows/pages.yml` | site no GitHub Pages, instalável como app (PWA) e offline | `https://<usuário>.github.io/<repositório>/` |
| `.github/workflows/android.yml` | APK Android (Capacitor) publicado em Releases → `apk-latest` | `https://github.com/<usuário>/<repositório>/releases/download/apk-latest/PokemonTeamAnalyzer.apk` |

Configuração única no GitHub:
1. O repositório precisa ser **público** (Pages gratuito e download do APK sem login).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. (Se o workflow do APK falhar por permissão) **Settings → Actions → General → Workflow permissions → Read and write**.

Instalar:
- **Android / desktop (Chrome, Edge)**: abrir o site e tocar em "Instalar app" (ou menu ⋮ → Instalar). Ou baixar o APK.
- **iPhone (Safari)**: abrir o site → Compartilhar → "Adicionar à Tela de Início". APK não funciona no iOS.
- **APK**: no Android, abrir o arquivo baixado e permitir "instalar apps desta fonte". O Play Protect pode avisar
  que o app é desconhecido (é uma versão de teste, fora da loja): "Instalar mesmo assim".

Arquivos envolvidos: `manifest.webmanifest`, `sw.js` + `sw-manifest.js` (offline), `tools/build-web.mjs`
(gera a lista offline e a pasta `www/`), `package.json` + `capacitor.config.json` (Android), `resources/` (ícone e splash).
Depois de alterar arquivos do app, rode `node tools/build-web.mjs` (o workflow do Pages também roda).

## Funcionalidades da V1

| # | Item | Onde |
|---|------|------|
| 1 | Seleção do jogo (6 jogos) | tela inicial, seletor no topo |
| 2 | Banco de Pokémon por jogo (com DLCs/transferência) | aba **Pokédex** |
| 3 | Montagem de time de até 6 | aba **Analisar time** |
| 4–7 | Fraquezas, resistências, imunidades, cobertura ofensiva | tabela "Defesa por tipo", "Cobertura ofensiva" e "Resumo do time" (arrastar sugestões com prévia) |
| 8–9 | Team Score + explicação de cada ponto | tela escura "De onde vem o score" |
| 10–11 | Sugestões de adição e substituição, com motivos e comparação antes × depois | "Como melhorar este time" |
| 12 | Geração dos melhores times equilibrados | aba **Gerar times** |
| 13 | Interface responsiva | desktop e celular |

Jogos: Legends: Z-A (+ DLC Mega Dimension), Scarlet/Violet (+ Teal Mask, Indigo Disk, HOME),
Legends: Arceus, Brilliant Diamond/Shining Pearl, Sword/Shield (+ Isle of Armor, Crown Tundra, HOME), X/Y.

## Arquitetura

```
core/pta.js                 namespace global PTA + registries (dados se registram aqui)
data/
  types.js                  nomes/cores dos 18 tipos
  adjustments.js            ajustes manuais de "poder efetivo" (Slaking/Truant etc.)
  games/<jogo>.js           CONFIG ESCRITA À MÃO de cada jogo (regras, mecânicas, conteúdos)
  generated/                GERADO pelo build — não editar
    pokemon-db.js           1.220 Pokémon/formas normalizados (tipos, stats, flags)
    type-charts.js          tabela de efetividade Gen 6+
    availability/<jogo>.js  quem existe em cada jogo, por conteúdo (base/DLC/HOME)
    sprites.js              manifesto dos sprites locais
engine/                     motor puro (sem DOM), testável em Node
  typeCalculator.js         efetividade + modelos por jogo (padrão, Legends: Arceus)
  gameContext.js            contexto do jogo: pool, evoluções no jogo, combinações, ameaças
  teamAnalyzer.js           números brutos do time (fracos/resist./imunes por tipo, STAB…)
  scoringConfig.js          PESOS e parâmetros do score  ← ajuste aqui
  teamScorer.js             componentes do score + calculateFinalTeamScore
  insights.js               textos de diagnóstico
  recommendationEngine.js   adições, substituições, antes × depois
  teamGenerator.js          beam search + busca local
ui/                         views (homeView, teamBuilder, analysisView, recommendationView,
                            generatorView, pokedexView, settingsView) + componentes
app.js                      estado, rotas (#/jogo/aba), persistência em localStorage
tools/                      build-data.mjs, download-sprites.mjs
tests/engine.test.mjs
```

Os scripts são clássicos (não ES modules) porque módulos não carregam via `file://`.

## Dados

Fonte: CSVs oficiais da [PokéAPI](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv).
O build baixa uma vez, normaliza e grava `.js` locais; o app nunca chama API.

Disponibilidade, declarada na config de cada jogo:

- **Learnset** (`versionGroups`): se o Pokémon/forma tem golpes registrados naquele jogo, ele existe lá.
  Funciona por forma (Tauros de Paldea, Arcanine de Hisui, Rotom-Wash…) e inclui DLC e HOME.
- **Pokédex** (`packs[].pokedexes`): separa o conteúdo em jogo base / DLC / transferência.
  Em Z-A, que ainda não tem learnsets na PokéAPI, é a própria fonte de disponibilidade.
- **Megas** por regra: o jogo tem Mega Evolução, a espécie base está disponível e a Mega foi
  introduzida num version group permitido (`megaVersionGroups`), com overrides para Megas de DLC.
- Gigantamax, Totem, formas só-de-batalha e formas idênticas (mesmos tipos e stats) são descartadas.
- "Totalmente evoluído" é calculado **por jogo** (Ursaring é final em BDSP, mas não em SV/LA).

### Adicionando um jogo

1. Crie `data/games/<id>.js` (copie um existente e ajuste `data`, `mechanics`, `rules`, `effectiveness`).
2. `node tools/build-data.mjs`
3. Inclua os dois `<script>` (config e `data/generated/availability/<id>.js`) no `index.html`.

Nenhuma linha do motor precisa mudar.

## Team Score

`Team Score = Σ peso × nota`, com cada nota de 0 a 1 e pesos somando 100 (padrão em `engine/scoringConfig.js`,
editável na aba **Ajustes**):

| Componente | Peso | O que mede |
|---|---|---|
| Ofensiva | 20 | STAB super efetivo contra os 18 tipos **e** contra as combinações de tipo que existem no jogo |
| Defensiva | 15 | por tipo: (resist. + imunes − fracos) / tamanho; tipos comuns no jogo pesam mais |
| Fraquezas compartilhadas | 15 | penaliza 3+ fracos ao mesmo tipo, 2+ fracos sem resposta e fraquezas 4× |
| Resistências | 10 | todo tipo tem alguém que resiste? (1 = 65%, 2 = 90%, 3+ = 100%) |
| Imunidades | 8 | imunidades distintas (meta: 3) |
| Respostas a ameaças | 12 | os 40 finais mais fortes do jogo: muralha, counter, revenge ou neutro |
| Diversidade | 8 | tipos distintos, sem tipos repetidos 3+ vezes nem combinações iguais |
| Equilíbrio de funções | 12 | físico/especial, velocidade, bulk e poder (BSR) relativo ao jogo |

Funções expostas em `PTA.engine`: `calculateOffensiveCoverage`, `calculateDefensiveCoverage`,
`calculateSharedWeaknesses`, `calculateResistances`, `calculateImmunities`, `calculateThreatResponses`,
`calculateTypeDiversity`, `calculateTeamBalance`, `calculateTeamScore`, `calculateFinalTeamScore`.
Novo critério = nova função em `COMPONENTS` (teamScorer.js) + um peso.

## Poder dos Pokémon: Base Stat Rating (BSR)

O "poder" usado no equilíbrio de funções, nas ameaças comuns e no filtro do gerador é o
**Base Stat Rating** de X-Act, a métrica de stats mais conhecida da comunidade competitiva
([artigo do Smogon CAP](https://www.smogon.com/cap/articles/stat_ratings)). `engine/bsr.js` traduz a
implementação de referência de [Quanyails/pokemon-bsr](https://github.com/Quanyails/pokemon-bsr) (MIT):

- stats efetivos no nível 100 (IV 31, sem EVs); velocidade = fração do metagame que o Pokémon ultrapassa;
- Physical/Special Sweepiness (ataque × velocidade) e Physical/Special Tankiness (HP × defesa);
- cada um vira z-score relativo ao **metagame do jogo selecionado** (os Pokémon finais disponíveis);
- escala: PS/SS/PT/ST com média 100, BSR com média 200 (desvio 100).

Assim um Pokémon "forte" em Legends: Arceus é medido contra o pool de Legends: Arceus. Os poucos casos em que
a habilidade invalida os stats (Slaking, Regigigas…) recebem um desconto em `data/adjustments.js`.

## Gerador de times

Com ~150–250 candidatos há ~10¹¹ times possíveis, então força bruta está fora. Toda busca usa a
configuração completa (`SEARCH` em `engine/teamGenerator.js`), sem modo rápido:

1. **Redução do pool**: por combinação de tipos, mantém até 5 representantes (papéis diferentes, maior poder).
2. **Beam search** (largura 64): monta o time membro a membro; todos os times completos avaliados vão para um banco.
3. **Busca local**: os 24 melhores do beam e 16 times aleatórios são refinados trocando cada membro enquanto o score sobe.
4. **Tipo de time**: "Maior Team Score" (pesos normais), "Maior cobertura de tipos" (pesos focados em ofensiva)
   ou "Mais resistente" (pesos focados em defesa, resistências e imunidades). Os pesos ficam em
   `OBJECTIVES`, no mesmo arquivo; todo time continua mostrando o Team Score normal.
5. **Seleção diversa**: mostra os 10 melhores com no máximo 3 membros em comum entre si.
6. **"Gerar mais 10 times"**: entrega os próximos 10 do banco (do 11º para baixo). Quando faltam times diversos,
   novas buscas locais partem de perturbações dos times já mostrados e de times aleatórios.

Leva ~3–6 s na busca inicial; "Gerar mais" é quase instantâneo. Dá para fixar o time atual e completá-lo.
**Megas sem limite** (aba Gerar times ou Ajustes) ignora o limite de 1 Mega por time do jogo; a escolha vale também
para a análise e as sugestões.

## Limitações conhecidas (V1)

- Ofensiva só por STAB (sem golpes de cobertura); habilidades (Levitate, Wonder Guard…) e itens ignorados.
- Funções estimadas por stats base; stats atuais (sem histórico de mudanças entre gerações).
- Terastalização/Dynamax não alteram a análise.
- Z-A: formas alternativas não-Mega seguem a forma padrão da Pokédex; Legends: Arceus sem algumas formas Origem.
- "Ameaças comuns" = Pokémon mais fortes do jogo, não estatística de uso.

## Próximos passos sugeridos

Movesets (cobertura real), habilidades (imunidades por habilidade), papéis por moveset, importação/exportação
no formato Showdown, compartilhamento por URL, formatos competitivos.
