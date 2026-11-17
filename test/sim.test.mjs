/*
 * Testes do motor de cálculo (sim.js)
 * Autor: Bruno Duda Dantas Matos
 * Versão: v1.0 (2026-11-16)
 * Histórico: v1.0 – testes iniciais (conta manual, reprodutibilidade, limites).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simular, calcular, curvaVolume, mulberry32, triangular } from '../sim.js';

const dados = JSON.parse(readFileSync(new URL('../data/dados.json', import.meta.url), 'utf8'));

// Dados "congelados": todos os parâmetros com min = moda = max, para dar para conferir à mão.
function dadosFixos() {
  const d = JSON.parse(JSON.stringify(dados));
  const alvo = {
    preco_laranja_kg: 2.0, rendimento_kg_l: 2.2, perda_fruta: 0.12, garrafa_un: 2.8,
    rotulo_un: 0.3, insumos_l: 0.5, custo_func_mes: 3150, treinamento_unico: 800,
    fixos_mes: 300, imposto: 0.04, fator_demanda: 1.0,
  };
  for (const p of d.parametros) { p.min = p.moda = p.max = alvo[p.id]; }
  d.premissas_fixas.variacao_preco_venda = 0;
  return d;
}

test('conta manual: lucro, custo por litro e ponto de equilíbrio', () => {
  const d = dadosFixos();
  const ctl = { volumeDia: 40, precoVenda: 19, funcionarios: 1, diasMes: 26 };
  const r = simular(d, ctl, 50);
  // fruta: 2,2 / (1 - 0,12) = 2,5 kg/L -> R$ 5,00. Variável: 5 + 2,8 + 0,3 + 0,5 = 8,6
  // litros/mês = 40 * 26 = 1040. Receita = 19760. Imposto = 790,40
  // fixo = 3150 + 800/12 + 300 = 3516,667. Lucro = 19760 - 790,4 - 8944 - 3516,667 = 6508,933
  assert.ok(Math.abs(r.lucro.p50 - 6508.9333) < 0.01, `lucro ${r.lucro.p50}`);
  // custo total por litro = 8,6 + 3516,667 / 1040 = 11,981
  assert.ok(Math.abs(r.custoL.p50 - 11.9814) < 0.001, `custo ${r.custoL.p50}`);
  // equilíbrio = 3516,667 / ((19*0,96 - 8,6) * 26) = 14,03 L/dia
  assert.ok(Math.abs(r.equilibrio.p50 - 14.03) < 0.01, `equilíbrio ${r.equilibrio.p50}`);
  assert.equal(r.probPrejuizo, 0);
});

test('mês 1: treinamento inteiro, perdas extras e 70% do volume', () => {
  const d = dadosFixos();
  const ctl = { volumeDia: 40, precoVenda: 19, funcionarios: 1, diasMes: 26 };
  const r = simular(d, ctl, 50);
  // perda 0,20 -> 2,2/0,8 = 2,75 kg/L -> R$ 5,50; variável = 9,10
  // litros = 40*0,7*26 = 728; receita = 13832; imposto = 553,28
  // fixo = 3150 + 800 + 300 = 4250
  // lucro = 13832 - 553,28 - 728*9,10 - 4250 = 13832 - 553,28 - 6624,8 - 4250 = 2403,92
  assert.ok(Math.abs(r.lucroMes1.p50 - 2403.92) < 0.01, `mês 1 ${r.lucroMes1.p50}`);
});

test('mesma semente = mesmo resultado; semente diferente muda a amostra', () => {
  const ctl = { volumeDia: 35, precoVenda: 19, funcionarios: 1, diasMes: 26 };
  const a = simular(dados, ctl, 2000, 1);
  const b = simular(dados, ctl, 2000, 1);
  const c = simular(dados, ctl, 2000, 2);
  assert.equal(a.lucro.p50, b.lucro.p50);
  assert.notEqual(a.lucro.p50, c.lucro.p50);
});

test('quantis em ordem e probabilidade entre 0 e 1', () => {
  const ctl = { volumeDia: 35, precoVenda: 19, funcionarios: 1, diasMes: 26 };
  const r = simular(dados, ctl, 3000);
  assert.ok(r.lucro.p10 <= r.lucro.p50 && r.lucro.p50 <= r.lucro.p90);
  assert.ok(r.custoL.p10 <= r.custoL.p50 && r.custoL.p50 <= r.custoL.p90);
  assert.ok(r.probPrejuizo >= 0 && r.probPrejuizo <= 1);
});

test('volume muito baixo dá prejuízo quase certo; volume alto dá lucro quase certo', () => {
  const base = { precoVenda: 19, funcionarios: 1, diasMes: 26 };
  const baixo = simular(dados, { ...base, volumeDia: 5 }, 3000);
  const alto = simular(dados, { ...base, volumeDia: 60 }, 3000);
  assert.ok(baixo.probPrejuizo > 0.95, `baixo ${baixo.probPrejuizo}`);
  assert.ok(alto.probPrejuizo < 0.05, `alto ${alto.probPrejuizo}`);
});

test('curva lucro × volume é crescente na mediana', () => {
  const ctl = { precoVenda: 19, funcionarios: 1, diasMes: 26, volumeDia: 35 };
  const curva = curvaVolume(dados, ctl, [10, 30, 50, 70], 1500);
  for (let i = 1; i < curva.length; i++) assert.ok(curva[i].p50 > curva[i - 1].p50);
});

test('aviso de capacidade: acima de 60 L/dia por funcionário', () => {
  const base = { precoVenda: 19, diasMes: 26 };
  assert.equal(simular(dados, { ...base, volumeDia: 70, funcionarios: 1 }, 100).acimaCapacidade, true);
  assert.equal(simular(dados, { ...base, volumeDia: 70, funcionarios: 2 }, 100).acimaCapacidade, false);
});

test('triangular respeita os limites', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 5000; i++) {
    const x = triangular(rng, 1, 2, 4);
    assert.ok(x >= 1 && x <= 4);
  }
});

test('dados.json: todo parâmetro tem min ≤ moda ≤ max, fonte e confiança válida', () => {
  for (const p of dados.parametros) {
    assert.ok(p.min <= p.moda && p.moda <= p.max, p.id);
    assert.ok(p.fonte && p.fonte.length > 3, p.id);
    assert.ok(['alta', 'media', 'baixa'].includes(p.confianca), p.id);
  }
});
