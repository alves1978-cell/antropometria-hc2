/**
 * ANTROPOMETRIA HC II (v2) — Aplicação PWA Principal
 * Implementa Casos 1 a 4 validados:
 * - Login institucional Google (GIS) + Modo Demonstração (Editor / Consulta)
 * - Correção do modal de paciente (sem [object HTMLDivElement]/null) + Sparkline
 * - Skeleton loading, filtros/ordenação/alta rápida em Hoje
 * - Prévia estendida em Avaliar (IMC, %PP, Chumlea, SARC-F, alertas suaves)
 * - Copiar evolução para Prontuário (PEP) com 1 clique
 * - Exportação XLSX, PDF Executivo, PDF Passagem de Plantão e CSV Internados
 */
window.App = (function () {
  'use strict';

  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, props) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') { for (const dk in v) node.dataset[dk] = v[dk]; }
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) appendChildSafe(node, arguments[i]);
    return node;
  }

  function appendChildSafe(parent, child) {
    if (child == null || child === false || child === true) return;
    if (Array.isArray(child)) child.forEach((c) => appendChildSafe(parent, c));
    else parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  function replaceSafe(container) {
    container.innerHTML = '';
    for (let i = 1; i < arguments.length; i++) appendChildSafe(container, arguments[i]);
  }

  const fmtDate = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
  const fmtDM = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';
  const fmtNum = (n, dec) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec == null ? 1 : dec, maximumFractionDigits: dec == null ? 1 : dec });
  const todayISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const cleanMat = (s) => String(s || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const normTxt = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function debounce(fn, ms) {
    let t;
    return function () {
      const a = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, a), ms);
    };
  }

  function sectorBadgeClass(sec) {
    const t = normTxt(sec).toUpperCase();
    if (t.indexOf('GINECO') >= 0 && (t.indexOf('ONCO') >= 0 || t.indexOf('OVARIO') >= 0)) return 's5';
    if (t.indexOf('ONCO') >= 0) return 's3';
    if (t.indexOf('MASSA') >= 0) return 's4';
    if (t.indexOf('TOC') >= 0) return 's2';
    return 's1';
  }
  function normSetorLabel(sec) {
    const t = normTxt(sec).toUpperCase().trim();
    if (!t) return 'GINECO';
    if (t.indexOf('GINECO') >= 0 && (t.indexOf('ONCO') >= 0 || t.indexOf('OVARIO') >= 0)) return 'GINECO/ONCO';
    if (t.indexOf('ONCO') >= 0) return 'ONCO';
    if (t.indexOf('MASSA') >= 0) return 'MASSA PÉLVICA';
    if (t.indexOf('TOC') >= 0) return 'TOC';
    return 'GINECO';
  }

  /* ---- UI Helpers: Toast, Skeleton, Busy Button, Modal, Confirm ---- */
  function toast(msg, type, dur) {
    const t = el('div', { class: 'toast ' + (type || ''), text: msg });
    qs('#toasts').appendChild(t);
    setTimeout(() => t.remove(), dur || (type === 'err' ? 7000 : 3200));
  }

  function skeletonCards(count) {
    const items = [];
    for (let i = 0; i < (count || 4); i++) {
      items.push(el('div', { class: 'skel-card' },
        el('div', { class: 'skel-line w40' }),
        el('div', { class: 'skel-line w70' }),
        el('div', { class: 'skel-line w55' })
      ));
    }
    return el('div', { class: 'skel-wrap' }, items);
  }

  function setBusy(btn, busy, label) {
    if (busy) {
      btn._lbl = btn.textContent;
      btn.disabled = true;
      btn.textContent = '';
      btn.appendChild(el('span', { class: 'spin' }));
      if (label) btn.appendChild(document.createTextNode(' ' + label));
    } else {
      btn.disabled = false;
      btn.textContent = btn._lbl || btn.textContent;
    }
  }

  function openModal(title, content, opts) {
    opts = opts || {};
    const back = el('div', { class: 'm-back', role: 'dialog', 'aria-modal': 'true' });
    const close = () => { back.remove(); if (opts.onClose) opts.onClose(); };
    const sheet = el('div', { class: 'm-sheet' },
      el('div', { class: 'm-head' },
        el('h2', { class: 'a-h', text: title }),
        el('button', { class: 'a-iconbtn', type: 'button', 'aria-label': 'Fechar', onclick: close, text: '✕' })
      ),
      content
    );
    back.appendChild(sheet);
    back.addEventListener('mousedown', (ev) => { if (ev.target === back) close(); });
    document.body.appendChild(back);
    return { close, el: sheet };
  }

  function confirmModal(title, message, confirmLabel, isDanger) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };
      const box = el('div', null,
        el('p', { text: message, style: 'margin:0 0 16px;font-size:14px;line-height:1.5' }),
        el('div', { class: 'a-row' },
          el('button', { class: 'a-btn ghost a-grow', type: 'button', text: 'Cancelar', onclick: () => { m.close(); finish(false); } }),
          el('button', { class: 'a-btn a-grow ' + (isDanger ? 'danger' : 'primary'), type: 'button', text: confirmLabel || 'Confirmar', onclick: () => { m.close(); finish(true); } })
        )
      );
      const m = openModal(title, box, { onClose: () => finish(false) });
    });
  }

  /* ---- Estado global ---- */
  const S = {
    init: null,
    pacientes: null,
    alertas: null,
    hist: null,
    dash: null,
    lookup: null,
    editing: null,
    sf: false,
    edema: 0,
    ascite: 0,
    sfv: [null, null, null, null, null],
    hojeFiltro: 'pend',
    hojeSetor: 'ALL',
    hojeSort: 'prio', // 'prio' | 'leito' | 'grav'
    pacFiltro: 'todos',
    _lk: null
  };

  const NUM_FIELDS = ['peso', 'pesoUsual', 'estatura', 'joelho', 'pesoRef', 'tempoPerda', 'cb', 'pct', 'cp', 'fpp'];
  const fieldEl = (k) => qs('#f-' + k);
  const isEditor = () => Boolean(S.init && S.init.user && S.init.user.role === 'editor');

  function clearCaches() {
    S.alertas = S.hist = S.dash = S.pacientes = null;
  }

  /* ---- Navegação ---- */
  function goTab(tab) {
    qsa('.a-view').forEach((v) => v.classList.toggle('active', v.id === 'v-' + tab));
    qsa('#a-nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    window.scrollTo(0, 0);
    if (tab === 'hoje') loadHoje();
    if (tab === 'pac') loadPacientes();
    if (tab === 'hist') loadHistorico();
    if (tab === 'painel') loadPainel();
    if (tab === 'avaliar') updateLivePreview();
  }

  function renderCapacityBanner(cap) {
    const box = qs('#cap-banner');
    box.innerHTML = '';
    if (!cap) return;
    [['avaliações', cap.aval], ['pacientes', cap.pac]].forEach(([lbl, c]) => {
      if (c && c.warn) {
        box.appendChild(el('div', {
          class: 'a-banner ' + (c.used >= c.max ? 'crit' : 'warn'),
          text: `Capacidade de ${lbl}: ${c.used} de ${c.max} linhas usadas. ${c.used >= c.max ? 'Limite atingido — amplie as linhas na planilha.' : 'Planeje ampliar a planilha em breve.'}`
        }));
      }
    });
  }

  function refreshDatalist() {
    const dl = qs('#dl-pac');
    dl.innerHTML = '';
    (S.pacientes || []).slice(0, 400).forEach((p) => {
      dl.appendChild(el('option', { value: p.mat, label: p.nome + ' · ' + p.setor + (p.leito ? ' · ' + p.leito : '') }));
    });
  }

  /* ==========================================================================
     ABA HOJE (Caso 3: filtro por setor, busca, ordenação, tendência, alta rápida)
     ========================================================================== */
  function loadHoje() {
    if (S.alertas) return renderHoje();
    replaceSafe(qs('#hoje-list'), skeletonCards(4));
    Api.call('api_alertas')
      .then((data) => {
        S.alertas = data;
        if (window.Dash) window.Dash.setAlertas(data.itens);
        renderHoje();
      })
      .catch((err) => replaceSafe(qs('#hoje-list'), el('div', { class: 'a-banner crit', text: err.message })));
  }

  const STATUS_LABEL = { atrasada: 'Atrasada', hoje: 'Hoje', embreve: 'Em breve', aguardando: '1ª avaliação', acompanhamento: 'Em dia' };
  const STATUS_CHIP = { atrasada: 'crit', hoje: 'warn', embreve: 'warn', aguardando: 'info', acompanhamento: 'ok' };

  function renderTrendChip(varPct, tendencia) {
    if (varPct == null && !tendencia) return null;
    const isGrave = tendencia && tendencia.toUpperCase().indexOf('GRAVE') >= 0;
    const isPerda = (varPct != null && varPct < -0.5) || (tendencia && tendencia.toLowerCase().indexOf('perda') >= 0);
    const isGanho = varPct != null && varPct > 0.5;
    const arrow = isPerda ? '↓ ' : isGanho ? '↑ ' : '→ ';
    const cls = isGrave ? 'crit' : isPerda ? 'warn' : isGanho ? 'info' : '';
    const txt = arrow + (varPct != null ? (varPct > 0 ? '+' : '') + fmtNum(varPct) + '%' : '') + (tendencia ? ' · ' + tendencia : '');
    return el('span', { class: 'a-chip ' + cls, text: txt.trim() });
  }

  function renderHoje() {
    const data = S.alertas;
    const c = data.contagem;
    const urg = c.atrasadas + c.hoje;
    const badge = qs('#a-badge');
    badge.textContent = urg;
    badge.classList.toggle('show', urg > 0);

    qs('#hoje-sub').textContent = `Hoje, ${fmtDate(data.hoje)} · ciclo de reavaliação de ${S.init ? S.init.diasReavaliacao : 10} dias.`;

    // Tiles KPI
    const tiles = [
      ['atrasada', c.atrasadas, 'Atrasadas', 't-crit'],
      ['hoje', c.hoje, 'Reavaliar hoje', 't-warn'],
      ['embreve', c.emBreve, 'Em até 2 dias', 't-warn'],
      ['aguardando', c.aguardando, 'Aguardando 1ª aval.', 't-info']
    ];
    replaceSafe(qs('#hoje-tiles'), tiles.map(([k, val, lbl, cls]) =>
      el('button', {
        class: 'a-tile ' + cls + (S.hojeFiltro === k ? ' sel' : ''),
        type: 'button',
        onclick: () => { S.hojeFiltro = S.hojeFiltro === k ? 'pend' : k; renderHoje(); }
      },
      el('div', { class: 'n', text: val }),
      el('div', { class: 'l', text: lbl }))
    ));

    // Filtros Status + Setores
    const statusChips = [
      ['pend', 'Pendentes'],
      ['todos', 'Todos internados (' + data.itens.length + ')']
    ].map(([k, lbl]) => el('button', {
      class: 'chip ' + (S.hojeFiltro === k ? 'active' : 'all-included'),
      type: 'button',
      text: lbl,
      onclick: () => { S.hojeFiltro = k; renderHoje(); }
    }));

    const setorList = ['ALL', 'GINECO', 'TOC', 'ONCO', 'MASSA PÉLVICA', 'GINECO/ONCO'];
    const secChips = setorList.map((sec) => el('button', {
      class: 'chip ' + (S.hojeSetor === sec ? 'active' : 'all-included'),
      type: 'button',
      text: sec === 'ALL' ? 'Todos setores' : sec,
      onclick: () => { S.hojeSetor = sec; renderHoje(); }
    }));
    replaceSafe(qs('#hoje-filters'), statusChips, el('span', { style: 'width:1px;background:var(--border);margin:4px 2px;flex:none' }), secChips);

    // Filtragem + Busca + Ordenação
    const q = normTxt(qs('#hoje-q').value);
    let list = data.itens.slice();
    if (S.hojeFiltro === 'pend') list = list.filter((x) => x.tipo !== 'acompanhamento');
    else if (S.hojeFiltro !== 'todos') list = list.filter((x) => x.tipo === S.hojeFiltro);

    if (S.hojeSetor !== 'ALL') {
      list = list.filter((x) => (x.setorNorm || normSetorLabel(x.setor)) === S.hojeSetor);
    }
    if (q) {
      list = list.filter((x) => normTxt(x.mat + ' ' + x.nome + ' ' + x.leito + ' ' + x.setor).indexOf(q) >= 0);
    }

    if (S.hojeSort === 'leito') {
      list.sort((a, b) => String(a.leito || 'zzz').localeCompare(String(b.leito || 'zzz'), 'pt-BR', { numeric: true }));
    } else if (S.hojeSort === 'grav') {
      list.sort((a, b) => {
        const ga = (a.tendencia && a.tendencia.indexOf('GRAVE') >= 0) ? -1000 : (a.varPct == null ? 999 : a.varPct);
        const gb = (b.tendencia && b.tendencia.indexOf('GRAVE') >= 0) ? -1000 : (b.varPct == null ? 999 : b.varPct);
        return ga - gb;
      });
    }

    const wrap = qs('#hoje-list');
    if (!list.length) {
      replaceSafe(wrap, el('div', { class: 'a-empty', text: S.hojeFiltro === 'pend' ? 'Nenhuma reavaliação pendente com os filtros atuais.' : 'Nenhum paciente encontrado.' }));
      return;
    }

    const canEdit = isEditor();
    replaceSafe(wrap, list.map((it) => {
      const secNorm = it.setorNorm || normSetorLabel(it.setor);
      const chipTxt = STATUS_LABEL[it.tipo] + (it.tipo === 'atrasada' && it.dias != null ? ' · ' + Math.abs(it.dias) + ' d' : it.tipo === 'embreve' && it.dias != null ? ' · ' + it.dias + ' d' : '');
      return el('div', { class: 'a-item', style: 'cursor:default' },
        el('div', { class: 'top' },
          el('span', { class: 'mat', text: it.mat }),
          el('span', { class: 'nome', text: it.nome }),
          el('span', { class: 'sec-pill ' + sectorBadgeClass(secNorm), text: secNorm }),
          el('span', { class: 'a-chip ' + STATUS_CHIP[it.tipo], text: chipTxt })
        ),
        el('div', { class: 'meta' },
          el('span', { text: [it.leito && ('Leito ' + it.leito), it.idade != null && (it.idade + ' anos')].filter(Boolean).join(' · ') }),
          it.ultima ? el('span', { text: 'Última: ' + fmtDM(it.ultima) + ' (' + it.nAval + ' aval.)' }) : el('span', { text: 'Sem avaliação' }),
          renderTrendChip(it.varPct, it.tendencia)
        ),
        el('div', { class: 'act' },
          canEdit ? el('button', { class: 'a-btn primary sm', type: 'button', text: it.ultima ? 'Reavaliar' : 'Avaliar', onclick: () => startEvaluationFor(it.mat) }) : null,
          el('button', { class: 'a-btn ghost sm', type: 'button', text: 'Ver paciente', onclick: () => openPatientDetailModal({ mat: it.mat, nome: it.nome }) }),
          canEdit ? el('button', { class: 'a-btn ghost sm', type: 'button', text: 'Registrar alta', onclick: () => openQuickDischargeModal(it) }) : null
        )
      );
    }));
  }

  function openQuickDischargeModal(it) {
    const dtIn = el('input', { class: 'f-in', type: 'date', value: (S.init && S.init.hoje) || todayISO() });
    const errBox = el('div', { class: 'a-banner crit hide' });
    const btnOk = el('button', { class: 'a-btn primary a-grow', type: 'button', text: 'Confirmar alta' });
    const body = el('div', null,
      el('p', { style: 'margin:0 0 12px;font-size:13.5px', text: `Registrar alta hospitalar de ${it.mat} (${it.nome}) — remove o paciente da fila de pendências de Hoje.` }),
      el('div', { class: 'f-field' }, el('label', { text: 'Data da alta' }), dtIn),
      errBox,
      el('div', { class: 'a-row' },
        el('button', { class: 'a-btn ghost a-grow', type: 'button', text: 'Cancelar', onclick: () => m.close() }),
        btnOk
      )
    );
    const m = openModal('Registrar alta rápida', body);
    btnOk.addEventListener('click', () => {
      errBox.classList.add('hide');
      setBusy(btnOk, true, 'Salvando…');
      Api.call('api_registrarAlta', it.mat, dtIn.value)
        .then(() => {
          setBusy(btnOk, false);
          m.close();
          clearCaches();
          toast('Alta registrada com sucesso', 'ok');
          loadHoje();
        })
        .catch((err) => {
          setBusy(btnOk, false);
          errBox.textContent = err.message;
          errBox.classList.remove('hide');
        });
    });
  }

  /* ==========================================================================
     ABA AVALIAR (Caso 3: última aval., prévia IMC + %PP + Chumlea, alertas suaves)
     ========================================================================== */
  const EDEMA_LABELS = ['Ausente', '+ pé', '++ joelho', '+++ coxa', '++++ anasarca'];
  const ASCITE_LABELS = ['Ausente', 'Leve +', 'Moderada ++', 'Grave +++'];
  const SARCF_QS = [
    ['Força', 'Dificuldade para levantar e carregar 4,5 kg', ['Nenhuma', 'Alguma', 'Muita/incapaz']],
    ['Caminhar', 'Dificuldade para andar pelo cômodo', ['Nenhuma', 'Alguma', 'Muita/incapaz']],
    ['Levantar', 'Dificuldade para sair da cama/cadeira', ['Nenhuma', 'Alguma', 'Muita/incapaz']],
    ['Escadas', 'Dificuldade para subir 10 degraus', ['Nenhuma', 'Alguma', 'Muita/incapaz']],
    ['Quedas', 'Quedas no último ano', ['Nenhuma', '1 a 3', '4 ou mais']]
  ];

  function renderEdemaAscite() {
    const build = (sel, labels, key) => {
      const box = qs(sel);
      replaceSafe(box, labels.map((lbl, idx) =>
        el('button', {
          type: 'button',
          class: idx === S[key] ? 'on' : '',
          onclick: () => { S[key] = idx; renderEdemaAscite(); updateLivePreview(); }
        }, String(idx), el('small', { text: lbl }))
      ));
    };
    build('#seg-edema', EDEMA_LABELS, 'edema');
    build('#seg-ascite', ASCITE_LABELS, 'ascite');
    const ed = S.init && S.init.edemaKg.find((x) => x[0] === S.edema);
    const as = S.init && S.init.asciteKg.find((x) => x[0] === S.ascite);
    qs('#hint-edema').textContent = ed && ed[1] > 0 ? '− ' + fmtNum(ed[1]) + ' kg' : '';
    qs('#hint-ascite').textContent = as && as[1] > 0 ? '− ' + fmtNum(as[1]) + ' kg' : '';
  }

  function renderSarcF() {
    const box = qs('#sf-box');
    const items = SARCF_QS.map((q, qi) =>
      el('div', { class: 'sf-q' },
        el('p', { text: (qi + 1) + '. ' + q[0] + ' — ' + q[1] }),
        el('div', { class: 'seg' },
          q[2].map((opt, oi) => el('button', {
            type: 'button',
            class: S.sfv[qi] === oi ? 'on' : '',
            onclick: () => { S.sfv[qi] = oi; renderSarcF(); updateLivePreview(); }
          }, String(oi), el('small', { text: opt })))
        )
      )
    );
    const done = S.sfv.every((v) => v != null);
    const score = S.sfv.reduce((acc, v) => acc + (v || 0), 0);
    const summary = el('div', {
      class: 'a-banner ' + (done ? (score >= 4 ? 'crit' : 'info') : ''),
      style: 'margin:10px 0 0',
      text: done ? `Escore SARC-F: ${score}/10 — ${score >= 4 ? 'Rastreio POSITIVO (≥ 4)' : 'Rastreio negativo (< 4)'}` : 'Responda os 5 itens para calcular o escore.'
    });
    replaceSafe(box, items, summary);
  }

  function toggleSarcF(on) {
    S.sf = on;
    const tog = qs('#tog-sf');
    tog.classList.toggle('on', on);
    tog.setAttribute('aria-checked', on);
    qs('#sf-box').classList.toggle('hide', !on);
    if (on) renderSarcF();
    else S.sfv = [null, null, null, null, null];
    updateLivePreview();
  }

  function lookupPatient(mat, prefill) {
    replaceSafe(qs('#pac-card'), skeletonCards(1));
    S._lk = mat;
    return Api.call('api_buscarPaciente', mat)
      .then((res) => {
        if (S._lk !== mat) return;
        S.lookup = res.encontrado ? res : null;
        renderLookupCard(res, mat);
        if (res.encontrado && prefill && !S.editing && res.ultimaEntrada) {
          prefillInput('estatura', res.ultimaEntrada.estatura);
          prefillInput('joelho', res.ultimaEntrada.joelho);
          prefillInput('pesoUsual', res.ultimaEntrada.pesoUsual);
        }
        updateScreeningBadges();
        updateLivePreview();
        return res;
      })
      .catch((err) => replaceSafe(qs('#pac-card'), el('div', { class: 'a-banner crit', text: err.message })));
  }

  function renderLookupCard(res, mat) {
    const box = qs('#pac-card');
    if (!res.encontrado) {
      replaceSafe(box, el('div', { class: 'a-banner warn' },
        `Matrícula ${mat} não cadastrada. `,
        isEditor() ? el('button', { class: 'a-btn sm primary', type: 'button', style: 'margin-left:6px', text: 'Cadastrar paciente', onclick: () => openPatientFormModal({ mat }, 'avaliar') }) : null
      ));
      return;
    }
    const p = res.paciente;
    const ult = res.ultima;
    const uIn = res.ultimaEntrada;
    const meta = [
      `${p.sexo === 'F' ? 'Feminino' : 'Masculino'}${p.idade != null ? ' · ' + p.idade + ' anos' : ''}`,
      `${p.setor}${p.leito ? ' · Leito ' + p.leito : ''}`,
      `Internação: ${fmtDate(p.intern)}${p.diasInt != null ? ' (' + p.diasInt + ' d)' : ''}`
    ];
    if (p.amput && p.amput !== 'Sem amputação') meta.push(`Amputação: ${p.amput}${p.pctAmput ? ' (' + fmtNum(p.pctAmput) + '%)' : ''}`);

    // Faixa resumo da última avaliação (Caso 3)
    const lastStrip = ult ? el('div', { class: 'last-strip' },
      el('b', { text: `Última avaliação (${fmtDM(ult.data)}): ` }),
      [
        ult.pesoCalc != null ? `Peso ${fmtNum(ult.pesoCalc)} kg` : null,
        ult.estatura != null ? `Estatura ${fmtNum(ult.estatura, 2)} m` : null,
        uIn && uIn.cb != null ? `CB ${fmtNum(uIn.cb)} cm` : null,
        uIn && uIn.cp != null ? `CP ${fmtNum(uIn.cp)} cm` : null,
        ult.imc != null ? `IMC ${fmtNum(ult.imc)} (${ult.imcClasse || ''})` : null
      ].filter(Boolean).join(' · ')
    ) : null;

    replaceSafe(box, el('div', { class: 'a-item', style: 'cursor:default;margin-bottom:0' },
      el('div', { class: 'top' },
        el('span', { class: 'mat', text: p.mat }),
        el('span', { class: 'nome', text: p.nome }),
        el('span', { class: 'sec-pill ' + sectorBadgeClass(p.setor), text: normSetorLabel(p.setor) }),
        el('span', { class: 'a-chip ' + (p.alta ? '' : 'info'), text: p.alta ? 'Alta ' + fmtDM(p.alta) : (res.historico.length ? res.historico.length + ' aval.' : '1ª avaliação') })
      ),
      el('div', { class: 'meta' }, meta.map((m) => el('span', { text: m }))),
      lastStrip,
      p.alta ? el('div', { class: 'a-banner warn', style: 'margin:8px 0 0', text: 'Paciente com alta registrada em ' + fmtDate(p.alta) + '.' }) : null
    ));
  }

  function updateScreeningBadges() {
    const isIdoso = Boolean(S.lookup && S.lookup.paciente && S.lookup.paciente.idade != null && S.lookup.paciente.idade >= (S.init ? S.init.idadeIdoso : 60));
    qs('#badge-fpp-rec').classList.toggle('hide', !isIdoso);
    qs('#badge-sf-rec').classList.toggle('hide', !isIdoso);
  }

  function prefillInput(k, val) {
    const inp = fieldEl(k);
    if (val != null && inp.value === '') {
      inp.value = String(val).replace('.', ',');
      inp.classList.add('prefilled');
    }
  }

  function resetEvalForm() {
    S.editing = null;
    S.lookup = null;
    S.edema = 0;
    S.ascite = 0;
    S._lk = null;
    qs('#f-mat').value = '';
    qs('#f-mat').disabled = false;
    qs('#btn-buscar').disabled = false;
    NUM_FIELDS.forEach((k) => {
      const inp = fieldEl(k);
      inp.value = '';
      inp.classList.remove('prefilled', 'err');
    });
    qs('#f-obs').value = '';
    qs('#f-data').value = (S.init && S.init.hoje) || todayISO();
    toggleSarcF(false);
    renderEdemaAscite();
    qs('#pac-card').innerHTML = '';
    qs('#edit-banner').innerHTML = '';
    qs('#inline-warnings').innerHTML = '';
    qs('#av-title').textContent = 'Nova avaliação';
    qs('#av-sub').classList.remove('hide');
    qs('#btn-cancel-edit').classList.add('hide');
    qs('#btn-save-aval').textContent = 'Salvar';
    updateScreeningBadges();
    updateLivePreview();
  }

  function startEvaluationFor(mat) {
    resetEvalForm();
    qs('#f-mat').value = mat;
    goTab('avaliar');
    lookupPatient(cleanMat(mat), true);
  }

  function readNumericFields() {
    const out = {};
    NUM_FIELDS.forEach((k) => {
      const raw = String(fieldEl(k).value || '').trim().replace(',', '.');
      if (raw === '') out[k] = null;
      else {
        const n = Number(raw);
        out[k] = isNaN(n) ? NaN : n;
      }
    });
    return out;
  }

  // Prévia de Chumlea (1985/1994) apenas p/ feedback imediato (a planilha continua oficial)
  function previewChumleaHeight(joelhoCm, pac) {
    if (!joelhoCm || isNaN(joelhoCm) || !pac || !pac.sexo || pac.idade == null) return null;
    const r = normTxt(pac.raca || '');
    const isBlack = r.indexOf('pret') >= 0;
    let cm = null;
    if (pac.sexo === 'F') {
      cm = isBlack
        ? 68.10 + (1.86 * joelhoCm) - (0.06 * pac.idade)
        : 84.88 - (0.24 * pac.idade) + (1.83 * joelhoCm);
    } else if (pac.sexo === 'M') {
      cm = isBlack
        ? 73.42 + (1.79 * joelhoCm)
        : 64.19 - (0.04 * pac.idade) + (2.02 * joelhoCm);
    }
    return cm && cm > 80 && cm < 230 ? cm / 100 : null;
  }

  function previewPPClass(pp, dias) {
    if (pp == null || isNaN(pp)) return '';
    if (pp <= 0) return 'Sem perda';
    if (!dias) return 'informe os dias';
    if (dias <= 7) return pp > 2 ? 'Perda GRAVE' : pp >= 1 ? 'Significativa' : 'Leve';
    if (dias <= 30) return pp > 5 ? 'Perda GRAVE' : pp >= 5 ? 'Significativa' : 'Leve';
    if (dias <= 90) return pp > 7.5 ? 'Perda GRAVE' : pp >= 7.5 ? 'Significativa' : 'Leve';
    return pp > 10 ? 'Perda GRAVE' : pp >= 10 ? 'Significativa' : 'Leve';
  }

  function renderSoftWarnings(vals, pesoCalc) {
    const box = qs('#inline-warnings');
    const warns = [];

    // 1. Estatura digitada em centímetros (ex: 162 -> 1,62 m)
    if (vals.estatura != null && !isNaN(vals.estatura) && vals.estatura > 3 && vals.estatura <= 250) {
      const conv = (vals.estatura / 100).toFixed(2).replace('.', ',');
      warns.push(el('div', { class: 'inline-alert' },
        el('span', { text: `Estatura digitada em centímetros (${vals.estatura})? O campo espera metros.` }),
        el('button', {
          class: 'a-btn sm primary',
          type: 'button',
          text: `Converter para ${conv} m`,
          onclick: () => {
            fieldEl('estatura').value = conv;
            fieldEl('estatura').classList.remove('prefilled');
            updateLivePreview();
          }
        })
      ));
    }

    // 2. Variação brusca de peso (> 15%) frente à última avaliação
    if (pesoCalc != null && S.lookup && S.lookup.ultima && S.lookup.ultima.pesoCalc > 0 && !S.editing) {
      const prev = S.lookup.ultima.pesoCalc;
      const pct = ((pesoCalc - prev) / prev) * 100;
      if (Math.abs(pct) > 15) {
        warns.push(el('div', { class: 'inline-alert' },
          el('span', { text: `Atenção: peso difere ${pct > 0 ? '+' : ''}${fmtNum(pct)}% da última avaliação (${fmtNum(prev)} kg). Confira a digitação.` })
        ));
      }
    }

    replaceSafe(box, warns);
  }

  function updateLivePreview() {
    const vals = readNumericFields();
    const init = S.init;
    const pac = S.lookup && S.lookup.paciente;

    // CMB ao vivo
    const cmb = (vals.cb != null && vals.pct != null && !isNaN(vals.cb) && !isNaN(vals.pct))
      ? vals.cb - Math.PI * (vals.pct / 10)
      : null;
    qs('#cmb-live').textContent = cmb != null ? `CMB = ${fmtNum(cmb)} cm (prévia)` : '';

    // Peso p/ cálculo
    const basePeso = (vals.peso != null && !isNaN(vals.peso)) ? vals.peso : ((vals.pesoRef != null && !isNaN(vals.pesoRef)) ? vals.pesoRef : null);
    let pesoCalc = null;
    if (basePeso != null && init) {
      const descEd = (init.edemaKg.find((x) => x[0] === S.edema) || [0, 0])[1];
      const descAsc = (init.asciteKg.find((x) => x[0] === S.ascite) || [0, 0])[1];
      pesoCalc = basePeso - (descEd + descAsc);
      if (pac && pac.pctAmput > 0) pesoCalc = pesoCalc / (1 - pac.pctAmput / 100);
    }

    // Estatura direta ou Chumlea (prévia)
    let est = (vals.estatura != null && !isNaN(vals.estatura) && vals.estatura > 0 && vals.estatura <= 2.5) ? vals.estatura : null;
    let estChumlea = null;
    if (!est && vals.joelho > 0) {
      estChumlea = previewChumleaHeight(vals.joelho, pac);
      est = estChumlea;
    }

    let imc = null, imcCls = '';
    if (pesoCalc != null && est != null && est > 0) {
      imc = pesoCalc / (est * est);
      if (init) {
        const tab = (pac && pac.idade != null && pac.idade >= init.idadeIdoso) ? init.imcIdoso : init.imcAdulto;
        tab.forEach(([lbl, min]) => { if (imc >= min) imcCls = lbl; });
      }
    }

    // %PP ao vivo (Caso 3)
    const pp = (pesoCalc != null && vals.pesoUsual > 0) ? ((vals.pesoUsual - pesoCalc) / vals.pesoUsual) * 100 : null;
    const extras = [];
    if (estChumlea != null) extras.push(`Chumlea ~${fmtNum(estChumlea, 2)} m`);
    if (pp != null) extras.push(`%PP ${fmtNum(pp)}% (${previewPPClass(pp, vals.tempoPerda)})`);
    if (S.sf && S.sfv.every((x) => x != null)) {
      const sc = S.sfv.reduce((a, b) => a + b, 0);
      extras.push(`SARC-F ${sc}/10`);
    }

    renderSoftWarnings(vals, pesoCalc);

    const mini = qs('#pv-mini');
    if (imc != null) {
      replaceSafe(mini,
        el('b', { text: `IMC ${fmtNum(imc)} · ${imcCls}` }),
        el('span', { text: `Peso p/ cálculo ${fmtNum(pesoCalc)} kg · prévia` }),
        extras.length ? el('span', { class: 'pv-extra', text: extras.join(' · ') }) : null
      );
    } else {
      const msg = pesoCalc == null
        ? (vals.joelho > 0 && vals.cb > 0 ? 'Peso será estimado (Chumlea) pela planilha' : 'Informe peso e estatura')
        : (vals.joelho > 0 ? 'Informe o paciente ou estatura para prévia' : 'Informe a estatura para ver o IMC');
      replaceSafe(mini,
        el('b', { text: pesoCalc != null ? `Peso ${fmtNum(pesoCalc)} kg` : '—' }),
        el('span', { text: msg }),
        extras.length ? el('span', { class: 'pv-extra', text: extras.join(' · ') }) : null
      );
    }
  }

  function saveEvaluation() {
    if (!isEditor()) { toast('Seu perfil é Somente Consulta.', 'err'); return; }
    const btn = qs('#btn-save-aval');
    const vals = readNumericFields();
    const payload = {
      mat: cleanMat(qs('#f-mat').value),
      data: qs('#f-data').value,
      edema: S.edema,
      ascite: S.ascite,
      obs: qs('#f-obs').value
    };
    NUM_FIELDS.forEach((k) => {
      payload[k] = (vals[k] == null) ? null : (isNaN(vals[k]) ? fieldEl(k).value : vals[k]);
    });
    SARCF_QS.forEach((_, i) => { payload['sf' + (i + 1)] = S.sf ? S.sfv[i] : null; });
    if (S.editing) {
      payload.row = S.editing.row;
      payload.dataOriginal = S.editing.dataOriginal;
    }

    if (!payload.mat) { toast('Informe a matrícula.', 'err'); qs('#f-mat').focus(); return; }
    if (!S.editing && !S.lookup) { toast('Matrícula não cadastrada. Cadastre o paciente primeiro.', 'err'); return; }
    if (S.sf && S.sfv.some((v) => v == null)) { toast('Responda os 5 itens do SARC-F ou desligue o questionário.', 'err'); return; }

    const wasEdit = Boolean(S.editing);
    setBusy(btn, true, 'Salvando…');
    Api.call('api_salvarAvaliacao', payload)
      .then((res) => {
        setBusy(btn, false);
        clearCaches();
        renderCapacityBanner(res.capacidade);
        openSavedResultModal(res, wasEdit);
        resetEvalForm();
        Api.call('api_listarPacientes').then((p) => { S.pacientes = p; refreshDatalist(); }).catch(() => {});
        if (wasEdit) goTab('hist');
      })
      .catch((err) => {
        setBusy(btn, false);
        toast(err.message, 'err');
      });
  }

  /* ---- Gerador de Texto para Evolução em Prontuário (PEP — Caso 3) ---- */
  function buildPepText(ev) {
    const lines = [];
    lines.push(`AVALIAÇÃO NUTRICIONAL ANTROPOMÉTRICA — HC II (${fmtDate(ev.data)})`);
    lines.push(`Paciente: ${ev.nome || '—'} | Matrícula: ${ev.mat} | ${ev.setor || '—'}${ev.leito ? ' · Leito ' + ev.leito : ''} | ${ev.tipo || 'Avaliação'}${ev.n ? ' #' + ev.n : ''}`);
    const pesoPart = ev.pesoCalc != null ? `Peso p/ cálculo: ${fmtNum(ev.pesoCalc)} kg (${ev.metodoPeso || '—'})` : 'Peso: não informado';
    const estPart = ev.estatura != null ? `Estatura: ${fmtNum(ev.estatura, 2)} m` : 'Estatura: não informada';
    const imcPart = ev.imc != null ? `IMC: ${fmtNum(ev.imc)} kg/m² (${ev.imcClasse || '—'})` : 'IMC: não calculado';
    lines.push(`${pesoPart} | ${estPart} | ${imcPart}`);

    if (ev.pp != null || (ev.ppClasse && ev.ppClasse !== '—')) {
      lines.push(`Perda de peso (%PP): ${ev.pp != null ? fmtNum(ev.pp) + '%' : '—'}${ev.ppClasse ? ' — ' + ev.ppClasse : ''}`);
    }
    if (ev.tendencia) {
      lines.push(`Evolução ponderal na internação: ${ev.tendencia}${ev.varIntPct != null ? ' (' + (ev.varIntPct > 0 ? '+' : '') + fmtNum(ev.varIntPct) + '%)' : ''}`);
    }
    const comp = [];
    if (ev.cb) comp.push(`CB: ${ev.cb}`);
    if (ev.dct) comp.push(`PCT/DCT: ${ev.dct}`);
    if (ev.cmb) comp.push(`CMB: ${ev.cmb}`);
    if (ev.cp) comp.push(`CP: ${ev.cp}`);
    if (comp.length) lines.push('Composição corporal: ' + comp.join(' | '));

    const func = [];
    if (ev.fpp) func.push(`FPP: ${ev.fpp}`);
    if (ev.sf != null) func.push(`SARC-F: ${ev.sf}/10 (${ev.sfInterp || '—'})`);
    if (func.length) lines.push('Avaliação funcional / sarcopenia: ' + func.join(' | '));

    return lines.join('\n');
  }

  function copyPep(ev) {
    const text = buildPepText(ev);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast('Evolução copiada! Pronta para colar no prontuário (PEP).', 'ok'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = el('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Evolução copiada para a área de transferência!', 'ok');
    } catch (e) {
      toast('Não foi possível copiar automaticamente. Selecione o texto manualmente.', 'err');
    }
    ta.remove();
  }

  function buildResultGrid(r) {
    const pairs = [
      ['IMC', r.imc != null ? fmtNum(r.imc) + ' kg/m² — ' + (r.imcClasse || '') : '—', true],
      ['Peso p/ cálculo', r.pesoCalc != null ? fmtNum(r.pesoCalc) + ' kg (' + (r.metodoPeso || '—') + ')' : '—'],
      ['Estatura utilizada', r.estatura != null ? fmtNum(r.estatura, 2) + ' m' : '—'],
      ['% perda de peso', r.pp != null ? fmtNum(r.pp) + '% — ' + (r.ppClasse || '') : (r.ppClasse || '—')],
      ['Evolução', r.tendencia ? r.tendencia + (r.varIntPct != null ? ' (' + fmtNum(r.varIntPct) + '%)' : '') : '—'],
      ['CB', r.cb || '—'],
      ['DCT (PCT)', r.dct || '—'],
      ['CMB', r.cmb || '—'],
      ['Massa muscular (CP)', r.cp || '—'],
      ['Força (FPP)', r.fpp || '—'],
      ['SARC-F', r.sf != null ? r.sf + '/10 — ' + r.sfInterp : '—']
    ];
    return el('div', { class: 'res-grid' }, pairs.map(([k, v, big]) =>
      el('div', { class: 'box' + (big ? ' big' : '') },
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v', text: v })
      )
    ));
  }

  function openSavedResultModal(res, isEdit) {
    const r = res.resultado;
    const body = el('div', null,
      el('div', { class: 'a-row', style: 'margin-bottom:6px;flex-wrap:wrap' },
        el('span', { class: 'a-chip ok', text: isEdit ? 'Alterações salvas' : 'Salvo na planilha' }),
        el('span', { class: 'a-small a-muted', text: `${r.mat} · ${r.nome} · ${r.tipo} ${r.n || ''} · linha ${res.row}` })
      ),
      el('p', { class: 'a-small a-muted', style: 'margin:0', text: 'Resultado oficial calculado pela planilha:' }),
      buildResultGrid(r),
      (res.avisos || []).map((w) => el('div', { class: 'a-banner warn', text: w })),
      el('button', { class: 'a-btn teal block a-mt', type: 'button', text: 'Copiar evolução p/ prontuário (PEP)', onclick: () => copyPep(r) }),
      el('div', { class: 'a-row a-mt' },
        el('button', { class: 'a-btn ghost a-grow', type: 'button', text: 'Fechar', onclick: () => m.close() }),
        isEdit ? null : el('button', { class: 'a-btn primary a-grow', type: 'button', text: 'Próximo paciente', onclick: () => { m.close(); goTab('avaliar'); qs('#f-mat').focus(); } })
      )
    );
    const m = openModal(isEdit ? 'Avaliação atualizada' : 'Avaliação registrada', body);
  }

  /* ==========================================================================
     ABA PACIENTES (Caso 2: bug [object HTMLDivElement]/null corrigido + Sparkline)
     ========================================================================== */
  function loadPacientes() {
    if (S.pacientes) return renderPacientes();
    replaceSafe(qs('#pac-list'), skeletonCards(5));
    Api.call('api_listarPacientes')
      .then((list) => { S.pacientes = list; refreshDatalist(); renderPacientes(); })
      .catch((err) => replaceSafe(qs('#pac-list'), el('div', { class: 'a-banner crit', text: err.message })));
  }

  function renderSparklineCard(historicoDesc) {
    const pts = historicoDesc.slice().reverse().filter((h) => h.pesoCalc != null || h.imc != null);
    if (pts.length < 2) return null;

    const pesos = pts.map((p) => p.pesoCalc).filter((v) => v != null);
    if (pesos.length < 2) return null;
    const minP = Math.min(...pesos) - 1;
    const maxP = Math.max(...pesos) + 1;
    const span = Math.max(maxP - minP, 1);

    const W = 420, H = 76, padX = 28, padY = 14;
    const xAt = (i) => padX + (i / (pts.length - 1)) * (W - padX * 2);
    const yAt = (v) => H - padY - ((v - minP) / span) * (H - padY * 2);

    let svgInner = '';
    const coords = pts.map((p, i) => ({ x: xAt(i), y: p.pesoCalc != null ? yAt(p.pesoCalc) : null, p })).filter((c) => c.y != null);
    const pathD = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    svgInner += `<path d="${pathD}" fill="none" stroke="var(--brand-primary)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    coords.forEach((c) => {
      svgInner += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="var(--brand-primary)" stroke="#fff" stroke-width="1.8"/>`;
      svgInner += `<text x="${c.x.toFixed(1)}" y="${(c.y - 7).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--brand-navy)">${fmtNum(c.p.pesoCalc)}</text>`;
      svgInner += `<text x="${c.x.toFixed(1)}" y="${H - 1}" text-anchor="middle" font-size="9" fill="var(--ink-muted)">${fmtDM(c.p.data)}</text>`;
    });

    const first = coords[0].p.pesoCalc, last = coords[coords.length - 1].p.pesoCalc;
    const diff = last - first;
    const diffPct = first > 0 ? (diff / first) * 100 : 0;

    const card = el('div', { class: 'spark-card' },
      el('div', { class: 'spark-title' },
        el('span', { text: 'Evolução ponderal (kg)' }),
        el('span', { style: 'color:' + (diffPct <= -5 ? 'var(--critical)' : diff < 0 ? 'var(--warning)' : 'var(--good)'), text: `${diff > 0 ? '+' : ''}${fmtNum(diff)} kg (${diffPct > 0 ? '+' : ''}${fmtNum(diffPct)}%)` })
      )
    );
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'spark-svg');
    svg.innerHTML = svgInner;
    card.appendChild(svg);
    return card;
  }

  function openPatientDetailModal(pacBasic) {
    const content = el('div', null, skeletonCards(2));
    const m = openModal(pacBasic.mat + ' · ' + (pacBasic.nome || ''), content);

    Api.call('api_buscarPaciente', pacBasic.mat)
      .then((res) => {
        if (!res.encontrado) {
          replaceSafe(content, el('div', { class: 'a-banner warn', text: 'Paciente não encontrado.' }));
          return;
        }
        const l = res.paciente;
        const canEdit = isEditor();

        // CORREÇÃO DEFINITIVA (Caso 2): usa replaceSafe() que achata arrays e ignora null!
        const avalItems = res.historico.length
          ? res.historico.map((av) =>
              el('button', {
                class: 'a-item',
                type: 'button',
                onclick: () => { m.close(); openEvalDetailModal(av); }
              },
                el('div', { class: 'top' },
                  el('b', { text: fmtDate(av.data) }),
                  el('span', { class: 'a-chip ' + (av.tipo === 'Inicial' ? 'info' : ''), text: av.tipo || 'Avaliação' }),
                  el('span', { class: 'a-small', text: (av.pesoCalc != null ? fmtNum(av.pesoCalc) + ' kg' : '—') + ' · IMC ' + fmtNum(av.imc) })
                ),
                av.imcClasse ? el('div', { class: 'meta', text: av.imcClasse + (av.cb ? ' · CB: ' + av.cb : '') }) : null
              )
            )
          : el('div', { class: 'a-empty a-small', text: 'Ainda sem avaliações registradas.' });

        replaceSafe(content,
          el('dl', { class: 'm-kv' },
            el('dt', { text: 'Sexo' }), el('dd', { text: l.sexo || '—' }),
            el('dt', { text: 'Nascimento' }), el('dd', { text: fmtDate(l.nasc) + (l.idade != null ? ' (' + l.idade + ' anos)' : '') }),
            el('dt', { text: 'Setor / leito' }), el('dd', { text: (l.setor || '—') + (l.leito ? ' · Leito ' + l.leito : '') }),
            el('dt', { text: 'Internação' }), el('dd', { text: fmtDate(l.intern) }),
            el('dt', { text: 'Alta' }), el('dd', { text: l.alta ? fmtDate(l.alta) : '—' }),
            el('dt', { text: 'Amputação' }), el('dd', { text: l.amput || '—' }),
            el('dt', { text: 'Raça / cor' }), el('dd', { text: l.raca || '—' }),
            el('dt', { text: 'Acompanhamento' }), el('dd', { text: l.status || '—' }),
            el('dt', { text: 'Próxima reavaliação' }), el('dd', { text: l.proxima ? fmtDate(l.proxima) : '—' })
          ),
          l.check && l.check !== 'OK' ? el('div', { class: 'a-banner warn a-mt', text: l.check }) : null,
          renderSparklineCard(res.historico),
          el('p', {
            class: 'a-small a-muted',
            style: 'margin:14px 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:.05em',
            text: `Avaliações (${res.historico.length}) — toque para abrir / copiar PEP`
          }),
          avalItems,
          canEdit ? el('div', { class: 'a-row a-mt' },
            el('button', { class: 'a-btn ghost a-grow', type: 'button', text: 'Editar cadastro', onclick: () => { m.close(); openPatientFormModal(l, 'pac'); } }),
            el('button', { class: 'a-btn primary a-grow', type: 'button', text: 'Nova avaliação', onclick: () => { m.close(); startEvaluationFor(l.mat); } })
          ) : null,
          res.historico.length === 0 && canEdit ? el('button', {
            class: 'a-btn danger block a-mt',
            type: 'button',
            text: 'Excluir cadastro',
            onclick: () => {
              confirmModal('Excluir cadastro?', `O paciente ${l.mat} (${l.nome}) não tem avaliações. O cadastro será apagado da planilha (registrado no LOG_APP).`, 'Excluir', true)
                .then((ok) => {
                  if (!ok) return;
                  Api.call('api_excluirPaciente', l.row, l.mat)
                    .then(() => { m.close(); clearCaches(); toast('Cadastro excluído', 'ok'); loadPacientes(); })
                    .catch((err) => toast(err.message, 'err'));
                });
            }
          }) : null
        );
      })
      .catch((err) => replaceSafe(content, el('div', { class: 'a-banner crit', text: err.message })));
  }

  function renderPacientes() {
    const q = normTxt(qs('#pac-q').value);
    let list = (S.pacientes || []).slice().reverse();
    if (S.pacFiltro === 'int') list = list.filter((p) => !p.alta);
    else if (S.pacFiltro === 'alta') list = list.filter((p) => Boolean(p.alta));
    if (q) list = list.filter((p) => normTxt(p.mat + ' ' + p.nome + ' ' + p.leito + ' ' + p.setor).indexOf(q) >= 0);

    const wrap = qs('#pac-list');
    if (!list.length) { replaceSafe(wrap, el('div', { class: 'a-empty', text: 'Nenhum paciente encontrado.' })); return; }

    const shown = list.slice(0, 80);
    replaceSafe(wrap,
      shown.map((p) => el('button', { class: 'a-item', type: 'button', onclick: () => openPatientDetailModal(p) },
        el('div', { class: 'top' },
          el('span', { class: 'mat', text: p.mat }),
          el('span', { class: 'nome', text: p.nome }),
          el('span', { class: 'sec-pill ' + sectorBadgeClass(p.setor), text: normSetorLabel(p.setor) }),
          p.alta ? el('span', { class: 'a-chip', text: 'Alta ' + fmtDM(p.alta) }) : el('span', { class: 'a-chip info', text: p.nAval + ' aval.' })
        ),
        el('div', { class: 'meta' },
          el('span', { text: [p.leito && ('Leito ' + p.leito), p.idade != null && (p.idade + ' anos'), p.sexo].filter(Boolean).join(' · ') }),
          p.status ? el('span', { text: p.status.replace(/\s*\(.*?\)/, '') }) : null
        )
      )),
      list.length > shown.length ? el('div', { class: 'a-empty a-small', text: `Mostrando ${shown.length} de ${list.length}. Refine a busca.` }) : null
    );
  }

  function openPatientFormModal(pac, returnTab) {
    if (!isEditor()) { toast('Seu perfil é Somente Consulta.', 'err'); return; }
    pac = pac || {};
    const init = S.init || { setores: [], amputacoes: [], racas: [] };
    const isEdit = Boolean(pac.row);
    const f = {};
    const wrapField = (lbl, input, hint) => el('div', { class: 'f-field' }, el('label', null, lbl, hint ? el('span', { class: 'hint', text: hint }) : null), input);
    const makeSel = (opts, val, empty) => {
      const sel = el('select', { class: 'f-in' }, empty ? el('option', { value: '', text: '—' }) : null, opts.map((o) => el('option', { value: o, text: o })));
      sel.value = val || '';
      return sel;
    };

    // Normaliza setor antigo para uma das 5 opções oficiais se possível
    let setorVal = pac.setor || '';
    if (setorVal && init.setores.indexOf(setorVal) < 0) {
      const n = normSetorLabel(setorVal).replace('PÉLVICA', 'PELVICA');
      if (init.setores.indexOf(n) >= 0) setorVal = n;
    }

    f.mat = el('input', { class: 'f-in', type: 'text', inputmode: 'numeric', value: pac.mat || '', disabled: isEdit, placeholder: 'ex.: 5242148' });
    f.nome = el('input', { class: 'f-in', type: 'text', value: pac.nome || '', maxlength: 20, placeholder: 'ex.: M.A.F', autocapitalize: 'characters' });
    f.sexo = makeSel(['F', 'M'], pac.sexo, true);
    f.nasc = el('input', { class: 'f-in', type: 'date', value: pac.nasc || '' });
    f.leito = el('input', { class: 'f-in', type: 'text', value: pac.leito || '', placeholder: 'ex.: 606.1' });
    f.setor = makeSel(init.setores, setorVal, true);
    f.intern = el('input', { class: 'f-in', type: 'date', value: pac.intern || init.hoje || todayISO() });
    f.alta = el('input', { class: 'f-in', type: 'date', value: pac.alta || '' });
    f.amput = makeSel(init.amputacoes, pac.amput || 'Sem amputação', false);
    f.raca = makeSel(init.racas, pac.raca, true);
    f.obs = el('textarea', { class: 'f-in', maxlength: 300 });
    f.obs.value = pac.obs || '';

    const errBox = el('div', { class: 'a-banner crit hide' });
    const btnSave = el('button', { class: 'a-btn primary a-grow', type: 'button', text: isEdit ? 'Salvar alterações' : 'Cadastrar' });
    const form = el('div', null,
      wrapField('Matrícula', f.mat),
      wrapField('Iniciais do paciente', f.nome, 'só iniciais — LGPD'),
      el('div', { class: 'f-grid' }, wrapField('Sexo', f.sexo), wrapField('Data de nascimento', f.nasc)),
      el('div', { class: 'f-grid' }, wrapField('Setor / clínica', f.setor, 'padronizado'), wrapField('Leito', f.leito)),
      el('div', { class: 'f-grid' }, wrapField('Data de internação', f.intern), wrapField('Data da alta', f.alta, 'se houver')),
      wrapField('Amputação (segmento)', f.amput, 'ajusta o peso'),
      wrapField('Raça / cor', f.raca, 'equações de Chumlea'),
      wrapField('Observações', f.obs),
      errBox,
      el('div', { class: 'a-row' },
        el('button', { class: 'a-btn ghost a-grow', type: 'button', text: 'Cancelar', onclick: () => m.close() }),
        btnSave
      )
    );
    const m = openModal(isEdit ? 'Editar cadastro' : 'Novo paciente', form);

    btnSave.addEventListener('click', () => {
      const payload = {
        row: pac.row,
        mat: cleanMat(f.mat.value),
        nome: f.nome.value.trim().toUpperCase(),
        sexo: f.sexo.value,
        nasc: f.nasc.value,
        leito: f.leito.value.trim(),
        setor: f.setor.value,
        intern: f.intern.value,
        alta: f.alta.value,
        amput: f.amput.value,
        raca: f.raca.value,
        obs: f.obs.value
      };
      errBox.classList.add('hide');
      setBusy(btnSave, true, 'Salvando…');
      Api.call('api_salvarPaciente', payload)
        .then((res) => {
          setBusy(btnSave, false);
          m.close();
          clearCaches();
          renderCapacityBanner(res.capacidade);
          toast(isEdit ? 'Cadastro atualizado' : 'Paciente cadastrado', 'ok');
          if (returnTab === 'avaliar') startEvaluationFor(res.paciente.mat);
          else loadPacientes();
        })
        .catch((err) => {
          setBusy(btnSave, false);
          errBox.textContent = err.message;
          errBox.classList.remove('hide');
          errBox.scrollIntoView({ block: 'nearest' });
        });
    });
  }

  /* ==========================================================================
     ABA HISTÓRICO + MODAL AVALIAÇÃO + COPIAR PEP
     ========================================================================== */
  function loadHistorico() {
    if (S.hist) return renderHistorico();
    replaceSafe(qs('#hist-list'), skeletonCards(5));
    Api.call('api_listarAvaliacoes', { mat: cleanMat(qs('#hist-q').value), limit: 60 })
      .then((res) => { S.hist = res; renderHistorico(); })
      .catch((err) => replaceSafe(qs('#hist-list'), el('div', { class: 'a-banner crit', text: err.message })));
  }

  function openEvalDetailModal(ev) {
    const canEdit = isEditor();
    const pepPreview = el('div', { class: 'pep-box hide', text: buildPepText(ev) });
    const body = el('div', null,
      el('p', { class: 'a-small a-muted', style: 'margin:0', text: `${ev.mat} · ${ev.nome} · ${ev.setor} · linha ${ev.row}` }),
      buildResultGrid(ev),
      ev.conferir && ev.conferir !== 'OK' ? el('div', { class: 'a-banner warn', text: 'Planilha: ' + ev.conferir }) : null,
      el('div', { class: 'a-row a-mt' },
        el('button', { class: 'a-btn teal a-grow', type: 'button', text: 'Copiar evolução (PEP)', onclick: () => copyPep(ev) }),
        el('button', { class: 'a-btn ghost sm', type: 'button', text: 'Prévia', onclick: () => pepPreview.classList.toggle('hide') })
      ),
      pepPreview,
      canEdit ? el('div', { class: 'a-row a-mt' },
        el('button', {
          class: 'a-btn danger a-grow',
          type: 'button',
          text: 'Excluir',
          onclick: () => {
            confirmModal('Excluir avaliação?', `Avaliação de ${fmtDate(ev.data)} do paciente ${ev.mat}. Os campos digitados serão apagados da planilha (registrado no LOG_APP).`, 'Excluir', true)
              .then((ok) => {
                if (!ok) return;
                Api.call('api_excluirAvaliacao', ev.row, ev.mat, ev.data)
                  .then(() => { m.close(); clearCaches(); toast('Avaliação excluída', 'ok'); loadHistorico(); })
                  .catch((err) => toast(err.message, 'err'));
              });
          }
        }),
        el('button', {
          class: 'a-btn primary a-grow',
          type: 'button',
          text: 'Editar',
          onclick: () => { m.close(); loadEvalIntoForm(ev); }
        })
      ) : null
    );
    const m = openModal('Avaliação de ' + fmtDate(ev.data), body);
  }

  function loadEvalIntoForm(ev) {
    Api.call('api_getAvaliacao', ev.row, ev.mat)
      .then((res) => {
        resetEvalForm();
        const inp = res.entrada;
        S.editing = { row: ev.row, mat: ev.mat, dataOriginal: ev.data };
        goTab('avaliar');
        qs('#f-mat').value = inp.mat;
        qs('#f-mat').disabled = true;
        qs('#btn-buscar').disabled = true;
        qs('#f-data').value = inp.data || '';
        NUM_FIELDS.forEach((k) => {
          fieldEl(k).value = inp[k] == null ? '' : String(inp[k]).replace('.', ',');
        });
        S.edema = inp.edema || 0;
        S.ascite = inp.ascite || 0;
        renderEdemaAscite();
        const hasSf = inp.sfAp === 'S';
        toggleSarcF(hasSf);
        if (hasSf) {
          S.sfv = [inp.sf1, inp.sf2, inp.sf3, inp.sf4, inp.sf5];
          renderSarcF();
        }
        qs('#f-obs').value = inp.obs || '';
        qs('#av-title').textContent = 'Editar avaliação';
        qs('#av-sub').classList.add('hide');
        replaceSafe(qs('#edit-banner'), el('div', { class: 'a-banner warn', text: `Editando avaliação de ${fmtDate(ev.data)} (matrícula ${ev.mat}). Os dados anteriores ficam salvos no LOG_APP.` }));
        qs('#btn-cancel-edit').classList.remove('hide');
        qs('#btn-save-aval').textContent = 'Salvar alterações';
        lookupPatient(cleanMat(ev.mat), false);
      })
      .catch((err) => toast(err.message, 'err'));
  }

  function renderHistorico() {
    const h = S.hist;
    const wrap = qs('#hist-list');
    if (!h.itens.length) { replaceSafe(wrap, el('div', { class: 'a-empty', text: 'Nenhuma avaliação encontrada.' })); return; }

    replaceSafe(wrap,
      h.itens.map((ev) => el('button', { class: 'a-item', type: 'button', onclick: () => openEvalDetailModal(ev) },
        el('div', { class: 'top' },
          el('b', { text: fmtDate(ev.data) }),
          el('span', { class: 'mat', style: 'font-size:14px', text: ev.mat }),
          el('span', { class: 'nome', text: ev.nome }),
          el('span', { class: 'a-chip ' + (ev.tipo === 'Inicial' ? 'info' : ''), text: ev.tipo })
        ),
        el('div', { class: 'meta' },
          el('span', { text: (ev.pesoCalc != null ? fmtNum(ev.pesoCalc) + ' kg' : 'sem peso') + ' · IMC ' + fmtNum(ev.imc) }),
          ev.imcClasse ? el('span', { text: ev.imcClasse }) : null,
          ev.conferir && ev.conferir.charAt(0) === '!' ? el('span', { class: 'a-chip warn', text: 'conferir' }) : null
        )
      )),
      h.total > h.itens.length ? el('div', { class: 'a-empty a-small', text: `Mostrando as ${h.itens.length} mais recentes de ${h.total}. Use o filtro de matrícula.` }) : null
    );
  }

  /* ==========================================================================
     ABA PAINEL
     ========================================================================== */
  function loadPainel() {
    if (S.dash) {
      qs('#painel-load').classList.add('hide');
      qs('#painel-body').classList.remove('hide');
      return;
    }
    qs('#painel-load').classList.remove('hide');
    qs('#painel-body').classList.add('hide');
    replaceSafe(qs('#painel-load'), el('div', { style: 'max-width:960px;margin:18px auto;padding:0 14px' }, skeletonCards(3)));

    Api.call('api_dashboard')
      .then((data) => {
        S.dash = data;
        qs('#painel-load').classList.add('hide');
        qs('#painel-body').classList.remove('hide');
        window.Dash.load(data, S.alertas ? S.alertas.itens : []);
      })
      .catch((err) => replaceSafe(qs('#painel-load'), el('div', { class: 'a-banner crit', style: 'margin:16px', text: err.message })));
  }

  /* ==========================================================================
     EXPORTAR (XLSX, PDF Executivo, PDF Passagem de Plantão, CSV Internados)
     ========================================================================== */
  const ICO_XLSX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>';
  const ICO_PDF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';
  const ICO_LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>';

  function openDownloadModal(title, filename, blob, metaExtra) {
    const canShare = Boolean(navigator.canShare && (() => {
      try { return navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] }); } catch (e) { return false; }
    })());
    const kb = blob.size >= 1048576 ? (blob.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(blob.size / 1024)) + ' KB';

    const body = el('div', { class: 'x-done' },
      el('p', { class: 'x-name', text: filename }),
      el('p', { class: 'x-meta', text: kb + (metaExtra ? ' · ' + metaExtra : '') }),
      el('div', { class: 'a-row' },
        el('button', {
          class: 'a-btn primary a-grow',
          type: 'button',
          text: 'Baixar',
          onclick: () => {
            const url = URL.createObjectURL(blob);
            const a = el('a', { href: url, download: filename, style: 'display:none' });
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
            toast('Download iniciado', 'ok');
          }
        }),
        canShare ? el('button', {
          class: 'a-btn a-grow',
          type: 'button',
          text: 'Compartilhar',
          onclick: () => {
            const f = new File([blob], filename, { type: blob.type });
            navigator.share({ files: [f], title: filename, text: filename }).catch((e) => {
              if (e && e.name !== 'AbortError') toast(e.message, 'err');
            });
          }
        }) : null
      )
    );
    openModal(title, body);
  }

  function openExportModal() {
    const optXlsx = el('button', { class: 'x-opt', type: 'button' },
      el('span', { class: 'x-ico', html: ICO_XLSX }),
      el('span', null, el('b', { text: 'Planilha completa (.xlsx)' }), el('small', { text: 'Cópia oficial de todas as abas e fórmulas do Google Planilhas.' }))
    );
    const optPdf = el('button', { class: 'x-opt', type: 'button' },
      el('span', { class: 'x-ico', html: ICO_PDF }),
      el('span', null, el('b', { text: 'Relatório Executivo do Painel (PDF)' }), el('small', { text: 'Padrão INCA/MS com filtros atuais, comparativo de período e Matriz de Obesidade Sarcopênica (LGPD).' }))
    );
    const optPlantao = el('button', { class: 'x-opt', type: 'button' },
      el('span', { class: 'x-ico teal', html: ICO_LIST }),
      el('span', null, el('b', { text: 'Passagem de Plantão / Risco (PDF)' }), el('small', { text: 'Lista operacional por Setor → Leito (matrícula, iniciais, ciclo e variação ponderal — LGPD).' }))
    );
    const optCsv = el('button', { class: 'x-opt', type: 'button' },
      el('span', { class: 'x-ico teal', html: ICO_XLSX }),
      el('span', null, el('b', { text: 'Resumo Atual de Internados (.csv p/ Excel)' }), el('small', { text: '1 linha por paciente internado com última avaliação, ciclo e tendência ponderal.' }))
    );

    const m = openModal('Exportar relatórios', el('div', null,
      optPdf, optPlantao, optCsv, optXlsx,
      el('p', { class: 'x-note', text: 'LGPD: compartilhe arquivos com matrícula/iniciais apenas com profissionais autorizados do HC II.' })
    ));

    optXlsx.addEventListener('click', () => {
      m.close();
      toast('Gerando planilha completa (.xlsx)…', '', 12000);
      Api.call('api_exportarXlsx')
        .then((res) => {
          const bin = atob(res.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          openDownloadModal('Planilha pronta', res.name, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        })
        .catch((err) => toast(err.message, 'err'));
    });

    optPdf.addEventListener('click', () => {
      m.close();
      toast('Montando Relatório Executivo (PDF)…', '', 12000);
      const ready = S.dash ? Promise.resolve() : Api.call('api_dashboard').then((d) => { S.dash = d; window.Dash.load(d, S.alertas ? S.alertas.itens : []); });
      ready
        .then(() => window.Report.buildPanelPdf({ user: S.init && S.init.user ? S.init.user.email : '' }))
        .then((res) => {
          openDownloadModal('Relatório Executivo pronto', res.name, res.blob, `${res.pages} pág. · ${res.n} registros`);
          Api.call('api_registrarExportacao', 'PDF', `${res.n} registros; ${res.pages} pág.`).catch(() => {});
        })
        .catch((err) => toast(err.message, 'err'));
    });

    optPlantao.addEventListener('click', () => {
      m.close();
      toast('Gerando Lista de Passagem de Plantão (PDF)…', '', 10000);
      const ready = S.alertas ? Promise.resolve(S.alertas) : Api.call('api_alertas').then((d) => { S.alertas = d; return d; });
      ready
        .then((al) => window.Report.buildHandoverPdf(al, { user: S.init && S.init.user ? S.init.user.email : '' }))
        .then((res) => {
          openDownloadModal('Passagem de Plantão pronta', res.name, res.blob, `${res.pages} pág. · ${res.n} internados`);
          Api.call('api_registrarExportacao', 'PDF_PLANTAO', `${res.n} internados`).catch(() => {});
        })
        .catch((err) => toast(err.message, 'err'));
    });

    optCsv.addEventListener('click', () => {
      m.close();
      const ready = S.alertas ? Promise.resolve(S.alertas) : Api.call('api_alertas').then((d) => { S.alertas = d; return d; });
      ready
        .then((al) => {
          const res = window.Report.buildInternadosCsv(al);
          openDownloadModal('Resumo de Internados pronto', res.name, res.blob, `${res.n} pacientes`);
          Api.call('api_registrarExportacao', 'CSV_INTERNADOS', `${res.n} internados`).catch(() => {});
        })
        .catch((err) => toast(err.message, 'err'));
    });
  }

  /* ==========================================================================
     AUTENTICAÇÃO & INICIALIZAÇÃO
     ========================================================================== */
  function showLoginScreen(errMsg) {
    qs('#app-shell').classList.add('hide');
    qs('#login-screen').classList.remove('hide');
    const errBox = qs('#login-err');
    if (errMsg) {
      errBox.textContent = errMsg;
      errBox.classList.remove('hide');
    } else {
      errBox.classList.add('hide');
    }

    const gisWrap = qs('#gis-button');
    gisWrap.innerHTML = '';
    const allowDemo = !(window.HC2_CONFIG && window.HC2_CONFIG.ALLOW_DEMO === false);
    const demoBlock = qs('#login-demo-block');
    if (demoBlock) demoBlock.classList.toggle('hide', !allowDemo);
    if (Api.isConfigured()) {
      qs('#login-config-note').classList.add('hide');
      initGoogleButton(gisWrap);
    } else {
      qs('#login-config-note').classList.remove('hide');
    }
  }

  function initGoogleButton(container) {
    const clientId = (window.HC2_CONFIG || {}).OAUTH_CLIENT_ID;
    const render = () => {
      if (!(window.google && google.accounts && google.accounts.id)) {
        container.textContent = 'Carregando botão Google…';
        setTimeout(render, 350);
        return;
      }
      container.innerHTML = '';
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response && response.credential) {
            Api.setToken(response.credential);
            bootApp();
          }
        }
      });
      google.accounts.id.renderButton(container, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        locale: 'pt-BR',
        width: 280
      });
    };
    render();
  }

  function bootApp() {
    qs('#login-screen').classList.add('hide');
    qs('#app-shell').classList.remove('hide');
    qs('#a-who').textContent = 'sincronizando…';
    replaceSafe(qs('#hoje-list'), skeletonCards(4));

    Api.call('api_batchInit')
      .then((bundle) => {
        S.init = bundle.init;
        S.alertas = bundle.alertas;
        S.pacientes = bundle.pacientes;

        const u = S.init.user;
        qs('#a-who').textContent = u.email;
        const roleEl = qs('#a-role');
        roleEl.className = 'a-role ' + (u.demo ? 'demo' : (u.role === 'leitor' ? 'leitor' : ''));
        roleEl.textContent = (u.demo ? 'Demo · ' : '') + (u.role === 'leitor' ? 'Consulta' : 'Editor');
        roleEl.classList.remove('hide');

        const canEdit = isEditor();
        qs('#btn-save-aval').disabled = !canEdit;
        qs('#btn-novo-pac').classList.toggle('hide', !canEdit);
        qs('#readonly-banner').classList.toggle('hide', canEdit);

        qs('#f-data').value = S.init.hoje || todayISO();
        renderEdemaAscite();
        renderCapacityBanner(S.init.capacidade);
        refreshDatalist();
        renderHoje();
      })
      .catch((err) => {
        if (err.message.indexOf('Sessão') >= 0 || err.message.indexOf('autorizado') >= 0) {
          showLoginScreen(err.message);
        } else {
          qs('#a-who').textContent = 'erro ao conectar';
          replaceSafe(qs('#hoje-list'), el('div', { class: 'a-banner crit', text: err.message }));
        }
      });
  }

  function bindGlobalEvents() {
    qsa('#a-nav button').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));
    qs('#a-refresh').addEventListener('click', () => {
      clearCaches();
      const active = (qs('#a-nav .active') || {}).dataset;
      goTab(active ? active.tab : 'hoje');
      toast('Atualizando dados…');
    });
    qs('#a-export').addEventListener('click', openExportModal);
    qs('#a-logout').addEventListener('click', () => {
      Api.logout();
      clearCaches();
      S.init = null;
      showLoginScreen();
    });

    // Hoje busca & ordenação
    qs('#hoje-q').addEventListener('input', debounce(renderHoje, 140));
    qs('#hoje-sort').addEventListener('change', (ev) => { S.hojeSort = ev.target.value; renderHoje(); });

    // Avaliar
    qs('#tog-sf').addEventListener('click', () => toggleSarcF(!S.sf));
    NUM_FIELDS.forEach((k) => {
      fieldEl(k).addEventListener('input', (ev) => {
        ev.target.classList.remove('prefilled', 'err');
        updateLivePreview();
      });
    });
    qs('#f-data').addEventListener('change', updateLivePreview);
    replaceSafe(qs('#q-tempo'), [[7, '1 semana'], [30, '1 mês'], [90, '3 meses'], [180, '6 meses']].map(([d, lbl]) =>
      el('button', { type: 'button', text: lbl, onclick: () => { fieldEl('tempoPerda').value = d; fieldEl('tempoPerda').classList.remove('prefilled'); updateLivePreview(); } })
    ));

    const debouncedLookup = debounce(() => {
      const m = cleanMat(qs('#f-mat').value);
      if (m.length >= 4) lookupPatient(m, true);
      else { S.lookup = null; qs('#pac-card').innerHTML = ''; updateScreeningBadges(); updateLivePreview(); }
    }, 420);
    qs('#f-mat').addEventListener('input', debouncedLookup);
    qs('#f-mat').addEventListener('change', () => { const m = cleanMat(qs('#f-mat').value); if (m.length >= 4) lookupPatient(m, true); });
    qs('#btn-buscar').addEventListener('click', () => {
      const m = cleanMat(qs('#f-mat').value);
      if (m.length >= 4) lookupPatient(m, true);
      else toast('Digite a matrícula completa (4+ dígitos).', 'err');
    });
    qs('#btn-save-aval').addEventListener('click', saveEvaluation);
    qs('#btn-cancel-edit').addEventListener('click', () => { resetEvalForm(); goTab('hist'); });

    // Pacientes
    qs('#btn-novo-pac').addEventListener('click', () => openPatientFormModal({}, 'pac'));
    qs('#pac-q').addEventListener('input', debounce(renderPacientes, 150));
    replaceSafe(qs('#pac-filters'), [['todos', 'Todos'], ['int', 'Internados'], ['alta', 'Com alta']].map(([k, lbl]) =>
      el('button', {
        class: 'chip ' + (S.pacFiltro === k ? 'active' : 'all-included'),
        type: 'button',
        dataset: { f: k },
        text: lbl,
        onclick: () => {
          S.pacFiltro = k;
          qsa('#pac-filters .chip').forEach((b) => {
            b.classList.toggle('active', b.dataset.f === k);
            b.classList.toggle('all-included', b.dataset.f !== k);
          });
          renderPacientes();
        }
      })
    ));

    // Histórico
    qs('#hist-q').addEventListener('input', debounce(() => { S.hist = null; loadHistorico(); }, 380));

    // Login Demo buttons
    qs('#btn-demo-editor').addEventListener('click', () => { Api.enableDemo('editor'); bootApp(); });
    qs('#btn-demo-leitor').addEventListener('click', () => { Api.enableDemo('leitor'); bootApp(); });

    // PWA Install prompt (Android / Desktop Chrome)
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (ev) => {
      ev.preventDefault();
      deferredPrompt = ev;
      qs('#install-bar').classList.remove('hide');
    });
    qs('#btn-install-pwa').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      qs('#install-bar').classList.add('hide');
    });
    qs('#btn-dismiss-install').addEventListener('click', () => qs('#install-bar').classList.add('hide'));
  }

  function start() {
    if (start._started) return;
    start._started = true;
    bindGlobalEvents();
    Api.setAuthHandler((msg) => showLoginScreen(msg));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    if (Api.isConfigured() && Api.hasValidToken()) {
      bootApp();
    } else if (Api.restoreDemoIfAny()) {
      bootApp();
    } else {
      showLoginScreen();
    }
  }

  return { start, goTab };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.App.start);
else window.App.start();
