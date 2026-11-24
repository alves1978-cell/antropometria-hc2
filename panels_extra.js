/**
 * SUB-PAINÉIS INTERATIVOS AVANÇADOS — Antropometria HC II (v2.1.0)
 * 1) Evolução na Internação (Trajetória Longitudinal)
 * 2) Sarcopenia & Rastreio (EWGSOP2 + Meta Interativa)
 * 3) Qualidade & Governança (Ciclo 10d, 48h, Completude e Demanda Semanal)
 * 4) Comparador Lado a Lado (Setor×Setor, Faixa, Sexo, Tipo, Período)
 */
window.PanelsExtra = (function () {
  'use strict';

  const ui = {
    sarcMeta: 50,
    compMode: 'setor', // 'setor' | 'faixa' | 'sexo' | 'tipo' | 'periodo'
    compA: 'ONCO',
    compB: 'GINECO'
  };

  function normSetor(s) {
    const t = String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!t) return 'GINECO';
    if (t.indexOf('GINECO') >= 0 && (t.indexOf('ONCO') >= 0 || t.indexOf('OVARIO') >= 0)) return 'GINECO/ONCO';
    if (t.indexOf('ONCO') >= 0) return 'ONCO';
    if (t.indexOf('MASSA') >= 0) return 'MASSA PÉLVICA';
    if (t.indexOf('TOC') >= 0) return 'TOC';
    return 'GINECO';
  }

  function daysBetween(isoA, isoB) {
    if (!isoA || !isoB) return null;
    const a = new Date(isoA + 'T12:00:00');
    const b = new Date(isoB + 'T12:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }

  function isDepletedMuscle(r) {
    const cb = r.cb && r.cb.indexOf('Depleção') === 0;
    const cmb = r.cmb && r.cmb.indexOf('Depleção') === 0;
    const cp = r.cp === 'Massa muscular reduzida';
    return Boolean(cb || cmb || cp);
  }

  function fmtDelta(val, unit) {
    if (val == null || isNaN(val)) return '—';
    const sign = val > 0.05 ? '+' : '';
    return sign + window.Dash.fmt1(val) + (unit || '');
  }

  /* ==========================================================================
     1. EVOLUÇÃO NA INTERNAÇÃO (TRAJETÓRIA LONGITUDINAL)
     ========================================================================== */
  function renderEvolucao(ctx) {
    const wrap = document.getElementById('subpanel-evolucao');
    if (!wrap) return;
    const { fmt1, fmt0, pctOf, mean, showTip, hideTip } = window.Dash;
    // Para trajetória longitudinal usamos TODAS as avaliações filtradas (não só 1 por paciente)
    const rows = ctx.allFilteredRows;
    const pacMap = new Map((ctx.pacientes || []).map((p) => [p.mat, p]));
    const alMap = new Map((ctx.alertas || []).map((a) => [a.mat, a]));

    if (!rows.length) {
      wrap.innerHTML = '<div class="card"><div class="list-empty">Nenhuma avaliação corresponde aos filtros selecionados.</div></div>';
      return;
    }

    // Agrupa avaliações cronologicamente por paciente
    const byMat = new Map();
    rows.forEach((r) => {
      if (!byMat.has(r.mat)) byMat.set(r.mat, []);
      byMat.get(r.mat).push(r);
    });

    const multi = [];
    byMat.forEach((list, mat) => {
      list.sort((a, b) => a.d.localeCompare(b.d));
      const p = pacMap.get(mat) || {};
      const al = alMap.get(mat) || {};
      const first = list[0];
      const last = list[list.length - 1];
      if (list.length >= 2) {
        const dImc = (first.imc != null && last.imc != null) ? (last.imc - first.imc) : null;
        multi.push({ mat, list, first, last, dImc, pac: p, al });
      }
    });

    const comTend = rows.filter((r) => r.tend != null);
    const perdaInt = comTend.filter((r) => r.tend === 'Perda leve' || r.tend === 'PERDA GRAVE na internação').length;
    const perdaGrave = comTend.filter((r) => r.tend === 'PERDA GRAVE na internação').length;
    const estabOuGanho = comTend.filter((r) => r.tend === 'Estável' || r.tend === 'Ganho ponderal').length;
    const meanDImc = mean(multi.map((m) => m.dImc).filter((v) => v != null));

    // Matriz de transição de IMC (1ª -> última)
    const grpOrder = ['deficit', 'neutro', 'excesso'];
    const grpLabel = { deficit: 'Déficit', neutro: 'Eutrofia', excesso: 'Excesso' };
    const trans = {};
    grpOrder.forEach((a) => { trans[a] = { deficit: 0, neutro: 0, excesso: 0 }; });
    let transN = 0;
    multi.forEach((m) => {
      if (m.first.imcGrp && m.last.imcGrp) {
        trans[m.first.imcGrp][m.last.imcGrp]++;
        transN++;
      }
    });

    // Scatter Dias de internação × Variação ponderal (%) ou Δ IMC
    const scatterPts = [];
    byMat.forEach((list, mat) => {
      const p = pacMap.get(mat);
      const al = alMap.get(mat);
      const last = list[list.length - 1];
      const dias = p && p.diasInt != null ? p.diasInt : daysBetween(p && p.intern, last.d);
      const varPct = al && al.varPct != null ? al.varPct : (list.length >= 2 && list[0].imc > 0 && last.imc != null ? ((last.imc - list[0].imc) / list[0].imc) * 100 : null);
      if (dias != null && dias >= 0 && varPct != null) {
        scatterPts.push({
          mat,
          nome: (p && p.nome) || (al && al.nome) || mat,
          setor: last.st,
          dias,
          varPct,
          tend: last.tend || (al && al.tendencia) || '—'
        });
      }
    });

    // Permanência por faixas
    const buckets = [
      { lbl: '≤ 7 dias', min: 0, max: 7, items: [] },
      { lbl: '8 a 14 dias', min: 8, max: 14, items: [] },
      { lbl: '15 a 30 dias', min: 15, max: 30, items: [] },
      { lbl: '> 30 dias', min: 31, max: 99999, items: [] }
    ];
    byMat.forEach((list, mat) => {
      const p = pacMap.get(mat);
      const last = list[list.length - 1];
      const dias = p && p.diasInt != null ? p.diasInt : daysBetween(p && p.intern, last.d);
      if (dias == null || dias < 0) return;
      const b = buckets.find((bk) => dias >= bk.min && dias <= bk.max);
      if (b) b.items.push(last);
    });

    wrap.innerHTML = `
      <section>
        <div class="section-head">
          <div>
            <p class="section-kicker">Trajetória longitudinal · 1ª → Última avaliação</p>
            <h2>Evolução Nutricional durante a Internação</h2>
          </div>
          <p class="section-note">Cruza avaliações sequenciais do mesmo paciente com o tempo de permanência hospitalar.</p>
        </div>
        <div class="kpi-grid">
          <div class="card kpi-tile accent">
            <p class="kpi-label">Pacientes com seguimento</p>
            <p class="kpi-value"><span class="v">${fmt0(multi.length)}</span><small>de ${fmt0(byMat.size)}</small></p>
            <p class="kpi-sub">${fmt1(pctOf(multi.length, byMat.size))}% com 2 ou mais avaliações no recorte</p>
          </div>
          <div class="card kpi-tile accent">
            <p class="kpi-label">Estabilidade ou ganho</p>
            <p class="kpi-value"><span class="v">${comTend.length ? fmt1(pctOf(estabOuGanho, comTend.length)) : '—'}</span><small>%</small></p>
            <p class="kpi-sub">${estabOuGanho} de ${comTend.length} avaliações com tendência</p>
          </div>
          <div class="card kpi-tile crit">
            <p class="kpi-label">Perda ponderal na internação</p>
            <p class="kpi-value"><span class="v">${comTend.length ? fmt1(pctOf(perdaInt, comTend.length)) : '—'}</span><small>%</small></p>
            <p class="kpi-sub">${perdaInt} com perda (${perdaGrave} grave)</p>
          </div>
          <div class="card kpi-tile ${meanDImc != null && meanDImc < -0.5 ? 'warn' : 'accent'}">
            <p class="kpi-label">Variação média de IMC</p>
            <p class="kpi-value"><span class="v">${meanDImc != null ? fmtDelta(meanDImc, '') : '—'}</span><small>kg/m²</small></p>
            <p class="kpi-sub">Média da 1ª para a última avaliação</p>
          </div>
        </div>
      </section>

      <section class="trend-grid">
        <div class="card">
          <p class="chart-title">Tempo de internação × Variação ponderal (%)</p>
          <p class="chart-sub">Cada ponto representa um paciente (toque/passe o mouse para ver detalhes)</p>
          <svg class="chart" id="chart-evo-scatter" viewBox="0 0 580 235"></svg>
          <div class="legend" style="margin-top:6px">
            <span class="item"><span class="sw" style="background:var(--critical)"></span>Perda ≥ 5% (grave)</span>
            <span class="item"><span class="sw" style="background:var(--warning)"></span>Perda leve (1–5%)</span>
            <span class="item"><span class="sw" style="background:var(--good)"></span>Estável / ganho</span>
          </div>
        </div>

        <div class="card">
          <p class="chart-title">Transição de diagnóstico IMC (1ª → Última)</p>
          <p class="chart-sub">Pacientes com ≥ 2 avaliações válidas (n=${transN})</p>
          <div id="evo-trans-matrix"></div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <div>
            <p class="section-kicker">Permanência hospitalar</p>
            <h2>Risco nutricional por tempo de internação</h2>
          </div>
          <p class="section-note">Compara depleção muscular (CB) e perda ponderal conforme os dias internados.</p>
        </div>
        <div class="card" style="padding:16px 18px" id="evo-buckets"></div>
      </section>
    `;

    // Renderiza Scatter SVG
    const svg = document.getElementById('chart-evo-scatter');
    if (!scatterPts.length) {
      svg.outerHTML = '<div class="chart-empty">Sem pacientes com tempo de internação e variação ponderal para plotar nesta seleção.</div>';
    } else {
      const maxDays = Math.max(20, ...scatterPts.map((p) => p.dias));
      const minVar = Math.min(-10, ...scatterPts.map((p) => p.varPct)) - 2;
      const maxVar = Math.max(6, ...scatterPts.map((p) => p.varPct)) + 2;
      const xAt = (d) => 44 + (Math.min(d, maxDays) / maxDays) * 516;
      const yAt = (v) => 200 - ((v - minVar) / Math.max(maxVar - minVar, 1)) * 182;

      let s = '';
      const yTicks = [Math.round(minVar), -5, 0, Math.round(maxVar)];
      yTicks.forEach((v) => {
        const y = yAt(v);
        const cls = v === 0 ? 'baseline' : 'gridline';
        const extra = v === -5 ? ' stroke="var(--critical)" stroke-dasharray="4 3" opacity="0.65"' : '';
        s += `<line class="${v === -5 ? '' : cls}"${extra} x1="44" x2="560" y1="${y}" y2="${y}"/>`;
        s += `<text class="axis-label" x="38" y="${y + 3}" text-anchor="end">${v > 0 ? '+' : ''}${v}%</text>`;
      });
      [0, Math.round(maxDays * 0.25), Math.round(maxDays * 0.5), Math.round(maxDays * 0.75), maxDays].forEach((d) => {
        s += `<text class="axis-label" x="${xAt(d)}" y="222" text-anchor="middle">${d}d</text>`;
      });
      s += `<text class="axis-label" x="558" y="${yAt(-5) - 5}" text-anchor="end" fill="var(--critical)" font-weight="600">limiar perda grave (-5%)</text>`;

      scatterPts.forEach((p, idx) => {
        const cx = xAt(p.dias);
        const cy = yAt(p.varPct);
        const col = p.varPct <= -5 ? 'var(--critical)' : p.varPct < -1 ? 'var(--warning)' : 'var(--good)';
        s += `<circle class="sc-pt" data-i="${idx}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="${col}" fill-opacity="0.85" stroke="#fff" stroke-width="1.5" style="cursor:pointer"/>`;
      });
      svg.innerHTML = s;
      svg.querySelectorAll('.sc-pt').forEach((pt) => {
        const p = scatterPts[+pt.dataset.i];
        pt.addEventListener('pointermove', (ev) => showTip(ev.clientX, ev.clientY, `${p.mat} · ${p.nome} (${p.setor})`, [
          ['Internação', p.dias + ' dias'],
          ['Variação', (p.varPct > 0 ? '+' : '') + fmt1(p.varPct) + '%'],
          ['Tendência', p.tend]
        ]));
        pt.addEventListener('pointerleave', hideTip);
      });
    }

    // Renderiza Matriz de Transição 3×3
    const tmBox = document.getElementById('evo-trans-matrix');
    if (!transN) {
      tmBox.innerHTML = '<div class="chart-empty">É necessário ter pacientes com ≥ 2 avaliações no período filtrado para montar a matriz de transição.</div>';
    } else {
      let html = '<table class="mini-table"><thead><tr><th>1ª \\ Última</th><th>Déficit</th><th>Eutrofia</th><th>Excesso</th></tr></thead><tbody>';
      grpOrder.forEach((rG) => {
        html += `<tr><td><b>${grpLabel[rG]}</b></td>`;
        grpOrder.forEach((cG) => {
          const val = trans[rG][cG];
          const diag = rG === cG;
          const cls = val === 0 ? 'm-zero' : diag ? 'm-diag' : (cG === 'deficit' ? 'm-warn' : 'm-shift');
          html += `<td class="${cls}">${val} <small>(${fmt0(pctOf(val, transN))}%)</small></td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table><p class="a-small a-muted" style="margin:10px 0 0">Células destacadas na diagonal indicam manutenção de faixa; fora da diagonal indicam mudança durante a internação.</p>';
      tmBox.innerHTML = html;
    }

    // Renderiza Faixas de Permanência
    const bkBox = document.getElementById('evo-buckets');
    const hasBk = buckets.some((b) => b.items.length > 0);
    if (!hasBk) {
      bkBox.innerHTML = '<div class="list-empty">Sem dados de tempo de internação vinculados às avaliações filtradas.</div>';
    } else {
      bkBox.innerHTML = buckets.map((b) => {
        const n = b.items.length;
        const dep = b.items.filter((r) => r.cb && r.cb.indexOf('Depleção') === 0).length;
        const per = b.items.filter((r) => r.tend === 'Perda leve' || r.tend === 'PERDA GRAVE na internação').length;
        const pDep = n ? pctOf(dep, n) : 0;
        const pPer = n ? pctOf(per, n) : 0;
        return `
          <div class="perm-row">
            <div class="perm-lbl"><b>${b.lbl}</b><small>n=${n} pacientes</small></div>
            <div class="perm-bars">
              <div class="perm-bar-line">
                <span>Depleção CB</span>
                <div class="bar-track"><div class="bar-fill" style="width:${n ? Math.max(pDep, 2) : 0}%;background:${pDep >= 50 ? 'var(--critical)' : pDep >= 25 ? 'var(--warning)' : 'var(--good)'}"></div></div>
                <b>${n ? fmt1(pDep) + '%' : '—'}</b>
              </div>
              <div class="perm-bar-line">
                <span>Perda ponderal</span>
                <div class="bar-track"><div class="bar-fill" style="width:${n ? Math.max(pPer, 2) : 0}%;background:var(--brand-primary)"></div></div>
                <b>${n ? fmt1(pPer) + '%' : '—'}</b>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  /* ==========================================================================
     2. SARCOPENIA & RASTREIO (EWGSOP2 + META INTERATIVA)
     ========================================================================== */
  function renderSarcopenia(ctx) {
    const wrap = document.getElementById('subpanel-sarcopenia');
    if (!wrap) return;
    const { fmt1, fmt0, pctOf, showTip, hideTip } = window.Dash;
    const rows = ctx.rows;
    const n = rows.length;

    if (!n) {
      wrap.innerHTML = '<div class="card"><div class="list-empty">Nenhuma avaliação corresponde aos filtros selecionados.</div></div>';
      return;
    }

    const prio = rows.filter((r) => r.fx === 'idoso' || isDepletedMuscle(r));
    const sfAp = rows.filter((r) => r.sfAp);
    const sfPos = rows.filter((r) => r.sfPos);
    const fppAp = rows.filter((r) => r.fpp != null);
    const fppRed = rows.filter((r) => r.fpp === 'Força reduzida');
    const muscRed = rows.filter((r) => isDepletedMuscle(r));
    const sarcProv = rows.filter((r) => (r.sfPos || r.fpp === 'Força reduzida') && isDepletedMuscle(r));

    const funnel = [
      { lbl: '1. Amostra filtrada', n: n, pct: 100, col: 'var(--brand-navy)', sub: 'Total no recorte atual' },
      { lbl: '2. Prioritários (≥60 anos ou depleção CB/CP)', n: prio.length, pct: pctOf(prio.length, n), col: 'var(--brand-primary)', sub: 'Público-alvo de rastreio funcional' },
      { lbl: '3. Massa muscular reduzida (CB/CMB/CP)', n: muscRed.length, pct: pctOf(muscRed.length, n), col: 'var(--warning)', sub: 'Sinal antropométrico de depleção' },
      { lbl: '4. SARC-F aplicado', n: sfAp.length, pct: pctOf(sfAp.length, n), col: 'var(--brand-teal)', sub: `${sfPos.length} positivo(s) (≥4)` },
      { lbl: '5. Dinamometria (FPP) aplicada', n: fppAp.length, pct: pctOf(fppAp.length, n), col: '#0284C7', sub: `${fppRed.length} com força reduzida` },
      { lbl: '6. Sarcopenia provável / confirmada', n: sarcProv.length, pct: pctOf(sarcProv.length, n), col: 'var(--critical)', sub: '(SARC-F+ ou FPP reduzida) + Massa reduzida' }
    ];

    const secStats = ctx.snap.SECTORS.filter((s) => ctx.snap.state.setores.has(s)).map((sec) => {
      const list = rows.filter((r) => r.st === sec);
      const idososSec = list.filter((r) => r.fx === 'idoso');
      const baseMeta = idososSec.length ? idososSec : list;
      const rast = baseMeta.filter((r) => r.sfAp || r.fpp != null).length;
      const cob = pctOf(rast, baseMeta.length);
      const dep = pctOf(list.filter((r) => isDepletedMuscle(r)).length, list.length);
      return { sec, n: list.length, baseN: baseMeta.length, isIdosoBase: idososSec.length > 0, cob, dep };
    });

    // Obesidade sarcopênica por subgrupo
    const groups = [
      { lbl: 'Idosos (≥60 anos)', list: rows.filter((r) => r.fx === 'idoso') },
      { lbl: 'Adultos (20–59)', list: rows.filter((r) => r.fx === 'adulto') },
      { lbl: 'Sexo Feminino', list: rows.filter((r) => r.sx === 'F') },
      { lbl: 'Sexo Masculino', list: rows.filter((r) => r.sx === 'M') }
    ].map((g) => {
      const valid = g.list.filter((r) => r.imcGrp && (r.cb != null || r.cp != null));
      const os = valid.filter((r) => r.imcGrp === 'excesso' && isDepletedMuscle(r)).length;
      return { lbl: g.lbl, n: valid.length, os, pct: pctOf(os, valid.length) };
    });

    wrap.innerHTML = `
      <section>
        <div class="section-head">
          <div>
            <p class="section-kicker">Protocolo EWGSOP2 · Rastreio funcional e massa muscular</p>
            <h2>Funil de Sarcopenia &amp; Cobertura por Setor</h2>
          </div>
          <div class="chip-group" id="sarc-meta-chips">
            ${[30, 50, 80].map((m) => `<button type="button" class="chip ${ui.sarcMeta === m ? 'active' : 'all-included'}" data-meta="${m}">Meta rastreio: ${m}%</button>`).join('')}
          </div>
        </div>
        <div class="trend-grid">
          <div class="card">
            <p class="chart-title">Funil de Rastreio EWGSOP2</p>
            <p class="chart-sub">Do total avaliado até a confirmação funcional (SARC-F + FPP + Massa muscular)</p>
            <div id="sarc-funnel"></div>
          </div>
          <div class="card">
            <p class="chart-title">Cobertura SARC-F / FPP por setor vs. Meta (${ui.sarcMeta}%)</p>
            <p class="chart-sub">Prioriza idosos (≥60) quando presentes no setor; linha vertical indica a meta</p>
            <div id="sarc-sector-bars"></div>
          </div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <div>
            <p class="section-kicker">Estratificação de risco</p>
            <h2>Obesidade Sarcopênica Provável por Faixa e Sexo</h2>
          </div>
          <p class="section-note">Prevalência de Excesso de peso (IMC) simultâneo a depleção muscular (CB/CP).</p>
        </div>
        <div class="kpi-grid">
          ${groups.map((g) => `
            <div class="card kpi-tile ${g.pct != null && g.pct >= 30 ? 'crit' : 'accent'}">
              <p class="kpi-label">${g.lbl}</p>
              <p class="kpi-value"><span class="v">${g.pct != null ? fmt1(g.pct) : '—'}</span><small>%</small></p>
              <p class="kpi-sub">${g.n ? `${g.os} de ${g.n} com IMC + CB/CP medidos` : 'sem medições'}</p>
            </div>
          `).join('')}
        </div>
      </section>
    `;

    // Bind meta chips
    wrap.querySelectorAll('#sarc-meta-chips button').forEach((b) => {
      b.addEventListener('click', () => {
        ui.sarcMeta = Number(b.dataset.meta);
        renderSarcopenia(ctx);
      });
    });

    // Renderiza Funil
    const fBox = document.getElementById('sarc-funnel');
    funnel.forEach((st) => {
      const row = document.createElement('div');
      row.className = 'funnel-row';
      const w = st.pct != null ? Math.max(st.pct, st.n > 0 ? 3 : 0) : 0;
      row.innerHTML = `
        <div class="funnel-head"><span><b>${st.lbl}</b> <small>${st.sub}</small></span><b>${fmt0(st.n)} (${fmt1(st.pct)}%)</b></div>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${st.col}"></div></div>
      `;
      row.addEventListener('pointermove', (ev) => showTip(ev.clientX, ev.clientY, st.lbl, [['Registros', fmt0(st.n)], ['% da amostra', fmt1(st.pct) + '%'], ['Detalhe', st.sub]]));
      row.addEventListener('pointerleave', hideTip);
      fBox.appendChild(row);
    });

    // Renderiza Cobertura vs Meta por Setor
    const sBox = document.getElementById('sarc-sector-bars');
    secStats.forEach((s) => {
      const hit = s.cob != null && s.cob >= ui.sarcMeta;
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <span class="name"><b>${s.sec}</b><br><small style="color:var(--ink-muted)">${s.isIdosoBase ? 'Idosos' : 'Geral'} (n=${s.baseN}) · dep. ${fmt1(s.dep)}%</small></span>
        <div class="bar-track">
          <div class="meta-line" style="left:${ui.sarcMeta}%" title="Meta: ${ui.sarcMeta}%"></div>
          <div class="bar-fill" style="width:${s.cob != null ? Math.max(s.cob, s.cob > 0 ? 2 : 0) : 0}%;background:${hit ? 'var(--good)' : s.cob >= ui.sarcMeta * 0.5 ? 'var(--warning)' : 'var(--critical)'}"></div>
        </div>
        <span class="val">${s.cob != null ? fmt1(s.cob) + '%' : '—'}<span class="n">${hit ? 'na meta' : 'abaixo'}</span></span>
      `;
      sBox.appendChild(row);
    });
  }

  /* ==========================================================================
     3. QUALIDADE & GOVERNANÇA (48H, CICLO 10D, COMPLETUDE, DEMANDA SEMANAL)
     ========================================================================== */
  function renderQualidade(ctx) {
    const wrap = document.getElementById('subpanel-qualidade');
    if (!wrap) return;
    const { fmt1, fmt0, pctOf, mean, showTip, hideTip } = window.Dash;
    const rows = ctx.allFilteredRows;
    const alertas = ctx.alertas || [];
    const pacientes = ctx.pacientes || [];

    // 1) 1ª avaliação em até 48h da internação (usando PACIENTES)
    const pacAtivosNoFiltro = pacientes.filter((p) => ctx.snap.state.setores.has(normSetor(p.setor)));
    const comInternEPrim = pacAtivosNoFiltro.filter((p) => p.intern && p.prim);
    const dentro48h = comInternEPrim.filter((p) => {
      const d = daysBetween(p.intern, p.prim);
      return d != null && d >= 0 && d <= 2;
    });

    // 2) Ciclo 10 dias (CONTROLE REAVALIAÇÃO)
    const alFiltrados = alertas.filter((a) => ctx.snap.state.setores.has(a.setorNorm || normSetor(a.setor)));
    const emDiaTotal = alFiltrados.filter((a) => a.tipo !== 'atrasada').length;
    const atraso30 = alFiltrados.filter((a) => a.tipo === 'atrasada' && a.dias != null && Math.abs(a.dias) > 30).length;

    // 3) Completude dos indicadores
    const n = rows.length;
    const completude = [
      { nome: 'IMC calculado (Peso + Estatura/Chumlea)', ok: rows.filter((r) => r.imc != null).length, den: n },
      { nome: 'Circunferência do Braço (CB)', ok: rows.filter((r) => r.cb != null).length, den: n },
      { nome: 'Circunferência da Panturrilha (CP)', ok: rows.filter((r) => r.cp != null).length, den: n },
      { nome: 'Prega Cutânea Tricipital (PCT / DCT)', ok: rows.filter((r) => r.dct != null).length, den: n },
      { nome: 'Circunferência Muscular do Braço (CMB)', ok: rows.filter((r) => r.cmb != null).length, den: n },
      { nome: 'Perda de peso (%PP) com tempo informado', ok: rows.filter((r) => r.pp != null && r.pp !== 'Informe o tempo da perda (dias) para classificar').length, den: n },
      { nome: 'Raça / cor no cadastro (p/ Chumlea)', ok: pacAtivosNoFiltro.filter((p) => p.raca && p.raca !== 'Não informada').length, den: pacAtivosNoFiltro.length },
      { nome: 'Dinamometria (FPP)', ok: rows.filter((r) => r.fpp != null).length, den: n },
      { nome: 'Questionário SARC-F', ok: rows.filter((r) => r.sfAp).length, den: n }
    ].map((c) => Object.assign(c, { pct: pctOf(c.ok, c.den) }));

    const compMedia = mean(completude.slice(0, 6).map((c) => c.pct).filter((v) => v != null));

    // 4) Aderência por Setor
    const secAder = ctx.snap.SECTORS.filter((s) => ctx.snap.state.setores.has(s)).map((sec) => {
      const list = alFiltrados.filter((a) => (a.setorNorm || normSetor(a.setor)) === sec);
      const ok = list.filter((a) => a.tipo !== 'atrasada').length;
      return { sec, total: list.length, ok, atrasados: list.length - ok, pct: pctOf(ok, list.length) };
    });

    // 5) Demanda por dia da semana
    const dowLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];
    rows.forEach((r) => {
      const dt = new Date(r.d + 'T12:00:00');
      if (!isNaN(dt.getTime())) {
        const idx = (dt.getDay() + 6) % 7;
        dowCounts[idx]++;
      }
    });

    wrap.innerHTML = `
      <section>
        <div class="section-head">
          <div>
            <p class="section-kicker">Governança clínica &amp; indicadores de processo</p>
            <h2>Qualidade do Registro e Aderência ao Protocolo</h2>
          </div>
          <p class="section-note">Monitora prazo de 48h na admissão, ciclo de reavaliação de 10 dias e completude dos campos.</p>
        </div>
        <div class="kpi-grid">
          <div class="card kpi-tile ${pctOf(dentro48h.length, comInternEPrim.length) >= 70 ? 'accent' : 'warn'}">
            <p class="kpi-label">1ª avaliação em até 48h</p>
            <p class="kpi-value"><span class="v">${comInternEPrim.length ? fmt1(pctOf(dentro48h.length, comInternEPrim.length)) : '—'}</span><small>%</small></p>
            <p class="kpi-sub">${dentro48h.length} de ${comInternEPrim.length} pacientes com data de internação</p>
          </div>
          <div class="card kpi-tile ${pctOf(emDiaTotal, alFiltrados.length) >= 75 ? 'accent' : 'crit'}">
            <p class="kpi-label">Ciclo de 10 dias em dia</p>
            <p class="kpi-value"><span class="v">${alFiltrados.length ? fmt1(pctOf(emDiaTotal, alFiltrados.length)) : '—'}</span><small>%</small></p>
            <p class="kpi-sub">${emDiaTotal} de ${alFiltrados.length} internados sem atraso</p>
          </div>
          <div class="card kpi-tile accent">
            <p class="kpi-label">Completude antropométrica</p>
            <p class="kpi-value"><span class="v">${compMedia != null ? fmt1(compMedia) : '—'}</span><small>%</small></p>
            <p class="kpi-sub">Média dos 6 indicadores antropométricos base</p>
          </div>
          <div class="card kpi-tile ${atraso30 > 0 ? 'warn' : 'accent'}">
            <p class="kpi-label">Atraso &gt; 30 dias (checar alta)</p>
            <p class="kpi-value"><span class="v">${fmt0(atraso30)}</span><small>pac.</small></p>
            <p class="kpi-sub">Use "Registrar alta" em Hoje para higienizar a fila</p>
          </div>
        </div>
      </section>

      <section class="trend-grid">
        <div class="card">
          <p class="chart-title">Aderência ao ciclo de 10 dias por setor</p>
          <p class="chart-sub">% de pacientes internados sem atraso na reavaliação</p>
          <div id="qual-ciclo-bars"></div>
        </div>
        <div class="card">
          <p class="chart-title">Demanda de avaliações por dia da semana</p>
          <p class="chart-sub">Distribuição de volume para apoiar a escala da equipe (n=${fmt0(n)})</p>
          <svg class="chart" id="chart-qual-dow" viewBox="0 0 460 215"></svg>
        </div>
      </section>

      <section>
        <div class="section-head">
          <div>
            <p class="section-kicker">Higiene de dados</p>
            <h2>Taxa de Preenchimento por Indicador</h2>
          </div>
          <p class="section-note">Verde ≥ 80% · Âmbar 40–79% · Vermelho &lt; 40%.</p>
        </div>
        <div class="card" style="padding:16px 18px" id="qual-comp-bars"></div>
      </section>
    `;

    // Aderência por setor
    const cBox = document.getElementById('qual-ciclo-bars');
    if (!alFiltrados.length) {
      cBox.innerHTML = '<div class="list-empty">Sem pacientes internados ativos nos setores filtrados.</div>';
    } else {
      secAder.forEach((s) => {
        const col = s.pct == null ? 'var(--grid)' : s.pct >= 80 ? 'var(--good)' : s.pct >= 50 ? 'var(--warning)' : 'var(--critical)';
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
          <span class="name"><b>${s.sec}</b><br><small style="color:var(--ink-muted)">${s.ok} em dia · ${s.atrasados} atras.</small></span>
          <div class="bar-track"><div class="bar-fill" style="width:${s.pct != null ? Math.max(s.pct, 2) : 0}%;background:${col}"></div></div>
          <span class="val">${s.pct != null ? fmt1(s.pct) + '%' : '—'}<span class="n">n=${s.total}</span></span>
        `;
        cBox.appendChild(row);
      });
    }

    // Demanda por dia da semana (SVG)
    const svg = document.getElementById('chart-qual-dow');
    const maxDow = Math.max(...dowCounts, 1);
    const yAt = (v) => 182 - (v / (maxDow * 1.18)) * 160;
    let out = '';
    [0, Math.round(maxDow / 2), maxDow].forEach((v) => {
      const y = yAt(v);
      out += `<line class="gridline" x1="30" x2="446" y1="${y}" y2="${y}"/>`;
      out += `<text class="axis-label" x="24" y="${y + 3}" text-anchor="end">${v}</text>`;
    });
    out += `<line class="baseline" x1="30" x2="446" y1="${yAt(0)}" y2="${yAt(0)}"/>`;
    dowCounts.forEach((cnt, i) => {
      const bw = 38;
      const cx = 30 + ((i + 0.5) / 7) * 416;
      const y = yAt(cnt);
      const h = Math.max(yAt(0) - y, cnt > 0 ? 3 : 0);
      const isPeak = cnt === maxDow && cnt > 0;
      out += `<rect class="dow-hit" data-i="${i}" x="${cx - bw / 2 - 4}" y="12" width="${bw + 8}" height="170" fill="transparent" style="cursor:pointer"/>`;
      out += `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="5" fill="${isPeak ? 'var(--brand-navy)' : 'var(--brand-primary)'}" opacity="${isPeak ? '1' : '0.82'}"/>`;
      out += `<text class="axis-label" x="${cx}" y="${y - 6}" text-anchor="middle" font-weight="700" fill="var(--ink-1)">${cnt}</text>`;
      out += `<text class="axis-label" x="${cx}" y="202" text-anchor="middle" font-weight="${isPeak ? '700' : '500'}">${dowLabels[i]}</text>`;
    });
    svg.innerHTML = out;
    svg.querySelectorAll('.dow-hit').forEach((hit) => {
      const i = +hit.dataset.i;
      hit.addEventListener('pointermove', (ev) => showTip(ev.clientX, ev.clientY, dowLabels[i], [
        ['Avaliações', fmt0(dowCounts[i])],
        ['% do total', fmt1(pctOf(dowCounts[i], n)) + '%']
      ]));
      hit.addEventListener('pointerleave', hideTip);
    });

    // Completude
    const compBox = document.getElementById('qual-comp-bars');
    completude.forEach((c) => {
      const col = c.pct == null ? 'var(--grid)' : c.pct >= 80 ? 'var(--good)' : c.pct >= 40 ? 'var(--warning)' : 'var(--critical)';
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <span class="name">${c.nome}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${c.pct != null ? Math.max(c.pct, 1.5) : 0}%;background:${col}"></div></div>
        <span class="val">${c.pct != null ? fmt1(c.pct) + '%' : '—'}<span class="n">${c.ok}/${c.den}</span></span>
      `;
      compBox.appendChild(row);
    });
  }

  /* ==========================================================================
     4. COMPARADOR LADO A LADO (SETOR, FAIXA, SEXO, TIPO, PERÍODO)
     ========================================================================== */
  function calcGroupMetrics(list) {
    const { pctOf, mean } = window.Dash;
    const n = list.length;
    const pacs = new Set(list.map((r) => r.mat)).size;
    const imcs = list.map((r) => r.imc).filter((v) => v != null);
    const validOS = list.filter((r) => r.imcGrp && (r.cb != null || r.cp != null));
    const osCnt = validOS.filter((r) => r.imcGrp === 'excesso' && isDepletedMuscle(r)).length;
    const comTend = list.filter((r) => r.tend != null);
    const perInt = comTend.filter((r) => r.tend === 'Perda leve' || r.tend === 'PERDA GRAVE na internação').length;
    return {
      n, pacs,
      imcMedio: mean(imcs),
      excesso: pctOf(list.filter((r) => r.imcGrp === 'excesso').length, n),
      deficit: pctOf(list.filter((r) => r.imcGrp === 'deficit').length, n),
      depCB: pctOf(list.filter((r) => r.cb && r.cb.indexOf('Depleção') === 0).length, n),
      depCP: pctOf(list.filter((r) => r.cp === 'Massa muscular reduzida').length, n),
      obesSarc: pctOf(osCnt, validOS.length),
      perdaInt: pctOf(perInt, comTend.length),
      cobSF: pctOf(list.filter((r) => r.sfAp).length, n),
      cobFPP: pctOf(list.filter((r) => r.fpp != null).length, n)
    };
  }

  function renderComparador(ctx) {
    const wrap = document.getElementById('subpanel-comparador');
    if (!wrap) return;
    const { fmt1, fmt0 } = window.Dash;
    const base = ctx.rows;
    const allBase = ctx.rawRows;
    const sectors = ctx.snap.SECTORS;

    let labelA = '', labelB = '', listA = [], listB = [];
    if (ui.compMode === 'setor') {
      labelA = ui.compA;
      labelB = ui.compB;
      listA = allBase.filter((r) => r.d >= ctx.snap.state.dateStart && r.d <= ctx.snap.state.dateEnd && r.st === ui.compA);
      listB = allBase.filter((r) => r.d >= ctx.snap.state.dateStart && r.d <= ctx.snap.state.dateEnd && r.st === ui.compB);
    } else if (ui.compMode === 'faixa') {
      labelA = 'Idosos (≥60 anos)';
      labelB = 'Adultos (20–59 anos)';
      listA = base.filter((r) => r.fx === 'idoso');
      listB = base.filter((r) => r.fx === 'adulto');
    } else if (ui.compMode === 'sexo') {
      labelA = 'Feminino';
      labelB = 'Masculino';
      listA = base.filter((r) => r.sx === 'F');
      listB = base.filter((r) => r.sx === 'M');
    } else if (ui.compMode === 'tipo') {
      labelA = 'Avaliação Inicial';
      labelB = 'Reavaliação';
      listA = base.filter((r) => r.tp === 'Inicial');
      listB = base.filter((r) => r.tp === 'Reavaliação');
    } else {
      // Período: últimos 30 dias vs 30 dias anteriores
      const hoje = ctx.snap.meta.hoje || (allBase.length ? allBase[allBase.length - 1].d : '2026-11-18');
      const add = (iso, d) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
      const sA = add(hoje, -29), eA = hoje;
      const eB = add(sA, -1), sB = add(eB, -29);
      labelA = `Últimos 30d (${sA.slice(8)}/${sA.slice(5, 7)}–${eA.slice(8)}/${eA.slice(5, 7)})`;
      labelB = `30d anteriores (${sB.slice(8)}/${sB.slice(5, 7)}–${eB.slice(8)}/${eB.slice(5, 7)})`;
      listA = allBase.filter((r) => r.d >= sA && r.d <= eA && ctx.snap.state.setores.has(r.st));
      listB = allBase.filter((r) => r.d >= sB && r.d <= eB && ctx.snap.state.setores.has(r.st));
    }

    const mA = calcGroupMetrics(listA);
    const mB = calcGroupMetrics(listB);

    const metrics = [
      { k: 'imcMedio', lbl: 'IMC médio (kg/m²)', unit: '', max: 40 },
      { k: 'excesso',  lbl: 'Excesso de peso', unit: '%', max: 100 },
      { k: 'deficit',  lbl: 'Déficit de peso', unit: '%', max: 100 },
      { k: 'depCB',    lbl: 'Depleção muscular (CB)', unit: '%', max: 100 },
      { k: 'depCP',    lbl: 'Massa muscular reduzida (CP)', unit: '%', max: 100 },
      { k: 'obesSarc', lbl: 'Obesidade sarcopênica provável', unit: '%', max: 100 },
      { k: 'perdaInt', lbl: 'Perda ponderal na internação', unit: '%', max: 100 },
      { k: 'cobSF',    lbl: 'Cobertura SARC-F', unit: '%', max: 100 },
      { k: 'cobFPP',   lbl: 'Cobertura força (FPP)', unit: '%', max: 100 }
    ];

    const modes = [
      ['setor', 'Setor × Setor'],
      ['faixa', 'Idosos × Adultos'],
      ['sexo', 'Feminino × Masculino'],
      ['tipo', 'Inicial × Reavaliação'],
      ['periodo', 'Últimos 30d × 30d ant.']
    ];

    wrap.innerHTML = `
      <section>
        <div class="section-head">
          <div>
            <p class="section-kicker">Análise comparativa · A vs. B</p>
            <h2>Comparador Interativo Lado a Lado</h2>
          </div>
          <p class="section-note">Compare indicadores nutricionais entre clínicas, faixas etárias ou períodos.</p>
        </div>

        <div class="card" style="padding:16px 18px;margin-bottom:16px">
          <div class="chip-group" id="comp-mode-chips" style="margin-bottom:${ui.compMode === 'setor' ? '12px' : '0'}">
            ${modes.map(([k, lbl]) => `<button type="button" class="chip ${ui.compMode === k ? 'active' : 'all-included'}" data-m="${k}">${lbl}</button>`).join('')}
          </div>
          ${ui.compMode === 'setor' ? `
            <div class="comp-selects">
              <div class="f-field" style="margin:0">
                <label>Lado A (Azul INCA)</label>
                <select class="f-in" id="comp-sel-a">${sectors.map((s) => `<option value="${s}" ${s === ui.compA ? 'selected' : ''}>${s}</option>`).join('')}</select>
              </div>
              <div class="comp-vs">vs.</div>
              <div class="f-field" style="margin:0">
                <label>Lado B (Teal SUS)</label>
                <select class="f-in" id="comp-sel-b">${sectors.map((s) => `<option value="${s}" ${s === ui.compB ? 'selected' : ''}>${s}</option>`).join('')}</select>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="comp-heads">
          <div class="card comp-head-a">
            <span class="a-chip info">Lado A</span>
            <h3>${labelA}</h3>
            <p><b>${fmt0(mA.n)}</b> registros · <b>${fmt0(mA.pacs)}</b> pacientes distintos</p>
          </div>
          <div class="card comp-head-b">
            <span class="a-chip teal">Lado B</span>
            <h3>${labelB}</h3>
            <p><b>${fmt0(mB.n)}</b> registros · <b>${fmt0(mB.pacs)}</b> pacientes distintos</p>
          </div>
        </div>

        <div class="card" style="padding:16px 18px;margin-top:12px">
          ${metrics.map((mt) => {
            const vA = mA[mt.k], vB = mB[mt.k];
            const diff = (vA != null && vB != null) ? (vA - vB) : null;
            const wA = vA != null ? Math.min(100, Math.max((vA / mt.max) * 100, vA > 0 ? 3 : 0)) : 0;
            const wB = vB != null ? Math.min(100, Math.max((vB / mt.max) * 100, vB > 0 ? 3 : 0)) : 0;
            return `
              <div class="comp-row">
                <div class="comp-metric-lbl">${mt.lbl}</div>
                <div class="comp-bars">
                  <div class="comp-side-a">
                    <span class="comp-val">${vA != null ? fmt1(vA) + mt.unit : '—'}</span>
                    <div class="comp-track-a"><div class="comp-fill-a" style="width:${wA}%"></div></div>
                  </div>
                  <div class="comp-delta">${diff != null ? fmtDelta(diff, mt.unit === '%' ? ' p.p.' : '') : '—'}</div>
                  <div class="comp-side-b">
                    <div class="comp-track-b"><div class="comp-fill-b" style="width:${wB}%"></div></div>
                    <span class="comp-val">${vB != null ? fmt1(vB) + mt.unit : '—'}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;

    wrap.querySelectorAll('#comp-mode-chips button').forEach((b) => {
      b.addEventListener('click', () => {
        ui.compMode = b.dataset.m;
        renderComparador(ctx);
      });
    });
    const selA = document.getElementById('comp-sel-a');
    const selB = document.getElementById('comp-sel-b');
    if (selA) selA.addEventListener('change', () => { ui.compA = selA.value; renderComparador(ctx); });
    if (selB) selB.addEventListener('change', () => { ui.compB = selB.value; renderComparador(ctx); });
  }

  function render(subtab, ctx) {
    if (subtab === 'evolucao') renderEvolucao(ctx);
    else if (subtab === 'sarcopenia') renderSarcopenia(ctx);
    else if (subtab === 'qualidade') renderQualidade(ctx);
    else if (subtab === 'comparador') renderComparador(ctx);
  }

  return { render };
})();
