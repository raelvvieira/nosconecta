# Importação da planilha de custos

Arquivo: `custos-nos.xlsx`
Gerado em: 2026-09-28

**Nada foi gravado no banco.** Este relatório e os quatro CSVs ao lado são uma PROPOSTA:
a conta de cada linha foi refeita, e o que não fecha está listado abaixo para você decidir.

## Resumo

| | |
|---|---|
| Materiais distintos | 91 |
| ...vindos da lista curada | 39 |
| ...marcados como revisados | 69 |
| Nomes duplicados descartados | 33 |
| Fichas técnicas | 18 |
| Itens de ficha | 161 |
| Linhas com conta errada | **23** |
| Fichas cujo total não fecha | **6** |
| Materiais da ficha sem nome igual no catálogo | **52** de 61 |

## Linhas em que `quantidade × valor unitário` não dá o total escrito

Parte disto não é erro de digitação: quando o valor unitário é o preço da EMBALAGEM
(bráquete a R$ 32,00 a caixa de 20), o total está certo e o rótulo da coluna é que engana.
Por isso a decisão é sua, linha por linha.

| Procedimento | Material | Qtd | Unitário | Escrito | Recalculado | Diferença |
|---|---|---:|---:|---:|---:|---:|
| Clareamento no Consultório | Barreira Gengival | 0,33 | R$ 15,66 | R$ 5,00 | R$ 5,17 | +0,17 |
| Clareamento no Consultório | Papel Esterilização | 1 | R$ 0,27 | R$ 0,08 | R$ 0,27 | +0,19 |
| Clareamento Caseiro | Luva de Látex | 4 | R$ 0,39 | R$ 0,78 | R$ 1,56 | +0,78 |
| Facetas | Resina | 15 | R$ 41,75 | R$ 62,63 | R$ 626,25 | +563,62 |
| Aparelho Metálico (instalação) | Microbrush | 1 | R$ 13,90 | R$ 0,14 | R$ 13,90 | +13,76 |
| Aparelho Metálico (instalação) | Braquete metálico | 20 | R$ 32,00 | R$ 32,00 | R$ 640,00 | +608,00 |
| Aparelho Metálico (instalação) | Tubos | 4 | R$ 12,00 | R$ 12,00 | R$ 48,00 | +36,00 |
| Aparelho Metálico (instalação) | Fios de Niti | 2 | R$ 2,14 | R$ 2,14 | R$ 4,28 | +2,14 |
| Manutenção | Fios de Niti | 2 | R$ 2,14 | R$ 2,14 | R$ 4,28 | +2,14 |
| Remoção Aparelho + Limpeza | Broca remoção resina (Orthomundi) | 1 | R$ 68,90 | R$ 13,68 | R$ 68,90 | +55,22 |
| Remoção Aparelho + Limpeza | Pedra Arkansas American Stones | 1 | R$ 14,02 | R$ 3,50 | R$ 14,02 | +10,52 |
| Contenção Acetato | Alginato | 1 | R$ 30,39 | R$ 3,00 | R$ 30,39 | +27,39 |
| Contenção Acetato | Gesso | 1 | R$ 8,75 | R$ 0,87 | R$ 8,75 | +7,88 |
| Contenção Acetato | Placa Cristal 1mm | 1 | R$ 39,73 | R$ 3,97 | R$ 39,73 | +35,76 |
| Contenção Fixa | Ácido Fosfórico | 1 | R$ 6,66 | R$ 0,66 | R$ 6,66 | +6,00 |
| Contenção Fixa | Adesivo Opti Bond | 1 | R$ 198,73 | R$ 13,24 | R$ 198,73 | +185,49 |
| Contenção Fixa | Microbrush | 1 | R$ 13,90 | R$ 0,14 | R$ 13,90 | +13,76 |
| Contenção Fixa | Resina Flow Tetric Ivoclar | 1 | R$ 119,00 | R$ 11,90 | R$ 119,00 | +107,10 |
| Contenção Fixa | Contenção Corrente (Orthomundi) | 1 | R$ 199,00 | R$ 9,95 | R$ 199,00 | +189,05 |
| Extração de Dentes do Siso | Água Destilada | 100 | R$ 0,30 | R$ 0,30 | R$ 30,00 | +29,70 |
| Gengivoplastia | Água Destilada | 100 | R$ 0,30 | R$ 0,30 | R$ 30,00 | +29,70 |
| Colocação do Implante | Água Destilada | 100 | R$ 0,30 | R$ 0,30 | R$ 30,00 | +29,70 |
| Colocação do Implante | Articaina | 10 | R$ 4,82 | R$ 40,82 | R$ 48,20 | +7,38 |

