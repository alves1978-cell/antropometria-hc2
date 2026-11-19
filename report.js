/**
 * GERADOR DE RELATÓRIOS INSTITUCIONAIS (PDF & CSV) — Antropometria HC II (v2)
 * Padrão visual INCA / Ministério da Saúde.
 * 1) Relatório Executivo do Painel (PDF) c/ Δ período anterior e Matriz 2x2
 * 2) Lista de Passagem de Plantão / Risco Nutricional (PDF) por Setor -> Leito (LGPD)
 * 3) Resumo Atual de Internados (.csv p/ Excel UTF-8 BOM)
 */
window.Report = (function () {
  'use strict';

  const PAGE_W = 210;
  const M = 14;
  const CW = 182;

  const COL = {
    navy: '#0C326F',
    primary: '#1351B4',
    teal: '#007A87',
    soft: '#EEF2F7',
    brandSoft: '#E8F0FE',
    white: '#FFFFFF',
    ink: '#1B2430',
    ink2: '#475569',
    muted: '#64748B',
    grid: '#DCE2EA',
    crit: '#C62828',
    critBg: '#FFEBEE',
    warn: '#B45309',
    warnBg: '#FEF3C7',
    good: '#168821',
    goodBg: '#E8F5E9',
    def1: '#60A5FA',
    def2: '#2563EB',
    def3: '#1E3A8A',
    exc1: '#FCA5A5',
    exc2: '#EF4444',
    exc3: '#B91C1C',
    exc4: '#7F1D1D',
    s: {
      GINECO: '#1351B4',
      TOC: '#C25E00',
      ONCO: '#007A87',
      'MASSA PÉLVICA': '#8E5A00',
      'GINECO/ONCO': '#9D2B6B'
    }
  };

  const CHAR_MAP = {
    '≥': '>=', '≤': '<=', '−': '-', '→': '->', '▲': '(+)', '▼': '(-)',
    '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '\u00A0': ' ', '\u202F': ' '
  };

  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/[≥≤−→▲▼’‘“”…\u00A0\u202F]/g, (ch) => CHAR_MAP[ch] || '')
      .replace(/[^\x09\x0a\x20-\x7e¡-ÿ–—•·]/g, '');
  }

  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      sc.async = true;
      sc.crossOrigin = 'anonymous';
      sc.onload = () => (window.jspdf && window.jspdf.jsPDF ? resolve() : reject(new Error('Gerador de PDF indisponível.')));
      sc.onerror = () => reject(new Error('Não foi possível carregar o gerador de PDF. Verifique a conexão (cdnjs.cloudflare.com).'));
      document.head.appendChild(sc);
    });
  }

  const fmtBR = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
  const todayStamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  const nowBR = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ===================== 1. RELATÓRIO EXECUTIVO DO PAINEL (PDF) ===================== */
  function buildPanelPdf(opts) {
    opts = opts || {};
    return loadJsPdf().then(() => {
      const snap = window.Dash.getSnapshot();
      const rows = snap.rows;
      const n = rows.length;
      if (n === 0) throw new Error('Nenhuma avaliação corresponde aos filtros atuais do Painel.');

      const { fmt1, fmt0, pctOf } = window.Dash;
      const st = snap.state;
      const pacs = new Set(rows.map((r) => r.mat)).size;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

      doc.setProperties({
        title: 'Painel Nutricional - HC II (INCA)',
        subject: 'Relatório executivo de antropometria hospitalar',
        author: opts.user || '',
        creator: 'Antropometria HC II v2'
      });

      let y = 0;
      const txt = (s, x, yy, o) => doc.text(clean(s), x, yy, o);
      const font = (w, sz, c) => { doc.setFont('helvetica', w); doc.setFontSize(sz); if (c) doc.setTextColor(c); };
      const fill = (c) => doc.setFillColor(c);
      const stroke = (c) => doc.setDrawColor(c);
      const ensure = (h) => { if (y + h > 278) { doc.addPage(); y = 16; } };
      const split = (s, w) => doc.splitTextToSize(clean(s), w);
      const lh = (sz) => 0.3528 * sz * 1.28;

      function sectionTitle(title, sub) {
        ensure(18);
        fill(COL.primary);
        doc.rect(M, y - 3.6, 1.8, 5.4, 'F');
        font('bold', 11.5, COL.navy);
        txt(title, M + 4, y);
        y += 1.6;
        if (sub) {
          font('normal', 7.8, COL.muted);
          y += 3.2;
          txt(sub, M + 4, y);
          y += 1.2;
        }
        y += 4.5;
      }

      // Cabeçalho Institucional INCA / Ministério da Saúde
      fill(COL.navy);
      doc.rect(0, 0, PAGE_W, 24, 'F');
      fill(COL.teal);
      doc.rect(0, 24, PAGE_W, 1.8, 'F');

      font('bold', 7.5, '#BAE6FD');
      txt('INCA · HOSPITAL DO CÂNCER II  |  NUTRIÇÃO CLÍNICA', M, 9);
      font('normal', 7.3, '#E0F2FE');
      txt('Emitido em ' + nowBR(), PAGE_W - M, 9, { align: 'right' });

      font('bold', 17, COL.white);
      txt('Painel Nutricional — HC II', M, 17);
      font('normal', 8.5, '#DBEAFE');
      txt('Diagnóstico antropométrico consolidado (dados agregados — LGPD)', M, 21.5);
      if (snap.meta.geradoEm) {
        font('normal', 7.2, '#BAE6FD');
        txt('Base atualizada: ' + snap.meta.geradoEm, PAGE_W - M, 21.5, { align: 'right' });
      }

      y = 32;

      // Quadro de filtros aplicados
      const hasAll = (set, arr) => arr.every((x) => set.has(x));
      const fxMap = { adulto: 'Adultos (20-59)', idoso: 'Idosos (>=60)', menor20: '< 20 anos' };
      const filtersMeta = [
        ['PERÍODO', fmtBR(st.dateStart) + ' a ' + fmtBR(st.dateEnd)],
        ['UNIDADE', st.unitMode === 'latest' ? '1 por paciente (última)' : 'Todas as avaliações'],
        ['SEXO', hasAll(st.sexos, ['F', 'M']) ? 'Ambos' : st.sexos.has('F') ? 'Feminino' : 'Masculino'],
        ['FAIXA ETÁRIA', hasAll(st.faixas, ['adulto', 'idoso', 'menor20']) ? 'Todas' : ['adulto', 'idoso', 'menor20'].filter((k) => st.faixas.has(k)).map((k) => fxMap[k]).join(', ')]
      ];
      const setoresStr = hasAll(st.setores, snap.SECTORS) ? 'Todos (' + snap.SECTORS.join(', ') + ')' : snap.SECTORS.filter((s) => st.setores.has(s)).join(', ');
      const amostraStr = fmt0(n) + (st.unitMode === 'latest' ? ' pacientes' : ' avaliações') + '  ·  ' + fmt0(pacs) + ' pacientes distintos  (base total: ' + fmt0(snap.totalBase) + ' aval.)' +
        (snap.prevPack ? '  ·  Delta vs. ' + fmtBR(snap.prevPack.start) + '-' + fmtBR(snap.prevPack.end) : '');

      const boxH = 26;
      fill(COL.brandSoft);
      stroke('#C5D9FA');
      doc.setLineWidth(0.25);
      doc.roundedRect(M, y, CW, boxH, 2, 2, 'FD');

      let cy = y + 5;
      filtersMeta.forEach(([k, v], i) => {
        const cx = M + 4 + i * 44;
        font('bold', 6.5, COL.teal);
        txt(k, cx, cy);
        font('bold', 8, COL.navy);
        txt(split(v, 42)[0], cx, cy + 3.8);
      });
      cy += 9.5;
      font('bold', 6.5, COL.teal);
      txt('SETORES', M + 4, cy);
      font('normal', 8, COL.ink);
      txt(split(setoresStr, 174)[0], M + 22, cy);
      cy += 5.5;
      font('bold', 6.5, COL.teal);
      txt('AMOSTRA', M + 4, cy);
      font('bold', 8, COL.navy);
      txt(amostraStr, M + 22, cy);

      y += boxH + 8;

      // KPIs Principais (com Δ período anterior quando existir)
      sectionTitle('Indicadores principais', snap.prevPack ? 'Inclui variação frente ao período anterior equivalente' : null);

      const kpiCards = Array.from(document.querySelectorAll('#kpi-grid .kpi-tile')).map((el) => ({
        cls: el.classList.contains('crit') ? 'crit' : el.classList.contains('warn') ? 'warn' : 'primary',
        label: el.querySelector('.kpi-label').textContent,
        value: el.querySelector('.kpi-value .v').textContent,
        suffix: el.querySelector('.kpi-value small').textContent,
        delta: el.querySelector('.kpi-delta') ? el.querySelector('.kpi-delta').textContent : '',
        sub: el.querySelector('.kpi-sub').textContent
      }));

      kpiCards.forEach((k, idx) => {
        const colIdx = idx % 3;
        if (colIdx === 0 && idx > 0) y += 30;
        if (colIdx === 0) ensure(30);
        const x = M + colIdx * 62;
        fill(COL.white);
        stroke(COL.grid);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, 58, 27, 2, 2, 'FD');
        fill(COL[k.cls]);
        doc.roundedRect(x, y, 1.8, 27, 0.8, 0.8, 'F');

        font('bold', 7.2, COL.ink2);
        txt(k.label, x + 4.5, y + 5.2);
        font('bold', 16, COL.navy);
        txt(k.value, x + 4.5, y + 14);
        const vw = doc.getTextWidth(clean(k.value));
        if (k.suffix) {
          font('normal', 8, COL.ink2);
          txt(k.suffix.trim(), x + 4.5 + vw + 1.2, y + 14);
        }
        if (k.delta) {
          font('bold', 6.8, COL.teal);
          txt(k.delta, x + 54, y + 14, { align: 'right' });
        }
        font('normal', 6.8, COL.muted);
        split(k.sub, 51).slice(0, 2).forEach((line, li) => txt(line, x + 4.5, y + 19.2 + li * 3.1));
      });
      y += 32;

      // Matriz 2x2 Obesidade Sarcopênica (Caso 4)
      if (snap.matrix.n > 0) {
        ensure(38);
        sectionTitle('Matriz de Obesidade Sarcopênica (IMC x Depleção Muscular)', 'Cruzamento de IMC com depleção muscular por CB ou CP (n=' + snap.matrix.n + ' com ambas medidas)');
        const m = snap.matrix;
        const cells = [
          { t: 'Excesso de peso + Depleção (Obesidade sarcopênica provável)', v: fmt1(pctOf(m.q.excDep, m.n)) + '%', s: m.q.excDep + ' de ' + m.n, bg: COL.critBg, bd: '#F5B7B7', tc: COL.crit },
          { t: 'Déficit/Eutrofia + Depleção (Desnutrição / depleção clássica)', v: fmt1(pctOf(m.q.nonDep, m.n)) + '%', s: m.q.nonDep + ' de ' + m.n, bg: COL.warnBg, bd: '#F5D08A', tc: COL.warn },
          { t: 'Excesso de peso + Massa muscular preservada', v: fmt1(pctOf(m.q.excOk, m.n)) + '%', s: m.q.excOk + ' de ' + m.n, bg: COL.brandSoft, bd: '#C5D9FA', tc: COL.navy },
          { t: 'Déficit/Eutrofia + Massa muscular preservada', v: fmt1(pctOf(m.q.nonOk, m.n)) + '%', s: m.q.nonOk + ' de ' + m.n, bg: COL.goodBg, bd: '#B7DFB9', tc: COL.good }
        ];
        cells.forEach((c, i) => {
          const cx = M + (i % 2) * 93;
          const cy2 = y + Math.floor(i / 2) * 18;
          fill(c.bg);
          stroke(c.bd);
          doc.setLineWidth(0.25);
          doc.roundedRect(cx, cy2, 89, 15.5, 2, 2, 'FD');
          font('bold', 7.2, COL.ink);
          txt(split(c.t, 64)[0], cx + 3.5, cy2 + 5.2);
          font('normal', 7, COL.ink2);
          txt(c.s, cx + 3.5, cy2 + 11.5);
          font('bold', 13, c.tc);
          txt(c.v, cx + 85.5, cy2 + 10.5, { align: 'right' });
        });
        y += 40;
      }

      // Resumo Executivo
      sectionTitle('Resumo executivo', 'Síntese automática para os filtros aplicados');
      const sumItems = Array.from(document.querySelectorAll('#summary-body li')).map((li) => {
        const body = li.lastElementChild;
        const b = body.querySelector('b');
        const title = b ? b.textContent.trim() : '';
        return { title, text: body.textContent.replace(title, '').trim() };
      });
      sumItems.forEach((it, idx) => {
        const lines = split(it.text, 170);
        const h = 4.4 + lines.length * lh(8.6) + 3;
        ensure(h);
        fill(COL.primary);
        doc.circle(M + 3, y - 0.9, 2.4, 'F');
        font('bold', 7.2, COL.white);
        txt(String(idx + 1), M + 3, y, { align: 'center' });
        font('bold', 8.8, COL.navy);
        txt(it.title, M + 8.5, y);
        font('normal', 8.6, COL.ink);
        lines.forEach((ln, li) => txt(ln, M + 8.5, y + 4.2 + li * lh(8.6)));
        y += h;
      });
      y += 4;

      // Classificação IMC
      sectionTitle('Classificação do IMC', 'Lipschitz para idosos (>=60 anos) e OMS para demais faixas');
      const imcDist = snap.IMC_ORDER.map((x) => {
        const count = rows.filter((r) => r.imcCat === x.cat).length;
        return Object.assign({}, x, { count, pct: (count / n) * 100 });
      });
      const maxImc = Math.max(...imcDist.map((x) => x.pct), 1);
      ensure(imcDist.length * 6 + 4);
      imcDist.forEach((x) => {
        font('normal', 8.2, COL.ink);
        txt(x.cat, M, y + 1);
        fill(COL.soft);
        doc.roundedRect(70, y - 2.5, 86, 4.2, 1, 1, 'F');
        if (x.pct > 0) {
          const barCol = x.grp === 'deficit'
            ? (x.sev >= 3 ? COL.def3 : x.sev === 2 ? COL.def2 : COL.def1)
            : x.grp === 'excesso'
              ? ([null, COL.exc1, COL.exc2, COL.exc3, COL.exc4][x.sev] || COL.exc2)
              : COL.good;
          fill(barCol);
          doc.roundedRect(70, y - 2.5, Math.max((x.pct / maxImc) * 86, 1.2), 4.2, 1, 1, 'F');
        }
        font('bold', 8.2, COL.ink);
        txt(fmt1(x.pct) + '%', 159, y + 1);
        font('normal', 7.4, COL.muted);
        txt('n=' + x.count, 196, y + 1, { align: 'right' });
        y += 6;
      });
      y += 5;

      // Ranking Indicadores
      sectionTitle('Indicadores antropométricos de risco', 'Prevalência sobre o total filtrado (n=' + fmt0(n) + ')');
      const maxInd = Math.max(...snap.indicators.filter((x) => x.pct != null).map((x) => x.pct), 1);
      ensure(snap.indicators.length * 6 + 10);
      snap.indicators.forEach((x) => {
        font('normal', 8, COL.ink);
        txt(x.nome + (x.lowN && x.pct != null ? ' *' : ''), M, y + 1);
        fill(COL.soft);
        doc.roundedRect(94, y - 2.5, 66, 4.2, 1, 1, 'F');
        if (x.pct != null && x.pct > 0) {
          fill(x.tier === 'critical' ? COL.crit : x.tier === 'warning' ? COL.warn : COL.good);
          doc.roundedRect(94, y - 2.5, Math.max((x.pct / maxInd) * 66, 1.2), 4.2, 1, 1, 'F');
        }
        font('bold', 8, COL.ink);
        txt(x.pct != null ? fmt1(x.pct) + '%' : '—', 163, y + 1);
        font('normal', 7.3, COL.muted);
        txt(x.pct != null ? 'n=' + x.num : 'sem dados', 196, y + 1, { align: 'right' });
        y += 6;
      });
      font('normal', 7, COL.muted);
      txt('* Base medida < 15: interprete com cautela. Cores: vermelho >=50%, âmbar 25-49%, verde <25%.', M, y + 1.5);
      y += 8;

      // Comparativo por Setor (com aderência ao ciclo 10d)
      sectionTitle('Comparativo por setor / clínica', 'Inclui volume, excesso de peso, depleção CB, IMC médio e aderência ao ciclo 10d');
      ensure(10 + snap.sectors.length * 7 + 8);
      fill(COL.brandSoft);
      doc.roundedRect(M, y - 4, CW, 6.5, 1.2, 1.2, 'F');
      font('bold', 7.5, COL.navy);
      txt('Setor', M + 3, y);
      txt('Volume', 82, y, { align: 'right' });
      txt('Excesso IMC', 112, y, { align: 'right' });
      txt('Depleção CB', 142, y, { align: 'right' });
      txt('IMC médio', 168, y, { align: 'right' });
      txt('Ciclo 10d', 194, y, { align: 'right' });
      y += 6.5;

      snap.sectors.forEach((s) => {
        fill(COL.s[s.setor] || COL.primary);
        doc.circle(M + 3, y - 0.9, 1.3, 'F');
        font('bold', 8.2, COL.ink);
        txt(s.setor, M + 6.5, y);
        font('normal', 8.2, COL.ink);
        txt(fmt0(s.n), 82, y, { align: 'right' });
        txt(s.n ? fmt1(s.pctExcesso) + '%' : '—', 112, y, { align: 'right' });
        txt(s.n && s.pctCB != null ? fmt1(s.pctCB) + '%' : '—', 142, y, { align: 'right' });
        txt(s.n && s.imcMedio != null ? fmt1(s.imcMedio) : '—', 168, y, { align: 'right' });
        txt(s.aderencia != null ? fmt1(s.aderencia) + '%' : '—', 194, y, { align: 'right' });
        stroke(COL.grid);
        doc.setLineWidth(0.15);
        doc.line(M, y + 2.3, 196, y + 2.3);
        y += 6.8;
      });
      y += 4;

      // Nota LGPD
      font('normal', 7, COL.muted);
      split('Relatório consolidado gerado pelo aplicativo Antropometria HC II (v2) a partir das classificações oficiais da planilha. Contém exclusivamente dados agregados, sem identificação individual de pacientes (LGPD).', CW)
        .forEach((ln) => { ensure(4); txt(ln, M, y); y += 3.2; });

      // Rodapé paginado
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        stroke(COL.grid);
        doc.setLineWidth(0.2);
        doc.line(M, 283, 196, 283);
        font('normal', 7, COL.muted);
        txt('INCA · HC II  ·  Painel Nutricional' + (opts.user ? '  ·  ' + opts.user : ''), M, 287.5);
        txt('Página ' + i + ' de ' + pages, 196, 287.5, { align: 'right' });
      }

      return {
        blob: doc.output('blob'),
        name: 'Painel_Nutricional_HC_II_' + todayStamp() + '.pdf',
        pages,
        n
      };
    });
  }

  /* ===================== 2. PASSAGEM DE PLANTÃO / RISCO (PDF — Caso 4) ===================== */
  function buildHandoverPdf(alertasData, opts) {
    opts = opts || {};
    return loadJsPdf().then(() => {
      const itens = (alertasData && alertasData.itens) ? alertasData.itens.slice() : [];
      if (!itens.length) throw new Error('Não há pacientes internados ativos para gerar a lista de passagem de plantão.');

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      doc.setProperties({
        title: 'Passagem de Plantão - Nutrição Clínica HC II',
        subject: 'Lista operacional por setor e leito (LGPD)',
        author: opts.user || ''
      });

      let y = 0;
      const txt = (s, x, yy, o) => doc.text(clean(s), x, yy, o);
      const font = (w, sz, c) => { doc.setFont('helvetica', w); doc.setFontSize(sz); if (c) doc.setTextColor(c); };
      const fill = (c) => doc.setFillColor(c);
      const stroke = (c) => doc.setDrawColor(c);
      const ensure = (h) => { if (y + h > 278) { doc.addPage(); y = 16; } };

      fill(COL.navy);
      doc.rect(0, 0, PAGE_W, 22, 'F');
      fill(COL.teal);
      doc.rect(0, 22, PAGE_W, 1.5, 'F');

      font('bold', 7.3, '#BAE6FD');
      txt('INCA · HC II  |  NUTRIÇÃO CLÍNICA  ·  USO INTERNO (LGPD — SOMENTE INICIAIS)', M, 8.5);
      font('normal', 7.3, '#E0F2FE');
      txt('Emitido em ' + nowBR(), PAGE_W - M, 8.5, { align: 'right' });
      font('bold', 15, COL.white);
      txt('Lista de Passagem de Plantão / Risco Nutricional', M, 16.5);
      font('normal', 8, '#DBEAFE');
      txt(itens.length + ' pacientes internados em acompanhamento · agrupados por Setor e Leito', M, 20.5);

      y = 30;

      // Agrupa por setor normalizado e ordena por leito
      const bySec = {};
      itens.forEach((it) => {
        const sec = it.setorNorm || it.setor || 'OUTROS';
        if (!bySec[sec]) bySec[sec] = [];
        bySec[sec].push(it);
      });

      const secOrder = Object.keys(bySec).sort();
      secOrder.forEach((sec) => {
        const list = bySec[sec].sort((a, b) => String(a.leito || 'zzz').localeCompare(String(b.leito || 'zzz'), 'pt-BR', { numeric: true }));
        ensure(18);
        fill(COL.brandSoft);
        doc.roundedRect(M, y - 4, CW, 7, 1.2, 1.2, 'F');
        font('bold', 9.2, COL.navy);
        txt(sec + '  (' + list.length + ' pacientes)', M + 3, y + 0.8);
        y += 7;

        // Cabeçalho tabela
        font('bold', 7.2, COL.muted);
        txt('LEITO', M + 2, y);
        txt('MATRÍCULA', M + 20, y);
        txt('INICIAIS', M + 44, y);
        txt('STATUS / CICLO', M + 66, y);
        txt('ÚLTIMA', M + 114, y);
        txt('VAR. PESO / TENDÊNCIA', M + 136, y);
        stroke(COL.grid);
        doc.setLineWidth(0.25);
        doc.line(M, y + 1.8, 196, y + 1.8);
        y += 5.5;

        list.forEach((it) => {
          ensure(7);
          const isCrit = it.tipo === 'atrasada' || (it.tendencia && it.tendencia.indexOf('GRAVE') >= 0);
          if (isCrit) {
            fill('#FFF7F7');
            doc.rect(M, y - 3.6, CW, 5.8, 'F');
          }
          font('bold', 7.8, COL.navy);
          txt(it.leito || '—', M + 2, y);
          font('normal', 7.8, COL.ink);
          txt(it.mat, M + 20, y);
          font('bold', 7.8, COL.ink);
          txt(it.nome, M + 44, y);
          font('bold', 7.4, it.tipo === 'atrasada' ? COL.crit : it.tipo === 'hoje' ? COL.warn : COL.ink2);
          const stTxt = it.tipo === 'atrasada' && it.dias != null ? 'Atrasada (' + Math.abs(it.dias) + 'd)' : (it.status || '—');
          txt(stTxt.slice(0, 28), M + 66, y);
          font('normal', 7.6, COL.ink2);
          txt(it.ultima ? fmtBR(it.ultima) : 'Sem aval.', M + 114, y);

          const varTxt = it.varPct != null
            ? (it.varPct > 0 ? '+' : '') + Number(it.varPct).toFixed(1).replace('.', ',') + '% ' + (it.tendencia || '')
            : (it.tendencia || '—');
          font(it.tendencia && it.tendencia.indexOf('GRAVE') >= 0 ? 'bold' : 'normal', 7.4, it.tendencia && it.tendencia.indexOf('GRAVE') >= 0 ? COL.crit : COL.ink);
          txt(varTxt.slice(0, 32), M + 136, y);

          stroke(COL.grid);
          doc.setLineWidth(0.12);
          doc.line(M, y + 2, 196, y + 2);
          y += 6;
        });
        y += 5;
      });

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        stroke(COL.grid);
        doc.setLineWidth(0.2);
        doc.line(M, 283, 196, 283);
        font('normal', 7, COL.muted);
        txt('Documento interno HC II (LGPD — sem nome completo) · ' + (opts.user || ''), M, 287.5);
        txt('Página ' + i + ' de ' + pages, 196, 287.5, { align: 'right' });
      }

      return {
        blob: doc.output('blob'),
        name: 'Passagem_Plantao_HC_II_' + todayStamp() + '.pdf',
        pages,
        n: itens.length
      };
    });
  }

  /* ===================== 3. RESUMO ATUAL DE INTERNADOS (.CSV p/ Excel) ===================== */
  function buildInternadosCsv(alertasData) {
    const itens = (alertasData && alertasData.itens) ? alertasData.itens : [];
    if (!itens.length) throw new Error('Sem pacientes internados ativos para exportar.');
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const headers = ['Setor', 'Leito', 'Matricula', 'Iniciais', 'Idade', 'Status_Ciclo', 'Dias_Reavaliacao', 'Ultima_Avaliacao', 'Num_Avaliacoes', 'Variacao_Internacao_Pct', 'Tendencia_Ponderal'];
    const lines = [headers.join(';')];
    itens.forEach((it) => {
      lines.push([
        it.setorNorm || it.setor || '',
        it.leito || '',
        it.mat || '',
        it.nome || '',
        it.idade != null ? it.idade : '',
        it.status || '',
        it.dias != null ? it.dias : '',
        it.ultima ? fmtBR(it.ultima) : '',
        it.nAval || 0,
        it.varPct != null ? String(it.varPct).replace('.', ',') : '',
        it.tendencia || ''
      ].map(esc).join(';'));
    });
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    return {
      blob,
      name: 'RESUMO_ATUAL_INTERNADOS_HC_II_' + todayStamp() + '.csv',
      n: itens.length
    };
  }

  return { buildPanelPdf, buildHandoverPdf, buildInternadosCsv };
})();
