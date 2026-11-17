/*
 * Simulador de viabilidade – suco de laranja natural (Cuiabá)
 * Arquivo: sim.js (motor de cálculo, sem dependências)
 * Autor: Bruno Duda Dantas Matos
 *
 * Versão: v2.0  (2026-11-16)
 * Histórico de mudanças:
 *   v2.0 – estrutura nova: demanda por funil (pontos de venda × giro × mix de
 *          300 ml, 500 ml e 1 L), perda por validade, entrega refrigerada,
 *          fluxo de caixa mês a mês, VPL, TIR, payback descontado, exposição
 *          máxima de caixa (método de risco de Hertz, 1964, com Monte Carlo),
 *          diagrama tornado (sensibilidade), pontos mínimos de equilíbrio e
 *          contatos de prospecção necessários. Removido o fator de demanda
 *          (o giro por ponto passou a representar essa incerteza) e o preço
 *          único por litro (agora há preço por tamanho e margem do ponto).
 *   v1.0 – primeira versão: Monte Carlo (distribuição triangular), custo por
 *          litro, lucro mensal, ponto de equilíbrio, probabilidade de prejuízo,
 *          mês 1 (treinamento e curva de aprendizado).
 */

export const TAMANHOS = [300, 500, 1000];
const IDS_MIX = ['mix_300', 'mix_500', 'mix_1000'];
const IDS_GARRAFA = ['garrafa_300', 'garrafa_500', 'garrafa_1000'];
const IDS_PRECO = ['preco_varejo_300', 'preco_varejo_500', 'preco_varejo_1000'];

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
export function sortear(params, rng, ctl = null) {
  const s = {};
  for (const id of Object.keys(params)) {
    const p = params[id];
    s[id] = triangular(rng, p.min, p.moda, p.max);
  }
  // Margem do ponto fixa (ex.: 0% para venda direta ao consumidor), se o controle pedir.
  if (ctl && ctl.margemPonto !== null && ctl.margemPonto !== undefined) s.margem_ponto = ctl.margemPonto;
  return s;
}

/** Taxa mensal equivalente a uma taxa anual. */
export function taxaMensal(aa) {
  return Math.pow(1 + aa, 1 / 12) - 1;
}

/** Fração do volume em regime no mês t (sobe do mês 1 até 100% na rampa). */
export function fatorVolumeMes(t, prem) {
  return Math.min(1, prem.mes1_fator_volume + ((1 - prem.mes1_fator_volume) * (t - 1)) / prem.rampa_meses);
}

/**
 * Economia de UM ponto de venda por mês (em regime ou com perda extra de fruta).
 * Tudo aqui é proporcional ao número de pontos.
 */
export function porPonto(s, prem, diasMes, perdaExtra = 0) {
  const soma = s.mix_300 + s.mix_500 + s.mix_1000;
  const w = IDS_MIX.map((id) => s[id] / soma);
  const perdaFruta = Math.min(0.5, s.perda_fruta + perdaExtra);
  const kgPorLitro = s.rendimento_kg_l / (1 - perdaFruta);
  const custoLiquidoL = s.preco_laranja_kg * kgPorLitro + s.insumos_l;
  const fatorProd = 1 / (1 - s.perda_validade);

  const garrDia = w.map((x) => s.giro_garrafas_dia * x);
  let litrosVendDia = 0;
  let recDia = 0;
  let embalagemDia = 0;
  const recDiaTam = [];
  garrDia.forEach((g, i) => {
    litrosVendDia += (g * TAMANHOS[i]) / 1000;
    const r = g * s[IDS_PRECO[i]] * (1 - s.margem_ponto);
    recDiaTam.push(r);
    recDia += r;
    embalagemDia += g * fatorProd * (s[IDS_GARRAFA[i]] + s.rotulo_un);
  });
  const litrosProdDia = litrosVendDia * fatorProd;
  return {
    w,
    garrDia,
    recDiaTam,
    litrosVendDia,
    litrosProdDia,
    recBrutaMes: recDia * diasMes,
    recLiqMes: recDia * diasMes * (1 - s.imposto),
    varMes: (litrosProdDia * custoLiquidoL + embalagemDia) * diasMes,
    entregaPonto: s.entrega_ponto_mes,
  };
}

/**
 * Resultado de um mês. fatorVol = fração do volume em regime (1 = regime).
 * A equipe contratada sobe sozinha quando a produção passa da capacidade.
 */
export function calcularMes(s, ctl, prem, fatorVol = 1, perdaExtra = 0) {
  const pp = porPonto(s, prem, ctl.diasMes, perdaExtra);
  const P = ctl.pontos * fatorVol;
  const litrosProdDia = P * pp.litrosProdDia;
  const funcionarios = Math.max(ctl.funcionarios, Math.ceil(litrosProdDia / prem.capacidade_func_dia_litros - 1e-9));
  const fixo = funcionarios * s.custo_func_mes + s.fixos_mes + s.entrega_base_mes;
  const receita = P * pp.recBrutaMes;
  const lucro = P * (pp.recLiqMes - pp.varMes - pp.entregaPonto) - fixo;
  const litrosMes = P * pp.litrosVendDia * ctl.diasMes;
  return {
    lucro,
    receita,
    funcionarios,
    litrosProdDia,
    litrosMes,
    custoTotalL: litrosMes > 0 ? (receita - lucro) / litrosMes : Infinity,
    garrDia: pp.garrDia.map((g) => g * P),
    recDiaTam: pp.recDiaTam.map((r) => r * P),
    w: pp.w,
    garrafasDia: pp.garrDia.reduce((a, b) => a + b, 0) * P,
  };
}

