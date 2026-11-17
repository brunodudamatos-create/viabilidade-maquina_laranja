/*
 * Interface do simulador de suco de laranja (Cuiabá)
 * Autor: Bruno Duda Dantas Matos
 * Versão: v1.0 (2026-11-16)
 * Histórico de mudanças:
 *   v1.0 – primeira versão: controles, indicadores, gráfico lucro × volume,
 *          histograma, tabelas de dados e dicas ao passar o mouse.
 */
import { simular, curvaVolume, histograma } from './sim.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

let dados = null;
let pendente = false;

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
  return {
    volumeDia: Number($('volume').value),
    precoVenda: Number($('preco').value),
    funcionarios: Number($('func').value),
    diasMes: Number($('dias').value),
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

/* ---------- Gráfico 1: lucro × volume ---------- */
function desenharCurva(curva, ctl, lucroAtual) {
  const caixa = $('g-curva');
  caixa.innerHTML = '<div class="dica"></div>';
  const W = Math.max(300, Math.round(caixa.clientWidth)), H = W < 420 ? 260 : 300;
  const m = { e: 64, d: 12, t: 12, b: 38 };
  const x0 = curva[0].volume, x1 = curva[curva.length - 1].volume;
  let yMin = Math.min(0, ...curva.map((p) => p.p10));
  let yMax = Math.max(0, ...curva.map((p) => p.p90));
  const pad = (yMax - yMin) * 0.05 || 1;
  yMin -= pad; yMax += pad;
  const X = (v) => m.e + ((v - x0) / (x1 - x0)) * (W - m.e - m.d);
  const Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Lucro mensal em função do volume vendido por dia' });
  for (const t of marcas(yMin, yMax, 5)) {
    svg.appendChild(el('line', { x1: m.e, x2: W - m.d, y1: Y(t), y2: Y(t), class: t === 0 ? 'eixo-linha' : 'grade-linha' }));
    svg.appendChild(el('text', { x: m.e - 8, y: Y(t) + 4, 'text-anchor': 'end' }, brl0.format(t)));
  }
  for (const t of marcas(x0, x1, 6)) {
    svg.appendChild(el('text', { x: X(t), y: H - m.b + 16, 'text-anchor': 'middle' }, String(t)));
  }
  svg.appendChild(el('text', { x: (m.e + W - m.d) / 2, y: H - 4, 'text-anchor': 'middle', class: 'tit-eixo' }, 'Litros vendidos por dia'));

  const topo = curva.map((p) => `${X(p.volume)},${Y(p.p90)}`);
  const base = curva.slice().reverse().map((p) => `${X(p.volume)},${Y(p.p10)}`);
  svg.appendChild(el('polygon', { points: topo.concat(base).join(' '), class: 'faixa-serie' }));
  svg.appendChild(el('polyline', { points: curva.map((p) => `${X(p.volume)},${Y(p.p50)}`).join(' '), class: 'linha-serie' }));

  // marca do volume escolhido
  const xv = X(ctl.volumeDia);
  svg.appendChild(el('line', { x1: xv, x2: xv, y1: m.t, y2: H - m.b, class: 'guia' }));
  svg.appendChild(el('circle', { cx: xv, cy: Y(lucroAtual), r: 5, class: 'marca' }));

  const guia = el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'guia', style: 'display:none' });
  const ponto = el('circle', { cx: 0, cy: 0, r: 5, class: 'marca', style: 'display:none' });
  svg.appendChild(guia); svg.appendChild(ponto);

  const area = el('rect', { x: m.e, y: m.t, width: W - m.e - m.d, height: H - m.t - m.b, fill: 'transparent' });
  area.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let melhor = curva[0];
    for (const p of curva) if (Math.abs(X(p.volume) - px) < Math.abs(X(melhor.volume) - px)) melhor = p;
    guia.setAttribute('x1', X(melhor.volume)); guia.setAttribute('x2', X(melhor.volume)); guia.style.display = '';
    ponto.setAttribute('cx', X(melhor.volume)); ponto.setAttribute('cy', Y(melhor.p50)); ponto.style.display = '';
    mostrarDica(caixa,
      `<strong>${melhor.volume} L/dia</strong><br>Mediana: ${brl0.format(melhor.p50)}<br>80% dos cenários: ${brl0.format(melhor.p10)} a ${brl0.format(melhor.p90)}<br>Chance de prejuízo: ${num0.format(melhor.probPrejuizo * 100)}%`,
      (X(melhor.volume) / W) * caixa.clientWidth, (Y(melhor.p50) / H) * caixa.clientHeight);
  });
  area.addEventListener('pointerleave', () => { guia.style.display = 'none'; ponto.style.display = 'none'; esconderDica(caixa); });
  svg.appendChild(area);
  caixa.prepend(svg);

  $('t-curva').innerHTML = '<table><thead><tr><th>L/dia</th><th>Pior 10%</th><th>Mediana</th><th>Melhor 10%</th><th>Chance de prejuízo</th></tr></thead><tbody>' +
    curva.map((p) => `<tr><td class="num">${p.volume}</td><td class="num">${brl0.format(p.p10)}</td><td class="num">${brl0.format(p.p50)}</td><td class="num">${brl0.format(p.p90)}</td><td class="num">${num0.format(p.probPrejuizo * 100)}%</td></tr>`).join('') +
    '</tbody></table>';
}

