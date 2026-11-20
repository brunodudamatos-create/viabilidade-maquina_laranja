/*
 * Interface do simulador de suco de laranja (Cuiabá)
 * Autor: Bruno Duda Dantas Matos
 * Versão: v2.2 (2026-11-20)
 * Histórico de mudanças:
 *   v2.2 – rótulo do resultado com a sigla por extenso (VPL, Valor Presente Líquido). Só texto.
 *   v2.1 – redesenha os gráficos quando a aba do Cenário A volta a ficar visível
 *          (evento 'painel-A-visivel'). Nenhuma conta foi alterada.
 *   v2.0 – funil de pontos de venda e garrafas, mix de tamanhos, VPL/TIR/payback,
 *          exposição de caixa, tornado, margem do ponto, tabela por TMA, métodos
 *          e referências. Gráficos: VPL × pontos, distribuição do VPL e tornado.
 *   v1.0 – primeira versão: controles, indicadores, gráfico lucro × volume,
 *          histograma, tabelas de dados e dicas ao passar o mouse.
 */
import { simular, curvaPontos, pontosParaProb, tornado, histograma } from './sim.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brlC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const pct0 = (x) => `${num0.format(x * 100)}%`;

let dados = null;
let pendente = false;
let timerPesado = null;

function el(tag, attrs = {}, texto) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function controles() {
  const usarFaixa = $('margem-faixa').checked;
  return {
    pontos: Number($('pontos').value),
    funcionarios: Number($('func').value),
    diasMes: Number($('dias').value),
    tmaAa: Number($('tma').value) / 100,
    horizonte: Number($('hor').value),
    margemPonto: usarFaixa ? null : Number($('margem').value) / 100,
  };
}

/** Marcas "redondas" para o eixo (1, 2, 5 × potência de 10). */
function marcas(min, max, alvo = 5) {
  const bruto = (max - min) / alvo || 1;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / pot;
  const passo = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pot;
  const ini = Math.ceil(min / passo) * passo;
  const out = [];
  for (let v = ini; v <= max + passo * 0.001; v += passo) out.push(Math.abs(v) < passo * 1e-9 ? 0 : v);
  return out;
}

function mostrarDica(caixa, html, x, y) {
  const d = caixa.querySelector('.dica');
  d.innerHTML = html;
  d.style.display = 'block';
  const larg = caixa.clientWidth;
  const dw = d.offsetWidth;
  d.style.left = Math.max(0, Math.min(larg - dw, x + 12)) + 'px';
  d.style.top = Math.max(0, y - 10) + 'px';
}
function esconderDica(caixa) { caixa.querySelector('.dica').style.display = 'none'; }

