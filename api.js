/**
 * CLIENTE API + AUTENTICAÇÃO GOOGLE (GIS) + MODO DEMONSTRAÇÃO
 * Antropometria HC II (v2)
 */
window.Api = (function () {
  'use strict';

  const TOKEN_KEY = 'hc2_v2_id_token';
  const DEMO_ROLE_KEY = 'hc2_v2_demo_role';

  let idToken = localStorage.getItem(TOKEN_KEY) || '';
  let demoMode = false;
  let demoRole = 'editor';
  let onAuthRequired = null;

  function cfg() {
    return window.HC2_CONFIG || {};
  }

  function isConfigured() {
    const c = cfg();
    return Boolean(
      c.GAS_API_URL && c.GAS_API_URL.indexOf('COLE_AQUI') < 0 &&
      c.OAUTH_CLIENT_ID && c.OAUTH_CLIENT_ID.indexOf('COLE_AQUI') < 0
    );
  }

  function decodeJwtPayload(tok) {
    try {
      const parts = String(tok || '').split('.');
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(b64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function hasValidToken() {
    if (!idToken) return false;
    const p = decodeJwtPayload(idToken);
    if (!p || !p.exp) return false;
    return Number(p.exp) * 1000 > Date.now() + 30000;
  }

  function setToken(tok) {
    demoMode = false;
    idToken = tok || '';
    if (idToken) localStorage.setItem(TOKEN_KEY, idToken);
    else localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_ROLE_KEY);
  }

  function enableDemo(role) {
    demoMode = true;
    demoRole = role === 'leitor' ? 'leitor' : 'editor';
    localStorage.setItem(DEMO_ROLE_KEY, demoRole);
  }

  function restoreDemoIfAny() {
    const r = localStorage.getItem(DEMO_ROLE_KEY);
    if (r && cfg().ALLOW_DEMO !== false) {
      demoMode = true;
      demoRole = r === 'leitor' ? 'leitor' : 'editor';
      return true;
    }
    return false;
  }

  function logout() {
    demoMode = false;
    idToken = '';
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_ROLE_KEY);
    if (window.google && google.accounts && google.accounts.id) {
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    }
  }

  async function call(action) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (demoMode) {
      return demoDispatch(action, args);
    }
    if (!isConfigured()) {
      throw new Error('Configure GAS_API_URL e OAUTH_CLIENT_ID em config.js (ou use o Modo Demonstração).');
    }
    if (!hasValidToken()) {
      setToken('');
      if (onAuthRequired) onAuthRequired('Sessão expirada. Entre novamente com sua conta Google.');
      throw new Error('Sessão expirada. Entre novamente com sua conta Google.');
    }

    const resp = await fetch(cfg().GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, idToken: idToken, args: args })
    });

    if (!resp.ok) {
      throw new Error('Erro de comunicação com o servidor (HTTP ' + resp.status + ').');
    }
    const json = await resp.json();
    if (!json || !json.ok) {
      if (json && json.code === 'UNAUTHORIZED') {
        setToken('');
        if (onAuthRequired) onAuthRequired(json.error || 'Sessão expirada.');
      }
      throw new Error((json && json.error) || 'Erro desconhecido na API.');
    }
    return json.data;
  }

  /* ===================== BASE FICTÍCIA P/ MODO DEMONSTRAÇÃO ===================== */
  let demoDB = null;

  function initDemoDB() {
    if (demoDB) return demoDB;
    const hoje = '2026-11-18';
    const edemaKg = [[0, 0], [1, 1], [2, 3], [3, 5], [4, 10]];
    const asciteKg = [[0, 0], [1, 2.2], [2, 6], [3, 14]];
    const imcAdulto = [
      ['Magreza grau III', 0], ['Magreza grau II', 16], ['Magreza grau I', 17],
      ['Eutrofia', 18.5], ['Sobrepeso / Pré-obesidade', 25],
      ['Obesidade grau I', 30], ['Obesidade grau II', 35], ['Obesidade grau III', 40]
    ];
    const imcIdoso = [['Baixo peso (idoso)', 0], ['Eutrofia', 22], ['Sobrepeso (idoso)', 27]];
    const amputacoes = [
      'Sem amputação', 'Mão', 'Antebraço e mão', 'Antebraço',
      'Braço até o ombro (membro superior inteiro)', 'Braço (acima do cotovelo)',
      'Pé', 'Perna abaixo do joelho (com pé)', 'Perna abaixo do joelho (sem pé)',
      'Perna acima do joelho', 'Perna inteira (com quadril)', 'Coxa'
    ];
    const racas = ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não informada'];

    const pacientes = [
      { row: 4,  mat: '5242148', nome: 'M.A.F', sexo: 'F', nasc: '1958-04-12', idade: 68, leito: '606.1', setor: 'GINECO',        intern: '2026-10-20', prim: '2026-10-21', alta: null, diasInt: 29, amput: 'Sem amputação', pctAmput: 0, nAval: 3, ultima: '2026-11-04', proxima: '2026-11-14', diasReav: -4,  status: 'REAVALIAÇÃO ATRASADA', obs: '', raca: 'Parda', check: 'OK' },
      { row: 5,  mat: '5310922', nome: 'J.C.S', sexo: 'M', nasc: '1962-09-03', idade: 64, leito: '412.2', setor: 'ONCO',          intern: '2026-10-15', prim: '2026-10-16', alta: null, diasInt: 34, amput: 'Sem amputação', pctAmput: 0, nAval: 3, ultima: '2026-11-01', proxima: '2026-11-11', diasReav: -7,  status: 'REAVALIAÇÃO ATRASADA', obs: '', raca: 'Branca', check: 'OK' },
      { row: 6,  mat: '5401833', nome: 'R.L.O', sexo: 'F', nasc: '1975-02-19', idade: 51, leito: '508.1', setor: 'GINECO/ONCO',   intern: '2026-11-08', prim: '2026-11-08', alta: null, diasInt: 10, amput: 'Sem amputação', pctAmput: 0, nAval: 1, ultima: '2026-11-08', proxima: '2026-11-18', diasReav: 0,   status: 'REAVALIAR HOJE', obs: '', raca: 'Preta', check: 'OK' },
      { row: 7,  mat: '5198741', nome: 'A.P.M', sexo: 'F', nasc: '1981-07-28', idade: 45, leito: '304.3', setor: 'TOC',           intern: '2026-11-09', prim: '2026-11-10', alta: null, diasInt: 9,  amput: 'Sem amputação', pctAmput: 0, nAval: 1, ultima: '2026-11-10', proxima: '2026-11-20', diasReav: 2,   status: 'REAVALIAR EM 2 DIAS', obs: '', raca: 'Parda', check: 'OK' },
      { row: 8,  mat: '5510294', nome: 'E.R.V', sexo: 'F', nasc: '1954-11-05', idade: 72, leito: '610.2', setor: 'MASSA PELVICA', intern: '2026-11-17', prim: null,         alta: null, diasInt: 1,  amput: 'Sem amputação', pctAmput: 0, nAval: 0, ultima: null,         proxima: '2026-11-18', diasReav: 0,   status: 'AGUARDANDO 1ª AVALIAÇÃO', obs: '', raca: 'Branca', check: 'OK' },
      { row: 9,  mat: '5288410', nome: 'C.M.T', sexo: 'F', nasc: '1969-01-14', idade: 57, leito: '602.1', setor: 'GINECO',        intern: '2026-11-12', prim: '2026-11-13', alta: null, diasInt: 6,  amput: 'Sem amputação', pctAmput: 0, nAval: 1, ultima: '2026-11-13', proxima: '2026-11-23', diasReav: 5,   status: 'Em acompanhamento', obs: '', raca: 'Parda', check: 'OK' },
      { row: 10, mat: '5092311', nome: 'L.S.B', sexo: 'F', nasc: '1960-06-30', idade: 66, leito: '418.1', setor: 'ONCO',          intern: '2026-09-10', prim: '2026-09-11', alta: null, diasInt: 69, amput: 'Perna abaixo do joelho (com pé)', pctAmput: 5.9, nAval: 2, ultima: '2026-09-25', proxima: '2026-10-05', diasReav: -44, status: 'REAVALIAÇÃO ATRASADA', obs: 'Verificar se já recebeu alta', raca: 'Preta', check: 'OK' },
      { row: 11, mat: '5440918', nome: 'S.N.D', sexo: 'F', nasc: '1988-03-22', idade: 38, leito: '511.2', setor: 'GINECO/ONCO',   intern: '2026-10-01', prim: '2026-10-02', alta: '2026-10-25', diasInt: 24, amput: 'Sem amputação', pctAmput: 0, nAval: 2, ultima: '2026-10-16', proxima: null, diasReav: null, status: 'Alta hospitalar', obs: '', raca: 'Branca', check: 'OK' }
    ];

    const avaliacoes = [
      { row: 5,  mat: '5242148', data: '2026-10-21', n: 1, tipo: 'Inicial',      nome: 'M.A.F', sexo: 'F', idade: 68, setor: 'GINECO',        leito: '606.1', peso: 74.0, pesoCalc: 74.0, metodoPeso: 'Aferido', estatura: 1.58, imc: 29.6, imcClasse: 'Sobrepeso (idoso)',         pp: 3.9,  ppClasse: 'Perda não significativa', cb: 'Depleção moderada (P5 a P15)', dct: 'Eutrofia (P25 a P75)', cmb: 'Depleção moderada (P5 a P15)', cp: 'Massa muscular reduzida',   fpp: 'Força reduzida', sf: 5, sfInterp: 'Rastreio POSITIVO (>= 4)', varAnt: null, varIntPct: 0.0,  tendencia: 'Estável',                    conferir: 'OK', in: { peso: 74.0, pesoUsual: 77.0, estatura: 1.58, joelho: null, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 30, cb: 24.5, pct: 18.0, cp: 30.0, fpp: 14.0, sfAp: 'S', sf1: 1, sf2: 1, sf3: 1, sf4: 1, sf5: 1, obs: '' } },
      { row: 6,  mat: '5242148', data: '2026-10-28', n: 2, tipo: 'Reavaliação',  nome: 'M.A.F', sexo: 'F', idade: 68, setor: 'GINECO',        leito: '606.1', peso: 72.1, pesoCalc: 71.1, metodoPeso: 'Aferido (ajust. edema)', estatura: 1.58, imc: 28.5, imcClasse: 'Sobrepeso (idoso)', pp: 7.7, ppClasse: 'Perda GRAVE', cb: 'Depleção grave (< P5)', dct: 'Eutrofia (P25 a P75)', cmb: 'Depleção grave (< P5)', cp: 'Massa muscular reduzida', fpp: null, sf: null, sfInterp: '', varAnt: -2.9, varIntPct: -3.9, tendencia: 'Perda leve', conferir: 'OK', in: { peso: 72.1, pesoUsual: 77.0, estatura: 1.58, joelho: null, pesoRef: null, edema: 1, ascite: 0, tempoPerda: 30, cb: 23.8, pct: 17.5, cp: 29.5, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 7,  mat: '5242148', data: '2026-11-04', n: 3, tipo: 'Reavaliação',  nome: 'M.A.F', sexo: 'F', idade: 68, setor: 'GINECO',        leito: '606.1', peso: 70.3, pesoCalc: 69.3, metodoPeso: 'Aferido (ajust. edema)', estatura: 1.58, imc: 27.8, imcClasse: 'Sobrepeso (idoso)', pp: 10.0, ppClasse: 'Perda GRAVE', cb: 'Depleção grave (< P5)', dct: 'Depleção leve (P15 a P25)', cmb: 'Depleção grave (< P5)', cp: 'Massa muscular reduzida', fpp: 'Força reduzida', sf: 6, sfInterp: 'Rastreio POSITIVO (>= 4)', varAnt: -1.8, varIntPct: -6.4, tendencia: 'PERDA GRAVE na internação', conferir: 'OK', in: { peso: 70.3, pesoUsual: 77.0, estatura: 1.58, joelho: null, pesoRef: null, edema: 1, ascite: 0, tempoPerda: 60, cb: 23.2, pct: 16.0, cp: 29.0, fpp: 13.0, sfAp: 'S', sf1: 2, sf2: 1, sf3: 1, sf4: 1, sf5: 1, obs: 'Suplementação oral hiperproteica iniciada' } },
      { row: 8,  mat: '5310922', data: '2026-10-16', n: 1, tipo: 'Inicial',      nome: 'J.C.S', sexo: 'M', idade: 64, setor: 'ONCO',          leito: '412.2', peso: 61.5, pesoCalc: 59.3, metodoPeso: 'Aferido (ajust. ascite)', estatura: 1.71, imc: 20.3, imcClasse: 'Baixo peso (idoso)', pp: 11.5, ppClasse: 'Perda GRAVE', cb: 'Depleção grave (< P5)', dct: 'Depleção grave (< P5)', cmb: 'Depleção grave (< P5)', cp: 'Massa muscular reduzida', fpp: 'Força reduzida', sf: 7, sfInterp: 'Rastreio POSITIVO (>= 4)', varAnt: null, varIntPct: 0.0, tendencia: 'Estável', conferir: 'OK', in: { peso: 61.5, pesoUsual: 67.0, estatura: 1.71, joelho: 52, pesoRef: null, edema: 0, ascite: 1, tempoPerda: 90, cb: 22.0, pct: 8.0, cp: 28.5, fpp: 19.0, sfAp: 'S', sf1: 2, sf2: 1, sf3: 2, sf4: 1, sf5: 1, obs: '' } },
      { row: 9,  mat: '5310922', data: '2026-10-25', n: 2, tipo: 'Reavaliação',  nome: 'J.C.S', sexo: 'M', idade: 64, setor: 'ONCO',          leito: '412.2', peso: 59.8, pesoCalc: 57.6, metodoPeso: 'Aferido (ajust. ascite)', estatura: 1.71, imc: 19.7, imcClasse: 'Baixo peso (idoso)', pp: 14.0, ppClasse: 'Perda GRAVE', cb: 'Depleção grave (< P5)', dct: 'Depleção grave (< P5)', cmb: 'Depleção grave (< P5)', cp: 'Massa muscular reduzida', fpp: null, sf: null, sfInterp: '', varAnt: -1.7, varIntPct: -2.9, tendencia: 'Perda leve', conferir: 'OK', in: { peso: 59.8, pesoUsual: 67.0, estatura: 1.71, joelho: 52, pesoRef: null, edema: 0, ascite: 1, tempoPerda: 90, cb: 21.5, pct: 7.5, cp: 28.0, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 10, mat: '5310922', data: '2026-11-01', n: 3, tipo: 'Reavaliação',  nome: 'J.C.S', sexo: 'M', idade: 64, setor: 'ONCO',          leito: '412.2', peso: 58.2, pesoCalc: 56.0, metodoPeso: 'Aferido (ajust. ascite)', estatura: 1.71, imc: 19.2, imcClasse: 'Baixo peso (idoso)', pp: 16.4, ppClasse: 'Perda GRAVE', cb: 'Depleção grave (< P5)', dct: 'Depleção grave (< P5)', cmb: 'Depleção grave (< P5)', cp: 'Massa muscular reduzida', fpp: null, sf: null, sfInterp: '', varAnt: -1.6, varIntPct: -5.6, tendencia: 'PERDA GRAVE na internação', conferir: 'OK', in: { peso: 58.2, pesoUsual: 67.0, estatura: 1.71, joelho: 52, pesoRef: null, edema: 0, ascite: 1, tempoPerda: 90, cb: 21.1, pct: 7.2, cp: 27.8, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 11, mat: '5401833', data: '2026-11-08', n: 1, tipo: 'Inicial',      nome: 'R.L.O', sexo: 'F', idade: 51, setor: 'GINECO/ONCO',   leito: '508.1', peso: 81.2, pesoCalc: 81.2, metodoPeso: 'Aferido', estatura: 1.62, imc: 30.9, imcClasse: 'Obesidade grau I',         pp: 0.0,  ppClasse: 'Sem perda de peso',       cb: 'Depleção moderada (P5 a P15)', dct: 'Eutrofia (P25 a P75)', cmb: 'Depleção moderada (P5 a P15)', cp: 'Massa muscular preservada', fpp: null, sf: null, sfInterp: '', varAnt: null, varIntPct: 0.0, tendencia: 'Estável', conferir: 'OK', in: { peso: 81.2, pesoUsual: 81.0, estatura: 1.62, joelho: null, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 30, cb: 26.2, pct: 22.0, cp: 34.5, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 12, mat: '5198741', data: '2026-11-10', n: 1, tipo: 'Inicial',      nome: 'A.P.M', sexo: 'F', idade: 45, setor: 'TOC',           leito: '304.3', peso: 62.4, pesoCalc: 62.4, metodoPeso: 'Aferido', estatura: 1.64, imc: 23.2, imcClasse: 'Eutrofia',                 pp: 2.5,  ppClasse: 'Perda não significativa', cb: 'Eutrofia (P25 a P75)', dct: 'Eutrofia (P25 a P75)', cmb: 'Eutrofia (P25 a P75)', cp: 'Massa muscular preservada', fpp: 'Força preservada', sf: 1, sfInterp: 'Rastreio negativo (< 4)', varAnt: null, varIntPct: 0.0, tendencia: 'Estável', conferir: 'OK', in: { peso: 62.4, pesoUsual: 64.0, estatura: 1.64, joelho: null, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 30, cb: 29.0, pct: 20.0, cp: 35.0, fpp: 24.0, sfAp: 'S', sf1: 0, sf2: 0, sf3: 1, sf4: 0, sf5: 0, obs: '' } },
      { row: 13, mat: '5288410', data: '2026-11-13', n: 1, tipo: 'Inicial',      nome: 'C.M.T', sexo: 'F', idade: 57, setor: 'GINECO',        leito: '602.1', peso: 76.5, pesoCalc: 76.5, metodoPeso: 'Aferido', estatura: 1.60, imc: 29.9, imcClasse: 'Sobrepeso / Pré-obesidade', pp: 0.0, ppClasse: 'Sem perda de peso',       cb: 'Depleção leve (P15 a P25)', dct: 'Eutrofia (P25 a P75)', cmb: 'Depleção moderada (P5 a P15)', cp: 'Massa muscular reduzida', fpp: null, sf: null, sfInterp: '', varAnt: null, varIntPct: 0.0, tendencia: 'Estável', conferir: 'OK', in: { peso: 76.5, pesoUsual: 76.5, estatura: 1.60, joelho: null, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 30, cb: 26.8, pct: 24.0, cp: 30.2, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 14, mat: '5092311', data: '2026-09-11', n: 1, tipo: 'Inicial',      nome: 'L.S.B', sexo: 'F', idade: 66, setor: 'ONCO',          leito: '418.1', peso: 68.0, pesoCalc: 72.3, metodoPeso: 'Aferido (ajust. amput.)', estatura: 1.56, imc: 29.7, imcClasse: 'Sobrepeso (idoso)', pp: 4.5, ppClasse: 'Perda não significativa', cb: 'Depleção moderada (P5 a P15)', dct: 'Eutrofia (P25 a P75)', cmb: 'Depleção moderada (P5 a P15)', cp: 'Massa muscular reduzida', fpp: null, sf: null, sfInterp: '', varAnt: null, varIntPct: 0.0, tendencia: 'Estável', conferir: 'OK', in: { peso: 68.0, pesoUsual: 75.5, estatura: 1.56, joelho: 47, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 60, cb: 25.0, pct: 18.0, cp: 29.8, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 15, mat: '5092311', data: '2026-09-25', n: 2, tipo: 'Reavaliação',  nome: 'L.S.B', sexo: 'F', idade: 66, setor: 'ONCO',          leito: '418.1', peso: 66.4, pesoCalc: 70.6, metodoPeso: 'Aferido (ajust. amput.)', estatura: 1.56, imc: 29.0, imcClasse: 'Sobrepeso (idoso)', pp: 6.5, ppClasse: 'Perda significativa', cb: 'Depleção grave (< P5)', dct: 'Depleção leve (P15 a P25)', cmb: 'Depleção grave (< P5)', cp: 'Massa muscular reduzida', fpp: null, sf: null, sfInterp: '', varAnt: -1.7, varIntPct: -2.4, tendencia: 'Perda leve', conferir: 'OK', in: { peso: 66.4, pesoUsual: 75.5, estatura: 1.56, joelho: 47, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 60, cb: 24.1, pct: 16.5, cp: 29.2, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 16, mat: '5440918', data: '2026-10-02', n: 1, tipo: 'Inicial',      nome: 'S.N.D', sexo: 'F', idade: 38, setor: 'GINECO/ONCO',   leito: '511.2', peso: 89.0, pesoCalc: 89.0, metodoPeso: 'Aferido', estatura: 1.65, imc: 32.7, imcClasse: 'Obesidade grau I', pp: 0.0, ppClasse: 'Sem perda de peso', cb: 'Eutrofia (P25 a P75)', dct: 'Eutrofia (P25 a P75)', cmb: 'Eutrofia (P25 a P75)', cp: 'Massa muscular preservada', fpp: null, sf: null, sfInterp: '', varAnt: null, varIntPct: 0.0, tendencia: 'Estável', conferir: 'OK', in: { peso: 89.0, pesoUsual: 89.0, estatura: 1.65, joelho: null, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 30, cb: 33.5, pct: 28.0, cp: 38.0, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } },
      { row: 17, mat: '5440918', data: '2026-10-16', n: 2, tipo: 'Reavaliação',  nome: 'S.N.D', sexo: 'F', idade: 38, setor: 'GINECO/ONCO',   leito: '511.2', peso: 90.2, pesoCalc: 90.2, metodoPeso: 'Aferido', estatura: 1.65, imc: 33.1, imcClasse: 'Obesidade grau I', pp: 0.0, ppClasse: 'Sem perda de peso', cb: 'Eutrofia (P25 a P75)', dct: 'Eutrofia (P25 a P75)', cmb: 'Eutrofia (P25 a P75)', cp: 'Massa muscular preservada', fpp: null, sf: null, sfInterp: '', varAnt: 1.2, varIntPct: 1.3, tendencia: 'Ganho ponderal', conferir: 'OK', in: { peso: 90.2, pesoUsual: 89.0, estatura: 1.65, joelho: null, pesoRef: null, edema: 0, ascite: 0, tempoPerda: 30, cb: 33.8, pct: 28.5, cp: 38.2, fpp: null, sfAp: '', sf1: null, sf2: null, sf3: null, sf4: null, sf5: null, obs: '' } }
    ];

    demoDB = { hoje, edemaKg, asciteKg, imcAdulto, imcIdoso, amputacoes, racas, pacientes, avaliacoes, nextRowP: 12, nextRowA: 18 };
    return demoDB;
  }

  function normSetorDemo(s) {
    const t = String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (t.indexOf('GINECO') >= 0 && t.indexOf('ONCO') >= 0) return 'GINECO/ONCO';
    if (t.indexOf('ONCO') >= 0) return 'ONCO';
    if (t.indexOf('MASSA') >= 0) return 'MASSA PÉLVICA';
    if (t.indexOf('TOC') >= 0) return 'TOC';
    return 'GINECO';
  }

  function classifyImcDemo(imc, idade, db) {
    if (imc == null) return '';
    const tab = (idade != null && idade >= 60) ? db.imcIdoso : db.imcAdulto;
    let out = '';
    tab.forEach(([lbl, min]) => { if (imc >= min) out = lbl; });
    return out;
  }

  function demoAlertas(db) {
    const cont = { atrasadas: 0, hoje: 0, emBreve: 0, aguardando: 0, acompanhamento: 0, altas: 0 };
    const itens = [];
    db.pacientes.forEach((p) => {
      if (p.alta) { cont.altas++; return; }
      const mine = db.avaliacoes.filter((a) => a.mat === p.mat).sort((x, y) => x.data.localeCompare(y.data));
      const last = mine[mine.length - 1];
      let tipo = 'acompanhamento';
      if (p.status.indexOf('ATRASADA') >= 0) { tipo = 'atrasada'; cont.atrasadas++; }
      else if (p.status.indexOf('HOJE') >= 0) { tipo = 'hoje'; cont.hoje++; }
      else if (p.status.indexOf('EM ') >= 0) { tipo = 'embreve'; cont.emBreve++; }
      else if (p.status.indexOf('AGUARDANDO') >= 0) { tipo = 'aguardando'; cont.aguardando++; }
      else cont.acompanhamento++;
      itens.push({
        mat: p.mat, nome: p.nome, idade: p.idade, leito: p.leito, setor: p.setor,
        setorNorm: normSetorDemo(p.setor), ultima: last ? last.data : null, nAval: mine.length,
        proxima: p.proxima, dias: p.diasReav, status: p.status, tipo: tipo,
        varPct: last ? last.varIntPct : null, tendencia: last ? last.tendencia : ''
      });
    });
    const ord = { atrasada: 0, hoje: 1, embreve: 2, aguardando: 3, acompanhamento: 4 };
    itens.sort((a, b) => (ord[a.tipo] - ord[b.tipo]) || ((a.dias == null ? 999 : a.dias) - (b.dias == null ? 999 : b.dias)));
    return { contagem: cont, itens: itens, hoje: db.hoje };
  }

  function demoInit(db) {
    return {
      user: { email: demoRole === 'leitor' ? 'consulta.demo@inca.gov.br' : 'nutricionista.demo@inca.gov.br', role: demoRole, restricted: true, demo: true },
      hoje: db.hoje,
      setores: ['GINECO', 'TOC', 'ONCO', 'MASSA PELVICA', 'GINECO/ONCO'],
      amputacoes: db.amputacoes,
      racas: db.racas,
      diasReavaliacao: 10,
      idadeIdoso: 60,
      edemaKg: db.edemaKg,
      asciteKg: db.asciteKg,
      imcAdulto: db.imcAdulto,
      imcIdoso: db.imcIdoso,
      capacidade: { aval: { used: db.avaliacoes.length, max: 600, warn: false }, pac: { used: db.pacientes.length, max: 400, warn: false } }
    };
  }

  async function demoDispatch(action, args) {
    await new Promise((r) => setTimeout(r, 160));
    const db = initDemoDB();
    const needEdit = () => { if (demoRole !== 'editor') throw new Error('Perfil Somente Consulta (Leitor): edição bloqueada.'); };

    switch (action) {
      case 'api_batchInit':
        return { init: demoInit(db), alertas: demoAlertas(db), pacientes: db.pacientes.map((p) => Object.assign({}, p)) };
      case 'api_init':
        return demoInit(db);
      case 'api_alertas':
        return demoAlertas(db);
      case 'api_listarPacientes':
        return db.pacientes.map((p) => Object.assign({}, p));
      case 'api_buscarPaciente': {
        const key = String(args[0] || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
        const p = db.pacientes.find((x) => x.mat === key);
        if (!p) return { encontrado: false, mat: key };
        const mine = db.avaliacoes.filter((a) => a.mat === key).sort((x, y) => x.data.localeCompare(y.data));
        const last = mine[mine.length - 1] || null;
        return {
          encontrado: true,
          paciente: Object.assign({}, p),
          ultima: last ? Object.assign({}, last) : null,
          ultimaEntrada: last ? Object.assign({ row: last.row, mat: last.mat, data: last.data }, last.in) : null,
          historico: mine.slice().reverse().map((x) => Object.assign({}, x))
        };
      }
      case 'api_salvarPaciente': {
        needEdit();
        const p = args[0] || {};
        const mat = String(p.mat || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
        if (!/^\d{4,10}$/.test(mat)) throw new Error('Matrícula inválida (4 a 10 dígitos).');
        if (!p.nome) throw new Error('Informe as iniciais do paciente.');
        const idade = p.nasc ? Math.floor((new Date(db.hoje) - new Date(p.nasc)) / (365.25 * 86400000)) : null;
        if (p.row) {
          const idx = db.pacientes.findIndex((x) => x.row === Number(p.row));
          if (idx < 0) throw new Error('Paciente não encontrado.');
          Object.assign(db.pacientes[idx], p, { mat, idade, status: p.alta ? 'Alta hospitalar' : db.pacientes[idx].status });
          return { paciente: db.pacientes[idx], capacidade: demoInit(db).capacidade };
        }
        if (db.pacientes.some((x) => x.mat === mat)) throw new Error('Matrícula já cadastrada.');
        const novo = Object.assign({
          row: db.nextRowP++, mat, nome: p.nome, sexo: p.sexo || 'F', nasc: p.nasc, idade,
          leito: p.leito || '', setor: p.setor || 'GINECO', intern: p.intern || db.hoje,
          prim: null, alta: p.alta || null, diasInt: 0, amput: p.amput || 'Sem amputação',
          pctAmput: 0, nAval: 0, ultima: null, proxima: db.hoje, diasReav: 0,
          status: p.alta ? 'Alta hospitalar' : 'AGUARDANDO 1ª AVALIAÇÃO', obs: p.obs || '', raca: p.raca || '', check: 'OK'
        });
        db.pacientes.push(novo);
        return { paciente: novo, capacidade: demoInit(db).capacidade };
      }
      case 'api_registrarAlta': {
        needEdit();
        const mat = String(args[0] || '');
        const dataAlta = args[1] || db.hoje;
        const p = db.pacientes.find((x) => x.mat === mat);
        if (!p) throw new Error('Paciente não encontrado.');
        p.alta = dataAlta;
        p.status = 'Alta hospitalar';
        return { paciente: Object.assign({}, p) };
      }
      case 'api_excluirPaciente': {
        needEdit();
        const row = Number(args[0]);
        db.pacientes = db.pacientes.filter((x) => x.row !== row);
        return { removido: true };
      }
      case 'api_listarAvaliacoes': {
        const opt = args[0] || {};
        let list = db.avaliacoes.slice();
        if (opt.mat) list = list.filter((x) => x.mat.indexOf(opt.mat) >= 0);
        list.sort((a, b) => b.data.localeCompare(a.data) || b.row - a.row);
        return { total: list.length, itens: list.slice(0, opt.limit || 60) };
      }
      case 'api_getAvaliacao': {
        const row = Number(args[0]);
        const found = db.avaliacoes.find((x) => x.row === row);
        if (!found) throw new Error('Avaliação não encontrada.');
        return { entrada: Object.assign({ row: found.row, mat: found.mat, data: found.data }, found.in), resultado: Object.assign({}, found) };
      }
      case 'api_salvarAvaliacao': {
        needEdit();
        const p = args[0] || {};
        const pac = db.pacientes.find((x) => x.mat === p.mat);
        if (!pac) throw new Error('Matrícula não cadastrada.');
        const basePeso = p.peso != null ? Number(p.peso) : (p.pesoRef != null ? Number(p.pesoRef) : null);
        if (basePeso == null) throw new Error('Informe peso aferido ou peso referido.');
        const descEd = (db.edemaKg.find((e) => e[0] === Number(p.edema || 0)) || [0, 0])[1];
        const descAsc = (db.asciteKg.find((e) => e[0] === Number(p.ascite || 0)) || [0, 0])[1];
        let pesoCalc = Math.round((basePeso - descEd - descAsc) * 10) / 10;
        if (pac.pctAmput > 0) pesoCalc = Math.round((pesoCalc / (1 - pac.pctAmput / 100)) * 10) / 10;
        const est = p.estatura ? Number(p.estatura) : null;
        const imc = est ? Math.round((pesoCalc / (est * est)) * 10) / 10 : null;
        const imcClasse = classifyImcDemo(imc, pac.idade, db);
        const pp = (p.pesoUsual && pesoCalc) ? Math.round(((p.pesoUsual - pesoCalc) / p.pesoUsual) * 1000) / 10 : null;
        const sfList = [p.sf1, p.sf2, p.sf3, p.sf4, p.sf5];
        const sfDone = sfList.every((v) => v != null);
        const sfScore = sfDone ? sfList.reduce((s, x) => s + Number(x), 0) : null;

        const mine = db.avaliacoes.filter((x) => x.mat === p.mat && x.row !== Number(p.row || -1));
        const rec = {
          row: p.row ? Number(p.row) : db.nextRowA++,
          mat: pac.mat, data: p.data, n: mine.length + 1, tipo: mine.length ? 'Reavaliação' : 'Inicial',
          nome: pac.nome, sexo: pac.sexo, idade: pac.idade, setor: pac.setor, leito: pac.leito,
          peso: p.peso, pesoCalc, metodoPeso: p.peso != null ? 'Aferido (demo)' : 'Referido (demo)',
          estatura: est, imc, imcClasse,
          pp, ppClasse: pp == null ? '—' : (pp >= 10 ? 'Perda GRAVE' : pp >= 5 ? 'Perda significativa' : 'Perda não significativa'),
          cb: p.cb ? (p.cb < 24 ? 'Depleção grave (< P5)' : p.cb < 27 ? 'Depleção moderada (P5 a P15)' : 'Eutrofia (P25 a P75)') : '',
          dct: p.pct ? 'Eutrofia (P25 a P75)' : '',
          cmb: (p.cb && p.pct) ? (p.cb < 25 ? 'Depleção moderada (P5 a P15)' : 'Eutrofia (P25 a P75)') : '',
          cp: p.cp ? (p.cp < (pac.sexo === 'M' ? 34 : 33) ? 'Massa muscular reduzida' : 'Massa muscular preservada') : '',
          fpp: p.fpp ? (p.fpp < (pac.sexo === 'M' ? 27 : 16) ? 'Força reduzida' : 'Força preservada') : '',
          sf: sfScore, sfInterp: sfScore == null ? '' : (sfScore >= 4 ? 'Rastreio POSITIVO (>= 4)' : 'Rastreio negativo (< 4)'),
          varAnt: null, varIntPct: 0, tendencia: 'Estável', conferir: 'OK',
          in: { peso: p.peso, pesoUsual: p.pesoUsual, estatura: p.estatura, joelho: p.joelho, pesoRef: p.pesoRef, edema: p.edema || 0, ascite: p.ascite || 0, tempoPerda: p.tempoPerda, cb: p.cb, pct: p.pct, cp: p.cp, fpp: p.fpp, sfAp: sfDone ? 'S' : '', sf1: p.sf1, sf2: p.sf2, sf3: p.sf3, sf4: p.sf4, sf5: p.sf5, obs: p.obs || '' }
        };
        if (p.row) {
          const i = db.avaliacoes.findIndex((x) => x.row === Number(p.row));
          if (i >= 0) db.avaliacoes[i] = rec;
        } else {
          db.avaliacoes.push(rec);
          pac.nAval = mine.length + 1;
          pac.ultima = p.data;
          pac.status = 'Em acompanhamento';
          pac.diasReav = 10;
        }
        return { row: rec.row, resultado: rec, avisos: ['Modo Demonstração: cálculo simulado localmente (na versão conectada à planilha, o cálculo oficial vem das fórmulas do HC II).'], capacidade: demoInit(db).capacidade };
      }
      case 'api_excluirAvaliacao': {
        needEdit();
        const row = Number(args[0]);
        db.avaliacoes = db.avaliacoes.filter((x) => x.row !== row);
        return { removido: true };
      }
      case 'api_dashboard': {
        const IMC_GRP = {
          'Magreza grau III': ['deficit', 3], 'Magreza grau II': ['deficit', 2], 'Magreza grau I': ['deficit', 1],
          'Baixo peso (idoso)': ['deficit', 1], 'Eutrofia': ['neutro', 0], 'Sobrepeso (idoso)': ['excesso', 1],
          'Sobrepeso / Pré-obesidade': ['excesso', 1], 'Obesidade grau I': ['excesso', 2],
          'Obesidade grau II': ['excesso', 3], 'Obesidade grau III': ['excesso', 4]
        };
        const rows = db.avaliacoes.map((a) => {
          const fx = a.idade == null ? 'adulto' : (a.idade < 20 ? 'menor20' : (a.idade >= 60 ? 'idoso' : 'adulto'));
          const gi = IMC_GRP[a.imcClasse] || [null, 0];
          return {
            d: a.data, mat: a.mat, sx: a.sexo, idd: a.idade, fx,
            st: normSetorDemo(a.setor), tp: a.tipo,
            imc: a.imc, imcCat: gi[0] ? a.imcClasse : null, imcGrp: gi[0], imcSev: gi[1],
            edm: Boolean(a.in && a.in.edema > 0), asc: Boolean(a.in && a.in.ascite > 0), amp: false,
            cb: a.cb || null, dct: a.dct || null, cmb: a.cmb || null, cp: a.cp || null,
            fpp: a.fpp || null, sfAp: a.sf != null, sfPos: a.sf != null && a.sf >= 4,
            pp: a.ppClasse || null, tend: a.tendencia || null
          };
        }).sort((x, y) => x.d.localeCompare(y.d));
        const pacs = new Set(rows.map((r) => r.mat)).size;
        return { rows, pacientes: pacs, hoje: db.hoje, geradoEm: '18/11/2026 20:00 (Demo)' };
      }
      case 'api_exportarXlsx':
        throw new Error('No Modo Demonstração não há planilha Google conectada. Use o Relatório PDF ou o Resumo de Internados (.csv), ou conecte à sua planilha via config.js.');
      case 'api_registrarExportacao':
        return true;
      default:
        throw new Error('Ação não suportada no modo demo: ' + action);
    }
  }

  return {
    isConfigured,
    isDemo: () => demoMode,
    hasValidToken,
    setToken,
    enableDemo,
    restoreDemoIfAny,
    logout,
    setAuthHandler: (fn) => { onAuthRequired = fn; },
    call
  };
})();