## Custo de cada ficha: o escrito e o recalculado

"Soma das linhas" usa os totais COMO ESTÃO escritos; "recalculado" refaz cada linha
por `quantidade × valor unitário`. Quando as duas colunas diferem muito, a resposta está
na tabela de erros acima — e quase sempre é o valor unitário que é de embalagem.

| Ficha | Itens | Soma das linhas | Recalculado | Custo Total escrito |
|---|---:|---:|---:|---:|
| Clareamento no Consultório | 8 | R$ 54,88 | R$ 55,24 | R$ 54,88 |
| Clareamento Caseiro | 8 | R$ 43,37 | R$ 44,15 | R$ 43,37 |
| Limpeza Dental (Profilaxia) | 9 | R$ 7,50 | R$ 7,50 | R$ 7,50 |
| Limpeza Profunda (Raspagem e Alisamento Radicular) | 9 | R$ 7,50 | R$ 7,50 | R$ 7,50 |
| Polimento Dental | 7 | R$ 21,55 | R$ 21,55 | R$ 21,55 |
| Restauração | 12 | R$ 45,77 | R$ 45,77 | R$ 45,77 |
| Facetas | 14 | R$ 154,46 | R$ 718,07 | R$ 130,85 |
| Aparelho Metálico (instalação) | 13 | R$ 60,20 | R$ 720,10 | R$ 60,15 |
| Aparelho Estético (instalação) | 2 | R$ 178,15 | R$ 178,15 | R$ 178,15 |
| Manutenção | 9 | R$ 8,40 | R$ 10,54 | R$ 8,40 |
| Remoção Aparelho + Limpeza | 3 | R$ 24,68 | R$ 90,42 | R$ 24,68 |
| Contenção Acetato | 8 | R$ 11,15 | R$ 82,18 | R$ 11,15 |
| Contenção Fixa | 10 | R$ 38,78 | R$ 540,18 | R$ 38,78 |
| Extração de Dentes do Siso | 9 | R$ 7,10 | R$ 36,80 | R$ 6,10 |
| Gengivoplastia | 10 | R$ 26,07 | R$ 55,77 | R$ 25,77 |
| Colocação do Implante | 13 | R$ 1882,83 | R$ 1919,91 | R$ 3804,21 |
| Toxina Botulínica | 8 | R$ 404,92 | R$ 404,92 | R$ 404,92 |
| Preenchimento | 9 | R$ 241,90 | R$ 241,90 | R$ 251,89 |

## Fichas que já têm hora clínica, imposto e preço

São as peças que o sistema vai aplicar em TODOS os procedimentos. Onde elas não
aparecem, o "Custo Total" da planilha é material puro — e por isso parece barato.

### Colocação do Implante

- **hora clinica**: coluna C `5.0` · coluna D `243.59` · valor R$ 243,59
- **impostos**: coluna C `0.26` · coluna D `1690` · valor R$ 1690,00
- **custo total**: coluna C `—` · coluna D `—` · valor R$ 3804,21
- **valor do procedimento**: coluna C `—` · coluna D `—` · valor R$ 6500,00
- **lucro liquido**: coluna C `Mari/Thiago` · coluna D `1350` · valor R$ 1350,00
- ⚠️ a hora clínica diz **5h × R$ 243,59 = R$ 1217,95**, mas soma R$ 243,59.

## Materiais em que o "Valor Unitário" não é o valor pago dividido pela quantidade

