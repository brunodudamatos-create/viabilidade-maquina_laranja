# Histórico de mudanças

**Autor:** Bruno Duda Dantas Matos

Mudanças pequenas aumentam o decimal (v1.0 → v1.1). Mudanças estruturais aumentam o número inteiro (v1.x → v2.0).

## v3.0 – 2026-11-20

Mudança estrutural: o simulador passa a ter **cenários de negócio clicáveis** (abas), para encontrar em qual modelo o suco de laranja se paga.

- Aba **A · Garrafa para revenda**: o simulador da v2.0, sem nenhuma alteração de cálculo (testes provam o mesmo resultado).
- **B · Copo no CEASA**, **C · Entrega própria**, **D · Garrafa no balcão**, **E · Carrinho em ponto de fluxo**: venda direta, sem intermediário.
- Cada cenário tem os mesmos filtros do A (equipe mínima, dias de operação, retorno exigido, horizonte) mais a demanda por dia (copos, pedidos ou vendas) e as **pessoas sem salário (família)**.
- Resultado principal: **quantos copos ou pedidos por dia precisam ser vendidos para empatar**, com VPL, TIR, payback, exposição de caixa, tornado, curva VPL × demanda e distribuição.
- Gráfico "para onde vai cada real de venda" (fruta, embalagem, energia/água/limpeza, entrega/impostos, equipe, ponto/fixos).
- **Energia elétrica explícita** (kWh por litro, refrigeração e tarifa), **manutenção da máquina**, água e limpeza, aluguel do ponto, divulgação, taxa de pagamento e entrega: valores provisórios, de baixa confiança, até chegar a placa da máquina e a conta de luz.
- Aba **Comparar todos** (A a E lado a lado) e riscos e "como validar" em cada cenário.
- Novos arquivos: `cenarios.js` (motor) e `cenarios-ui.js` (interface). `sim.js` não foi alterado; `app.js` ganhou só o redesenho ao voltar para a aba A (v2.1).
- Testes automáticos: 31 (9 novos, com conta manual do cenário B e prova de que o A não mudou).

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
