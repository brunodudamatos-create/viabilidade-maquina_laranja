/*
 * Simulador de viabilidade – suco de laranja natural (Cuiabá)
 * Arquivo: cenarios.js (motor dos cenários de venda direta B, C, D e E)
 * Autor: Bruno Duda Dantas Matos
 *
 * Versão: v3.0  (2026-11-20)
 * Histórico de mudanças:
 *   v3.0 – arquivo novo. Quatro modelos de negócio sem intermediário:
 *          B copo no CEASA, C entrega própria, D garrafa no balcão e
 *          E carrinho em ponto de fluxo. A demanda passa a ser o número de
 *          vendas por dia (copos ou pedidos). Custo explícito de energia
 *          elétrica (kWh por litro, refrigeração e tarifa), manutenção da
 *          máquina, água e limpeza, aluguel, marketing, taxa de pagamento e
 *          entrega. Filtros: equipe mínima, pessoas sem salário (família),
 *          dias de operação, retorno exigido (TMA) e horizonte.
 *          O motor do Cenário A (sim.js) não foi alterado.
 */
import {
  mulberry32, triangular, quantil, taxaMensal, fatorVolumeMes,
  valorPresente, tirAnual, paybackDescontado, exposicaoMaxima,
} from './sim.js';

/** Entradas que os cenários herdam da lista principal (mesmos valores do Cenário A). */
export const GLOBAIS = [
  'preco_laranja_kg', 'rendimento_kg_l', 'perda_fruta', 'custo_func_mes',
  'fixos_mes', 'imposto', 'treinamento_unico',
];

/** Mapa id -> {min, moda, max, nome, ...} com todas as entradas de um cenário. */
export function mapaCenario(dados, cen) {
  const mapa = {};
  for (const id of GLOBAIS) {
    const p = dados.parametros.find((x) => x.id === id);
    mapa[id] = { ...p, origem: 'geral' };
  }
  for (const p of dados.cenarios_comuns.params) mapa[p.id] = { ...p, origem: 'comum' };
  for (const p of cen.params) mapa[p.id] = { ...p, origem: 'cenario' };
  return mapa;
}

function sortearCen(mapa, rng) {
  const s = {};
  for (const id of Object.keys(mapa)) s[id] = triangular(rng, mapa[id].min, mapa[id].moda, mapa[id].max);
  return s;
}

/**
 * Resultado de um mês. fatorVol = fração do volume em regime.
 * ctl: { demanda (vendas por dia planejadas), funcionarios (mínimo),
 *        familia (pessoas sem salário), diasMes, tmaAa, horizonte }
 */
export function calcularMesCen(s, ctl, cen, fatorVol = 1, perdaExtra = 0) {
  const prem = cen.premissas;
  const D = ctl.demanda * s.realizacao_demanda * fatorVol; // vendas por dia que de fato aparecem
  const dias = ctl.diasMes;
  const perdaFruta = Math.min(0.5, s.perda_fruta + perdaExtra);
  const custoFrutaL = (s.preco_laranja_kg * s.rendimento_kg_l) / (1 - perdaFruta);
  const fatorProd = 1 / (1 - s.perda_validade);
  const litrosVendDia = D * s.litros_un;
  const litrosProdDia = litrosVendDia * fatorProd;
  const unidadesProdDia = D * fatorProd;

  const receita = D * s.preco_un * dias;
  const fruta = litrosProdDia * custoFrutaL * dias;
  const embalagem = unidadesProdDia * s.embal_un * dias;
  const aguaLimpeza = litrosProdDia * s.agua_limpeza_l * dias;
  const kwhDia = D > 0 ? litrosProdDia * s.kwh_litro + s.refrig_kwh_dia : 0;
  const energia = kwhDia * s.tarifa_kwh * dias;
  const entrega = D * s.entrega_un * dias;
  const impostosTaxas = receita * (s.imposto + s.taxa_pagamento);

  const pessoas = Math.max(
    ctl.funcionarios,
    Math.ceil(litrosProdDia / prem.capacidade_func_dia_litros - 1e-9),
    Math.ceil(D / prem.capacidade_func_dia_vendas - 1e-9),
  );
  const pagos = Math.max(0, pessoas - ctl.familia);
  const equipe = pagos * s.custo_func_mes;
  const aluguel = s.aluguel_mes;
  const marketing = s.marketing_mes;
  const manutencao = s.manutencao_mes;
  const fixosGerais = s.fixos_mes;
  const custoTotal = fruta + embalagem + aguaLimpeza + energia + entrega + impostosTaxas + equipe + aluguel + marketing + manutencao + fixosGerais;
  const lucro = receita - custoTotal;
  const vendasMes = D * dias;
  return {
    lucro, receita, custoTotal, pessoas, pagos, D, vendasMes, litrosProdDia, litrosVendDia, kwhDia,
    itens: { fruta, embalagem, aguaLimpeza, energia, entrega, impostosTaxas, equipe, aluguel, marketing, manutencao, fixosGerais },
  };
}

