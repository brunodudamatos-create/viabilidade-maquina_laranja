# Histórico de mudanças

**Autor:** Bruno Duda Dantas Matos

Mudanças pequenas aumentam o decimal (v1.0 → v1.1). Mudanças estruturais aumentam o número inteiro (v1.x → v2.0).

## v2.0 – 2026-11-16

Mudança estrutural: o simulador deixa de partir de "litros por dia" e passa a partir de **pontos de venda**.

- Funil: pontos de venda × giro por ponto × mix de tamanhos (300 ml, 500 ml e 1 L) → garrafas por dia → litros → equipe.
- Respostas diretas: pontos de venda mínimos, garrafas por dia no equilíbrio e contatos de prospecção necessários (taxa de fechamento).
- Método acadêmico: análise de risco de Hertz (1964), Monte Carlo sobre o VPL, com TIR, payback descontado, exposição máxima de caixa e VPL por TMA (a Selic de 13,75% ao ano é o piso).
- Diagrama tornado (sensibilidade de um fator por vez).
- Novos custos e perdas: preço de varejo por tamanho, margem do ponto de venda, perda por validade (48 h), entrega refrigerada e investimento inicial.
- Equipe contratada automaticamente quando a produção passa de 60 L/dia por pessoa.
- Tabela "quanto o ponto fica do preço" (de 0% a 45%) e referências do método.
- Removidos: fator de demanda (o giro por ponto passou a representar essa incerteza), preço único por litro e treinamento diluído em 12 meses (agora é investimento do mês 0).
- Testes automáticos (22), com valores conferidos por um script em Python.

## v1.0 – 2026-11-16

Primeira versão.

- Motor de cálculo Monte Carlo (distribuição triangular, semente fixa para resultado reproduzível).
- Indicadores: lucro mensal, custo total por litro, ponto de equilíbrio, chance de prejuízo, mês 1.
- Gráficos: lucro × volume diário e distribuição do lucro, com dicas ao passar o mouse e tabelas equivalentes.
- Tabela de dados com fonte, data e confiança; lista do que ainda falta.
- Dados iniciais: cotação da laranja na CEASA-MT (jul/2026), embalagem, mão de obra do setor em MT, preços de venda de outras cidades.
- Volume padrão de 20 L/dia, perto do ponto de equilíbrio, para não dar impressão otimista.
- Testes automáticos (9) conferindo a conta manual.