/* ---------- Gráfico 2: histograma ---------- */
function desenharHistograma(bins, total) {
  const caixa = $('g-hist');
  caixa.innerHTML = '<div class="dica"></div>';
  const W = Math.max(300, Math.round(caixa.clientWidth)), H = W < 420 ? 250 : 270;
  const m = { e: 40, d: 12, t: 12, b: 58 };
  const yMax = Math.max(...bins.map((b) => b.n)) / total * 100 * 1.08;
  const lo = bins[0].de, hi = bins[bins.length - 1].ate;
  const X = (v) => m.e + ((v - lo) / (hi - lo)) * (W - m.e - m.d);
  const Y = (p) => m.t + (1 - p / yMax) * (H - m.t - m.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Distribuição do lucro mensal simulado' });
  for (const t of marcas(0, yMax, 4)) {
    svg.appendChild(el('line', { x1: m.e, x2: W - m.d, y1: Y(t), y2: Y(t), class: t === 0 ? 'eixo-linha' : 'grade-linha' }));
    svg.appendChild(el('text', { x: m.e - 8, y: Y(t) + 4, 'text-anchor': 'end' }, num0.format(t) + '%'));
  }
  for (const t of marcas(lo, hi, 5)) {
    svg.appendChild(el('text', { x: X(t), y: H - m.b + 16, 'text-anchor': 'middle' }, brl0.format(t)));
  }
  svg.appendChild(el('text', { x: (m.e + W - m.d) / 2, y: H - 6, 'text-anchor': 'middle', class: 'tit-eixo' }, 'Lucro mensal (R$)'));

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
        `<strong>${brl0.format(b.de)} a ${brl0.format(b.ate)}</strong><br>${num1.format(p)}% dos cenários<br>${perda ? 'Prejuízo' : 'Lucro'}`,
        ev.clientX - rc.left, ev.clientY - rc.top);
    });
    barra.addEventListener('pointerleave', () => esconderDica(caixa));
    svg.appendChild(barra);
  });
  caixa.prepend(svg);

  $('t-hist').innerHTML = '<table><thead><tr><th>Faixa de lucro</th><th>Cenários</th></tr></thead><tbody>' +
    bins.map((b) => `<tr><td class="num">${brl0.format(b.de)} a ${brl0.format(b.ate)}</td><td class="num">${num1.format((b.n / total) * 100)}%</td></tr>`).join('') +
    '</tbody></table>';
}