/** Fluxo de caixa: investimento no mês 0, lucro nos meses 1..H (rampa igual à do Cenário A). */
export function fluxoCen(s, ctl, cen, premGeral) {
  const flows = [];
  let mes1 = null;
  for (let t = 1; t <= ctl.horizonte; t++) {
    const r = calcularMesCen(s, ctl, cen, fatorVolumeMes(t, premGeral), t === 1 ? premGeral.mes1_perda_extra : 0);
    if (t === 1) mes1 = r;
    flows.push(r.lucro);
  }
  return { cf0: -(s.treinamento_unico + s.invest_cenario), flows, mes1 };
}

/**
 * Vendas por dia (que de fato aparecem) para o lucro mensal em regime ser ≥ 0.
 * O lucro é linear na demanda para uma equipe fixa; testa equipes de 1 a 12.
 */
export function equilibrioVendas(s, ctl, cen) {
  const prem = cen.premissas;
  const dias = ctl.diasMes;
  const perdaFruta = Math.min(0.5, s.perda_fruta);
  const custoFrutaL = (s.preco_laranja_kg * s.rendimento_kg_l) / (1 - perdaFruta);
  const fatorProd = 1 / (1 - s.perda_validade);
  const litrosProd = s.litros_un * fatorProd;
  const varUn = litrosProd * (custoFrutaL + s.agua_limpeza_l + s.kwh_litro * s.tarifa_kwh) + (s.embal_un * fatorProd) + s.entrega_un;
  const m = s.preco_un * (1 - s.imposto - s.taxa_pagamento) - varUn; // margem de contribuição por venda
  if (!(m > 0)) return Infinity;
  const fixoBase = s.fixos_mes + s.aluguel_mes + s.marketing_mes + s.manutencao_mes + s.refrig_kwh_dia * s.tarifa_kwh * dias;
  for (let k = Math.max(1, ctl.funcionarios); k <= 12; k++) {
    const F = fixoBase + Math.max(0, k - ctl.familia) * s.custo_func_mes;
    const d = F / (dias * m);
    if (d <= k * prem.capacidade_func_dia_vendas + 1e-9 && d * litrosProd <= k * prem.capacidade_func_dia_litros + 1e-9) return d;
  }
  return Infinity;
}

function resumir(valores) {
  const o = valores.slice().sort((a, b) => a - b);
  return { p10: quantil(o, 0.1), p50: quantil(o, 0.5), p90: quantil(o, 0.9) };
}

const CHAVES_ITENS = ['fruta', 'embalagem', 'aguaLimpeza', 'energia', 'entrega', 'impostosTaxas', 'equipe', 'aluguel', 'marketing', 'manutencao', 'fixosGerais'];