/** Fluxo de caixa: investimento no mês 0 e lucro operacional nos meses 1..H. */
export function fluxoCaixa(s, ctl, prem) {
  const H = ctl.horizonte;
  const flows = [];
  let mes1 = null;
  for (let t = 1; t <= H; t++) {
    const r = calcularMes(s, ctl, prem, fatorVolumeMes(t, prem), t === 1 ? prem.mes1_perda_extra : 0);
    if (t === 1) mes1 = r;
    flows.push(r.lucro);
  }
  return { cf0: -(s.treinamento_unico + s.investimento_outros), flows, mes1 };
}

/** Valor presente líquido (taxa mensal rM). */
export function valorPresente(cf0, flows, rM) {
  let v = cf0;
  for (let t = 1; t <= flows.length; t++) v += flows[t - 1] / Math.pow(1 + rM, t);
  return v;
}

/** TIR anual (bisseção). Devolve null se não existir no intervalo. */
export function tirAnual(cf0, flows) {
  const f = (r) => valorPresente(cf0, flows, r);
  let lo = -0.5;
  let hi = 20;
  if (!(f(lo) > 0) || !(f(hi) < 0)) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}

/** Mês em que o valor presente acumulado fica ≥ 0 (null se não recupera). */
export function paybackDescontado(cf0, flows, rM) {
  let acc = cf0;
  for (let t = 1; t <= flows.length; t++) {
    acc += flows[t - 1] / Math.pow(1 + rM, t);
    if (acc >= 0) return t;
  }
  return null;
}

/** Maior valor de caixa que precisa estar disponível (soma acumulada mais negativa). */
export function exposicaoMaxima(cf0, flows) {
  let acc = cf0;
  let min = acc;
  for (const x of flows) {
    acc += x;
    if (acc < min) min = acc;
  }
  return -Math.min(0, min);
}

/**
 * Menos pontos de venda para o lucro mensal em regime ser ≥ 0.
 * Como tudo é proporcional ao número de pontos, a conta é exata (sem busca).
 */
export function equilibrioPontos(s, ctl, prem) {
  const pp = porPonto(s, prem, ctl.diasMes, 0);
  const a = pp.recLiqMes - pp.varMes - pp.entregaPonto;
  if (!(a > 0)) return Infinity;
  for (let k = Math.max(1, ctl.funcionarios); k <= 12; k++) {
    const F = k * s.custo_func_mes + s.fixos_mes + s.entrega_base_mes;
    const p = F / a;
    if (p * pp.litrosProdDia <= k * prem.capacidade_func_dia_litros + 1e-9) return p;
  }
  return Infinity;
}

function resumir(valores) {
  const o = valores.slice().sort((a, b) => a - b);
  return { p10: quantil(o, 0.1), p50: quantil(o, 0.5), p90: quantil(o, 0.9) };
}

function indiceMax(v) {
  let m = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[m]) m = i;
  return m;
}

