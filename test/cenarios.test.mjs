/*
 * Testes dos cenários B a E e da regressão do Cenário A
 * Autor: Bruno Duda Dantas Matos
 * Versão: v3.0 (2026-11-20)
 * Histórico: v3.0 – arquivo novo (conta manual do cenário B, equilíbrio, filtros,
 *            reprodutibilidade e prova de que o Cenário A não mudou).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simular, tornado } from '../sim.js';
import { mapaCenario, calcularMesCen, equilibrioVendas, simularCen, curvaDemanda, tornadoCen } from '../cenarios.js';

const dados = JSON.parse(fs.readFileSync(new URL('../data/dados.json', import.meta.url), 'utf8'));
const modas = (cen) => Object.fromEntries(Object.entries(mapaCenario(dados, cen)).map(([k, p]) => [k, p.moda]));
const B = dados.cenarios.find((c) => c.letra === 'B');
const ctlB = { demanda: 80, funcionarios: 1, familia: 0, diasMes: 26, tmaAa: 0.1375, horizonte: 24 };

test('Cenário A não mudou (números da v2.0, 3000 simulações)', () => {
  const ctl = { pontos: 30, funcionarios: 1, diasMes: 26, tmaAa: 0.1375, horizonte: 24, margemPonto: null };
  const r = simular(dados, ctl, 3000);
  assert.ok(Math.abs(r.vpl.p50 - -167780.88651431393) < 1e-6);
  assert.ok(Math.abs(r.lucroRegime.p50 - -7635.050093783954) < 1e-6);
  assert.ok(Math.abs(tornado(dados, ctl).vplBase - -116035.79479963922) < 1e-6);
  const d = simular(dados, { ...ctl, margemPonto: 0 }, 3000);
  assert.ok(Math.abs(d.vpl.p50 - -3949.3139353741394) < 1e-6);
  assert.ok(Math.abs(d.equilibrioPontos.p50 - 23.58704398004164) < 1e-9);
});

test('cenário B: conta manual com todos os valores mais prováveis', () => {
  const m = calcularMesCen(modas(B), ctlB, B, 1, 0);
  assert.ok(Math.abs(m.D - 68) < 1e-9);
  assert.ok(Math.abs(m.litrosProdDia - 28.3333333) < 1e-6);
  assert.ok(Math.abs(m.receita - 15028) < 1e-6);
  assert.ok(Math.abs(m.itens.fruta - 3683.3333333) < 1e-5);
  assert.ok(Math.abs(m.itens.embalagem - 1473.3333333) < 1e-5);
  assert.ok(Math.abs(m.itens.aguaLimpeza - 184.1666667) < 1e-5);
  assert.ok(Math.abs(m.itens.energia - 187.8066667) < 1e-5);
  assert.ok(Math.abs(m.itens.impostosTaxas - 901.68) < 1e-6);
  assert.equal(m.pessoas, 1);
  assert.ok(Math.abs(m.custoTotal - 11030.32) < 1e-4);
  assert.ok(Math.abs(m.lucro - 3997.68) < 1e-4);
});

test('equilíbrio: lucro em regime é zero na demanda de empate', () => {
  const s = modas(B);
  const eq = equilibrioVendas(s, ctlB, B);
  assert.ok(Math.abs(eq - 37.00062034739455) < 1e-9);
  const m = calcularMesCen({ ...s, realizacao_demanda: 1 }, { ...ctlB, demanda: eq }, B, 1, 0);
  assert.ok(Math.abs(m.lucro) < 1e-6);
});

test('pessoas da família sem salário reduzem o custo e elevam o lucro', () => {
  const s = modas(B);
  const a = calcularMesCen(s, ctlB, B, 1, 0);
  const b = calcularMesCen(s, { ...ctlB, familia: 1 }, B, 1, 0);
  assert.ok(Math.abs(b.lucro - a.lucro - 3150) < 1e-6);
  assert.ok(equilibrioVendas(s, { ...ctlB, familia: 1 }, B) < equilibrioVendas(s, ctlB, B));
});

test('equipe sobe sozinha quando a demanda passa da capacidade', () => {
  const m = calcularMesCen({ ...modas(B), realizacao_demanda: 1 }, { ...ctlB, demanda: 400 }, B, 1, 0);
  assert.equal(m.pessoas, 3);
});

test('mais energia (tarifa) reduz o lucro; entrega só pesa no cenário C', () => {
  const s = modas(B);
  const a = calcularMesCen(s, ctlB, B, 1, 0);
  const b = calcularMesCen({ ...s, tarifa_kwh: s.tarifa_kwh * 2 }, ctlB, B, 1, 0);
  assert.ok(Math.abs(a.lucro - b.lucro - a.itens.energia) < 1e-6);
  const C = dados.cenarios.find((c) => c.letra === 'C');
  const mc = calcularMesCen(modas(C), { ...ctlB, demanda: 30 }, C, 1, 0);
  assert.ok(mc.itens.entrega > 0);
  assert.equal(a.itens.entrega, 0);
});

test('simulação é reprodutível e a conta em regime bate com o resumo', () => {
  const r1 = simularCen(dados, B, ctlB, 800);
  const r2 = simularCen(dados, B, ctlB, 800);
  assert.equal(r1.vpl.p50, r2.vpl.p50);
  assert.ok(r1.vpl.p10 <= r1.vpl.p50 && r1.vpl.p50 <= r1.vpl.p90);
  assert.ok(r1.probVplNegativo >= 0 && r1.probVplNegativo <= 1);
});

test('mais vendas por dia: VPL mediano não cai', () => {
  const curva = curvaDemanda(dados, B, ctlB, [20, 60, 100, 140, 180], 300);
  for (let i = 1; i < curva.length; i++) assert.ok(curva[i].p50 >= curva[i - 1].p50 - 1e-6);
});

test('todos os cenários: dados completos e tornado em ordem', () => {
  assert.equal(dados.cenarios.length, 4);
  for (const c of dados.cenarios) {
    const mapa = mapaCenario(dados, c);
    for (const [id, p] of Object.entries(mapa)) {
      assert.ok(p.min <= p.moda && p.moda <= p.max, `${c.letra}.${id}`);
      assert.ok(['alta', 'media', 'baixa'].includes(p.confianca), `${c.letra}.${id} confiança`);
    }
    for (const id of ['preco_un', 'litros_un', 'embal_un', 'perda_validade', 'realizacao_demanda', 'taxa_pagamento', 'entrega_un', 'aluguel_mes', 'marketing_mes', 'invest_cenario', 'kwh_litro', 'refrig_kwh_dia', 'tarifa_kwh', 'agua_limpeza_l', 'manutencao_mes']) {
      assert.ok(mapa[id], `${c.letra} falta ${id}`);
    }
    assert.ok(c.riscos.length >= 3 && c.como_validar.length >= 1);
    const ctl = { ...ctlB, demanda: c.demanda.padrao };
    const t = tornadoCen(dados, c, ctl);
    for (let i = 1; i < t.itens.length; i++) assert.ok(t.itens[i - 1].amplitude >= t.itens[i].amplitude);
    const r = simularCen(dados, c, ctl, 500);
    assert.ok(Number.isFinite(r.vpl.p50));
  }
});

test('lista de pendências completa e sem dado interno', () => {
  assert.ok(dados.pendencias.length >= 12);
  for (const x of dados.pendencias) {
    for (const k of ['n', 'item', 'enviar', 'onde_entra', 'cenarios', 'prioridade']) assert.ok(x[k], `${x.n} sem ${k}`);
    assert.ok(['Alta', 'Média', 'Baixa'].includes(x.prioridade));
  }
  assert.ok(!/brasileira/i.test(JSON.stringify(dados.pendencias)));
});
