/*
 * Interface dos cenários de negócio (abas A a E e comparação)
 * Autor: Bruno Duda Dantas Matos
 *
 * Versão: v3.0  (2026-11-20)
 * Histórico de mudanças:
 *   v3.0 – arquivo novo. Abas para escolher o modelo de negócio (A garrafa para
 *          revenda, B copo no CEASA, C entrega própria, D garrafa no balcão,
 *          E carrinho) e uma aba que compara todos. Cada cenário tem os mesmos
 *          filtros do Cenário A (equipe, dias, retorno exigido, horizonte) mais
 *          a demanda por dia e as pessoas sem salário (família). Resultado
 *          principal: quantos copos ou pedidos por dia são preciso vender
 *          para empatar.
 */
import { simular, histograma } from './sim.js';
import { simularCen, curvaDemanda, demandaParaProb, tornadoCen, mapaCenario } from './cenarios.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brlC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 0 });
const num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const num3 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const pct0 = (x) => `${num0.format(x * 100)}%`;

let dados = null;
let abaAtual = 'A';
let timer = null;
const estado = {};
const COR = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

function el(tag, attrs = {}, texto) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  if (texto !== undefined) e.textContent = texto;
  return e;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function marcas(min, max, alvo = 5) {
  const bruto = (max - min) / alvo || 1;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / pot;
  const passo = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pot;
  const out = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + passo * 0.001; v += passo) out.push(Math.abs(v) < passo * 1e-9 ? 0 : v);
  return out;
}
function dica(caixa, html, x, y) {
  const d = caixa.querySelector('.dica');
  d.innerHTML = html; d.style.display = 'block';
  d.style.left = Math.max(0, Math.min(caixa.clientWidth - d.offsetWidth, x + 12)) + 'px';
  d.style.top = Math.max(0, y - 10) + 'px';
}
function semDica(caixa) { caixa.querySelector('.dica').style.display = 'none'; }
function formatar(v, un) {
  if (un === 'fração') return `${num1.format(v * 100)}%`;
  if (un.startsWith('R$')) return v >= 100 ? brl0.format(v) : brl2.format(v);
  return Math.abs(v) < 1 && v !== 0 ? num3.format(v) : num2.format(v);
}
const ROTULO_CONF = { alta: '▲ Alta', media: '● Média', baixa: '▼ Baixa' };
const cenarioPorLetra = (l) => dados.cenarios.find((c) => c.letra === l);

/* ---------- Abas ---------- */
function montarAbas() {
  const nomes = [['A', 'A · Garrafa para revenda']].concat(dados.cenarios.map((c) => [c.letra, `${c.letra} · ${c.curto}`]), [['comparar', 'Comparar todos']]);
  $('abas').innerHTML = nomes.map(([k, t]) => `<button type="button" class="aba" data-aba="${k}" aria-pressed="false">${esc(t)}</button>`).join('');
  $('abas').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-aba]');
    if (b) irPara(b.dataset.aba);
  });
}

function irPara(aba) {
  abaAtual = aba;
  for (const b of document.querySelectorAll('.aba')) b.setAttribute('aria-pressed', String(b.dataset.aba === aba));
  const ehA = aba === 'A';
  $('painel-A').hidden = !ehA;
  $('painel-cen').hidden = ehA;
  try { history.replaceState(null, '', ehA ? location.pathname : `#${aba}`); } catch (e) { /* sem histórico */ }
  if (ehA) { window.dispatchEvent(new Event('painel-A-visivel')); return; }
  if (aba === 'comparar') { montarComparar(); atualizarComparar(); } else { montarCenario(cenarioPorLetra(aba)); atualizarCen(); }
}