/** Roda n simulações (Hertz, 1964) para um cenário. */
export function simularCen(dados, cen, ctl, n = 3000, semente = 20261120) {
  const mapa = mapaCenario(dados, cen);
  const prem = dados.premissas_fixas;
  const rM = taxaMensal(ctl.tmaAa);
  const tmas = dados.financeiro.tmas_comparacao_aa;
  const rMs = tmas.map(taxaMensal);
  const rng = mulberry32(semente);

  const vpls = [], lucrosReg = [], lucrosMes1 = [], exposicoes = [], invest = [], eq = [], pessoas = [], litros = [], energiaMes = [];
  const tirs = [], paybacks = [], custoUn = [], margemUn = [];
  const itens = Object.fromEntries(CHAVES_ITENS.map((k) => [k, []]));
  const vplTma = tmas.map(() => []);
  let neg = 0, prejMes1 = 0, semTir = 0;

  for (let i = 0; i < n; i++) {
    const s = sortearCen(mapa, rng);
    const f = fluxoCen(s, ctl, cen, prem);
    const vpl = valorPresente(f.cf0, f.flows, rM);
    vpls.push(vpl);
    if (vpl < 0) neg++;
    tmas.forEach((_, j) => vplTma[j].push(valorPresente(f.cf0, f.flows, rMs[j])));
    const tir = tirAnual(f.cf0, f.flows);
    if (tir === null) semTir++; else tirs.push(tir);
    const pb = paybackDescontado(f.cf0, f.flows, rM);
    if (pb !== null) paybacks.push(pb);
    exposicoes.push(exposicaoMaxima(f.cf0, f.flows));
    invest.push(-f.cf0);
    lucrosMes1.push(f.mes1.lucro);
    if (f.mes1.lucro < 0) prejMes1++;

    const reg = calcularMesCen(s, ctl, cen, 1, 0);
    lucrosReg.push(reg.lucro);
    pessoas.push(reg.pessoas);
    litros.push(reg.litrosProdDia);
    energiaMes.push(reg.itens.energia);
    if (reg.vendasMes > 0) {
      custoUn.push(reg.custoTotal / reg.vendasMes);
      margemUn.push(reg.lucro / reg.vendasMes);
      for (const k of CHAVES_ITENS) itens[k].push(reg.itens[k] / reg.vendasMes);
    }
    eq.push(equilibrioVendas(s, ctl, cen));
  }

  const precoUn = mapa.preco_un.moda;
  return {
    n,
    vpl: resumir(vpls),
    probVplNegativo: neg / n,
    tir: tirs.length ? resumir(tirs) : null,
    tirDefinida: 1 - semTir / n,
    payback: paybacks.length ? resumir(paybacks) : null,
    probRecupera: paybacks.length / n,
    exposicao: resumir(exposicoes),
    investimento: resumir(invest),
    lucroRegime: resumir(lucrosReg),
    lucroMes1: resumir(lucrosMes1),
    probPrejuizoMes1: prejMes1 / n,
    equilibrioVendasDia: resumir(eq),
    pessoas: resumir(pessoas),
    litrosDia: resumir(litros),
    energiaMes: resumir(energiaMes),
    custoPorVenda: resumir(custoUn),
    lucroPorVenda: resumir(margemUn),
    precoPorVendaModa: precoUn,
    itensPorVenda: Object.fromEntries(CHAVES_ITENS.map((k) => [k, itens[k].length ? resumir(itens[k]).p50 : 0])),
    vplPorTma: tmas.map((aa, j) => ({
      tmaAa: aa,
      p50: quantil(vplTma[j].slice().sort((a, b) => a - b), 0.5),
      probNegativo: vplTma[j].filter((x) => x < 0).length / n,
    })),
    amostrasVpl: vpls,
    horizonte: ctl.horizonte,
  };
}

/** Curva VPL × vendas por dia planejadas (mesma semente em todos os pontos). */
export function curvaDemanda(dados, cen, ctl, lista, n = 400, semente = 20261120) {
  const mapa = mapaCenario(dados, cen);
  const prem = dados.premissas_fixas;
  const rM = taxaMensal(ctl.tmaAa);
  return lista.map((demanda) => {
    const rng = mulberry32(semente);
    const c = { ...ctl, demanda };
    const vpls = [];
    let neg = 0;
    for (let i = 0; i < n; i++) {
      const s = sortearCen(mapa, rng);
      const f = fluxoCen(s, c, cen, prem);
      const v = valorPresente(f.cf0, f.flows, rM);
      vpls.push(v);
      if (v < 0) neg++;
    }
    const r = resumir(vpls);
    return { x: demanda, p10: r.p10, p50: r.p50, p90: r.p90, probNegativo: neg / n };
  });
}

/** Menor demanda em que a chance de VPL positivo chega ao alvo (null se não chega). */
export function demandaParaProb(curva, alvo) {
  for (const p of curva) if (1 - p.probNegativo >= alvo) return p.x;
  return null;
}

/** Tornado: VPL no mínimo e no máximo de cada entrada, as demais no valor mais provável. */
export function tornadoCen(dados, cen, ctl) {
  const mapa = mapaCenario(dados, cen);
  const prem = dados.premissas_fixas;
  const rM = taxaMensal(ctl.tmaAa);
  const base = {};
  for (const id of Object.keys(mapa)) base[id] = mapa[id].moda;
  const vplDe = (s) => {
    const f = fluxoCen(s, ctl, cen, prem);
    return valorPresente(f.cf0, f.flows, rM);
  };
  const vplBase = vplDe(base);
  const itens = [];
  for (const id of Object.keys(mapa)) {
    const p = mapa[id];
    const a = vplDe({ ...base, [id]: p.min });
    const b = vplDe({ ...base, [id]: p.max });
    const amp = Math.abs(b - a);
    if (amp < 1e-9) continue;
    itens.push({ id, nome: p.curto || p.nome, min: p.min, max: p.max, vplNoMin: a, vplNoMax: b, amplitude: amp });
  }
  itens.sort((x, y) => y.amplitude - x.amplitude);
  return { vplBase, itens };
}
