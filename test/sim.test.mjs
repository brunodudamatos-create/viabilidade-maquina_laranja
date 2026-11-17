/*
 * Testes do motor de cálculo (sim.js)
 * Autor: Bruno Duda Dantas Matos
 * Versão: v2.0 (2026-11-16)
 * Histórico:
 *   v2.0 – testes novos para funil de pontos, mix, validade, entrega, VPL,
 *          TIR, payback, exposição de caixa, tornado e curva de pontos.
 *          Os valores esperados foram conferidos por um script Python separado.
 *   v1.0 – testes iniciais (conta manual, reprodutibilidade, limites).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  simular, calcularMes, fluxoCaixa, valorPresente, tirAnual, paybackDescontado, exposicaoMaxima,
  equilibrioPontos, curvaPontos, pontosParaProb, tornado, taxaMensal, fatorVolumeMes,
  mulberry32, triangular, quantil,
} from '../sim.js';

const dados = JSON.parse(readFileSync(new URL('../data/dados.json', import.meta.url), 'utf8'));
const prem = dados.premissas_fixas;

// Dados "congelados": min = moda = max, para dar para conferir à mão (e no Python).
const CONGELADO = {
  preco_laranja_kg: 2.0, rendimento_kg_l: 2.2, perda_fruta: 0.12,
  garrafa_300: 1.6, garrafa_500: 2.0, garrafa_1000: 2.8,
  rotulo_un: 0.3, insumos_l: 0.5, custo_func_mes: 3150, treinamento_unico: 800,
  investimento_outros: 7000, fixos_mes: 300, imposto: 0.04,
  giro_garrafas_dia: 3.0, mix_300: 0.4, mix_500: 0.35, mix_1000: 0.25,
  preco_varejo_300: 7.5, preco_varejo_500: 9.0, preco_varejo_1000: 18.5,
  margem_ponto: 0.35, perda_validade: 0.10, entrega_base_mes: 1500, entrega_ponto_mes: 45,
  taxa_fechamento: 0.10,
};
function dadosFixos() {
  const d = JSON.parse(JSON.stringify(dados));
  for (const p of d.parametros) {
    assert.ok(p.id in CONGELADO, `falta valor congelado para ${p.id}`);
    p.min = p.moda = p.max = CONGELADO[p.id];
  }
  return d;
}
const CTL = { pontos: 30, funcionarios: 1, diasMes: 26, tmaAa: 0.1375, horizonte: 24, margemPonto: null };

test('conta manual do mês em regime (conferida em Python)', () => {
  const s = { ...CONGELADO };
  const r = calcularMes(s, CTL, prem, 1, 0);
  assert.ok(Math.abs(r.lucro - -4444.276) < 0.01, `lucro ${r.lucro}`);
  assert.equal(r.funcionarios, 1);
  assert.ok(Math.abs(r.litrosProdDia - 54.5) < 1e-9);
  assert.ok(Math.abs(r.litrosMes - 30 * 1.635 * 26) < 1e-6, `litros/mês ${r.litrosMes}`);
  assert.ok(Math.abs(r.receita - 16388.775) < 0.01, `receita ${r.receita}`);
});

test('mês 1: 70% do volume e 8 pontos percentuais a mais de perda de fruta', () => {
  const r = calcularMes({ ...CONGELADO }, CTL, prem, fatorVolumeMes(1, prem), prem.mes1_perda_extra);
  assert.ok(Math.abs(r.lucro - -5091.9432) < 0.01, `mês 1 ${r.lucro}`);
});

test('rampa de volume sobe do mês 1 até 100% no mês 5', () => {
  assert.equal(fatorVolumeMes(1, prem), 0.7);
  assert.ok(Math.abs(fatorVolumeMes(3, prem) - 0.85) < 1e-12);
  assert.equal(fatorVolumeMes(5, prem), 1);
  assert.equal(fatorVolumeMes(30, prem), 1);
});

test('VPL de 24 meses no cenário congelado (conferido em Python)', () => {
  const f = fluxoCaixa({ ...CONGELADO }, CTL, prem);
  assert.equal(f.flows.length, 24);
  assert.equal(f.cf0, -7800);
  const v = valorPresente(f.cf0, f.flows, taxaMensal(CTL.tmaAa));
  assert.ok(Math.abs(v - -102187.0142) < 0.01, `vpl ${v}`);
  assert.equal(paybackDescontado(f.cf0, f.flows, taxaMensal(CTL.tmaAa)), null);
});

test('simular com dados congelados reproduz o VPL manual e dá prejuízo certo', () => {
  const r = simular(dadosFixos(), CTL, 40);
  assert.ok(Math.abs(r.vpl.p50 - -102187.0142) < 0.01, `vpl ${r.vpl.p50}`);
  assert.equal(r.probVplNegativo, 1);
  assert.equal(r.equilibrioPontos.p50, Infinity);
  assert.equal(r.probRecupera, 0);
});

test('venda direta (margem do ponto 0%): VPL, payback, equilíbrio e exposição (Python)', () => {
  const ctl = { ...CTL, margemPonto: 0 };
  const r = simular(dadosFixos(), ctl, 40);
  assert.ok(Math.abs(r.vpl.p50 - 69872.555) < 0.01, `vpl ${r.vpl.p50}`);
  assert.equal(r.payback.p50, 4);
  assert.ok(Math.abs(r.equilibrioPontos.p50 - 16.5414) < 0.001, `eq ${r.equilibrioPontos.p50}`);
  assert.ok(Math.abs(r.exposicao.p50 - 7800) < 1e-9);
  assert.ok(Math.abs(r.lucroRegime.p50 - 4027.46) < 0.01);
  assert.equal(r.probVplNegativo, 0);
  assert.ok(r.tir && r.tir.p50 > 1, 'TIR anual alta quando o investimento é baixo');
});

test('equilibrioPontos: com margem 0 e 16,54 pontos o lucro em regime é zero', () => {
  const s = { ...CONGELADO, margem_ponto: 0 };
  const p = equilibrioPontos(s, CTL, prem);
  const r = calcularMes(s, { ...CTL, pontos: p }, prem, 1, 0);
  assert.ok(Math.abs(r.lucro) < 1e-6, `lucro ${r.lucro}`);
});

test('equipe sobe sozinha: 150 pontos exigem mais de 1 funcionário', () => {
  const r = calcularMes({ ...CONGELADO }, { ...CTL, pontos: 150 }, prem, 1, 0);
  assert.equal(r.funcionarios, Math.ceil((150 * 1.8166667) / 60 - 1e-9));
  assert.ok(r.funcionarios >= 5);
});

test('VPL de fluxo simples: -100 agora e +110 em 1 mês a 10% ao mês dá zero', () => {
  assert.ok(Math.abs(valorPresente(-100, [110], 0.1)) < 1e-12);
});

test('TIR: -100 e +110 em 1 mês => 10% ao mês = 213,8% ao ano', () => {
  const t = tirAnual(-100, [110]);
  assert.ok(Math.abs(t - (Math.pow(1.1, 12) - 1)) < 1e-6, `tir ${t}`);
});

test('TIR indefinida quando só há saídas', () => {
  assert.equal(tirAnual(-100, [-10, -10]), null);
});

test('payback descontado e exposição máxima de caixa', () => {
  // -1000 e 400 por mês, taxa 0 => payback no mês 3; exposição = 1000
  assert.equal(paybackDescontado(-1000, [400, 400, 400, 400], 0), 3);
  assert.equal(exposicaoMaxima(-1000, [400, 400, 400, 400]), 1000);
  // fluxo que primeiro piora: -1000, -300, +200...
  assert.equal(exposicaoMaxima(-1000, [-300, 200, 200]), 1300);
  // com desconto, o payback demora mais ou não ocorre
  assert.equal(paybackDescontado(-1000, [400, 400, 400], 0.5), null);
});

test('mesma semente = mesmo resultado; semente diferente muda a amostra', () => {
  const a = simular(dados, CTL, 800, 1);
  const b = simular(dados, CTL, 800, 1);
  const c = simular(dados, CTL, 800, 2);
  assert.equal(a.vpl.p50, b.vpl.p50);
  assert.notEqual(a.vpl.p50, c.vpl.p50);
});

test('quantis em ordem e probabilidades entre 0 e 1', () => {
  const r = simular(dados, CTL, 1500);
  assert.ok(r.vpl.p10 <= r.vpl.p50 && r.vpl.p50 <= r.vpl.p90);
  assert.ok(r.exposicao.p10 <= r.exposicao.p50 && r.exposicao.p50 <= r.exposicao.p90);
  for (const x of [r.probVplNegativo, r.probRecupera, r.tirDefinida, r.probPrejuizoMes1]) assert.ok(x >= 0 && x <= 1);
});

test('mix: participações somam 100% e as chances de "vende mais" somam 100%', () => {
  const r = simular(dados, CTL, 2000);
  const somaUn = r.mix.reduce((a, m) => a + m.probMaisUnidades, 0);
  const somaRec = r.mix.reduce((a, m) => a + m.probMaisReceita, 0);
  assert.ok(Math.abs(somaUn - 1) < 1e-9 && Math.abs(somaRec - 1) < 1e-9);
  const somaShare = r.mix.reduce((a, m) => a + m.share.p50, 0);
  assert.ok(somaShare > 0.9 && somaShare < 1.1, `soma das medianas ${somaShare}`);
});

test('mais pontos de venda melhora a mediana do VPL (com margem positiva por ponto)', () => {
  const ctl = { ...CTL, margemPonto: 0.1 };
  const curva = curvaPontos(dados, ctl, [10, 40, 80, 120], 400);
  for (let i = 1; i < curva.length; i++) assert.ok(curva[i].p50 > curva[i - 1].p50, `i=${i}`);
});

test('pontosParaProb devolve o primeiro ponto que atinge o alvo, ou null', () => {
  const curva = [
    { x: 10, probNegativo: 0.9 }, { x: 20, probNegativo: 0.4 }, { x: 30, probNegativo: 0.1 },
  ];
  assert.equal(pontosParaProb(curva, 0.5), 20);
  assert.equal(pontosParaProb(curva, 0.8), 30);
  assert.equal(pontosParaProb(curva, 0.95), null);
});

test('tornado: ordenado por amplitude, sem a taxa de fechamento, e confere um item (Python)', () => {
  const t = tornado(dadosFixosComFaixa(), { ...CTL, margemPonto: 0 });
  assert.ok(t.itens.length > 5);
  for (let i = 1; i < t.itens.length; i++) assert.ok(t.itens[i - 1].amplitude >= t.itens[i].amplitude);
  assert.ok(!t.itens.some((x) => x.id === 'taxa_fechamento'), 'taxa_fechamento não afeta o VPL');
  assert.ok(Math.abs(t.vplBase - 69872.555) < 0.01, `base ${t.vplBase}`);
  // quanto maior o giro, maior o VPL
  const giro = t.itens.find((x) => x.id === 'giro_garrafas_dia');
  assert.ok(giro.vplNoMax > giro.vplNoMin);
});

// dados congelados, mas com faixa em alguns itens, para o tornado ter o que ordenar
function dadosFixosComFaixa() {
  const d = dadosFixos();
  const faixas = { giro_garrafas_dia: [1.5, 3, 4.5], preco_laranja_kg: [1.5, 2, 2.8], perda_validade: [0.05, 0.1, 0.3], custo_func_mes: [2900, 3150, 3400], preco_varejo_500: [8, 9, 10.5], investimento_outros: [3000, 7000, 15000] };
  for (const p of d.parametros) if (faixas[p.id]) [p.min, p.moda, p.max] = faixas[p.id];
  return d;
}

test('margem do ponto fixa nos controles substitui o sorteio', () => {
  const a = simular(dados, { ...CTL, margemPonto: 0 }, 600, 5);
  const b = simular(dados, { ...CTL, margemPonto: 0.45 }, 600, 5);
  assert.ok(a.vpl.p50 > b.vpl.p50);
});

test('triangular respeita os limites', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 5000; i++) {
    const x = triangular(rng, 1, 2, 4);
    assert.ok(x >= 1 && x <= 4);
  }
});

test('quantil com Infinity no vetor não gera NaN', () => {
  assert.equal(quantil([1, 2, Infinity], 0.5), 2);
  assert.equal(quantil([1, Infinity, Infinity], 0.5), Infinity);
});

test('dados.json: todo parâmetro tem min ≤ moda ≤ max, fonte, confiança válida e nome curto', () => {
  const ids = new Set();
  for (const p of dados.parametros) {
    assert.ok(p.min <= p.moda && p.moda <= p.max, p.id);
    assert.ok(p.fonte && p.fonte.length > 3, p.id);
    assert.ok(['alta', 'media', 'baixa'].includes(p.confianca), p.id);
    assert.ok(p.curto && p.curto.length > 2, p.id);
    assert.ok(!ids.has(p.id), `id repetido ${p.id}`);
    ids.add(p.id);
  }
  for (const id of Object.keys(CONGELADO)) assert.ok(ids.has(id), `falta ${id} no dados.json`);
  assert.equal(ids.size, Object.keys(CONGELADO).length);
  assert.ok(dados.financeiro.tma_base_aa > 0 && dados.financeiro.horizonte_meses >= 12);
});