Quase sempre porque o seu número embute RENDIMENTO: quantos usos a embalagem dá.
Confirme o rendimento e ele vira a quantidade por embalagem no cadastro.

| Material | Qtd embalagem | Valor pago | Unitário da planilha | Pela divisão | Rendimento implícito |
|---|---:|---:|---:|---:|---:|
| Soro Fisiológico 0,9% 10ml c/5 Ampolas | 50 | R$ 4,50 | R$ 0,90 | R$ 0,09 | 5,00 usos |
| Adesivo Optibond Universal | 1 | R$ 200,00 | R$ 10,00 | R$ 200,00 | 20,00 usos |
| Resina Vitra APS Unique 4g | 4 | R$ 167,00 | R$ 8,35 | R$ 41,75 | 20,00 usos |
| Pasta Profilática Pert-X | 1 | R$ 29,90 | R$ 2,00 | R$ 29,90 | 14,95 usos |
| Arco NiTi Termoativado Thermopluas Redondo C/10 | 10 | R$ 11,70 | R$ 1,07 | R$ 1,17 | 10,93 usos |
| Arco NiTi Superelástico Curva Reversa Spee Redondo - Morelli 020 L | 1 | R$ 26,10 | R$ 2,61 | R$ 26,10 | 10,00 usos |
| Rolo Dental Algodão c/100un | 1 | R$ 3,90 | R$ 0,20 | R$ 3,90 | 19,50 usos |
| Papel Carbono Contacto Film | 1 | R$ 15,90 | R$ 0,66 | R$ 15,90 | 24,09 usos |
| Tira de Lixa de Aço | 1 | R$ 17,69 | R$ 0,73 | R$ 17,69 | 24,23 usos |
| Mini Kit Clareador Whiteness HP 35% | 1 | R$ 73,99 | R$ 24,66 | R$ 73,99 | 3,00 usos |
| Alginato Jeltrate Dustless Tipo II | 1 | R$ 74,00 | R$ 3,70 | R$ 74,00 | 20,00 usos |
| Placa para Moldeira Cristal 1,5mm | 1 | R$ 49,00 | R$ 9,80 | R$ 49,00 | 5,00 usos |
| Clareador Dental Caseiro Potenza Bianco H2O2 C/ 5 Seringas - PHS 16% | 1 | R$ 65,90 | R$ 33,00 | R$ 65,90 | 2,00 usos |
| Bráquete Cerâmico Maia Light Roth 022 | 1 | R$ 154,56 | R$ 6,18 | R$ 154,56 | 25,01 usos |
| Elástico Intraoral Látex 1/8 | 1 | R$ 8,40 | R$ 0,84 | R$ 8,40 | 10,00 usos |

## Nomes duplicados (mantida a primeira aparição)