/* ---------- Indicadores ---------- */
function atualizar() {
  pendente = false;
  const ctl = controles();
  $('volume-v').textContent = `${ctl.volumeDia} L`;
  $('preco-v').textContent = brl2.format(ctl.precoVenda);
  $('func-v').textContent = String(ctl.funcionarios);
  $('dias-v').textContent = `${ctl.diasMes} dias`;

  const r = simular(dados, ctl, 5000);
  const heroi = $('heroi-lucro');
  heroi.textContent = brl0.format(r.lucro.p50);
  heroi.classList.toggle('negativo', r.lucro.p50 < 0);
  $('heroi-faixa').textContent = `80% dos cenários ficam entre ${brl0.format(r.lucro.p10)} e ${brl0.format(r.lucro.p90)}`;

  $('k-custo').textContent = brl2.format(r.custoL.p50);
  $('k-custo-f').textContent = `${brl2.format(r.custoL.p10)} a ${brl2.format(r.custoL.p90)} por litro`;
  $('k-prob').textContent = `${num0.format(r.probPrejuizo * 100)}%`;
  $('k-prob-f').textContent = 'dos cenários terminam o mês no vermelho';

  const eq = r.equilibrio.p50;
  $('k-eq').textContent = Number.isFinite(eq) && eq < 500 ? `${num1.format(eq)} L/dia` : 'não fecha';
  $('k-eq-f').textContent = Number.isFinite(r.equilibrio.p90) && r.equilibrio.p90 < 500
    ? `${num1.format(r.equilibrio.p10)} a ${num1.format(r.equilibrio.p90)} L/dia` : 'com o preço escolhido, em parte dos cenários';

  $('k-mes1').textContent = brl0.format(r.lucroMes1.p50);
  $('k-mes1-f').textContent = `chance de prejuízo: ${num0.format(r.probPrejuizoMes1 * 100)}%`;

  const alerta = $('alerta-capacidade');
  alerta.hidden = !r.acimaCapacidade;
  if (r.acimaCapacidade) {
    alerta.textContent = `⚠ ${ctl.volumeDia} L/dia passa da capacidade assumida de ${r.capacidadeDia} L/dia para ${ctl.funcionarios} funcionário(s). Aumente os funcionários ou confirme a capacidade da máquina.`;
  }

  const volumes = [];
  for (let v = 5; v <= 150; v += 5) volumes.push(v);
  const curva = curvaVolume(dados, ctl, volumes, 1500);
  desenharCurva(curva, ctl, r.lucro.p50);
  desenharHistograma(histograma(r.amostrasLucro, 24), r.n);
}

function agendar() {
  if (pendente) return;
  pendente = true;
  requestAnimationFrame(atualizar);
}

/* ---------- Tabela de dados ---------- */
function formatar(valor, unidade) {
  if (unidade === 'fração') return `${num1.format(valor * 100)}%`;
  if (unidade === 'fator') return `${num1.format(valor)}×`;
  if (unidade.startsWith('R$')) return valor >= 100 ? brl0.format(valor) : brl2.format(valor);
  return num1.format(valor);
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
  const ref = dados.referencias_preco_venda;
  const [a, b, c] = ref.faixa_padrao;
  linhas.push(`<tr>
      <td><strong>${escapar(ref.nome)}</strong><br><span style="color:var(--tinta-3)">${escapar(ref.nota)}</span></td>
      <td class="num">${brl2.format(a)}</td><td class="num"><strong>${brl2.format(b)}</strong></td><td class="num">${brl2.format(c)}</td>
      <td class="num">${escapar(ref.unidade)}</td><td><a href="${escapar(ref.url)}" target="_blank" rel="noopener noreferrer">${escapar(ref.fonte)}</a></td>
      <td class="num">${escapar(ref.data)}</td><td class="conf ${ref.confianca}">${ROTULO_CONF[ref.confianca]}</td></tr>`);
  $('t-dados').innerHTML = `<table><thead><tr><th>Item</th><th>Mínimo</th><th>Mais provável</th><th>Máximo</th><th>Unidade</th><th>Fonte</th><th>Data</th><th>Confiança</th></tr></thead><tbody>${linhas.join('')}</tbody></table>`;
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
  desenharDados();
  for (const id of ['volume', 'preco', 'func', 'dias']) $(id).addEventListener('input', agendar);
  let larguraAnterior = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== larguraAnterior) { larguraAnterior = window.innerWidth; agendar(); }
  });
  atualizar();
}
iniciar();
