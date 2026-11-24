/**
 * PAINEL NUTRICIONAL — HC II (v2)
 * Casos 2 & 4: Chips de filtro neutros/ativos, alternância Todas vs 1 por paciente,
 * Matriz 2x2 de Obesidade Sarcopênica, comparativo período anterior (▲/▼),
 * gráficos SVG com alerta de amostra pequena (n < 5) e aderência de protocolo por setor.
 */
window.Dash = (function () {
  'use strict';

  const IMC_ORDER = [
    { cat: 'Magreza grau III', grp: 'deficit', sev: 3 },
    { cat: 'Magreza grau II', grp: 'deficit', sev: 2 },
    { cat: 'Magreza grau I', grp: 'deficit', sev: 1 },
    { cat: 'Baixo peso (idoso)', grp: 'deficit', sev: 1 },
    { cat: 'Eutrofia', grp: 'neutro', sev: 0 },
    { cat: 'Sobrepeso (idoso)', grp: 'excesso', sev: 1 },
    { cat: 'Sobrepeso / Pré-obesidade', grp: 'excesso', sev: 1 },
    { cat: 'Obesidade grau I', grp: 'excesso', sev: 2 },
    { cat: 'Obesidade grau II', grp: 'excesso', sev: 3 },
    { cat: 'Obesidade grau III', grp: 'excesso', sev: 4 }
  ];

  const SECTORS = ['GINECO', 'TOC', 'ONCO', 'MASSA PÉLVICA', 'GINECO/ONCO'];
  const SECTOR_VAR = {
    GINECO: '--s1',
    TOC: '--s2',
    ONCO: '--s3',
    'MASSA PÉLVICA': '--s4',
    'GINECO/ONCO': '--s5'
  };
  const SECTOR_CLS = {
    GINECO: 's1',
    TOC: 's2',
    ONCO: 's3',
    'MASSA PÉLVICA': 's4',
    'GINECO/ONCO': 's5'
  };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  let ROWS = [];
  let ALERTAS_ITEMS = [];
  let PACIENTES_LIST = [];
  let PRESETS = [];
  let DASH_RANGE = { start: '0000-01-01', end: '9999-12-31' };
  let LAST_META = { hoje: '', geradoEm: '', pacientes: 0 };

  const state = {
    dateStart: '0000-01-01',
    dateEnd: '9999-12-31',
    preset: 'all',
    unitMode: 'all', // 'all' | 'latest' (1 por paciente)
    subtab: 'geral', // 'geral' | 'evolucao' | 'sarcopenia' | 'qualidade' | 'comparador'
    setores: new Set(SECTORS),
    sexos: new Set(['F', 'M']),
    faixas: new Set(['adulto', 'idoso', 'menor20']),
    tipos: new Set(['Inicial', 'Reavaliação'])
  };

  /* ---- Helpers numéricos / datas ---- */
  const fmt1 = (v) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt0 = (v) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const pctOf = (a, b) => b > 0 ? (a / b) * 100 : null;
  const mean = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
  function stddev(arr) {
    if (arr.length < 2) return null;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (arr.length - 1));
  }
  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function isoAdd(iso, days) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function weekStartOf(iso) {
    const d = new Date(iso + 'T12:00:00');
    const diff = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  }
  function fmtDateBR(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return d + '/' + m;
  }
  function fmtLong(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return Number(d) + ' de ' + MESES[Number(m) - 1] + ' de ' + y;
  }
  function getVar(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  /* ---- Tooltip ---- */
  function showTip(x, y, title, rows) {
    const tip = document.getElementById('tooltip');
    if (!tip) return;
    tip.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'tt-title';
    t.textContent = title;
    tip.appendChild(t);
    rows.forEach(([k, v]) => {
      const r = document.createElement('div');
      r.className = 'tt-row';
      const sk = document.createElement('span');
      sk.className = 'k';
      sk.textContent = k;
      const sv = document.createElement('span');
      sv.className = 'v';
      sv.textContent = v;
      r.appendChild(sk);
      r.appendChild(sv);
      tip.appendChild(r);
    });
    let left = x + 14;
    let top = y + 14;
    if (left + 250 > window.innerWidth) left = x - 250 - 14;
    if (top + 110 > window.innerHeight) top = y - 110 - 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
    tip.classList.add('show');
  }
  function hideTip() {
    const tip = document.getElementById('tooltip');
    if (tip) tip.classList.remove('show');
  }

  /* ---- Filtragem + 1 por paciente + Período anterior ---- */
  function applyFiltersToRange(start, end, unitMode) {
    let list = ROWS.filter((r) =>
      r.d >= start &&
      r.d <= end &&
      state.setores.has(r.st) &&
      state.sexos.has(r.sx) &&
      state.faixas.has(r.fx) &&
      state.tipos.has(r.tp)
    );
    if (unitMode === 'latest') {
      const byMat = new Map();
      list.forEach((r) => {
        const prev = byMat.get(r.mat);
        if (!prev || r.d >= prev.d) byMat.set(r.mat, r);
      });
      list = Array.from(byMat.values()).sort((a, b) => a.d.localeCompare(b.d));
    }
    return list;
  }

  function filteredRows() {
    return applyFiltersToRange(state.dateStart, state.dateEnd, state.unitMode);
  }

  function previousPeriodRows() {
    if (state.preset === 'all') return null;
    const d1 = new Date(state.dateStart + 'T12:00:00');
    const d2 = new Date(state.dateEnd + 'T12:00:00');
    const spanDays = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    const prevEnd = isoAdd(state.dateStart, -1);
    const prevStart = isoAdd(prevEnd, -(spanDays - 1));
    const list = applyFiltersToRange(prevStart, prevEnd, state.unitMode);
    if (!list.length) return null;
    return { start: prevStart, end: prevEnd, rows: list };
  }

  /* ---- Matriz 2x2 Obesidade Sarcopênica (Caso 4) ---- */
  function isMuscleDepleted(r) {
    const cbDep = r.cb && r.cb.indexOf('Depleção') === 0;
    const cpDep = r.cp === 'Massa muscular reduzida';
    return Boolean(cbDep || cpDep);
  }
  function hasMuscleMeasure(r) {
    return r.cb != null || r.cp != null;
  }
  function buildMatrix(rows) {
    const valid = rows.filter((r) => r.imcGrp && hasMuscleMeasure(r));
    const n = valid.length;
    const q = {
      excDep: 0,  // Excesso de peso + Depleção (Obesidade sarcopênica provável)
      excOk: 0,   // Excesso de peso + Massa preservada
      nonDep: 0,  // Déficit/Eutrofia + Depleção
      nonOk: 0    // Déficit/Eutrofia + Massa preservada
    };
    valid.forEach((r) => {
      const exc = r.imcGrp === 'excesso';
      const dep = isMuscleDepleted(r);
      if (exc && dep) q.excDep++;
      else if (exc && !dep) q.excOk++;
      else if (!exc && dep) q.nonDep++;
      else q.nonOk++;
    });
    return { n, q };
  }

  /* ---- Indicadores ---- */
  function buildIndicators(rows) {
    const n = rows.length;
    const cntDep = (k) => rows.filter((r) => r[k] && r[k].indexOf('Depleção') === 0).length;
    const cntGrave = (k) => rows.filter((r) => r[k] === 'Depleção grave (< P5)').length;
    const cntMeas = (k) => rows.filter((r) => r[k] != null).length;

    const list = [
      { nome: 'CB — depleção grave (<P5)', num: cntGrave('cb'), den: n, measured: cntMeas('cb') },
      { nome: 'CB — qualquer depleção (<P25)', num: cntDep('cb'), den: n, measured: cntMeas('cb') },
      { nome: 'DCT — depleção grave (<P5)', num: cntGrave('dct'), den: n, measured: cntMeas('dct') },
      { nome: 'DCT — qualquer depleção (<P25)', num: cntDep('dct'), den: n, measured: cntMeas('dct') },
      { nome: 'CMB — depleção grave (<P5)', num: cntGrave('cmb'), den: n, measured: cntMeas('cmb') },
      { nome: 'CMB — qualquer depleção (<P25)', num: cntDep('cmb'), den: n, measured: cntMeas('cmb') },
      { nome: 'Massa muscular reduzida (CP)', num: rows.filter((r) => r.cp === 'Massa muscular reduzida').length, den: n, measured: cntMeas('cp') },
      { nome: 'FPP — força reduzida', num: rows.filter((r) => r.fpp === 'Força reduzida').length, den: n, measured: cntMeas('fpp') },
      { nome: 'SARC-F positivo', num: rows.filter((r) => r.sfPos).length, den: n, measured: rows.filter((r) => r.sfAp).length },
      { nome: 'Perda de peso (%PP) grave ou significativa', num: rows.filter((r) => r.pp && (r.pp.indexOf('Perda GRAVE') === 0 || r.pp.indexOf('Perda significativa') === 0)).length, den: n, measured: rows.filter((r) => r.pp != null && r.pp !== 'Informe o tempo da perda (dias) para classificar').length },
      { nome: 'Perda de peso durante internação', num: rows.filter((r) => r.tend === 'Perda leve' || r.tend === 'PERDA GRAVE na internação').length, den: n, measured: rows.filter((r) => r.tend != null).length },
      { nome: 'PERDA GRAVE durante internação', num: rows.filter((r) => r.tend === 'PERDA GRAVE na internação').length, den: n, measured: rows.filter((r) => r.tend != null).length },
      { nome: 'Ganho de peso durante internação', num: rows.filter((r) => r.tend === 'Ganho ponderal').length, den: n, measured: rows.filter((r) => r.tend != null).length }
    ];
    list.forEach((item) => {
      item.pct = item.den > 0 ? (item.num / item.den) * 100 : null;
      item.lowN = item.measured < 15;
      item.tier = item.pct == null ? 'good' : item.pct >= 50 ? 'critical' : item.pct >= 25 ? 'warning' : 'good';
    });
    list.sort((a, b) => (a.pct == null && b.pct == null) ? 0 : a.pct == null ? 1 : b.pct == null ? -1 : b.pct - a.pct);
    return list;
  }

  function buildWeeks(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const ws = weekStartOf(r.d);
      if (!map.has(ws)) map.set(ws, []);
      map.get(ws).push(r);
    });
    return Array.from(map.keys()).sort().map((ws) => {
      const list = map.get(ws);
      const n = list.length;
      const exc = list.filter((r) => r.imcGrp === 'excesso').length;
      const cb = list.filter((r) => r.cb && r.cb.indexOf('Depleção') === 0).length;
      const imcs = list.map((r) => r.imc).filter((v) => v != null);
      return {
        ws,
        label: fmtDateBR(ws),
        n,
        smallN: n < 5,
        pctExcesso: pctOf(exc, n),
        pctCB: pctOf(cb, n),
        imcMedio: mean(imcs)
      };
    });
  }

  /* ---- Chips de Filtro (Caso 2: neutro quando todos incluídos, destaque quando filtrado) ---- */
  function buildChips(containerId, items, setRef, opts) {
    opts = opts || {};
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    const allSelected = setRef.size === items.length;

    const tagEl = document.getElementById('tag-' + containerId);
    if (tagEl) {
      tagEl.classList.toggle('hide', allSelected);
      tagEl.textContent = setRef.size + '/' + items.length;
    }

    items.forEach((it) => {
      const on = setRef.has(it.value);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = it.label;

      if (allSelected) {
        btn.className = 'chip all-included';
        if (opts.sectorDot) {
          const dot = document.createElement('span');
          dot.style.cssText = 'display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:var(' + SECTOR_VAR[it.value] + ')';
          btn.prepend(dot);
        }
      } else if (on) {
        btn.className = 'chip active';
        if (opts.sectorDot) {
          btn.style.background = 'var(' + SECTOR_VAR[it.value] + ')';
          btn.style.borderColor = 'var(' + SECTOR_VAR[it.value] + ')';
        }
      } else {
        btn.className = 'chip off';
      }

      btn.addEventListener('click', () => {
        if (allSelected) {
          // Clique no estado "todos incluídos" isola rapidamente aquele item (muito mais intuitivo!)
          setRef.clear();
          setRef.add(it.value);
        } else if (on) {
          if (setRef.size === 1) {
            // Re-clicar o único selecionado restaura todos
            items.forEach((x) => setRef.add(x.value));
          } else {
            setRef.delete(it.value);
          }
        } else {
          setRef.add(it.value);
        }
        buildChips(containerId, items, setRef, opts);
        renderAll();
      });
      wrap.appendChild(btn);
    });
  }

  function buildPresetChips() {
    const wrap = document.getElementById('filter-preset');
    if (!wrap) return;
    wrap.innerHTML = '';
    PRESETS.forEach((pr) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip ' + (state.preset === pr.id ? 'active' : 'all-included');
      btn.textContent = pr.label;
      btn.addEventListener('click', () => {
        state.preset = pr.id;
        state.dateStart = pr.start;
        state.dateEnd = pr.end;
        document.getElementById('date-start').value = pr.start;
        document.getElementById('date-end').value = pr.end;
        buildPresetChips();
        renderAll();
      });
      wrap.appendChild(btn);
    });
  }

  function buildAllChips() {
    buildPresetChips();
    buildChips('filter-setor', SECTORS.map((s) => ({ value: s, label: s })), state.setores, { sectorDot: true });
    buildChips('filter-sexo', [{ value: 'F', label: 'Feminino' }, { value: 'M', label: 'Masculino' }], state.sexos);
    buildChips('filter-faixa', [{ value: 'adulto', label: 'Adultos (20–59)' }, { value: 'idoso', label: 'Idosos (≥60)' }, { value: 'menor20', label: '< 20 anos' }], state.faixas);
    buildChips('filter-tipo', [{ value: 'Inicial', label: 'Inicial' }, { value: 'Reavaliação', label: 'Reavaliação' }], state.tipos);
  }

  /* ---- Renderização KPIs + Delta ---- */
  function makeDeltaBadge(curr, prev, suffix, higherIsWorse) {
    if (curr == null || prev == null) return null;
    const diff = curr - prev;
    if (Math.abs(diff) < 0.05) return { txt: '0,0' + suffix, cls: 'flat' };
    const sign = diff > 0 ? '▲ +' : '▼ ';
    const cls = higherIsWorse ? (diff > 0 ? 'up' : 'down') : 'flat';
    return { txt: sign + fmt1(diff) + suffix, cls };
  }

  function renderKPIs(rows, prevPack) {
    const n = rows.length;
    const pacs = new Set(rows.map((r) => r.mat)).size;
    const reav = rows.filter((r) => r.tp === 'Reavaliação').length;
    const imcs = rows.map((r) => r.imc).filter((v) => v != null);
    const imcM = mean(imcs), imcDP = stddev(imcs), imcMed = median(imcs);
    const exc = rows.filter((r) => r.imcGrp === 'excesso').length;
    const def = rows.filter((r) => r.imcGrp === 'deficit').length;
    const cbM = rows.filter((r) => r.cb != null).length;
    const cbDep = rows.filter((r) => r.cb && r.cb.indexOf('Depleção') === 0).length;
    const cpM = rows.filter((r) => r.cp != null).length;
    const cpRed = rows.filter((r) => r.cp === 'Massa muscular reduzida').length;

    const pRows = prevPack ? prevPack.rows : null;
    const pN = pRows ? pRows.length : 0;
    const pImcM = pRows ? mean(pRows.map((r) => r.imc).filter((v) => v != null)) : null;
    const pExcPct = pRows ? pctOf(pRows.filter((r) => r.imcGrp === 'excesso').length, pN) : null;
    const pDefPct = pRows ? pctOf(pRows.filter((r) => r.imcGrp === 'deficit').length, pN) : null;
    const pCbPct = pRows ? pctOf(pRows.filter((r) => r.cb && r.cb.indexOf('Depleção') === 0).length, pN) : null;
    const pCpPct = pRows ? pctOf(pRows.filter((r) => r.cp === 'Massa muscular reduzida').length, pN) : null;

    const labelUnit = state.unitMode === 'latest' ? 'Pacientes (última aval.)' : 'Avaliações no período';
    const tiles = [
      {
        cls: 'accent', label: labelUnit, value: n > 0 ? fmt0(n) : '—', suffix: '',
        delta: pRows ? makeDeltaBadge(n, pN, '', false) : null,
        sub: n > 0 ? `${pacs} pacientes distintos · ${reav} reavaliações (${fmt1(pctOf(reav, n))}%)` : 'sem dados para os filtros atuais'
      },
      {
        cls: 'accent', label: 'IMC médio', value: imcM != null ? fmt1(imcM) : '—', suffix: 'kg/m²',
        delta: makeDeltaBadge(imcM, pImcM, '', false),
        sub: imcM != null ? `DP ${fmt1(imcDP)} · mediana ${fmt1(imcMed)}` : '—'
      },
      {
        cls: 'crit', label: 'Excesso de peso', value: n > 0 ? fmt1(pctOf(exc, n)) : '—', suffix: '%',
        delta: makeDeltaBadge(pctOf(exc, n), pExcPct, ' p.p.', true),
        sub: n > 0 ? `${exc} com sobrepeso ou obesidade` : '—'
      },
      {
        cls: 'warn', label: 'Déficit de peso', value: n > 0 ? fmt1(pctOf(def, n)) : '—', suffix: '%',
        delta: makeDeltaBadge(pctOf(def, n), pDefPct, ' p.p.', true),
        sub: n > 0 ? `${def} com magreza ou baixo peso` : '—'
      },
      {
        cls: 'crit', label: 'Depleção muscular (CB)', value: n > 0 ? fmt1(pctOf(cbDep, n)) : '—', suffix: '%',
        delta: makeDeltaBadge(pctOf(cbDep, n), pCbPct, ' p.p.', true),
        sub: n > 0 ? `${cbDep} de ${n} (medido em ${cbM})` : 'sem dados'
      },
      {
        cls: 'crit', label: 'Massa muscular reduzida (CP)', value: n > 0 ? fmt1(pctOf(cpRed, n)) : '—', suffix: '%',
        delta: makeDeltaBadge(pctOf(cpRed, n), pCpPct, ' p.p.', true),
        sub: n > 0 ? `${cpRed} de ${n} (medido em ${cpM})` : 'sem dados'
      }
    ];

    const grid = document.getElementById('kpi-grid');
    grid.innerHTML = '';
    tiles.forEach((t) => {
      const el = document.createElement('div');
      el.className = 'card kpi-tile ' + t.cls;
      el.innerHTML = '<p class="kpi-label"></p><p class="kpi-value"><span class="v"></span><small></small></p><p class="kpi-sub"></p>';
      el.querySelector('.kpi-label').textContent = t.label;
      el.querySelector('.kpi-value .v').textContent = t.value;
      el.querySelector('.kpi-value small').textContent = t.suffix;
      if (t.delta) {
        const d = document.createElement('span');
        d.className = 'kpi-delta ' + t.delta.cls;
        d.textContent = t.delta.txt;
        d.title = 'Variação frente ao período anterior equivalente';
        el.querySelector('.kpi-value').appendChild(d);
      }
      el.querySelector('.kpi-sub').textContent = t.sub;
      grid.appendChild(el);
    });

    const idosos = rows.filter((r) => r.fx === 'idoso').length;
    const fem = rows.filter((r) => r.sx === 'F').length;
    const edAsc = rows.filter((r) => r.edm || r.asc).length;
    const sf = rows.filter((r) => r.sfAp).length;
    const fpp = rows.filter((r) => r.fpp != null).length;

    const strip = document.getElementById('kpi-strip');
    strip.innerHTML = '';
    [
      { v: n > 0 ? fmt1(pctOf(idosos, n)) + '%' : '—', l: 'Idosos (≥60 anos)', s: n > 0 ? `${idosos} de ${n}` : '—' },
      { v: n > 0 ? fmt1(pctOf(fem, n)) + '%' : '—', l: 'Sexo feminino', s: n > 0 ? `${fem} de ${n}` : '—' },
      { v: n > 0 ? fmt1(pctOf(edAsc, n)) + '%' : '—', l: 'Com edema/ascite', s: n > 0 ? `${edAsc} registros` : '—' },
      { v: n > 0 ? fmt1(pctOf(sf, n)) + '%' : '—', l: 'Cobertura SARC-F', s: n > 0 ? `${sf} de ${n} rastreados` : '—' },
      { v: n > 0 ? fmt1(pctOf(fpp, n)) + '%' : '—', l: 'Cobertura força (FPP)', s: n > 0 ? `${fpp} de ${n} com dinamometria` : '—' }
    ].forEach((c) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML = '<p class="v"></p><p class="l"></p><p class="s"></p>';
      cell.querySelector('.v').textContent = c.v;
      cell.querySelector('.l').textContent = c.l;
      cell.querySelector('.s').textContent = c.s;
      strip.appendChild(cell);
    });
  }

  /* ---- Renderização Matriz 2x2 Obesidade Sarcopênica ---- */
  function renderMatrix(rows) {
    const box = document.getElementById('sarc-matrix');
    if (!box) return;
    box.innerHTML = '';
    const m = buildMatrix(rows);
    if (m.n === 0) {
      box.innerHTML = '<div class="list-empty">Sem registros com IMC e medida muscular (CB ou CP) nesta seleção.</div>';
      return;
    }
    const cells = [
      {
        cls: 'hot',
        badge: '<span class="a-chip crit">Atenção · Obesidade sarcopênica provável</span>',
        title: 'Excesso de peso + Depleção muscular',
        val: fmt1(pctOf(m.q.excDep, m.n)) + '%',
        sub: `${m.q.excDep} de ${m.n} com IMC elevado e CB/CP reduzidos (risco mascarado pelo peso)`
      },
      {
        cls: 'warn',
        badge: '<span class="a-chip warn">Desnutrição / Depleção clássica</span>',
        title: 'Déficit ou Eutrofia + Depleção muscular',
        val: fmt1(pctOf(m.q.nonDep, m.n)) + '%',
        sub: `${m.q.nonDep} de ${m.n} sem excesso de peso, porém com perda muscular (CB/CP)`
      },
      {
        cls: '',
        badge: '<span class="a-chip info">Excesso sem depleção</span>',
        title: 'Excesso de peso + Massa preservada',
        val: fmt1(pctOf(m.q.excOk, m.n)) + '%',
        sub: `${m.q.excOk} de ${m.n} com sobrepeso/obesidade e CB/CP preservados`
      },
      {
        cls: 'ok',
        badge: '<span class="a-chip ok">Menor risco antropométrico</span>',
        title: 'Déficit/Eutrofia + Massa preservada',
        val: fmt1(pctOf(m.q.nonOk, m.n)) + '%',
        sub: `${m.q.nonOk} de ${m.n} com massa muscular preservada (CB/CP)`
      }
    ];
    cells.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'matrix-cell ' + c.cls;
      div.innerHTML = `<div class="matrix-head"><span class="matrix-title">${c.title}</span>${c.badge}</div><div class="matrix-val">${c.val}</div><div class="matrix-sub">${c.sub}</div>`;
      box.appendChild(div);
    });
  }

  /* ---- IMC divergente ---- */
  function imcColor(e) {
    if (e.grp === 'deficit') return getVar(e.sev >= 3 ? '--def3' : e.sev === 2 ? '--def2' : '--def1');
    if (e.grp === 'excesso') return getVar({ 1: '--exc1', 2: '--exc2', 3: '--exc3', 4: '--exc4' }[e.sev] || '--exc2');
    return getVar('--good');
  }

  function renderIMC(rows) {
    const wrap = document.getElementById('imc-diverge');
    wrap.innerHTML = '';
    const n = rows.length;
    if (!n) { wrap.innerHTML = '<div class="list-empty">Sem dados para os filtros selecionados.</div>'; return; }
    const dist = IMC_ORDER.map((x) => Object.assign({}, x, { count: rows.filter((r) => r.imcCat === x.cat).length }));
    dist.forEach((x) => { x.pct = (x.count / n) * 100; });
    const maxP = Math.max(...dist.filter((x) => x.grp !== 'neutro').map((x) => x.pct), 0.1);

    dist.forEach((x) => {
      if (x.grp === 'neutro') {
        const row = document.createElement('div');
        row.className = 'div-row center';
        const pill = document.createElement('div');
        pill.className = 'div-center-pill';
        pill.textContent = `${x.cat} — ${fmt1(x.pct)}% (n=${x.count})`;
        row.appendChild(document.createElement('div'));
        row.appendChild(pill);
        row.appendChild(document.createElement('div'));
        wrap.appendChild(row);
        return;
      }
      const row = document.createElement('div');
      row.className = 'div-row';
      const w = ((x.pct / maxP) * 100).toFixed(1);
      const col = imcColor(x);
      if (x.grp === 'deficit') {
        row.innerHTML = `<div class="div-label-l"></div><div class="div-val-l"></div><div class="div-bar-l"><div class="div-bar" style="width:${w}%;background:${col}"></div></div><div class="div-axis"></div><div class="div-bar-r"></div><div class="div-val-r"></div><div class="div-label-r"></div>`;
        row.children[0].textContent = x.cat;
        row.children[1].textContent = fmt1(x.pct) + '%';
      } else {
        row.innerHTML = `<div class="div-label-l"></div><div class="div-val-l"></div><div class="div-bar-l"></div><div class="div-axis"></div><div class="div-bar-r"><div class="div-bar" style="width:${w}%;background:${col}"></div></div><div class="div-val-r"></div><div class="div-label-r"></div>`;
        row.children[5].textContent = fmt1(x.pct) + '%';
        row.children[6].textContent = x.cat;
      }
      const bar = row.querySelector('.div-bar');
      bar.addEventListener('pointermove', (ev) => showTip(ev.clientX, ev.clientY, x.cat, [['% da amostra', fmt1(x.pct) + '%'], ['Registros', String(x.count)]]));
      bar.addEventListener('pointerleave', hideTip);
      wrap.appendChild(row);
    });
  }

  /* ---- Séries Semanais SVG (Caso 4: tooltips + marcação de amostra pequena n < 5) ---- */
  function xAtFor(len, i, x0, span) {
    return len <= 1 ? x0 + span / 2 : x0 + (i / (len - 1)) * span;
  }

  function renderTrendLines(weeks) {
    const svg = document.getElementById('chart-lines');
    const leg = document.getElementById('legend-lines');
    leg.innerHTML = '';
    if (!weeks.length) {
      svg.innerHTML = '';
      svg.style.display = 'none';
      return;
    }
    svg.style.display = 'block';
    const len = weeks.length;
    const xAt = (i) => xAtFor(len, i, 32, 574);
    const yAt = (v) => 200 - (Math.max(0, Math.min(100, v || 0)) / 100) * 186;
    let out = '';
    [0, 20, 40, 60, 80, 100].forEach((v) => {
      const y = yAt(v);
      out += `<line class="gridline" x1="32" x2="606" y1="${y}" y2="${y}"/>`;
      out += `<text class="axis-label" x="26" y="${y + 3}" text-anchor="end">${v}%</text>`;
    });
    const step = Math.max(1, Math.ceil(len / 9));
    weeks.forEach((w, i) => {
      if (i % step === 0 || i === len - 1) {
        out += `<text class="axis-label" x="${xAt(i)}" y="222" text-anchor="middle">${w.label}${w.smallN ? '*' : ''}</text>`;
      }
    });

    const series = [
      { key: 'pctExcesso', color: 'var(--brand-primary)', label: 'Excesso de peso' },
      { key: 'pctCB', color: 'var(--critical)', label: 'Depleção muscular (CB)' }
    ];
    series.forEach((s) => {
      const pts = weeks.map((w, i) => ({ i, v: w[s.key], smallN: w.smallN })).filter((p) => p.v != null);
      if (pts.length) {
        for (let k = 1; k < pts.length; k++) {
          const p0 = pts[k - 1], p1 = pts[k];
          const dash = (p0.smallN || p1.smallN) ? ' stroke-dasharray="4 3"' : '';
          out += `<line x1="${xAt(p0.i).toFixed(1)}" y1="${yAt(p0.v).toFixed(1)}" x2="${xAt(p1.i).toFixed(1)}" y2="${yAt(p1.v).toFixed(1)}" stroke="${s.color}" stroke-width="2.2"${dash} stroke-linecap="round"/>`;
        }
        pts.forEach((p) => {
          const fill = p.smallN ? 'var(--surface)' : s.color;
          const stroke = p.smallN ? s.color : 'var(--surface)';
          out += `<circle cx="${xAt(p.i)}" cy="${yAt(p.v)}" r="4.2" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
        });
        const last = pts[pts.length - 1];
        out += `<text class="axis-label" x="${xAt(last.i) + 8}" y="${yAt(last.v) + 4}" fill="${s.color}" font-weight="700">${fmt1(last.v)}%</text>`;
      }
      const item = document.createElement('span');
      item.className = 'item';
      item.innerHTML = `<span class="ln" style="background:${s.color}"></span>`;
      item.appendChild(document.createTextNode(s.label));
      leg.appendChild(item);
    });
    const smallNote = document.createElement('span');
    smallNote.className = 'item';
    smallNote.innerHTML = '<span style="width:9px;height:9px;border-radius:50%;border:2px solid var(--ink-muted);display:inline-block"></span><span>* semana com n &lt; 5</span>';
    leg.appendChild(smallNote);

    out += '<line id="lc-crosshair" class="crosshair" x1="0" x2="0" y1="14" y2="200"/>';
    weeks.forEach((w, i) => {
      out += `<rect class="hit" data-i="${i}" x="${xAt(i) - 574 / Math.max(len, 1) / 2}" y="14" width="${574 / Math.max(len, 1)}" height="186"/>`;
    });
    svg.innerHTML = out;

    const ch = svg.querySelector('#lc-crosshair');
    svg.querySelectorAll('.hit').forEach((hit) => {
      hit.addEventListener('pointermove', (ev) => {
        const w = weeks[+hit.dataset.i];
        ch.setAttribute('x1', xAt(+hit.dataset.i));
        ch.setAttribute('x2', xAt(+hit.dataset.i));
        ch.style.opacity = '1';
        const rowsTip = [
          ['Excesso de peso', w.pctExcesso != null ? fmt1(w.pctExcesso) + '%' : 'sem dados'],
          ['Depleção CB', w.pctCB != null ? fmt1(w.pctCB) + '%' : 'sem dados'],
          ['Volume (n)', fmt0(w.n) + (w.smallN ? ' (amostra pequena)' : '')]
        ];
        showTip(ev.clientX, ev.clientY, 'Semana de ' + w.label, rowsTip);
      });
      hit.addEventListener('pointerleave', () => { ch.style.opacity = '0'; hideTip(); });
    });
  }

  function renderTrendBars(weeks) {
    const svg = document.getElementById('chart-bars');
    if (!weeks.length) { svg.innerHTML = ''; svg.style.display = 'none'; return; }
    svg.style.display = 'block';
    const len = weeks.length;
    const maxV = Math.max(...weeks.map((w) => w.n)) + Math.max(4, Math.ceil(0.2 * Math.max(...weeks.map((w) => w.n))));
    const bw = Math.min(36, (422 / len) * 0.56);
    const yAt = (v) => 200 - (v / maxV) * 186;
    const xAt = (i) => len <= 1 ? 239 : 28 + ((i + 0.5) / len) * 422;
    let out = '';
    [0, 0.5 * maxV, maxV].forEach((v) => {
      const y = yAt(v);
      out += `<line class="gridline" x1="28" x2="450" y1="${y}" y2="${y}"/>`;
      out += `<text class="axis-label" x="22" y="${y + 3}" text-anchor="end">${Math.round(v)}</text>`;
    });
    out += `<line class="baseline" x1="28" x2="450" y1="${yAt(0)}" y2="${yAt(0)}"/>`;
    const step = Math.max(1, Math.ceil(len / 8));
    weeks.forEach((w, i) => {
      const x = xAt(i) - bw / 2;
      const y = yAt(w.n);
      const h = Math.max(yAt(0) - y, 2);
      const fill = w.smallN ? 'var(--brand-soft-border)' : 'var(--brand-primary)';
      out += `<rect class="hit" data-i="${i}" x="${x - 4}" y="14" width="${bw + 8}" height="186"/>`;
      out += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${fill}"/>`;
      out += `<text class="axis-label" x="${xAt(i)}" y="${y - 6}" text-anchor="middle" font-weight="700" fill="var(--ink-1)">${w.n}</text>`;
      if (i % step === 0 || i === len - 1) {
        out += `<text class="axis-label" x="${xAt(i)}" y="222" text-anchor="middle">${w.label}</text>`;
      }
    });
    svg.innerHTML = out;
    svg.querySelectorAll('.hit').forEach((hit) => {
      hit.addEventListener('pointermove', (ev) => {
        const w = weeks[+hit.dataset.i];
        showTip(ev.clientX, ev.clientY, 'Semana de ' + w.label, [['Registros', fmt0(w.n) + (w.smallN ? ' (n < 5)' : '')]]);
      });
      hit.addEventListener('pointerleave', hideTip);
    });
  }

  function renderTrendImc(weeks) {
    const svg = document.getElementById('chart-imc');
    if (!weeks.length) { svg.innerHTML = ''; svg.style.display = 'none'; return; }
    svg.style.display = 'block';
    const len = weeks.length;
    const xAt = (i) => xAtFor(len, i, 44, 1096);
    const yAt = (v) => 122 - ((v - 15) / 23) * 108;
    let out = '';
    [18, 22, 25, 29, 33, 37].forEach((v) => {
      const y = yAt(v);
      out += `<line class="gridline" x1="44" x2="1140" y1="${y}" y2="${y}"/>`;
      out += `<text class="axis-label" x="36" y="${y + 3}" text-anchor="end">${v}</text>`;
    });
    const y25 = yAt(25);
    out += `<line x1="44" x2="1140" y1="${y25}" y2="${y25}" stroke="var(--warning)" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.85"/>`;
    out += `<text class="axis-label" x="1140" y="${y25 - 5}" text-anchor="end" fill="var(--warning)" font-weight="600">limiar sobrepeso (25 kg/m²)</text>`;

    const pts = weeks.map((w, i) => ({ i, v: w.imcMedio, smallN: w.smallN })).filter((p) => p.v != null);
    if (pts.length) {
      const area = 'M' + xAt(pts[0].i) + ',' + yAt(15) + ' ' + pts.map((p) => 'L' + xAt(p.i) + ',' + yAt(p.v)).join(' ') + ' L' + xAt(pts[pts.length - 1].i) + ',' + yAt(15) + ' Z';
      out += `<path d="${area}" fill="var(--brand-teal)" opacity="0.09"/>`;
      for (let k = 1; k < pts.length; k++) {
        const p0 = pts[k - 1], p1 = pts[k];
        const dash = (p0.smallN || p1.smallN) ? ' stroke-dasharray="4 3"' : '';
        out += `<line x1="${xAt(p0.i)}" y1="${yAt(p0.v)}" x2="${xAt(p1.i)}" y2="${yAt(p1.v)}" stroke="var(--brand-teal)" stroke-width="2.2"${dash}/>`;
      }
      pts.forEach((p) => {
        out += `<circle cx="${xAt(p.i)}" cy="${yAt(p.v)}" r="4.2" fill="${p.smallN ? 'var(--surface)' : 'var(--brand-teal)'}" stroke="${p.smallN ? 'var(--brand-teal)' : 'var(--surface)'}" stroke-width="2"/>`;
      });
      const last = pts[pts.length - 1];
      out += `<text class="axis-label" x="${xAt(last.i) + 8}" y="${yAt(last.v) + 4}" fill="var(--brand-teal)" font-weight="700">${fmt1(last.v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(len / 12));
    weeks.forEach((w, i) => {
      if (i % step === 0 || i === len - 1) {
        out += `<text class="axis-label" x="${xAt(i)}" y="144" text-anchor="middle">${w.label}</text>`;
      }
      out += `<rect class="hit" data-i="${i}" x="${xAt(i) - 1096 / Math.max(len, 1) / 2}" y="14" width="${1096 / Math.max(len, 1)}" height="108"/>`;
    });
    svg.innerHTML = out;
    svg.querySelectorAll('.hit').forEach((hit) => {
      hit.addEventListener('pointermove', (ev) => {
        const w = weeks[+hit.dataset.i];
        showTip(ev.clientX, ev.clientY, 'Semana de ' + w.label, [
          ['IMC médio', w.imcMedio != null ? fmt1(w.imcMedio) + ' kg/m²' : 'sem dados'],
          ['Volume (n)', fmt0(w.n) + (w.smallN ? ' (n < 5)' : '')]
        ]);
      });
      hit.addEventListener('pointerleave', hideTip);
    });
  }

  /* ---- Ranking Indicadores ---- */
  function renderRankIndicadores(rows) {
    const wrap = document.getElementById('rank-indicadores');
    wrap.innerHTML = '';
    if (!rows.length) { wrap.innerHTML = '<div class="list-empty">Sem dados para os filtros selecionados.</div>'; return; }
    const list = buildIndicators(rows);
    const colors = { critical: 'var(--critical)', warning: 'var(--warning)', good: 'var(--good)' };
    const maxP = Math.max(...list.filter((x) => x.pct != null).map((x) => x.pct), 1);

    list.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const w = item.pct != null ? Math.max((item.pct / maxP) * 100, 1.5) : 0;
      row.innerHTML = `<span class="name"></span><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${item.pct != null ? colors[item.tier] : 'var(--grid)'}"></div></div><span class="val"></span>`;
      const nameEl = row.querySelector('.name');
      nameEl.appendChild(document.createTextNode(item.nome));
      if (item.lowN && item.pct != null) {
        const f = document.createElement('span');
        f.className = 'flag';
        f.textContent = ' *';
        nameEl.appendChild(f);
      }
      const valEl = row.querySelector('.val');
      valEl.appendChild(document.createTextNode(item.pct != null ? fmt1(item.pct) + '%' : '—'));
      const sub = document.createElement('span');
      sub.className = 'n';
      sub.textContent = item.pct != null ? 'n=' + item.num : 'sem dados';
      valEl.appendChild(sub);

      row.querySelector('.bar-fill').addEventListener('pointermove', (ev) => {
        showTip(ev.clientX, ev.clientY, item.nome, item.pct != null
          ? [['Prevalência', fmt1(item.pct) + '%'], ['Base', item.num + ' de ' + item.den], ['Medido em', item.measured + ' registros']]
          : [['Status', 'sem medições nesta seleção']]);
      });
      row.querySelector('.bar-fill').addEventListener('pointerleave', hideTip);
      wrap.appendChild(row);
    });
  }

  /* ---- Setores + Aderência de Protocolo (Caso 4) ---- */
  function buildSectorStats(rows) {
    const activeSectors = SECTORS.filter((s) => state.setores.has(s));
    return activeSectors.map((sec) => {
      const list = rows.filter((r) => r.st === sec);
      const n = list.length;
      const exc = list.filter((r) => r.imcGrp === 'excesso').length;
      const cb = list.filter((r) => r.cb && r.cb.indexOf('Depleção') === 0).length;
      const sfFpp = list.filter((r) => r.sfAp || r.fpp != null).length;
      const imcs = list.map((r) => r.imc).filter((v) => v != null);

      // Aderência ao ciclo de 10 dias (pacientes internados no setor em dia vs atrasados)
      const secAlerts = ALERTAS_ITEMS.filter((a) => (a.setorNorm || a.setor) === sec);
      const emDia = secAlerts.filter((a) => a.tipo !== 'atrasada').length;
      const aderencia = secAlerts.length ? pctOf(emDia, secAlerts.length) : null;

      return {
        setor: sec, n,
        pctExcesso: pctOf(exc, n),
        pctCB: pctOf(cb, n),
        imcMedio: mean(imcs),
        pctRastreio: pctOf(sfFpp, n),
        aderencia,
        internadosAtivos: secAlerts.length
      };
    });
  }

  function renderSectors(rows) {
    const wrap = document.getElementById('sector-grid');
    wrap.innerHTML = '';
    const stats = buildSectorStats(rows);
    if (!stats.length) { wrap.innerHTML = '<div class="list-empty">Nenhum setor selecionado.</div>'; return; }
    const nonZero = stats.filter((s) => s.n > 0);
    const maxN = nonZero.length ? Math.max(...nonZero.map((s) => s.n)) : null;
    const minN = nonZero.length ? Math.min(...nonZero.map((s) => s.n)) : null;

    stats.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'card sector-card';
      let tag = '';
      if (nonZero.length > 1 && s.n === maxN) tag = '<span class="sector-tag max">Maior volume</span>';
      else if (nonZero.length > 1 && s.n === minN) tag = '<span class="sector-tag min">Menor volume</span>';

      card.innerHTML = `
        <div class="sector-head">
          <span class="sec-pill ${SECTOR_CLS[s.setor] || ''}">${s.setor}</span>
          ${tag}
        </div>
        <p class="sector-n">${fmt0(s.n)} <small>${state.unitMode === 'latest' ? 'pacientes' : 'avaliações'}</small></p>
        <div class="sector-metrics">
          <div class="sector-metric"><div class="mv">${s.n > 0 ? fmt1(s.pctExcesso) + '%' : '—'}</div><div class="ml">excesso de peso</div></div>
          <div class="sector-metric"><div class="mv">${s.n > 0 && s.pctCB != null ? fmt1(s.pctCB) + '%' : '—'}</div><div class="ml">depleção CB</div></div>
          <div class="sector-metric"><div class="mv">${s.n > 0 && s.imcMedio != null ? fmt1(s.imcMedio) : '—'}</div><div class="ml">IMC médio</div></div>
          <div class="sector-metric"><div class="mv">${s.aderencia != null ? fmt1(s.aderencia) + '%' : (s.n > 0 ? fmt1(s.pctRastreio) + '%' : '—')}</div><div class="ml">${s.aderencia != null ? 'ciclo 10d em dia' : 'cobertura SARC/FPP'}</div></div>
        </div>
      `;
      wrap.appendChild(card);
    });
  }

  /* ---- Resumo Executivo ---- */
  function renderSummary(rows) {
    const wrap = document.getElementById('summary-body');
    const n = rows.length;
    if (!n) {
      wrap.innerHTML = '<p class="empty-msg">Nenhuma avaliação corresponde aos filtros selecionados.</p>';
      return;
    }
    const pacs = new Set(rows.map((r) => r.mat)).size;
    const fem = rows.filter((r) => r.sx === 'F').length;
    const idosos = rows.filter((r) => r.fx === 'idoso').length;
    const exc = pctOf(rows.filter((r) => r.imcGrp === 'excesso').length, n);
    const cb = pctOf(rows.filter((r) => r.cb && r.cb.indexOf('Depleção') === 0).length, n);
    const sf = pctOf(rows.filter((r) => r.sfAp).length, n);
    const fpp = pctOf(rows.filter((r) => r.fpp != null).length, n);
    const mat = buildMatrix(rows);

    const bySec = SECTORS.map((s) => ({ s, n: rows.filter((r) => r.st === s).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const topSec = bySec.slice(0, 2).map((x) => `${x.s} (${fmt1(pctOf(x.n, n))}%)`).join(' e ');

    const bullets = [];
    const sexLabel = fem / n >= 0.65 ? 'predominantemente mulheres' : (n - fem) / n >= 0.65 ? 'predominantemente homens' : 'com equilíbrio entre os sexos';
    bullets.push({
      t: 'Perfil da amostra:',
      d: `${n} ${state.unitMode === 'latest' ? 'pacientes (última avaliação)' : 'avaliações'} em ${pacs} pacientes distintos, ${sexLabel} (${fmt1(pctOf(fem, n))}% mulheres) e ${fmt1(pctOf(idosos, n))}% de idosos${topSec ? ', concentrados em ' + topSec : ''}.`
    });

    if (exc != null && cb != null) {
      let msg;
      if (exc >= 40 && cb >= 40) {
        msg = `${fmt1(exc)}% têm excesso de peso e ${fmt1(cb)}% apresentam depleção muscular (CB) — com ${mat.n > 0 ? fmt1(pctOf(mat.q.excDep, mat.n)) + '% (' + mat.q.excDep + '/' + mat.n + ')' : 'parcela relevante'} na interseção Excesso + Depleção (obesidade sarcopênica provável mascarada pelo peso).`;
      } else if (cb > exc + 15) {
        msg = `a depleção muscular (CB, ${fmt1(cb)}%) supera o excesso de peso (${fmt1(exc)}%) — perfil próximo à desnutrição energético-proteica clássica.`;
      } else if (exc > cb + 15) {
        msg = `o excesso de peso (${fmt1(exc)}%) predomina sobre os sinais de depleção muscular (CB, ${fmt1(cb)}%).`;
      } else {
        msg = `excesso de peso (${fmt1(exc)}%) e depleção muscular (CB, ${fmt1(cb)}%) coexistem em proporções próximas.`;
      }
      if (n < 15) msg += ' Amostra filtrada pequena — interprete como indicativo.';
      bullets.push({ t: 'Achado central:', d: msg });
    }

    const weeks = buildWeeks(rows).filter((w) => w.n > 0);
    if (weeks.length >= 2) {
      const w0 = weeks[0], w1 = weeks[weeks.length - 1];
      const volTxt = w1.n > w0.n ? `subiu de ${w0.n} para ${w1.n}` : w1.n < w0.n ? `caiu de ${w0.n} para ${w1.n}` : `manteve-se em ${w1.n}`;
      bullets.push({ t: 'Tendência no período:', d: `o volume semanal ${volTxt} (${w0.label} a ${w1.label}); na última semana o excesso de peso foi ${fmt1(w1.pctExcesso)}% e a depleção por CB ${fmt1(w1.pctCB)}%.` });
    } else if (weeks.length === 1) {
      bullets.push({ t: 'Tendência no período:', d: `recorte de uma única semana (${weeks[0].label}, n=${weeks[0].n}) — amplie o período para analisar tendência.` });
    }

    bullets.push({
      t: 'Lacuna de rastreio funcional:',
      d: `FPP e SARC-F cobriram ${fmt1(fpp)}% e ${fmt1(sf)}% da amostra, respectivamente${sf < 15 && fpp < 15 ? ' — ampliar o rastreio especialmente em idosos (≥60 anos) e pacientes com CB/CP alterados.' : '.'}`
    });

    const topInd = buildIndicators(rows).filter((i) => i.pct != null && !i.lowN)[0];
    bullets.push({
      t: 'Conduta gerencial sugerida:',
      d: `${topInd ? 'priorizar ' + topInd.nome.toLowerCase() + ' (' + fmt1(topInd.pct) + '%)' : 'reforçar rastreio SARC-F/FPP'} e manter o ciclo de reavaliação de 10 dias e altas atualizadas na aba Hoje.`,
      action: true
    });

    const ol = document.createElement('ol');
    bullets.forEach((b, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="idx">${i + 1}</span><span></span>`;
      const body = li.querySelector('span:last-child');
      const strong = document.createElement('b');
      strong.textContent = b.t + ' ';
      body.appendChild(strong);
      const sp = document.createElement('span');
      if (b.action) sp.className = 'action';
      sp.textContent = b.d;
      body.appendChild(sp);
      ol.appendChild(li);
    });
    wrap.innerHTML = '';
    wrap.appendChild(ol);
  }

  function renderAll() {
    const rows = filteredRows();
    const prevPack = previousPeriodRows();
    const n = rows.length;
    const pacs = new Set(rows.map((r) => r.mat)).size;

    document.getElementById('empty-banner').classList.toggle('show', n === 0);

    const st = document.getElementById('filter-status-text');
    if (st) {
      st.innerHTML = `Mostrando <b>${fmt0(n)}</b> ${state.unitMode === 'latest' ? 'pacientes (última aval.)' : 'de ' + fmt0(ROWS.length) + ' avaliações'} · <b>${fmt0(pacs)}</b> pacientes distintos` +
        (prevPack ? ` · <span style="color:var(--brand-teal);font-weight:600">Δ vs. ${fmtDateBR(prevPack.start)}–${fmtDateBR(prevPack.end)}</span>` : '');
    }

    const uAll = document.getElementById('btn-unit-all');
    const uLat = document.getElementById('btn-unit-latest');
    if (uAll && uLat) {
      uAll.classList.toggle('active', state.unitMode === 'all');
      uLat.classList.toggle('active', state.unitMode === 'latest');
    }

    renderKPIs(rows, prevPack);
    renderMatrix(rows);
    renderIMC(rows);
    const weeks = buildWeeks(rows);
    renderTrendLines(weeks);
    renderTrendBars(weeks);
    renderTrendImc(weeks);
    renderRankIndicadores(rows);
    renderSectors(rows);
    renderSummary(rows);
    renderActiveSubpanel(rows);
  }

  function switchSubtab(tab) {
    state.subtab = tab || 'geral';
    document.querySelectorAll('#dash-subtabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.subtab === state.subtab);
    });
    ['geral', 'evolucao', 'sarcopenia', 'qualidade', 'comparador'].forEach((k) => {
      const el = document.getElementById('subpanel-' + k);
      if (el) el.classList.toggle('hide', k !== state.subtab);
    });
    if (ROWS.length) renderActiveSubpanel(filteredRows());
  }

  function renderActiveSubpanel(rows) {
    if (state.subtab === 'geral' || !window.PanelsExtra) return;
    const allFilteredRows = applyFiltersToRange(state.dateStart, state.dateEnd, 'all');
    window.PanelsExtra.render(state.subtab, {
      rows,
      allFilteredRows,
      rawRows: ROWS,
      alertas: ALERTAS_ITEMS,
      pacientes: PACIENTES_LIST,
      snap: getSnapshot()
    });
  }

  function bindEventsOnce() {
    if (bindEventsOnce._done) return;
    bindEventsOnce._done = true;

    document.querySelectorAll('#dash-subtabs button').forEach((b) => {
      b.addEventListener('click', () => switchSubtab(b.dataset.subtab));
    });

    document.getElementById('date-start').addEventListener('change', (ev) => {
      state.dateStart = ev.target.value;
      state.preset = null;
      buildPresetChips();
      renderAll();
    });
    document.getElementById('date-end').addEventListener('change', (ev) => {
      state.dateEnd = ev.target.value;
      state.preset = null;
      buildPresetChips();
      renderAll();
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
      state.dateStart = DASH_RANGE.start;
      state.dateEnd = DASH_RANGE.end;
      state.preset = 'all';
      state.unitMode = 'all';
      state.setores = new Set(SECTORS);
      state.sexos = new Set(['F', 'M']);
      state.faixas = new Set(['adulto', 'idoso', 'menor20']);
      state.tipos = new Set(['Inicial', 'Reavaliação']);
      document.getElementById('date-start').value = DASH_RANGE.start;
      document.getElementById('date-end').value = DASH_RANGE.end;
      buildAllChips();
      renderAll();
    });
    document.getElementById('btn-unit-all').addEventListener('click', () => {
      state.unitMode = 'all';
      renderAll();
    });
    document.getElementById('btn-unit-latest').addEventListener('click', () => {
      state.unitMode = 'latest';
      renderAll();
    });
  }

  function load(data, alertasItems, pacientesList) {
    bindEventsOnce();
    ROWS = data.rows || [];
    ALERTAS_ITEMS = alertasItems || ALERTAS_ITEMS || [];
    PACIENTES_LIST = pacientesList || PACIENTES_LIST || [];
    LAST_META = { hoje: data.hoje, geradoEm: data.geradoEm, pacientes: data.pacientes };

    const hoje = data.hoje;
    const dMin = ROWS.length ? ROWS[0].d : hoje;
    const dMax = ROWS.length ? ROWS[ROWS.length - 1].d : hoje;
    DASH_RANGE = { start: dMin, end: dMax };

    const ym0 = hoje.slice(0, 7);
    const prevMonthYM = (() => {
      const d = new Date(ym0 + '-01T12:00:00');
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    })();
    const [py, pm] = prevMonthYM.split('-').map(Number);
    const prevMonthEnd = prevMonthYM + '-' + String(new Date(py, pm, 0).getDate()).padStart(2, '0');

    PRESETS = [
      { id: 'all', label: 'Todo o período', start: dMin, end: dMax },
      { id: 'd7', label: 'Últimos 7 dias', start: isoAdd(hoje, -6), end: hoje },
      { id: 'd30', label: 'Últimos 30 dias', start: isoAdd(hoje, -29), end: hoje },
      { id: 'm0', label: 'Este mês', start: ym0 + '-01', end: hoje },
      { id: 'm1', label: 'Mês anterior', start: prevMonthYM + '-01', end: prevMonthEnd }
    ];

    state.dateStart = dMin;
    state.dateEnd = dMax;
    state.preset = 'all';
    state.unitMode = 'all';
    state.setores = new Set(SECTORS);
    state.sexos = new Set(['F', 'M']);
    state.faixas = new Set(['adulto', 'idoso', 'menor20']);
    state.tipos = new Set(['Inicial', 'Reavaliação']);

    const ds = document.getElementById('date-start');
    const de = document.getElementById('date-end');
    ds.value = dMin; de.value = dMax;
    ds.min = dMin; ds.max = dMax;
    de.min = dMin; de.max = dMax;

    document.getElementById('dash-base').textContent = ROWS.length ? 'Base: ' + fmtLong(dMin) + ' a ' + fmtLong(dMax) : 'Base: sem avaliações';
    document.getElementById('dash-gerado').textContent = 'Planilha — aba AVALIAÇÕES · atualizado em ' + data.geradoEm;
    document.getElementById('dash-footbase').textContent = 'Base completa: ' + fmt0(ROWS.length) + ' avaliações, ' + fmt0(data.pacientes) + ' pacientes distintos (' + fmtDateBR(dMin) + ' a ' + fmtDateBR(dMax) + ').';

    buildAllChips();
    renderAll();
  }

  function setAlertas(items) {
    ALERTAS_ITEMS = items || [];
    if (ROWS.length) {
      renderSectors(filteredRows());
      renderActiveSubpanel(filteredRows());
    }
  }

  function setPacientes(list) {
    PACIENTES_LIST = list || [];
    if (ROWS.length) renderActiveSubpanel(filteredRows());
  }

  function getSnapshot() {
    const rows = filteredRows();
    return {
      rows,
      totalBase: ROWS.length,
      prevPack: previousPeriodRows(),
      state: {
        dateStart: state.dateStart,
        dateEnd: state.dateEnd,
        preset: state.preset,
        unitMode: state.unitMode,
        setores: new Set(state.setores),
        sexos: new Set(state.sexos),
        faixas: new Set(state.faixas),
        tipos: new Set(state.tipos)
      },
      meta: LAST_META,
      matrix: buildMatrix(rows),
      indicators: buildIndicators(rows),
      weeks: buildWeeks(rows),
      sectors: buildSectorStats(rows),
      IMC_ORDER,
      SECTORS
    };
  }

  return { load, setAlertas, setPacientes, switchSubtab, getSnapshot, showTip, hideTip, fmt1, fmt0, pctOf, mean };
})();