/* ---------- Gráfico 1: VPL × pontos de venda ---------- */
function desenharCurva(curva, ctl, vplAtual) {
  const caixa = $('g-curva');
  caixa.innerHTML = '<div class="dica"></div>';
  const W = Math.max(300, Math.round(caixa.clientWidth)), H = W < 420 ? 260 : 300;
  const m = { e: 80, d: 12, t: 12, b: 38 };
  const x0 = curva[0].x, x1 = curva[curva.length - 1].x;
  let yMin = Math.min(0, ...curva.map((p) => p.p10));
  let yMax = Math.max(0, ...curva.map((p) => p.p90));
  const pad = (yMax - yMin) * 0.05 || 1;
  yMin -= pad; yMax += pad;
  const X = (v) => m.e + ((v - x0) / (x1 - x0)) * (W - m.e - m.d);
  const Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'VPL em função do número de pontos de venda' });
  for (const t of marcas(yMin, yMax, 5)) {
    svg.appendChild(el('line', { x1: m.e, x2: W - m.d, y1: Y(t), y2: Y(t), class: t === 0 ? 'eixo-linha' : 'grade-linha' }));
    svg.appendChild(el('text', { x: m.e - 8, y: Y(t) + 4, 'text-anchor': 'end' }, brlC.format(t)));
  }
  for (const t of marcas(x0, x1, 6)) {
    svg.appendChild(el('text', { x: X(t), y: H - m.b + 16, 'text-anchor': 'middle' }, String(t)));
  }
  svg.appendChild(el('text', { x: (m.e + W - m.d) / 2, y: H - 4, 'text-anchor': 'middle', class: 'tit-eixo' }, 'Pontos de venda atendidos'));

  const topo = curva.map((p) => `${X(p.x)},${Y(p.p90)}`);
  const base = curva.slice().reverse().map((p) => `${X(p.x)},${Y(p.p10)}`);
  svg.appendChild(el('polygon', { points: topo.concat(base).join(' '), class: 'faixa-serie' }));
  svg.appendChild(el('polyline', { points: curva.map((p) => `${X(p.x)},${Y(p.p50)}`).join(' '), class: 'linha-serie' }));

  const xv = X(Math.min(x1, Math.max(x0, ctl.pontos)));
  svg.appendChild(el('line', { x1: xv, x2: xv, y1: m.t, y2: H - m.b, class: 'guia' }));
  svg.appendChild(el('circle', { cx: xv, cy: Y(vplAtual), r: 5, class: 'marca' }));

  const guia = el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'guia', style: 'display:none' });
  const ponto = el('circle', { cx: 0, cy: 0, r: 5, class: 'marca', style: 'display:none' });
  svg.appendChild(guia); svg.appendChild(ponto);

  const area = el('rect', { x: m.e, y: m.t, width: W - m.e - m.d, height: H - m.t - m.b, fill: 'transparent' });
  area.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let melhor = curva[0];
    for (const p of curva) if (Math.abs(X(p.x) - px) < Math.abs(X(melhor.x) - px)) melhor = p;
    guia.setAttribute('x1', X(melhor.x)); guia.setAttribute('x2', X(melhor.x)); guia.style.display = '';
    ponto.setAttribute('cx', X(melhor.x)); ponto.setAttribute('cy', Y(melhor.p50)); ponto.style.display = '';
    mostrarDica(caixa,
      `<strong>${melhor.x} pontos</strong><br>VPL mediano: ${brl0.format(melhor.p50)}<br>80% dos cenários: ${brl0.format(melhor.p10)} a ${brl0.format(melhor.p90)}<br>Chance de VPL negativo: ${pct0(melhor.probNegativo)}`,
      (X(melhor.x) / W) * caixa.clientWidth, (Y(melhor.p50) / H) * caixa.clientHeight);
  });
  area.addEventListener('pointerleave', () => { guia.style.display = 'none'; ponto.style.display = 'none'; esconderDica(caixa); });
  svg.appendChild(area);
  caixa.prepend(svg);

  $('t-curva').innerHTML = '<table><thead><tr><th>Pontos</th><th>Pior 10%</th><th>Mediana</th><th>Melhor 10%</th><th>Chance de VPL negativo</th></tr></thead><tbody>' +
    curva.map((p) => `<tr><td class="num">${p.x}</td><td class="num">${brl0.format(p.p10)}</td><td class="num">${brl0.format(p.p50)}</td><td class="num">${brl0.format(p.p90)}</td><td class="num">${pct0(p.probNegativo)}</td></tr>`).join('') +
    '</tbody></table>';
}