- `Babador Impermeável Descartável` — aba Completa linha 2; mantido o da aba Mais Usados linha 5
- `Escova Robinson Nylon CA` — aba Completa linha 4; mantido o da aba Mais Usados linha 37
- `Tubo Simples Conversível Para Cola Roth 022 C/10` — aba Completa linha 6; mantido o da aba Completa linha 5
- `Sugador Descartável` — aba Completa linha 9; mantido o da aba Mais Usados linha 4
- `Lâmina de Bisturi Aço Carbono N°15C C/10 Estéril` — aba Completa linha 23; mantido o da aba Mais Usados linha 25
- `Luva de Látex Branca Com Pó Standard` — aba Completa linha 24; mantido o da aba Mais Usados linha 3
- `Máscara com Elástico` — aba Completa linha 26; mantido o da aba Mais Usados linha 2
- `Seringa para Insulina 0,5ml 6mm x 0,25mm 31g` — aba Completa linha 27; mantido o da aba Mais Usados linha 28
- `Água Destilada para Autoclave` — aba Completa linha 28; mantido o da aba Mais Usados linha 12
- `Adesivo Ambar` — aba Completa linha 29; mantido o da aba Mais Usados linha 16
- `Pasta Profilática Shine 90g` — aba Completa linha 34; mantido o da aba Mais Usados linha 13
- `Fita Banda Matriz Metálica` — aba Completa linha 35; mantido o da aba Mais Usados linha 34
- `Fita Banda Matriz Metálica` — aba Completa linha 36; mantido o da aba Mais Usados linha 34
- `Alginato Avagel Tipo II` — aba Completa linha 37; mantido o da aba Mais Usados linha 10
- `Gesso Pedra Tipo III Branco` — aba Completa linha 39; mantido o da aba Mais Usados linha 11
- `Caixa para Aparelho Ortodôntico` — aba Completa linha 44; mantido o da aba Completa linha 43
- `Ponta Diamantada Esférica FG` — aba Completa linha 50; mantido o da aba Completa linha 49
- `Resina Vittra APS Unique 4g` — aba Completa linha 52; mantido o da aba Mais Usados linha 18
- `Água Destilada para Autoclave` — aba Completa linha 53; mantido o da aba Mais Usados linha 12
- `Tira de Lixa de Aço` — aba Completa linha 64; mantido o da aba Completa linha 25
- `Papel Esterilização` — aba Completa linha 66; mantido o da aba Mais Usados linha 8
- `Toxina Botulínica Nabota Tipo A 100U` — aba Completa linha 67; mantido o da aba Mais Usados linha 30
- `Ácido Hialurônico Preenchedor Lift` — aba Completa linha 68; mantido o da aba Mais Usados linha 35
- `Adesivo Ambar` — aba Completa linha 69; mantido o da aba Mais Usados linha 16
- `Kit Cirúrgico Implante Padrão Estéril` — aba Completa linha 72; mantido o da aba Mais Usados linha 38
- `Fio de Sutura de Nylon` — aba Completa linha 73; mantido o da aba Mais Usados linha 23
- `Compressa de Gaze C/ 500un` — aba Completa linha 74; mantido o da aba Mais Usados linha 24
- `Soro Fisiológico 0,9% 10ml c/5 Ampolas` — aba Completa linha 76; mantido o da aba Mais Usados linha 39
- `Soro Fisiológico 0,9% Bolsa 250ml` — aba Completa linha 77; mantido o da aba Mais Usados linha 40
- `Ponta Diamantada Esférica Média PM 07 Precision` — aba Completa linha 78; mantido o da aba Mais Usados linha 19
- `Barreira Gengival Top Dam - FGM` — aba Completa linha 80; mantido o da aba Mais Usados linha 22
- `1 Kit Clareador Whiteness HP 35% com Top Dam 3 Pacientes` — aba Completa linha 81; mantido o da aba Mais Usados linha 7
- `Broca 3191F` — aba Completa linha 82; mantido o da aba Mais Usados linha 21

## Materiais da ficha que precisam ser casados com o catálogo

A ficha usa nome genérico e o catálogo usa nome comercial. Preencha a coluna
`ESCOLHA_AQUI` de `materiais-a-casar.csv`: material errado na ficha é custo errado
em todo procedimento que o usa, para sempre.