/** Roda n simulações (Hertz, 1964) e devolve o resumo. */
export function simular(dados, ctl, n = 5000, semente = 20261116) {
  const params = mapaParametros(dados);
  const prem = dados.premissas_fixas;
  const fin = dados.financeiro;
  const rM = taxaMensal(ctl.tmaAa);
  const tmas = fin.tmas_comparacao_aa;
  const rMs = tmas.map(taxaMensal);
  const rng = mulberry32(semente);

  const vpls = [], lucrosReg = [], custosL = [], lucrosMes1 = [], exposicoes = [], investimentos = [];
  const eqPontos = [], eqGarrafas = [], contatos = [], tirs = [], paybacks = [], funcs = [], litrosDia = [];
  const garrTam = [[], [], []], shareTam = [[], [], []];
  const vplTma = tmas.map(() => []);
  const topUn = [0, 0, 0], topRec = [0, 0, 0];
  let vplNeg = 0, prejMes1 = 0, semTir = 0;

  for (let i = 0; i < n; i++) {
    const s = sortear(params, rng, ctl);
    const f = fluxoCaixa(s, ctl, prem);
    const vpl = valorPresente(f.cf0, f.flows, rM);
    vpls.push(vpl);
    if (vpl < 0) vplNeg++;
    tmas.forEach((_, j) => vplTma[j].push(valorPresente(f.cf0, f.flows, rMs[j])));

    const tir = tirAnual(f.cf0, f.flows);
    if (tir === null) semTir++; else tirs.push(tir);
    const pb = paybackDescontado(f.cf0, f.flows, rM);
    if (pb !== null) paybacks.push(pb);
    exposicoes.push(exposicaoMaxima(f.cf0, f.flows));
    investimentos.push(-f.cf0);
    lucrosMes1.push(f.mes1.lucro);
    if (f.mes1.lucro < 0) prejMes1++;

    const reg = calcularMes(s, ctl, prem, 1, 0);
    lucrosReg.push(reg.lucro);
    custosL.push(reg.custoTotalL);
    funcs.push(reg.funcionarios);
    litrosDia.push(reg.litrosProdDia);
    reg.garrDia.forEach((g, k) => { garrTam[k].push(g); shareTam[k].push(reg.w[k]); });
    topUn[indiceMax(reg.garrDia)]++;
    topRec[indiceMax(reg.recDiaTam)]++;

    const eq = equilibrioPontos(s, ctl, prem);
    eqPontos.push(eq);
    eqGarrafas.push(eq * s.giro_garrafas_dia);
    contatos.push(ctl.pontos / s.taxa_fechamento);
  }

  return {
    n,
    vpl: resumir(vpls),
    probVplNegativo: vplNeg / n,
    tir: tirs.length ? resumir(tirs) : null,
    tirDefinida: 1 - semTir / n,
    payback: paybacks.length ? resumir(paybacks) : null,
    probRecupera: paybacks.length / n,
    exposicao: resumir(exposicoes),
    investimento: resumir(investimentos),
    lucroRegime: resumir(lucrosReg),
    custoL: resumir(custosL),
    lucroMes1: resumir(lucrosMes1),
    probPrejuizoMes1: prejMes1 / n,
    equilibrioPontos: resumir(eqPontos),
    equilibrioGarrafasDia: resumir(eqGarrafas),
    contatos: resumir(contatos),
    funcionarios: resumir(funcs),
    litrosDia: resumir(litrosDia),
    mix: TAMANHOS.map((ml, k) => ({
      ml,
      share: resumir(shareTam[k]),
      garrafasDia: resumir(garrTam[k]),
      probMaisUnidades: topUn[k] / n,
      probMaisReceita: topRec[k] / n,
    })),
    vplPorTma: tmas.map((aa, j) => ({
      tmaAa: aa,
      p50: quantil(vplTma[j].slice().sort((a, b) => a - b), 0.5),
      probNegativo: vplTma[j].filter((x) => x < 0).length / n,
    })),
    amostrasVpl: vpls,
    horizonte: ctl.horizonte,
  };
}

/** Curva VPL × pontos de venda (mesma semente em todos os pontos). */
export function curvaPontos(dados, ctl, lista, n = 500, semente = 20261116) {
  const params = mapaParametros(dados);
  const prem = dados.premissas_fixas;
  const rM = taxaMensal(ctl.tmaAa);
  return lista.map((pontos) => {
    const rng = mulberry32(semente);
    const c = { ...ctl, pontos };
    const vpls = [];
    let neg = 0;
    for (let i = 0; i < n; i++) {
      const s = sortear(params, rng, c);
      const f = fluxoCaixa(s, c, prem);
      const v = valorPresente(f.cf0, f.flows, rM);
      vpls.push(v);
      if (v < 0) neg++;
    }
    const r = resumir(vpls);
    return { x: pontos, p10: r.p10, p50: r.p50, p90: r.p90, probNegativo: neg / n };
  });
}

/** Menor número de pontos em que a chance de VPL > 0 chega ao alvo (null se não chega). */
export function pontosParaProb(curva, alvo) {
  for (const p of curva) if (1 - p.probNegativo >= alvo) return p.x;
  return null;
}

/** Sensibilidade de um fator por vez (tornado): VPL no mínimo e no máximo de cada entrada. */
export function tornado(dados, ctl) {
  const prem = dados.premissas_fixas;
  const rM = taxaMensal(ctl.tmaAa);
  const base = {};
  for (const p of dados.parametros) base[p.id] = p.moda;
  if (ctl.margemPonto !== null && ctl.margemPonto !== undefined) base.margem_ponto = ctl.margemPonto;
  const vplDe = (s) => {
    const f = fluxoCaixa(s, ctl, prem);
    return valorPresente(f.cf0, f.flows, rM);
  };
  const vplBase = vplDe(base);
  const itens = [];
  for (const p of dados.parametros) {
    if (p.id === 'margem_ponto' && ctl.margemPonto !== null && ctl.margemPonto !== undefined) continue;
    const a = vplDe({ ...base, [p.id]: p.min });
    const b = vplDe({ ...base, [p.id]: p.max });
    const amp = Math.abs(b - a);
    if (amp < 1e-9) continue;
    itens.push({ id: p.id, nome: p.curto || p.nome, min: p.min, max: p.max, vplNoMin: a, vplNoMax: b, amplitude: amp });
  }
  itens.sort((x, y) => y.amplitude - x.amplitude);
  return { vplBase, itens };
}

/** Histograma (faixa entre P1 e P99). */
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