/* ---------- Gráfico 2: histograma do VPL ---------- */
function desenharHistograma(bins, total) {
  const caixa = $('g-hist');
  caixa.innerHTML = '<div class="dica"></div>';
  const W = Math.max(300, Math.round(caixa.clientWidth)), H = W < 420 ? 250 : 270;
  const m = { e: 40, d: 12, t: 12, b: 58 };
  const yMax = Math.max(...bins.map((b) => b.n)) / total * 100 * 1.08;
  const lo = bins[0].de, hi = bins[bins.length - 1].ate;
  const X = (v) => m.e + ((v - lo) / (hi - lo)) * (W - m.e - m.d);
  const Y = (p) => m.t + (1 - p / yMax) * (H - m.t - m.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Distribuição do VPL simulado' });
  for (const t of marcas(0, yMax, 4)) {
    svg.appendChild(el('line', { x1: m.e, x2: W - m.d, y1: Y(t), y2: Y(t), class: t === 0 ? 'eixo-linha' : 'grade-linha' }));
    svg.appendChild(el('text', { x: m.e - 8, y: Y(t) + 4, 'text-anchor': 'end' }, num0.format(t) + '%'));
  }
  for (const t of marcas(lo, hi, W < 420 ? 3 : 4)) {
    svg.appendChild(el('text', { x: X(t), y: H - m.b + 16, 'text-anchor': 'middle' }, brlC.format(t)));
  }
  svg.appendChild(el('text', { x: (m.e + W - m.d) / 2, y: H - 6, 'text-anchor': 'middle', class: 'tit-eixo' }, 'VPL (R$)'));

  const slot = (W - m.e - m.d) / bins.length;
  const larg = Math.min(24, slot - 2);
  bins.forEach((b) => {
    const p = (b.n / total) * 100;
    if (p <= 0) return;
    const cx = X((b.de + b.ate) / 2);
    const x = cx - larg / 2, y = Y(p), yb = Y(0), r = Math.min(4, larg / 2, yb - y);
    const d = `M${x},${yb} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + larg - r},${y} Q${x + larg},${y} ${x + larg},${y + r} L${x + larg},${yb} Z`;
    const perda = (b.de + b.ate) / 2 < 0;
    const barra = el('path', { d, class: perda ? 'barra-perda' : 'barra-lucro' });
    barra.addEventListener('pointermove', (ev) => {
      const rc = caixa.getBoundingClientRect();
      mostrarDica(caixa,
        `<strong>${brl0.format(b.de)} a ${brl0.format(b.ate)}</strong><br>${num1.format(p)}% dos cenários<br>${perda ? 'VPL negativo (não se paga)' : 'VPL positivo'}`,
        ev.clientX - rc.left, ev.clientY - rc.top);
    });
    barra.addEventListener('pointerleave', () => esconderDica(caixa));
    svg.appendChild(barra);
  });
  caixa.prepend(svg);

  $('t-hist').innerHTML = '<table><thead><tr><th>Faixa de VPL</th><th>Cenários</th></tr></thead><tbody>' +
    bins.map((b) => `<tr><td class="num">${brl0.format(b.de)} a ${brl0.format(b.ate)}</td><td class="num">${num1.format((b.n / total) * 100)}%</td></tr>`).join('') +
    '</tbody></table>';
}

/* ---------- Gráfico 3: tornado (sensibilidade) ---------- */
function desenharTornado(t) {
  const caixa = $('g-tornado');
  caixa.innerHTML = '<div class="dica"></div>';
  const itens = t.itens.slice(0, 10);
  const W = Math.max(300, Math.round(caixa.clientWidth));
  const linha = 26;
  const m = { e: Math.round(Math.min(150, W * 0.4)), d: 12, t: 8, b: 30 };
  const H = m.t + itens.length * linha + m.b;
  const vals = itens.flatMap((i) => [i.vplNoMin, i.vplNoMax]).concat(t.vplBase);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.04 || 1;
  lo -= pad; hi += pad;
  const X = (v) => m.e + ((v - lo) / (hi - lo)) * (W - m.e - m.d);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Quanto cada entrada move o VPL (tornado)' });
  for (const v of marcas(lo, hi, W < 420 ? 2 : 4)) {
    svg.appendChild(el('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, class: 'grade-linha' }));
    svg.appendChild(el('text', { x: X(v), y: H - m.b + 16, 'text-anchor': 'middle' }, brlC.format(v)));
  }
  itens.forEach((it, i) => {
    const y = m.t + i * linha;
    const a = Math.min(it.vplNoMin, it.vplNoMax), b = Math.max(it.vplNoMin, it.vplNoMax);
    const nome = it.nome.length > 22 && m.e < 120 ? it.nome.slice(0, 21) + '…' : it.nome;
    svg.appendChild(el('text', { x: m.e - 8, y: y + linha / 2 + 4, 'text-anchor': 'end' }, nome));
    const barra = el('rect', { x: X(a), y: y + 4, width: Math.max(2, X(b) - X(a)), height: linha - 8, rx: 4, class: 'barra-torn' });
    const dica = (ev) => {
      const rc = caixa.getBoundingClientRect();
      mostrarDica(caixa,
        `<strong>${escapar(it.nome)}</strong><br>No mínimo (${num2.format(it.min)}): VPL ${brl0.format(it.vplNoMin)}<br>No máximo (${num2.format(it.max)}): VPL ${brl0.format(it.vplNoMax)}`,
        ev.clientX - rc.left, ev.clientY - rc.top);
    };
    barra.addEventListener('pointermove', dica);
    barra.addEventListener('pointerleave', () => esconderDica(caixa));
    svg.appendChild(barra);
  });
  svg.appendChild(el('line', { x1: X(t.vplBase), x2: X(t.vplBase), y1: m.t, y2: H - m.b, class: 'guia' }));
  if (lo < 0 && hi > 0) svg.appendChild(el('line', { x1: X(0), x2: X(0), y1: m.t, y2: H - m.b, class: 'eixo-linha' }));
  caixa.prepend(svg);

  $('t-tornado').innerHTML = '<table><thead><tr><th>Entrada</th><th>VPL no mínimo</th><th>VPL no máximo</th><th>Amplitude</th></tr></thead><tbody>' +
    t.itens.map((it) => `<tr><td>${escapar(it.nome)}</td><td class="num">${brl0.format(it.vplNoMin)}</td><td class="num">${brl0.format(it.vplNoMax)}</td><td class="num">${brl0.format(it.amplitude)}</td></tr>`).join('') +
    '</tbody></table>';
}

/* ---------- Tabelas de resposta ---------- */
function desenharMix(r, ctl) {
  const prem = dados.parametros;
  const moda = (id) => prem.find((p) => p.id === id).moda;
  const margem = ctl.margemPonto === null ? moda('margem_ponto') : ctl.margemPonto;
  const ids = { 300: 'preco_varejo_300', 500: 'preco_varejo_500', 1000: 'preco_varejo_1000' };
  const linhas = r.mix.map((m) => {
    const varejo = moda(ids[m.ml]);
    return `<tr><td><strong>${m.ml === 1000 ? '1 L' : m.ml + ' ml'}</strong></td>
      <td class="num">${pct0(m.share.p50)}</td>
      <td class="num">${num0.format(m.garrafasDia.p50)}</td>
      <td class="num">${num0.format(m.garrafasDia.p50 * ctl.diasMes)}</td>
      <td class="num">${brl2.format(varejo)}</td>
      <td class="num">${brl2.format(varejo * (1 - margem))}</td>
      <td class="num">${pct0(m.probMaisUnidades)}</td>
      <td class="num">${pct0(m.probMaisReceita)}</td></tr>`;
  });
  $('t-mix').innerHTML = `<table><thead><tr><th>Tamanho</th><th>Parte das garrafas</th><th>Garrafas por dia</th><th>Garrafas por mês</th><th>Preço ao consumidor</th><th>Preço ao ponto</th><th>Chance de ser o que mais vende (unidades)</th><th>Chance de ser o que mais rende (R$)</th></tr></thead><tbody>${linhas.join('')}</tbody></table>`;
}

function desenharTma(r) {
  $('t-tma').innerHTML = '<table><thead><tr><th>Retorno exigido (TMA) ao ano</th><th>VPL mediano</th><th>Chance de VPL negativo</th></tr></thead><tbody>' +
    r.vplPorTma.map((t) => `<tr><td class="num">${num2.format(t.tmaAa * 100)}%${t.tmaAa === dados.financeiro.tma_base_aa ? ' (Selic)' : ''}</td><td class="num">${brl0.format(t.p50)}</td><td class="num">${pct0(t.probNegativo)}</td></tr>`).join('') +
    '</tbody></table>';
}

function desenharMargens(ctl) {
  const linhas = [{ rotulo: 'Faixa do estudo (25% a 45%)', m: null }, ...[0.4, 0.3, 0.2, 0.1, 0].map((m) => ({ rotulo: `${num0.format(m * 100)}%${m === 0 ? ' (venda direta ao consumidor)' : ''}`, m }))];
  const corpo = linhas.map((l) => {
    const r = simular(dados, { ...ctl, margemPonto: l.m }, 1200);
    const eq = r.equilibrioPontos.p50;
    return `<tr><td>${l.rotulo}</td><td class="num">${brl0.format(r.vpl.p50)}</td><td class="num">${pct0(r.probVplNegativo)}</td><td class="num">${brl0.format(r.lucroRegime.p50)}</td><td class="num">${Number.isFinite(eq) && eq < 1000 ? num0.format(Math.ceil(eq)) + ' pontos' : 'não fecha'}</td></tr>`;
  });
  $('t-margens').innerHTML = `<table><thead><tr><th>Quanto o ponto fica do preço ao consumidor</th><th>VPL mediano</th><th>Chance de VPL negativo</th><th>Lucro mensal em regime</th><th>Pontos mínimos</th></tr></thead><tbody>${corpo.join('')}</tbody></table>`;
}

/* ---------- Indicadores ---------- */
function ate1000(x) { return Number.isFinite(x) && x < 1000; }

function atualizar() {
  pendente = false;
  const ctl = controles();
  $('pontos-v').textContent = `${ctl.pontos} pontos`;
  $('func-v').textContent = `${ctl.funcionarios} (mínimo)`;
  $('dias-v').textContent = `${ctl.diasMes} dias`;
  $('tma-v').textContent = `${num2.format(ctl.tmaAa * 100)}% ao ano`;
  $('hor-v').textContent = `${ctl.horizonte} meses`;
  $('margem-v').textContent = ctl.margemPonto === null ? '25% a 45%' : `${num0.format(ctl.margemPonto * 100)}%`;
  $('margem').disabled = ctl.margemPonto === null;

  const r = simular(dados, ctl, 3000);
  const heroi = $('heroi-vpl');
  $('heroi-rotulo').textContent = `VPL (Valor Presente Líquido) em ${ctl.horizonte} meses, a ${num2.format(ctl.tmaAa * 100)}% ao ano (mediana)`;
  heroi.textContent = brl0.format(r.vpl.p50);
  heroi.classList.toggle('negativo', r.vpl.p50 < 0);
  $('heroi-faixa').textContent = `80% dos cenários ficam entre ${brl0.format(r.vpl.p10)} e ${brl0.format(r.vpl.p90)}`;
  $('heroi-leitura').textContent = r.probVplNegativo >= 0.5
    ? `Em ${pct0(r.probVplNegativo)} dos cenários o negócio não se paga: rende menos do que deixar o dinheiro aplicado a ${num2.format(ctl.tmaAa * 100)}% ao ano.`
    : `Em ${pct0(1 - r.probVplNegativo)} dos cenários o negócio rende mais do que deixar o dinheiro aplicado a ${num2.format(ctl.tmaAa * 100)}% ao ano.`;

  const eq = r.equilibrioPontos;
  $('k-pontos').textContent = ate1000(eq.p50) ? `${num0.format(Math.ceil(eq.p50))} pontos` : 'não fecha';
  $('k-pontos-f').textContent = ate1000(eq.p50)
    ? `no pior de 10% dos cenários: ${ate1000(eq.p90) ? num0.format(Math.ceil(eq.p90)) + ' pontos' : 'não fecha'}`
    : 'com estas premissas, mais pontos não bastam para o lucro mensal passar de zero';
  const eqg = r.equilibrioGarrafasDia;
  $('k-garrafas').textContent = ate1000(eqg.p50) ? `${num0.format(Math.ceil(eqg.p50))} garrafas/dia` : 'não fecha';
  $('k-garrafas-f').textContent = ate1000(eqg.p50) ? `${num0.format(Math.ceil(eqg.p50 * ctl.diasMes))} por mês, somando os três tamanhos` : 'ver a tabela de margem do ponto abaixo';
  $('k-contatos').textContent = `${num0.format(Math.ceil(r.contatos.p50 / 10) * 10)} contatos`;
  $('k-contatos-f').textContent = `para fechar ${ctl.pontos} pontos; pior 10%: ${num0.format(Math.ceil(r.contatos.p90 / 10) * 10)}`;

  $('k-vplneg').textContent = pct0(r.probVplNegativo);
  $('k-vplneg-f').textContent = 'dos cenários o dinheiro investido não volta com o retorno exigido';
  $('k-payback').textContent = r.probRecupera >= 0.5 ? `${num0.format(r.payback.p50)} meses` : 'não se paga';
  $('k-payback-f').textContent = `se paga dentro de ${ctl.horizonte} meses em ${pct0(r.probRecupera)} dos cenários`;
  if (r.tirDefinida >= 0.5 && r.tir) {
    $('k-tir').textContent = r.tir.p50 > 9.99 ? 'acima de 999% a.a.' : `${num0.format(r.tir.p50 * 100)}% a.a.`;
    $('k-tir-f').textContent = `existe em ${pct0(r.tirDefinida)} dos cenários; com investimento pequeno a TIR sai enorme (olhe VPL e payback)`;
  } else {
    $('k-tir').textContent = 'sem TIR';
    $('k-tir-f').textContent = `só existe em ${pct0(r.tirDefinida)} dos cenários (fluxo de caixa negativo)`;
  }
  $('k-exp').textContent = brl0.format(r.exposicao.p50);
  $('k-exp-f').textContent = `caixa necessário; pior 10%: ${brl0.format(r.exposicao.p90)}`;
  $('k-regime').textContent = brl0.format(r.lucroRegime.p50);
  $('k-regime-f').textContent = `por mês depois da rampa; custo total ${brl2.format(r.custoL.p50)} por litro`;
  $('k-mes1').textContent = brl0.format(r.lucroMes1.p50);
  $('k-mes1-f').textContent = `mês 1 (70% do volume, mais perda de fruta); chance de prejuízo ${pct0(r.probPrejuizoMes1)}`;
  $('k-inv').textContent = brl0.format(r.investimento.p50);
  $('k-inv-f').textContent = 'treinamento, licenças e giro (a máquina já existe e não entra)';

  $('info-equipe').textContent = `Produção em regime: cerca de ${num0.format(r.litrosDia.p50)} L/dia (de ${num0.format(r.litrosDia.p10)} a ${num0.format(r.litrosDia.p90)}). Equipe necessária: ${num0.format(r.funcionarios.p50)} funcionário(s) (o modelo contrata sozinho quando passa de ${dados.premissas_fixas.capacidade_func_dia_litros} L/dia por pessoa).`;

  desenharHistograma(histograma(r.amostrasVpl, 24), r.n);
  desenharTornado(tornado(dados, ctl));
  desenharMix(r, ctl);
  desenharTma(r);

  clearTimeout(timerPesado);
  timerPesado = setTimeout(() => atualizarPesado(ctl, r), 80);
}

function atualizarPesado(ctl, r) {
  const lista = [];
  for (let p = 2; p <= 150; p += 4) lista.push(p);
  const curva = curvaPontos(dados, ctl, lista, 500);
  desenharCurva(curva, ctl, r.vpl.p50);
  const p50 = pontosParaProb(curva, 0.5);
  const p80 = pontosParaProb(curva, 0.8);
  $('curva-leitura').textContent = p50 === null
    ? 'Nesta configuração, nenhum número de pontos até 150 faz o VPL ficar positivo em metade dos cenários.'
    : `Chance de VPL positivo de 50% a partir de ${p50} pontos${p80 !== null ? ` e de 80% a partir de ${p80} pontos` : ' (80% não é atingida até 150 pontos)'}.`;
  desenharMargens(ctl);
}

function agendar() {
  if (pendente) return;
  pendente = true;
  requestAnimationFrame(atualizar);
}

/* ---------- Tabela de dados ---------- */
function formatar(valor, unidade) {
  if (unidade === 'fração') return `${num1.format(valor * 100)}%`;
  if (unidade === 'fator' || unidade === 'peso') return num2.format(valor);
  if (unidade.startsWith('R$')) return valor >= 100 ? brl0.format(valor) : brl2.format(valor);
  return num2.format(valor);
}
const ROTULO_CONF = { alta: '▲ Alta', media: '● Média', baixa: '▼ Baixa' };

function desenharDados() {
  const linhas = dados.parametros.map((p) => {
    const fonte = p.url ? `<a href="${escapar(p.url)}" target="_blank" rel="noopener noreferrer">${escapar(p.fonte)}</a>` : escapar(p.fonte);
    return `<tr>
      <td><strong>${escapar(p.nome)}</strong><br><span style="color:var(--tinta-3)">${escapar(p.nota)}</span></td>
      <td class="num">${formatar(p.min, p.unidade)}</td><td class="num"><strong>${formatar(p.moda, p.unidade)}</strong></td><td class="num">${formatar(p.max, p.unidade)}</td>
      <td class="num">${escapar(p.unidade)}</td><td>${fonte}</td><td class="num">${escapar(p.data)}</td>
      <td class="conf ${p.confianca}">${ROTULO_CONF[p.confianca]}</td></tr>`;
  });
  $('t-dados').innerHTML = `<table><thead><tr><th>Item</th><th>Mínimo</th><th>Mais provável</th><th>Máximo</th><th>Unidade</th><th>Fonte</th><th>Data</th><th>Confiança</th></tr></thead><tbody>${linhas.join('')}</tbody></table>`;

  $('t-varejo').innerHTML = '<table><thead><tr><th>Tamanho</th><th>Onde</th><th>Preço</th></tr></thead><tbody>' +
    dados.referencias_preco_varejo.map((x) => `<tr><td>${escapar(x.tamanho)}</td><td><a href="${escapar(x.url)}" target="_blank" rel="noopener noreferrer">${escapar(x.local)}</a></td><td class="num">${brl2.format(x.preco)}</td></tr>`).join('') +
    '</tbody></table>';

  $('lista-metodos').innerHTML = dados.metodologia.map((m) => `<li><strong>${escapar(m.titulo)}.</strong> ${escapar(m.descricao)} <a href="${escapar(m.url)}" target="_blank" rel="noopener noreferrer">${escapar(m.fonte)}</a></li>`).join('');
  $('nota-fin').innerHTML = `${escapar(dados.financeiro.nota)} <a href="${escapar(dados.financeiro.url)}" target="_blank" rel="noopener noreferrer">${escapar(dados.financeiro.fonte)}</a>`;
  $('lacunas').innerHTML = dados.lacunas.map((l) => `<li>${escapar(l)}</li>`).join('');
  $('rodape-versao').textContent = `Dados v${dados.versao}, atualizados em ${dados.atualizado}. Autor: ${dados.autor}.`;
}

async function iniciar() {
  try {
    const resp = await fetch('data/dados.json');
    if (!resp.ok) throw new Error(resp.status);
    dados = await resp.json();
  } catch (e) {
    document.querySelector('.pagina').insertAdjacentHTML('afterbegin',
      '<div class="aviso" role="alert"><strong>Erro:</strong> não consegui carregar os dados (data/dados.json). Se abriu o arquivo direto no computador, use um servidor local.</div>');
    return;
  }
  $('tma').value = String(dados.financeiro.tma_base_aa * 100);
  $('hor').value = String(dados.financeiro.horizonte_meses);
  desenharDados();
  for (const id of ['pontos', 'func', 'dias', 'tma', 'hor', 'margem', 'margem-faixa']) $(id).addEventListener('input', agendar);
  let larguraAnterior = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== larguraAnterior) { larguraAnterior = window.innerWidth; agendar(); }
  });
  window.addEventListener('painel-A-visivel', agendar);
  atualizar();
}
iniciar();
