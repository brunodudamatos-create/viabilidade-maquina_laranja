<!--
  README do simulador de viabilidade – suco de laranja natural (Cuiabá)
  Autor: Bruno Duda Dantas Matos
  Versão: v3.2 (2026-11-20)
  Histórico de mudanças: veja CHANGELOG.md
-->
# Simulador de viabilidade: suco de laranja natural em Cuiabá

Estudo de viabilidade com dados públicos. Responde: quantos pontos de venda, quantas garrafas
(300 ml, 500 ml e 1 L) e quantos contatos de prospecção são necessários para o negócio se pagar.
Método: análise de risco de Hertz (1964), com Monte Carlo sobre o VPL, TIR, payback descontado e tornado.

**Autor:** Bruno Duda Dantas Matos · **Versão:** v3.2

## O que ele faz

- Você escolhe: pontos de venda atendidos, equipe mínima, dias de operação, retorno exigido (TMA), horizonte e a margem do ponto de venda.
- Cada custo é uma **faixa** (mínimo, mais provável, máximo), não um número fixo.
- Mostra pontos de venda mínimos, garrafas por dia no equilíbrio, contatos a prospectar, VPL (mediana e faixa de 80%),
  chance de VPL negativo, payback descontado, TIR, exposição máxima de caixa, lucro em regime e o **mês 1**.
- Mostra o **tornado** (o que mais pesa no VPL) e a tabela de quanto o ponto de venda fica do preço.
- Cada dado tem **fonte, data e nível de confiança** (alta, média ou baixa).

## ⚠ O que ele NÃO faz

- **Não prevê demanda.** O giro por ponto, o mix de tamanhos e a taxa de fechamento são premissas. A demanda real só se descobre com teste em poucos pontos e a prospecção.
- Vários números são **estimativas** (confiança baixa). A lista do que falta aparece na página.
- Não é aconselhamento financeiro, jurídico ou sanitário. Confirme registro no MAPA, alvará sanitário, CNAE e impostos com contador e Vigilância Sanitária.
- **Não coloque dados internos de empresas neste repositório** (ele é público). Use só dados públicos ou faixas.

## Como rodar no computador

```bash
npm start
```

Abra http://localhost:8080 no navegador. (É só um servidor de arquivos estáticos; a página precisa dele para carregar `data/dados.json`.)

## Como testar o cálculo

```bash
npm test
```

Os testes conferem a conta feita à mão (e em Python), o VPL, a TIR, o payback, o tornado, a reprodutibilidade e os limites.

## Como atualizar os dados

Edite `data/dados.json`. Para cada parâmetro: `min`, `moda` (mais provável), `max`, `fonte`, `url`, `data` e `confianca`.
Depois rode `npm test`, aumente a versão e registre a mudança em `CHANGELOG.md`.

## Como publicar na Vercel

1. Em vercel.com, escolha **Add New… → Project** e importe este repositório do GitHub.
2. Em *Framework Preset*, deixe **Other**. Não precisa de comando de build nem de pasta de saída.
3. Clique em **Deploy**. Cada novo envio ao GitHub publica de novo sozinho.

> O plano gratuito da Vercel (Hobby) é para uso pessoal e não comercial. Este é um estudo, mas se a Vercel
> considerar o uso comercial, o mesmo código roda sem mudança em Cloudflare Pages ou GitHub Pages.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html`, `style.css`, `app.js` | Página e gráficos |
| `sim.js` | Motor de cálculo (sem dependências) |
| `data/dados.json` | Dados, fontes e confiança |
| `test/sim.test.mjs` | Testes do cálculo |
| `CHANGELOG.md` | Histórico de versões |