| Material na ficha | Em quantas fichas | Melhor palpite | Semelhança |
|---|---:|---|---:|
| Luva de Látex | 13 | Luva de Látex Branca Com Pó Standard | 0,90 |
| Babador | 13 | Babador Impermeável Descartável | 0,83 |
| Água Destilada | 12 | Água Destilada para Autoclave | 0,99 |
| Enxaguante Bucal | 5 | Enxaguante Bucal Periogard sem Álcool 2L | 0,90 |
| Gaze | 5 | Compressa de Gaze C/ 500un | 0,83 |
| Ácido Fosfórico | 3 | Ácido Fosfórico 37% Condac 37 | 0,99 |
| Ponta Diamantada | 3 | Ponta Diamantada Cônica | 0,99 |
| Kit Estéril Cirúrgico | 3 | Kit Cirúrgico Implante Padrão Estéril | 0,50 |
| Sugador Cirúrgico | 3 | Sugador Cirúrgico Descartável | 0,99 |
| Fios de Sutura | 3 | Fio de Sutura de Nylon | 0,25 |
| Lâmina de Bisturi | 3 | Lâmina de Bisturi Aço Carbono N°15C C/10 Estéril | 0,75 |
| Alginato | 2 | Alginato Avagel Tipo II | 0,75 |
| Gesso | 2 | Gesso Pedra Tipo III Branco | 0,70 |
| Pasta Profilática | 2 | Pasta Profilática Shine 90g | 0,99 |
| Resina | 2 | Resina Vittra APS Unique 4g | 0,70 |
| Microbrush | 2 | — nenhum parecido — | — |
| Fios de Niti | 2 | — nenhum parecido — | — |
| Elastic | 2 | Máscara com Elástico | 0,50 |
| Lenços Umedecidos | 2 | Lenços Umedecidos Panvel Baby 45 Unidades | 0,83 |
| Álcool | 2 | Alcool 70% 5L | 0,83 |
| Barreira Gengival | 1 | Barreira Gengival Top Dam | 0,99 |
| Kit Clareador | 1 | Kit Clareador 10% Potenza Bianco | 0,75 |
| Kit Clareador Caseiro | 1 | — nenhum parecido — | — |
| Sacola de Papel | 1 | Sacola de Papel Kraft com Alça M | 0,90 |
| Discos Soflex | 1 | — nenhum parecido — | — |
| Disco Softflex | 1 | — nenhum parecido — | — |
| Fita Banda Matriz | 1 | Fita Banda Matriz de Poliéster - TDV | 0,99 |
| Discos Softflex | 1 | — nenhum parecido — | — |
| Matriz | 1 | Matriz de Poliéster | 0,99 |
| Acído Fosfórico | 1 | Ácido Fosfórico 37% Condac 37 | 0,99 |
| Resina ortodôntica (Orthomundi) | 1 | — nenhum parecido — | — |
| Braquete metálico | 1 | — nenhum parecido — | — |
| Tubos | 1 | — nenhum parecido — | — |
| Custos Instalação | 1 | — nenhum parecido — | — |
| Braquetes estéticos | 1 | — nenhum parecido — | — |
| OUTROS | 1 | — nenhum parecido — | — |
| Broca remoção resina (Orthomundi) | 1 | — nenhum parecido — | — |
| Pedra Arkansas American Stones | 1 | Pedra Arkansas American Stones Ultra-White Fina FG | 0,99 |
| Custo limpeza | 1 | — nenhum parecido — | — |
| Placa Cristal 1mm | 1 | Placa para Moldeira Cristal 1,0mm | 0,33 |
| Disco de Carborundum | 1 | — nenhum parecido — | — |
| Adesivo Opti Bond | 1 | Adesivo Ambar | 0,25 |
| Resina Flow Tetric Ivoclar | 1 | — nenhum parecido — | — |
| Contenção Corrente (Orthomundi) | 1 | — nenhum parecido — | — |
| Articaina | 1 | — nenhum parecido — | — |
| Implante Neodent Grandmorse | 1 | — nenhum parecido — | — |
| Parafuso de Cobertura | 1 | — nenhum parecido — | — |
| Prótese Total Provisória | 1 | — nenhum parecido — | — |
| Água para Injeção | 1 | Água para Injeção c/ 5 Frascos 10ml - Samtec | 0,83 |
| Toxina Botulínica | 1 | Toxina Botulínica Nabota Tipo A 100U | 0,83 |
| Ácido Hialurônico | 1 | Ácido Hialurônico Preenchedor Lift | 0,99 |
| Microcânula com Agulha | 1 | Microcânula com Agulha - Rennova | 0,99 |

## Procedimentos

O catálogo real não foi informado (`--procedimentos`), então não há sugestão de
casamento das 18 fichas com os procedimentos do sistema. Rode de novo passando o CSV.

## O que fazer com este resultado

1. Abrir `materiais.csv` e conferir a coluna `conferir` (rendimento).
2. Preencher `ESCOLHA_AQUI` em `materiais-a-casar.csv` e em `procedimentos-a-casar.csv`.
3. Decidir, nas linhas listadas acima, se o valor unitário é unidade ou embalagem.
4. Só então a migration de dados é escrita — a partir dos CSVs revisados, não da planilha.