/* ---------- Painel de um cenário ---------- */
function montarCenario(cen) {
  $('painel-cen').dataset.modo = cen.letra;
  const st = estado[cen.letra] || (estado[cen.letra] = {
    dem: cen.demanda.padrao, func: 1, fam: 0, dias: 26,
    tma: dados.financeiro.tma_base_aa * 100, hor: dados.financeiro.horizonte_meses,
  });
  const un = cen.unidade_plural;
  $('painel-cen').innerHTML = `
    <h2 style="margin-top:8px">${esc(cen.letra)} · ${esc(cen.nome)}</h2>
    <p class="sub">${esc(cen.descricao)}</p>
    <div class="aviso" role="note"><strong>Atenção:</strong> preço, demanda, aluguel, entrega e investimento deste cenário são
      <strong>estimativas de baixa confiança</strong> (marcadas na tabela). O simulador mostra <strong>quanto é preciso vender</strong>
      para o negócio dar certo; não prevê que vão comprar. ${esc(dados.cenarios_comuns.aviso)}</div>
    <section class="cartao" aria-label="Filtros">
      <div class="controles">
        <div class="controle"><label for="c-dem">${esc(un[0].toUpperCase() + un.slice(1))} por dia (planejados) <output id="c-dem-v"></output></label>
          <input id="c-dem" type="range" min="${cen.demanda.min}" max="${cen.demanda.max}" step="${cen.demanda.passo}" value="${st.dem}"></div>
        <div class="controle"><label for="c-func">Equipe mínima <output id="c-func-v"></output></label>
          <input id="c-func" type="range" min="1" max="3" step="1" value="${st.func}"></div>
        <div class="controle"><label for="c-fam">Pessoas sem salário (família) <output id="c-fam-v"></output></label>
          <input id="c-fam" type="range" min="0" max="2" step="1" value="${st.fam}"></div>
        <div class="controle"><label for="c-dias">Dias de operação por mês <output id="c-dias-v"></output></label>
          <input id="c-dias" type="range" min="15" max="30" step="1" value="${st.dias}"></div>
        <div class="controle"><label for="c-tma">Retorno exigido (TMA) <output id="c-tma-v"></output></label>
          <input id="c-tma" type="range" min="10" max="35" step="0.25" value="${st.tma}"></div>
        <div class="controle"><label for="c-hor">Horizonte da análise <output id="c-hor-v"></output></label>
          <input id="c-hor" type="range" min="12" max="36" step="6" value="${st.hor}"></div>
      </div>
      <div id="c-info" class="info"></div>
    </section>
    <section class="heroi" aria-live="polite">
      <div class="rotulo" id="c-heroi-rotulo">VPL</div>
      <div class="valor" id="c-heroi-vpl">–</div>
      <div class="faixa" id="c-heroi-faixa"></div>
      <div class="leitura" id="c-heroi-leitura"></div>
    </section>
    <h2>Quanto preciso vender</h2>
    <section class="grade-cartoes">
      <div class="cartao"><div class="rotulo">${esc(un[0].toUpperCase() + un.slice(1))} por dia para empatar</div><div class="valor" id="c-k-eq">–</div><div class="faixa" id="c-k-eq-f"></div></div>
      <div class="cartao"><div class="rotulo">Pessoas necessárias</div><div class="valor" id="c-k-pes">–</div><div class="faixa" id="c-k-pes-f"></div></div>
      <div class="cartao"><div class="rotulo">Suco por dia em regime</div><div class="valor" id="c-k-lit">–</div><div class="faixa" id="c-k-lit-f"></div></div>
      <div class="cartao"><div class="rotulo">Energia elétrica por mês</div><div class="valor" id="c-k-en">–</div><div class="faixa" id="c-k-en-f"></div></div>
    </section>
    <h2>Retorno do investimento</h2>
    <section class="grade-cartoes">
      <div class="cartao"><div class="rotulo">Chance de VPL negativo</div><div class="valor" id="c-k-neg">–</div><div class="faixa" id="c-k-neg-f"></div></div>
      <div class="cartao"><div class="rotulo">Payback descontado</div><div class="valor" id="c-k-pb">–</div><div class="faixa" id="c-k-pb-f"></div></div>
      <div class="cartao"><div class="rotulo">TIR</div><div class="valor" id="c-k-tir">–</div><div class="faixa" id="c-k-tir-f"></div></div>
      <div class="cartao"><div class="rotulo">Exposição máxima de caixa</div><div class="valor" id="c-k-exp">–</div><div class="faixa" id="c-k-exp-f"></div></div>
      <div class="cartao"><div class="rotulo">Lucro mensal em regime</div><div class="valor" id="c-k-reg">–</div><div class="faixa" id="c-k-reg-f"></div></div>
      <div class="cartao"><div class="rotulo">Mês 1 (curva de aprendizado)</div><div class="valor" id="c-k-m1">–</div><div class="faixa" id="c-k-m1-f"></div></div>
      <div class="cartao"><div class="rotulo">Investimento inicial</div><div class="valor" id="c-k-inv">–</div><div class="faixa" id="c-k-inv-f"></div></div>
    </section>
    <h2>Para onde vai cada real de venda</h2>
    <section class="cartao">
      <div class="grafico" id="c-g-custo"></div>
      <div class="legenda" id="c-leg-custo"></div>
      <p class="leitura" id="c-custo-leitura"></p>
      <details><summary>Ver a tabela</summary><div class="tabela-rolagem" id="c-t-custo"></div></details>
    </section>
    <h2>O que mais pesa no resultado</h2>
    <section class="cartao">
      <div class="grafico" id="c-g-tornado"></div>
      <div class="legenda"><span><span class="chave" style="background:var(--serie)"></span>VPL quando a entrada vai do mínimo ao máximo, com as demais no valor mais provável</span></div>
      <details><summary>Ver a tabela do tornado</summary><div class="tabela-rolagem" id="c-t-tornado"></div></details>
    </section>
    <div class="duas-colunas">
      <section class="cartao">
        <h2 style="margin-top:0">VPL conforme ${esc(un)} por dia</h2>
        <div class="grafico" id="c-g-curva"><div class="calculando">Calculando…</div></div>
        <div class="legenda"><span><span class="chave" style="background:var(--serie)"></span>Mediana</span><span><span class="chave" style="background:var(--serie);opacity:.25"></span>Faixa de 80% dos cenários</span></div>
        <p class="leitura" id="c-curva-leitura"></p>
        <details><summary>Ver a tabela desta curva</summary><div class="tabela-rolagem" id="c-t-curva"></div></details>
      </section>
      <section class="cartao">
        <h2 style="margin-top:0">Distribuição do VPL nesta configuração</h2>
        <div class="grafico" id="c-g-hist"></div>
        <div class="legenda"><span><span class="chave" style="background:var(--serie)"></span>VPL positivo</span><span><span class="chave" style="background:var(--perda)"></span>VPL negativo</span></div>
        <details><summary>Ver a tabela desta distribuição</summary><div class="tabela-rolagem" id="c-t-hist"></div></details>
      </section>
    </div>
    <h2>VPL conforme o retorno exigido</h2>
    <section class="cartao tabela-rolagem" id="c-t-tma"></section>
    <h2>Riscos deste cenário</h2>
    <ul class="lacunas">${cen.riscos.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <h2>Como validar antes de investir</h2>
    <ul class="lacunas">${cen.como_validar.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <h2>Dados, fontes e confiança deste cenário</h2>
    <section class="cartao tabela-rolagem" id="c-t-dados"></section>`;
  for (const id of ['c-dem', 'c-func', 'c-fam', 'c-dias', 'c-tma', 'c-hor']) $(id).addEventListener('input', agendarCen);
  desenharDadosCen(cen);
}

