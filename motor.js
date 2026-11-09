/* Motor de cálculo do Super Desafio CSAT – funções puras (navegador e Node).
 * Regras: ESPECIFICACAO_CSAT_SaoLuis_Visao_Interativa.md, generalizadas para
 *  - unidades com qualquer combinação de dimensões ativas/congeladas (HUB: Sup + Entrega; Híbridas: Sup + ER + Entrega);
 *  - volume por dimensão proporcional à participação dela nas respostas da janela do ritmo
 *    (ERs de São Luís: ER = Sup = 100%, como na especificação).
 */
(function (root) {
  'use strict';
  const DIMS = ['sup', 'er', 'ent'];
  const NOME_DIM = { sup: 'Supervisora', er: 'ER', ent: 'Entrega' };
  const EPS = 1e-9;
  const ceil = (x) => Math.ceil(x - EPS) + 0; // + 0 evita -0
  const rhu = (x) => Math.floor(x + 0.5); // arredonda meio para cima (como o Excel)

  const toMs = (iso) => Date.parse(iso + 'T12:00:00Z');
  function addDays(iso, n) {
    const d = new Date(toMs(iso));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / 864e5);

  const vazio = () => ({ sup: { p: 0, n: 0 }, er: { p: 0, n: 0 }, ent: { p: 0, n: 0 } });

  /** Soma promotoras (4 e 5) e respostas por dimensão de uma unidade entre d0 e d1 (inclusive). */
  function agregar(linhas, cod, d0, d1) {
    const a = vazio();
    const c = Number(cod);
    for (const l of linhas) {
      if (l[1] !== c || l[0] < d0 || l[0] > d1) continue;
      for (let i = 0; i < 3; i++) {
        const v = l[2 + i];
        a[DIMS[i]].n += v[0] + v[1] + v[2] + v[3] + v[4];
        a[DIMS[i]].p += v[3] + v[4];
      }
    }
    return a;
  }

  /** Diarização em inteiros cuja soma é exatamente X. */
  function diario(X, dias) {
    const out = [];
    for (let k = 1; k <= dias; k++) out.push(rhu((X * k) / dias) - rhu((X * (k - 1)) / dias));
    return out;
  }

  const media = (arr) => {
    const v = arr.filter((x) => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const razao = (p, n) => (n > 0 ? p / n : null);

  /** Plano de uma unidade (seção 5, generalizada). */
  function planoUnidade(u, P) {
    const dimsUso = P.entregaEntra ? DIMS : ['sup', 'er'];
    const b = u.base, w = u.win;
    const winSup = w.sup.n;
    const share = {};
    for (const d of DIMS) {
      if (d === 'sup') share[d] = winSup > 0 || b.sup.n > 0 ? 1 : 0;
      else if (winSup > 0) share[d] = Math.min(1, w[d].n / winSup);
      else share[d] = b.sup.n > 0 ? Math.min(1, b[d].n / b.sup.n) : 0; // sem ritmo: usa o mix histórico
    }
    const ativas = dimsUso.filter((d) => share[d] > 0);
    const congeladas = dimsUso.filter((d) => !ativas.includes(d) && b[d].n > 0);
    const csatBase = {};
    for (const d of DIMS) csatBase[d] = dimsUso.includes(d) ? razao(b[d].p, b[d].n) : null;
    const totalAtual = media(dimsUso.map((d) => csatBase[d]));

    const k = ativas.length + congeladas.length;
    const F = congeladas.reduce((a, d) => a + csatBase[d], 0);
    const T = ativas.length ? (k * P.meta - F) / ativas.length : null;
    const temPlano = u.papel === 'meta' && ativas.length > 0 && P.dias > 0;
    let inviavel = temPlano && P.regra !== 'media' && T >= 1;
    const ritmo = winSup / P.janela;
    const y = temPlano ? rhu(ritmo * P.dias) : 0;

    const xmin = {}, rd = {}, vol = {}, L = {}, yd = {}, teto = {};
    for (const d of ativas) {
      const { p, n } = b[d];
      xmin[d] = temPlano && T < 1 ? ceil(Math.max(0, (T * n - p) / (1 - T))) : 0;
      rd[d] = share[d] > 0 ? ceil(xmin[d] / share[d]) : 0;
    }
    let K = 0, inviavelMedia = false, q = null;
    if (P.regra !== 'media') {
      K = temPlano && !inviavel ? Math.max(y, ...ativas.map((d) => rd[d])) : 0;
      for (const d of ativas) {
        const { p, n } = b[d];
        vol[d] = d === 'sup' ? K : Math.min(K, Math.max(xmin[d], rhu(K * share[d])));
        L[d] = temPlano && !inviavel ? Math.min(vol[d], ceil(Math.max(0, T * (n + vol[d]) - p))) : 0;
      }
    } else if (temPlano) {
      // Regra "pela média": basta o CSAT TOTAL (média das dimensões) chegar à meta.
      // Mesma fração q de promotoras em todas as dimensões ativas; K = menor volume (>= ritmo) com q <= 100%.
      const volDe = (K) => Object.fromEntries(ativas.map((d) => [d, d === 'sup' ? K : rhu(K * share[d])]));
      const qDe = (K) => {
        const v = volDe(K);
        let fixo = F, coef = 0;
        for (const d of ativas) {
          const { p, n } = b[d];
          const den = n + v[d];
          if (den === 0) continue;
          fixo += p / den; coef += v[d] / den;
        }
        const falta = k * P.meta - fixo;
        if (falta <= EPS) return 0;
        return coef > 0 ? falta / coef : Infinity;
      };
      if (qDe(y) <= 1 + EPS) K = y;
      else {
        let hi = Math.max(1, y);
        while (qDe(hi) > 1 + EPS && hi < 2e6) hi *= 2;
        if (qDe(hi) > 1 + EPS) inviavelMedia = true;
        else {
          let lo = y;
          while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (qDe(mid) <= 1 + EPS) hi = mid; else lo = mid; }
          K = hi;
        }
      }
      if (!inviavelMedia) {
        Object.assign(vol, volDe(K));
        q = Math.min(1, Math.max(0, qDe(K)));
        for (const d of ativas) L[d] = Math.min(vol[d], ceil(q * vol[d]));
      }
    }
    if (P.regra === 'media') inviavel = inviavelMedia;
    for (const d of ativas) {
      const { p, n } = b[d];
      if (vol[d] == null) { vol[d] = 0; L[d] = 0; }
      yd[d] = d === 'sup' ? y : rhu(y * share[d]);
      teto[d] = razao(p + yd[d], n + yd[d]);
    }
    const tetoDims = {};
    for (const d of dimsUso) tetoDims[d] = ativas.includes(d) && temPlano ? teto[d] : csatBase[d];

    return {
      cod: u.cod, papel: u.papel, base: b, win: w, share, ativas, congeladas, dimsUso,
      csatBase, totalAtual, T: P.regra === 'media' ? null : T, q, regra: P.regra || 'dim', temPlano, inviavel, ritmo, y, xmin, rd, K, vol, L, yd,
      teto, totalTeto: temPlano ? media(dimsUso.map((d) => tetoDims[d])) : totalAtual,
    };
  }

  /** Aplica e_s respostas extras (100% promotoras) e calcula os números finais da unidade. */
  function finalizar(r, eS) {
    r.e = eS;
    r.R = r.K + eS;
    r.P = {}; r.V = {}; r.final = {};
    for (const d of r.dimsUso) {
      if (r.ativas.includes(d) && r.temPlano) {
        const ex = d === 'sup' ? eS : rhu(eS * r.share[d]);
        r.P[d] = r.L[d] + ex;
        r.V[d] = r.vol[d] + ex;
        r.final[d] = razao(r.base[d].p + r.P[d], r.base[d].n + r.V[d]);
      } else {
        r.final[d] = r.csatBase[d];
      }
    }
    r.totalFinal = media(r.dimsUso.map((d) => r.final[d]));
    r.pctPromNovas = {};
    for (const d of r.ativas) r.pctPromNovas[d] = r.V[d] > 0 ? r.P[d] / r.V[d] : null;
    // viável: as promotoras exigidas cabem nas respostas esperadas no ritmo atual
    r.viavel = r.temPlano && !r.inviavel && (r.R === 0 || (r.y > 0 && r.ativas.every((d) => r.P[d] <= r.yd[d])));
    r.multiplo = r.temPlano && r.y > 0 ? r.R / r.y : null;
    r.faltamResp = r.temPlano ? Math.max(0, r.R - r.y) : 0;
    r.porDia = null;
    return r;
  }

  /** Praça (seção 6): agregado pooled + extras mínimas para a praça fechar na meta. */
  function planoPraca(unidades, P) {
    const dimsUso = P.entregaEntra ? DIMS : ['sup', 'er'];
    const r = unidades.map((u) => planoUnidade(u, P));
    const plan = r.filter((x) => x.temPlano && !x.inviavel);
    const Y = plan.reduce((a, x) => a + x.K, 0);

    function pooled(fn) {
      const agg = {};
      for (const d of dimsUso) {
        let p = 0, n = 0;
        for (const x of r) {
          const [pp, nn] = fn(x, d);
          p += pp; n += nn;
        }
        agg[d] = { p, n, csat: razao(p, n) };
      }
      agg.total = media(dimsUso.map((d) => agg[d].csat));
      return agg;
    }
    const atual = pooled((x, d) => [x.base[d].p, x.base[d].n]);
    const teto = pooled((x, d) =>
      x.temPlano && x.ativas.includes(d) ? [x.base[d].p + x.yd[d], x.base[d].n + x.yd[d]] : [x.base[d].p, x.base[d].n]);

    const avaliar = (e) => {
      for (const x of r) finalizar(x, plan.includes(x) && Y > 0 ? ceil((e * x.K) / Y) : 0);
      return pooled((x, d) =>
        x.temPlano && x.ativas.includes(d) ? [x.base[d].p + x.P[d], x.base[d].n + x.V[d]] : [x.base[d].p, x.base[d].n]);
    };
    const ok = (agg) => agg.total != null && agg.total >= P.meta - EPS;

    const semExtras = avaliar(0);
    let e = 0, inviavelPraca = false;
    if (!ok(semExtras)) {
      if (Y === 0) inviavelPraca = true;
      else {
        let hi = 1;
        while (!ok(avaliar(hi)) && hi < 2e6) hi *= 2;
        if (!ok(avaliar(hi))) inviavelPraca = true;
        else {
          let lo = 0; // lo falha, hi passa
          while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (ok(avaliar(mid))) hi = mid; else lo = mid;
          }
          e = hi;
        }
      }
    }
    const final = avaliar(inviavelPraca ? 0 : e);

    // gap da descontinuada (informativo, seção 6.3)
    const gapDesc = {};
    for (const x of r.filter((x) => x.papel === 'descontinuada'))
      gapDesc[x.cod] = Object.fromEntries(['sup', 'er'].map((d) =>
        [d, ceil(Math.max(0, P.meta * x.base[d].n - x.base[d].p))]));

    const R = plan.reduce((a, x) => a + x.R, 0);
    const y = plan.reduce((a, x) => a + x.y, 0);
    return {
      unidades: r, dimsUso, Y, e, inviavelPraca, atual, teto, semExtras, final, gapDesc,
      R, y, multiplo: y > 0 ? R / y : null,
      viavel: plan.length > 0 && plan.every((x) => x.viavel) && !inviavelPraca,
      porDia: P.dias > 0 ? R / P.dias : null,
      ritmoDia: P.dias > 0 ? y / P.dias : null,
    };
  }

  const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  /** Cálculo completo de uma praça a partir de DADOS e dos parâmetros da tela. */
  function calcular(D, o) {
    const cfg = D.config;
    const corte = o.corte || D.corte;
    const fim = o.fimPlano || cfg.fim_plano;
    const janela = o.janela || cfg.janela_ritmo;
    const inicioPlano = addDays(corte, 1);
    const dias = Math.max(0, diffDays(inicioPlano, fim) + 1);
    const winIni = addDays(corte, -(janela - 1));
    const inicioBase = o.inicioBase || cfg.inicio_base;
    const papeis = Object.assign({}, cfg.pracas[o.praca].unidades);
    for (const [cod, papel] of Object.entries(o.papeis || {})) if (cod in papeis) papeis[cod] = papel;
    const unidades = Object.entries(papeis)
      .filter(([, papel]) => papel !== 'fora')
      .map(([cod, papel]) => ({
        cod, papel,
        base: agregar(D.linhas, cod, inicioBase, corte),
        win: agregar(D.linhas, cod, winIni, corte),
      }));
    const P = {
      meta: o.meta != null ? o.meta : cfg.meta, dias, janela,
      entregaEntra: o.entregaEntra != null ? o.entregaEntra : cfg.entrega_entra,
      regra: o.regra || 'dim',
    };
    const res = planoPraca(unidades, P);
    res.params = Object.assign({ corte, fim, inicioPlano, inicioBase, winIni, praca: o.praca }, P);
    res.datas = [];
    for (let i = 0; i < dias; i++) {
      const dt = addDays(inicioPlano, i);
      res.datas.push({ iso: dt, dow: DOW[new Date(toMs(dt)).getUTCDay()] });
    }
    for (const x of res.unidades) {
      if (!x.temPlano) continue;
      x.porDia = dias > 0 ? x.R / dias : null;
      x.diaResp = diario(x.R, dias);
      x.diaProm = {};
      for (const d of x.ativas) x.diaProm[d] = diario(x.P[d], dias);
    }
    return res;
  }

  /** Realizado por dia (respostas = Supervisora; promotoras por dimensão) entre d0 e d1. */
  function realizadoDiario(linhas, cod, d0, d1) {
    const out = {};
    const c = Number(cod);
    for (const l of linhas) {
      if (l[1] !== c || l[0] < d0 || l[0] > d1) continue;
      const o = (out[l[0]] = out[l[0]] || { resp: 0, sup: 0, er: 0, ent: 0, n: { sup: 0, er: 0, ent: 0 } });
      for (let i = 0; i < 3; i++) {
        const v = l[2 + i];
        o[DIMS[i]] += v[3] + v[4];
        o.n[DIMS[i]] += v[0] + v[1] + v[2] + v[3] + v[4];
      }
      o.resp = o.n.sup;
    }
    return out;
  }

  const API = { DIMS, NOME_DIM, agregar, diario, planoUnidade, planoPraca, calcular, realizadoDiario, addDays, diffDays, rhu, ceil };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Motor = API;
})(typeof window !== 'undefined' ? window : globalThis);
