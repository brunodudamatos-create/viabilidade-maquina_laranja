/*
 * Simulador de viabilidade – suco de laranja natural (Cuiabá)
 * Arquivo: sim.js (motor de cálculo, sem dependências)
 * Autor: Bruno Duda Dantas Matos
 *
 * Versão: v1.0  (2026-11-16)
 * Histórico de mudanças:
 *   v1.0 – primeira versão: Monte Carlo (distribuição triangular), custo por
 *          litro, lucro mensal, ponto de equilíbrio, probabilidade de prejuízo,
 *          mês 1 (treinamento e curva de aprendizado).
 */

/** Gerador pseudoaleatório com semente (resultado reproduzível). */
export function mulberry32(semente) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sorteio triangular entre min e max, com valor mais provável (moda). */
export function triangular(rng, min, moda, max) {
  if (max === min) return min;
  const u = rng();
  const c = (moda - min) / (max - min);
  if (u < c) return min + Math.sqrt(u * (max - min) * (moda - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - moda));
}

/** Quantil de um vetor já ordenado (interpolação linear). */
export function quantil(ordenado, q) {
  if (!ordenado.length) return NaN;
  const pos = (ordenado.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const a = ordenado[base];
  const b = ordenado[Math.min(base + 1, ordenado.length - 1)];
  if (a === Infinity || b === Infinity) return resto === 0 ? a : Infinity;
  return a + (b - a) * resto;
}

/** Converte a lista de parâmetros do JSON em um mapa id -> {min, moda, max}. */
export function mapaParametros(dados) {
  const mapa = {};
  for (const p of dados.parametros) mapa[p.id] = { min: p.min, moda: p.moda, max: p.max };
  return mapa;
}

/** Sorteia um conjunto completo de valores (ordem fixa para reproduzir). */
export function sortear(params, controles, premissas, rng) {
  const s = {};
  for (const id of Object.keys(params)) {
    const p = params[id];
    s[id] = triangular(rng, p.min, p.moda, p.max);
  }
  const v = premissas.variacao_preco_venda;
  s.preco_venda = triangular(
    rng,
    controles.precoVenda * (1 - v),
    controles.precoVenda,
    controles.precoVenda * (1 + v)
  );
  return s;
}

/**
 * Calcula um cenário a partir de um sorteio.
 * mes1 = true aplica treinamento inteiro, perdas extras e volume menor.
 */
export function calcular(s, controles, premissas, mes1 = false) {
  const perda = Math.min(0.5, s.perda_fruta + (mes1 ? premissas.mes1_perda_extra : 0));
  const kgPorLitro = s.rendimento_kg_l / (1 - perda);
  const custoFrutaL = s.preco_laranja_kg * kgPorLitro;
  const custoVariavelL = custoFrutaL + s.garrafa_un + s.rotulo_un + s.insumos_l;

  const volumeDia = controles.volumeDia * s.fator_demanda * (mes1 ? premissas.mes1_fator_volume : 1);
  const litrosMes = volumeDia * controles.diasMes;

  const treinamento = mes1 ? s.treinamento_unico : s.treinamento_unico / 12;
  const custoFixoMes = controles.funcionarios * s.custo_func_mes + treinamento + s.fixos_mes;

  const receita = litrosMes * s.preco_venda;
  const imposto = receita * s.imposto;
  const lucro = receita - imposto - litrosMes * custoVariavelL - custoFixoMes;

  const custoTotalL = litrosMes > 0 ? custoVariavelL + custoFixoMes / litrosMes : Infinity;
  const margemContribL = s.preco_venda * (1 - s.imposto) - custoVariavelL;
  const equilibrioDia =
    margemContribL > 0 ? custoFixoMes / (margemContribL * controles.diasMes) : Infinity;

  return { lucro, custoTotalL, custoVariavelL, equilibrioDia, litrosMes, receita, custoFixoMes };
}

function resumir(valores) {
  const o = valores.slice().sort((a, b) => a - b);
  return { p10: quantil(o, 0.1), p50: quantil(o, 0.5), p90: quantil(o, 0.9) };
}

/** Roda n simulações e devolve o resumo. */
export function simular(dados, controles, n = 5000, semente = 20261116) {
  const params = mapaParametros(dados);
  const premissas = dados.premissas_fixas;
  const rng = mulberry32(semente);

  const lucros = [];
  const custos = [];
  const equilibrios = [];
  const lucrosMes1 = [];
  let prejuizos = 0;
  let prejuizosMes1 = 0;

  for (let i = 0; i < n; i++) {
    const s = sortear(params, controles, premissas, rng);
    const r = calcular(s, controles, premissas, false);
    const r1 = calcular(s, controles, premissas, true);
    lucros.push(r.lucro);
    custos.push(r.custoTotalL);
    equilibrios.push(r.equilibrioDia);
    lucrosMes1.push(r1.lucro);
    if (r.lucro < 0) prejuizos++;
    if (r1.lucro < 0) prejuizosMes1++;
  }

  return {
    n,
    lucro: resumir(lucros),
    custoL: resumir(custos),
    equilibrio: resumir(equilibrios),
    lucroMes1: resumir(lucrosMes1),
    probPrejuizo: prejuizos / n,
    probPrejuizoMes1: prejuizosMes1 / n,
    amostrasLucro: lucros,
    capacidadeDia: controles.funcionarios * premissas.capacidade_func_dia_litros,
    acimaCapacidade: controles.volumeDia > controles.funcionarios * premissas.capacidade_func_dia_litros,
  };
}

/** Curva lucro × volume diário (mediana e faixa P10–P90). */
export function curvaVolume(dados, controles, volumes, n = 1500, semente = 20261116) {
  return volumes.map((v) => {
    const r = simular(dados, { ...controles, volumeDia: v }, n, semente);
    return { volume: v, p10: r.lucro.p10, p50: r.lucro.p50, p90: r.lucro.p90, probPrejuizo: r.probPrejuizo };
  });
}

/** Histograma do lucro (faixa entre P1 e P99). */
export function histograma(amostras, nBins = 24) {
  const o = amostras.slice().sort((a, b) => a - b);
  const lo = quantil(o, 0.01);
  const hi = quantil(o, 0.99);
  const largura = (hi - lo) / nBins || 1;
  const bins = Array.from({ length: nBins }, (_, i) => ({
    de: lo + i * largura,
    ate: lo + (i + 1) * largura,
    n: 0,
  }));
  for (const x of o) {
    if (x < lo || x > hi) continue;
    const i = Math.min(nBins - 1, Math.floor((x - lo) / largura));
    bins[i].n++;
  }
  return bins;
}