function desenharDadosCen(cen) {
  const mapa = mapaCenario(dados, cen);
  const ORIGEM = { geral: 'Geral (igual ao Cenário A)', comum: 'Energia e manutenção (comum aos cenários)', cenario: 'Deste cenário' };
  const linhas = Object.values(mapa).map((p) => {
    const fonte = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.fonte)}</a>` : esc(p.fonte);
    return `<tr><td><strong>${esc(p.nome)}</strong><br><span style="color:var(--tinta-3)">${esc(p.nota || '')}</span></td>
      <td class="num">${formatar(p.min, p.unidade)}</td><td class="num"><strong>${formatar(p.moda, p.unidade)}</strong></td><td class="num">${formatar(p.max, p.unidade)}</td>
      <td class="num">${esc(p.unidade)}</td><td>${esc(ORIGEM[p.origem])}</td><td>${fonte}</td><td class="conf ${p.confianca}">${ROTULO_CONF[p.confianca]}</td></tr>`;
  });
  $('c-t-dados').innerHTML = `<table><thead><tr><th>Item</th><th>Mínimo</th><th>Mais provável</th><th>Máximo</th><th>Unidade</th><th>Grupo</th><th>Fonte</th><th>Confiança</th></tr></thead><tbody>${linhas.join('')}</tbody></table>`;
}

function ctlCen() {
  return {
    demanda: Number($('c-dem').value), funcionarios: Number($('c-func').value), familia: Number($('c-fam').value),
    diasMes: Number($('c-dias').value), tmaAa: Number($('c-tma').value) / 100, horizonte: Number($('c-hor').value),
  };
}
let pendenteCen = false;
function agendarCen() { if (pendenteCen) return; pendenteCen = true; requestAnimationFrame(atualizarCen); }

function atualizarCen() {
  pendenteCen = false;
  if (abaAtual === 'A' || abaAtual === 'comparar' || !$('c-dem')) return;
  const cen = cenarioPorLetra(abaAtual);
  const ctl = ctlCen();
  const un = cen.unidade_plural;
  estado[cen.letra] = { dem: ctl.demanda, func: ctl.funcionarios, fam: ctl.familia, dias: ctl.diasMes, tma: ctl.tmaAa * 100, hor: ctl.horizonte };
  $('c-dem-v').textContent = `${num0.format(ctl.demanda)} ${un}`;
  $('c-func-v').textContent = `${ctl.funcionarios} (mínimo)`;
  $('c-fam-v').textContent = `${ctl.familia}`;
  $('c-dias-v').textContent = `${ctl.diasMes} dias`;
  $('c-tma-v').textContent = `${num2.format(ctl.tmaAa * 100)}% ao ano`;
  $('c-hor-v').textContent = `${ctl.horizonte} meses`;

  const r = simularCen(dados, cen, ctl, 3000);
  const h = $('c-heroi-vpl');
  $('c-heroi-rotulo').textContent = `VPL em ${ctl.horizonte} meses, a ${num2.format(ctl.tmaAa * 100)}% ao ano (mediana)`;
  h.textContent = brl0.format(r.vpl.p50);
  h.classList.toggle('negativo', r.vpl.p50 < 0);
  $('c-heroi-faixa').textContent = `80% dos cenários ficam entre ${brl0.format(r.vpl.p10)} e ${brl0.format(r.vpl.p90)}`;
  $('c-heroi-leitura').textContent = r.probVplNegativo >= 0.5
    ? `Em ${pct0(r.probVplNegativo)} dos cenários o negócio não se paga: rende menos do que deixar o dinheiro aplicado a ${num2.format(ctl.tmaAa * 100)}% ao ano.`
    : `Em ${pct0(1 - r.probVplNegativo)} dos cenários o negócio rende mais do que deixar o dinheiro aplicado a ${num2.format(ctl.tmaAa * 100)}% ao ano.`;

  const eq = r.equilibrioVendasDia;
  const ok = Number.isFinite(eq.p50);
  $('c-k-eq').textContent = ok ? `${num0.format(Math.ceil(eq.p50))} ${un}/dia` : 'não fecha';
  $('c-k-eq-f').textContent = ok
    ? `${num0.format(Math.ceil(eq.p50 * ctl.diasMes))} por mês; pior 10%: ${Number.isFinite(eq.p90) ? num0.format(Math.ceil(eq.p90)) : 'não fecha'}. Você planejou ${num0.format(ctl.demanda)}/dia.`
    : 'com estas premissas, vender mais não faz o lucro mensal passar de zero';
  const pessoas = Math.round(r.pessoas.p50);
  $('c-k-pes').textContent = `${pessoas} pessoa${pessoas > 1 ? 's' : ''}`;
  $('c-k-pes-f').textContent = `${Math.max(0, pessoas - ctl.familia)} com salário e ${Math.min(pessoas, ctl.familia)} da família sem salário`;
  $('c-k-lit').textContent = `${num0.format(r.litrosDia.p50)} L/dia`;
  $('c-k-lit-f').textContent = `de ${num0.format(r.litrosDia.p10)} a ${num0.format(r.litrosDia.p90)} L/dia; laranja necessária: cerca de ${num0.format(r.litrosDia.p50 * dados.parametros.find((p) => p.id === 'rendimento_kg_l').moda)} kg/dia`;
  $('c-k-en').textContent = brl0.format(r.energiaMes.p50);
  $('c-k-en-f').textContent = `cerca de ${brl2.format(r.itensPorVenda.energia)} por venda; estimativa até chegar a placa da máquina e a conta de luz`;

  $('c-k-neg').textContent = pct0(r.probVplNegativo);
  $('c-k-neg-f').textContent = 'dos cenários o dinheiro investido não volta com o retorno exigido';
  $('c-k-pb').textContent = r.probRecupera >= 0.5 ? `${num0.format(r.payback.p50)} meses` : 'não se paga';
  $('c-k-pb-f').textContent = `se paga dentro de ${ctl.horizonte} meses em ${pct0(r.probRecupera)} dos cenários`;
  if (r.tirDefinida >= 0.5 && r.tir) {
    $('c-k-tir').textContent = r.tir.p50 > 9.99 ? 'acima de 999% a.a.' : `${num0.format(r.tir.p50 * 100)}% a.a.`;
    $('c-k-tir-f').textContent = `existe em ${pct0(r.tirDefinida)} dos cenários; com investimento pequeno a TIR sai enorme (olhe VPL e payback)`;
  } else {
    $('c-k-tir').textContent = 'sem TIR';
    $('c-k-tir-f').textContent = `só existe em ${pct0(r.tirDefinida)} dos cenários (fluxo de caixa negativo)`;
  }
  $('c-k-exp').textContent = brl0.format(r.exposicao.p50);
  $('c-k-exp-f').textContent = `caixa necessário; pior 10%: ${brl0.format(r.exposicao.p90)}`;
  $('c-k-reg').textContent = brl0.format(r.lucroRegime.p50);
  $('c-k-reg-f').textContent = `por mês depois da rampa; lucro típico de ${brl2.format(r.lucroPorVenda.p50)} por venda`;
  $('c-k-m1').textContent = brl0.format(r.lucroMes1.p50);
  $('c-k-m1-f').textContent = `mês 1 (70% do volume, mais perda de fruta); chance de prejuízo ${pct0(r.probPrejuizoMes1)}`;
  $('c-k-inv').textContent = brl0.format(r.investimento.p50);
  $('c-k-inv-f').textContent = 'balcão ou equipamento, licenças e treinamento (a máquina já existe e não entra)';
  $('c-info').textContent = `Preço típico: ${brl2.format(r.precoPorVendaModa)} por venda. Equipe: o modelo coloca mais gente sozinho quando passa de ${cen.premissas.capacidade_func_dia_vendas} ${un}/dia ou de ${cen.premissas.capacidade_func_dia_litros} L/dia por pessoa. "Quanto da demanda aparece" reduz a demanda planejada (chuva, frio, dia fraco).`;

  graficoCusto(r, cen);
  graficoHist(histograma(r.amostrasVpl, 24), r.n);
  graficoTornado(tornadoCen(dados, cen, ctl));
  tabelaTma(r);
  clearTimeout(timer);
  timer = setTimeout(() => pesadoCen(cen, ctl, r), 80);
}

function pesadoCen(cen, ctl, r) {
  if (abaAtual !== cen.letra || !$('c-g-curva')) return;
  const passo = Math.max(cen.demanda.passo, Math.ceil((cen.demanda.max - cen.demanda.min) / 36 / cen.demanda.passo) * cen.demanda.passo);
  const lista = [];
  for (let d = cen.demanda.min; d <= cen.demanda.max; d += passo) lista.push(d);
  const curva = curvaDemanda(dados, cen, ctl, lista, 400);
  graficoCurva(curva, ctl, r.vpl.p50, cen);
  const p50 = demandaParaProb(curva, 0.5);
  const p80 = demandaParaProb(curva, 0.8);
  const un = cen.unidade_plural;
  $('c-curva-leitura').textContent = p50 === null
    ? `Nesta configuração, nenhuma demanda até ${cen.demanda.max} ${un} por dia faz o VPL ficar positivo em metade dos cenários.`
    : `Chance de VPL positivo de 50% a partir de ${p50} ${un} por dia${p80 !== null ? ` e de 80% a partir de ${p80}` : ` (80% não é atingida até ${cen.demanda.max})`}.`;
}

/* ---------- Gráficos ---------- */
function graficoCusto(r, cen) {
  const caixa = $('c-g-custo');
  caixa.innerHTML = '<div class="dica"></div>';
  const it = r.itensPorVenda;
  const grupos = [
    { nome: 'Fruta', v: it.fruta },
    { nome: 'Embalagem', v: it.embalagem },
    { nome: 'Energia, água e limpeza', v: it.energia + it.aguaLimpeza },
    { nome: 'Entrega, impostos e taxas', v: it.entrega + it.impostosTaxas },
    { nome: 'Equipe', v: it.equipe },
    { nome: 'Ponto, manutenção e fixos', v: it.aluguel + it.marketing + it.manutencao + it.fixosGerais },
  ];
  const total = grupos.reduce((a, g) => a + g.v, 0);
  const preco = r.precoPorVendaModa;
  const maxV = Math.max(total, preco) * 1.04;
  const W = Math.max(300, Math.round(caixa.clientWidth)), H = 96;
  const m = { e: 8, d: 8, t: 22, b: 26 };
  const X = (v) => m.e + (v / maxV) * (W - m.e - m.d);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Custo típico por venda, por grupo, comparado com o preço' });
  let acc = 0;
  grupos.forEach((g, i) => {
    if (g.v <= 0) return;
    const x = X(acc), w = Math.max(1, X(acc + g.v) - X(acc));
    const rc = el('rect', { x, y: m.t, width: w, height: 34, fill: COR[i], stroke: 'var(--superficie)', 'stroke-width': 2 });
    rc.addEventListener('pointermove', (ev) => {
      const b = caixa.getBoundingClientRect();
      dica(caixa, `<strong>${esc(g.nome)}</strong><br>${brl2.format(g.v)} por ${cen.unidade_venda} (${pct0(g.v / preco)} do preço)`, ev.clientX - b.left, ev.clientY - b.top);
    });
    rc.addEventListener('pointerleave', () => semDica(caixa));
    svg.appendChild(rc);
    if (w > 44) svg.appendChild(el('text', { x: x + w / 2, y: m.t + 21, 'text-anchor': 'middle', style: 'fill:#fff;font-weight:600' }, brl2.format(g.v)));
    acc += g.v;
  });
  svg.appendChild(el('line', { x1: X(preco), x2: X(preco), y1: m.t - 8, y2: m.t + 44, class: 'guia', 'stroke-width': 2 }));
  svg.appendChild(el('text', { x: Math.min(W - m.d, X(preco)), y: m.t - 11, 'text-anchor': X(preco) > W * 0.7 ? 'end' : 'start' }, `Preço: ${brl2.format(preco)}`));
  svg.appendChild(el('text', { x: m.e, y: H - 6 }, `Custo típico: ${brl2.format(total)} por ${cen.unidade_venda}`));
  caixa.prepend(svg);
  $('c-leg-custo').innerHTML = grupos.map((g, i) => `<span><span class="chave" style="background:${COR[i]}"></span>${esc(g.nome)}</span>`).join('');
  const sobra = preco - total;
  $('c-custo-leitura').textContent = sobra >= 0
    ? `Em cada ${cen.unidade_venda} sobram cerca de ${brl2.format(sobra)} depois de todos os custos, no volume escolhido. Valores típicos (mediana de cada item); o preço é o valor mais provável.`
    : `Em cada ${cen.unidade_venda} faltam cerca de ${brl2.format(-sobra)} para cobrir todos os custos, no volume escolhido. Valores típicos (mediana de cada item).`;
  $('c-t-custo').innerHTML = '<table><thead><tr><th>Grupo</th><th>Por venda</th><th>Parte do preço</th></tr></thead><tbody>' +
    grupos.map((g) => `<tr><td>${esc(g.nome)}</td><td class="num">${brl2.format(g.v)}</td><td class="num">${pct0(g.v / preco)}</td></tr>`).join('') +
    `<tr><td><strong>Custo total</strong></td><td class="num"><strong>${brl2.format(total)}</strong></td><td class="num">${pct0(total / preco)}</td></tr></tbody></table>`;
}

function graficoCurva(curva, ctl, vplAtual, cen) {
  const caixa = $('c-g-curva');
  caixa.innerHTML = '<div class="dica"></div>';
  const W = Math.max(300, Math.round(caixa.clientWidth)), H = W < 420 ? 260 : 300;
  const m = { e: 80, d: 12, t: 12, b: 38 };
  const x0 = curva[0].x, x1 = curva[curva.length - 1].x;
  let yMin = Math.min(0, ...curva.map((p) => p.p10)), yMax = Math.max(0, ...curva.map((p) => p.p90));
  const pad = (yMax - yMin) * 0.05 || 1; yMin -= pad; yMax += pad;
  const X = (v) => m.e + ((v - x0) / (x1 - x0)) * (W - m.e - m.d);
  const Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `VPL em função de ${cen.unidade_plural} por dia` });
  for (const t of marcas(yMin, yMax, 5)) {
    svg.appendChild(el('line', { x1: m.e, x2: W - m.d, y1: Y(t), y2: Y(t), class: t === 0 ? 'eixo-linha' : 'grade-linha' }));
    svg.appendChild(el('text', { x: m.e - 8, y: Y(t) + 4, 'text-anchor': 'end' }, brlC.format(t)));
  }
  for (const t of marcas(x0, x1, 6)) svg.appendChild(el('text', { x: X(t), y: H - m.b + 16, 'text-anchor': 'middle' }, String(t)));
  svg.appendChild(el('text', { x: (m.e + W - m.d) / 2, y: H - 4, 'text-anchor': 'middle', class: 'tit-eixo' }, `${cen.unidade_plural[0].toUpperCase() + cen.unidade_plural.slice(1)} por dia (planejados)`));
  const topo = curva.map((p) => `${X(p.x)},${Y(p.p90)}`), base = curva.slice().reverse().map((p) => `${X(p.x)},${Y(p.p10)}`);
  svg.appendChild(el('polygon', { points: topo.concat(base).join(' '), class: 'faixa-serie' }));
  svg.appendChild(el('polyline', { points: curva.map((p) => `${X(p.x)},${Y(p.p50)}`).join(' '), class: 'linha-serie' }));
  const xv = X(Math.min(x1, Math.max(x0, ctl.demanda)));
  svg.appendChild(el('line', { x1: xv, x2: xv, y1: m.t, y2: H - m.b, class: 'guia' }));
  svg.appendChild(el('circle', { cx: xv, cy: Y(vplAtual), r: 5, class: 'marca' }));
  const guia = el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'guia', style: 'display:none' });
  const ponto = el('circle', { cx: 0, cy: 0, r: 5, class: 'marca', style: 'display:none' });
  svg.appendChild(guia); svg.appendChild(ponto);
  const area = el('rect', { x: m.e, y: m.t, width: W - m.e - m.d, height: H - m.t - m.b, fill: 'transparent' });
  area.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    let melhor = curva[0];
    for (const p of curva) if (Math.abs(X(p.x) - px) < Math.abs(X(melhor.x) - px)) melhor = p;
    guia.setAttribute('x1', X(melhor.x)); guia.setAttribute('x2', X(melhor.x)); guia.style.display = '';
    ponto.setAttribute('cx', X(melhor.x)); ponto.setAttribute('cy', Y(melhor.p50)); ponto.style.display = '';
    dica(caixa, `<strong>${melhor.x} ${cen.unidade_plural}/dia</strong><br>VPL mediano: ${brl0.format(melhor.p50)}<br>80% dos cenários: ${brl0.format(melhor.p10)} a ${brl0.format(melhor.p90)}<br>Chance de VPL negativo: ${pct0(melhor.probNegativo)}`,
      (X(melhor.x) / W) * caixa.clientWidth, (Y(melhor.p50) / H) * caixa.clientHeight);
  });
  area.addEventListener('pointerleave', () => { guia.style.display = 'none'; ponto.style.display = 'none'; semDica(caixa); });
  svg.appendChild(area);
  caixa.prepend(svg);
  $('c-t-curva').innerHTML = `<table><thead><tr><th>${esc(cen.unidade_plural)}/dia</th><th>Pior 10%</th><th>Mediana</th><th>Melhor 10%</th><th>Chance de VPL negativo</th></tr></thead><tbody>` +
    curva.map((p) => `<tr><td class="num">${p.x}</td><td class="num">${brl0.format(p.p10)}</td><td class="num">${brl0.format(p.p50)}</td><td class="num">${brl0.format(p.p90)}</td><td class="num">${pct0(p.probNegativo)}</td></tr>`).join('') + '</tbody></table>';
}

function graficoHist(bins, total) {
  const caixa = $('c-g-hist');
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
  for (const t of marcas(lo, hi, W < 420 ? 3 : 4)) svg.appendChild(el('text', { x: X(t), y: H - m.b + 16, 'text-anchor': 'middle' }, brlC.format(t)));
  svg.appendChild(el('text', { x: (m.e + W - m.d) / 2, y: H - 6, 'text-anchor': 'middle', class: 'tit-eixo' }, 'VPL (R$)'));
  const slot = (W - m.e - m.d) / bins.length, larg = Math.min(24, slot - 2);
  bins.forEach((b) => {
    const p = (b.n / total) * 100;
    if (p <= 0) return;
    const cx = X((b.de + b.ate) / 2), x = cx - larg / 2, y = Y(p), yb = Y(0), r = Math.min(4, larg / 2, yb - y);
    const d = `M${x},${yb} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + larg - r},${y} Q${x + larg},${y} ${x + larg},${y + r} L${x + larg},${yb} Z`;
    const perda = (b.de + b.ate) / 2 < 0;
    const barra = el('path', { d, class: perda ? 'barra-perda' : 'barra-lucro' });
    barra.addEventListener('pointermove', (ev) => {
      const rc = caixa.getBoundingClientRect();
      dica(caixa, `<strong>${brl0.format(b.de)} a ${brl0.format(b.ate)}</strong><br>${num1.format(p)}% dos cenários<br>${perda ? 'VPL negativo (não se paga)' : 'VPL positivo'}`, ev.clientX - rc.left, ev.clientY - rc.top);
    });
    barra.addEventListener('pointerleave', () => semDica(caixa));
    svg.appendChild(barra);
  });
  caixa.prepend(svg);
  $('c-t-hist').innerHTML = '<table><thead><tr><th>Faixa de VPL</th><th>Cenários</th></tr></thead><tbody>' +
    bins.map((b) => `<tr><td class="num">${brl0.format(b.de)} a ${brl0.format(b.ate)}</td><td class="num">${num1.format((b.n / total) * 100)}%</td></tr>`).join('') + '</tbody></table>';
}

function graficoTornado(t) {
  const caixa = $('c-g-tornado');
  caixa.innerHTML = '<div class="dica"></div>';
  const itens = t.itens.slice(0, 10);
  const W = Math.max(300, Math.round(caixa.clientWidth)), linha = 26;
  const m = { e: Math.round(Math.min(160, W * 0.4)), d: 12, t: 8, b: 30 };
  const H = m.t + itens.length * linha + m.b;
  const vals = itens.flatMap((i) => [i.vplNoMin, i.vplNoMax]).concat(t.vplBase);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.04 || 1; lo -= pad; hi += pad;
  const X = (v) => m.e + ((v - lo) / (hi - lo)) * (W - m.e - m.d);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Quanto cada entrada move o VPL (tornado)' });
  for (const v of marcas(lo, hi, W < 420 ? 2 : 4)) {
    svg.appendChild(el('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, class: 'grade-linha' }));
    svg.appendChild(el('text', { x: X(v), y: H - m.b + 16, 'text-anchor': 'middle' }, brlC.format(v)));
  }
  itens.forEach((it, i) => {
    const y = m.t + i * linha, a = Math.min(it.vplNoMin, it.vplNoMax), b = Math.max(it.vplNoMin, it.vplNoMax);
    const nome = it.nome.length > 22 && m.e < 130 ? it.nome.slice(0, 21) + '…' : it.nome;
    svg.appendChild(el('text', { x: m.e - 8, y: y + linha / 2 + 4, 'text-anchor': 'end' }, nome));
    const barra = el('rect', { x: X(a), y: y + 4, width: Math.max(2, X(b) - X(a)), height: linha - 8, rx: 4, class: 'barra-torn' });
    barra.addEventListener('pointermove', (ev) => {
      const rc = caixa.getBoundingClientRect();
      dica(caixa, `<strong>${esc(it.nome)}</strong><br>No mínimo (${num3.format(it.min)}): VPL ${brl0.format(it.vplNoMin)}<br>No máximo (${num3.format(it.max)}): VPL ${brl0.format(it.vplNoMax)}`, ev.clientX - rc.left, ev.clientY - rc.top);
    });
    barra.addEventListener('pointerleave', () => semDica(caixa));
    svg.appendChild(barra);
  });
  svg.appendChild(el('line', { x1: X(t.vplBase), x2: X(t.vplBase), y1: m.t, y2: H - m.b, class: 'guia' }));
  if (lo < 0 && hi > 0) svg.appendChild(el('line', { x1: X(0), x2: X(0), y1: m.t, y2: H - m.b, class: 'eixo-linha' }));
  caixa.prepend(svg);
  $('c-t-tornado').innerHTML = '<table><thead><tr><th>Entrada</th><th>VPL no mínimo</th><th>VPL no máximo</th><th>Amplitude</th></tr></thead><tbody>' +
    t.itens.map((it) => `<tr><td>${esc(it.nome)}</td><td class="num">${brl0.format(it.vplNoMin)}</td><td class="num">${brl0.format(it.vplNoMax)}</td><td class="num">${brl0.format(it.amplitude)}</td></tr>`).join('') + '</tbody></table>';
}

function tabelaTma(r) {
  $('c-t-tma').innerHTML = '<table><thead><tr><th>Retorno exigido (TMA) ao ano</th><th>VPL mediano</th><th>Chance de VPL negativo</th></tr></thead><tbody>' +
    r.vplPorTma.map((t) => `<tr><td class="num">${num2.format(t.tmaAa * 100)}%${t.tmaAa === dados.financeiro.tma_base_aa ? ' (Selic)' : ''}</td><td class="num">${brl0.format(t.p50)}</td><td class="num">${pct0(t.probNegativo)}</td></tr>`).join('') + '</tbody></table>';
}

/* ---------- Comparar todos ---------- */
function montarComparar() {
  if ($('painel-cen').dataset.modo === 'comparar') return;
  $('painel-cen').dataset.modo = 'comparar';
  $('painel-cen').innerHTML = `
    <h2 style="margin-top:8px">Comparar todos os cenários</h2>
    <p class="sub">Cada cenário no volume padrão dele e com os mesmos filtros. Serve para ver onde o negócio fecha e onde não fecha; depois abra a aba do cenário para mexer nos filtros.</p>
    <section class="cartao">
      <div class="controles">
        <div class="controle"><label for="k-fam">Pessoas sem salário (família) <output id="k-fam-v"></output></label>
          <input id="k-fam" type="range" min="0" max="2" step="1" value="0"></div>
        <div class="controle"><label for="k-tma">Retorno exigido (TMA) <output id="k-tma-v"></output></label>
          <input id="k-tma" type="range" min="10" max="35" step="0.25" value="${dados.financeiro.tma_base_aa * 100}"></div>
        <div class="controle"><label for="k-hor">Horizonte da análise <output id="k-hor-v"></output></label>
          <input id="k-hor" type="range" min="12" max="36" step="6" value="${dados.financeiro.horizonte_meses}"></div>
      </div>
    </section>
    <section class="cartao tabela-rolagem" id="k-tabela" style="margin-top:12px"><div class="calculando">Calculando…</div></section>
    <p class="sub" id="k-nota"></p>`;
  for (const id of ['k-fam', 'k-tma', 'k-hor']) $(id).addEventListener('input', agendarComparar);
}
let pendenteK = false;
function agendarComparar() { if (pendenteK) return; pendenteK = true; requestAnimationFrame(atualizarComparar); }

function atualizarComparar() {
  pendenteK = false;
  if (abaAtual !== 'comparar' || !$('k-fam')) return;
  const fam = Number($('k-fam').value), tma = Number($('k-tma').value) / 100, hor = Number($('k-hor').value);
  $('k-fam-v').textContent = String(fam);
  $('k-tma-v').textContent = `${num2.format(tma * 100)}% ao ano`;
  $('k-hor-v').textContent = `${hor} meses`;
  const linhas = [];
  const a = simular(dados, { pontos: 30, funcionarios: 1, diasMes: 26, tmaAa: tma, horizonte: hor, margemPonto: null }, 1500);
  const eqA = a.equilibrioPontos.p50;
  linhas.push({ nome: 'A · Garrafa para revenda', dem: '30 pontos de venda', vpl: a.vpl.p50, neg: a.probVplNegativo, reg: a.lucroRegime.p50, eq: Number.isFinite(eqA) ? `${num0.format(Math.ceil(eqA))} pontos` : 'não fecha', pb: a.probRecupera >= 0.5 ? `${num0.format(a.payback.p50)} meses` : 'não se paga', inv: a.investimento.p50 });
  for (const c of dados.cenarios) {
    const ctl = { demanda: c.demanda.padrao, funcionarios: 1, familia: fam, diasMes: 26, tmaAa: tma, horizonte: hor };
    const r = simularCen(dados, c, ctl, 1500);
    const eq = r.equilibrioVendasDia.p50;
    linhas.push({ nome: `${c.letra} · ${c.curto}`, dem: `${c.demanda.padrao} ${c.unidade_plural}/dia`, vpl: r.vpl.p50, neg: r.probVplNegativo, reg: r.lucroRegime.p50, eq: Number.isFinite(eq) ? `${num0.format(Math.ceil(eq))} ${c.unidade_plural}/dia` : 'não fecha', pb: r.probRecupera >= 0.5 ? `${num0.format(r.payback.p50)} meses` : 'não se paga', inv: r.investimento.p50 });
  }
  $('k-tabela').innerHTML = '<table><thead><tr><th>Cenário</th><th>Volume usado</th><th>VPL mediano</th><th>Chance de VPL negativo</th><th>Lucro mensal em regime</th><th>Empate</th><th>Payback</th><th>Investimento</th></tr></thead><tbody>' +
    linhas.map((l) => `<tr><td><strong>${esc(l.nome)}</strong></td><td class="num">${esc(l.dem)}</td><td class="num${l.vpl < 0 ? ' neg' : ''}">${brl0.format(l.vpl)}</td><td class="num">${pct0(l.neg)}</td><td class="num${l.reg < 0 ? ' neg' : ''}">${brl0.format(l.reg)}</td><td class="num">${esc(l.eq)}</td><td class="num">${esc(l.pb)}</td><td class="num">${brl0.format(l.inv)}</td></tr>`).join('') + '</tbody></table>';
  $('k-nota').textContent = 'O volume padrão de cada cenário é um palpite, não um dado medido: o que esta tabela mostra com mais firmeza é o empate (quanto precisa vender). O Cenário A ainda traz a energia dentro dos insumos de R$ 0,50 por litro; nos demais ela é explícita. Preço, demanda, aluguel e investimento dos cenários B a E têm baixa confiança.';
}

/* ---------- Início ---------- */
async function iniciar() {
  try {
    const resp = await fetch('data/dados.json');
    if (!resp.ok) throw new Error(resp.status);
    dados = await resp.json();
  } catch (e) { return; }
  montarAbas();
  const h = (location.hash || '').replace('#', '');
  const valida = h === 'comparar' || (h && cenarioPorLetra(h));
  irPara(valida ? h : 'A');
  let largura = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === largura) return;
    largura = window.innerWidth;
    if (abaAtual !== 'A' && abaAtual !== 'comparar') agendarCen();
  });
}
iniciar();
