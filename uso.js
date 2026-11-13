/* SUPER DESAFIO CSAT - identificação de quem acessa e registro de uso (copiado do PULSAR COMERCIAL).
 * Grava na aba "acessos_csat" da planilha do PULSAR (separada da aba "acessos" do PULSAR).
 *
 * Na primeira visita a pessoa escolhe o nome (GVO, GCVO/GPVO ou GRVO do cadastro de lojas, ou outro nome).
 * A escolha fica neste navegador. A cada página, aba ou filtro aberto, grava um acesso na aba "acessos" da
 * planilha de ações (Apps Script), no máximo 1 vez a cada 30 minutos para a mesma tela.
 * No computador local (localhost) não grava nada, para os testes não contarem como uso.
 */
(function () {
  const KEY_USUARIO = 'pulsar-usuario', KEY_DISP = 'pulsar-dispositivo', KEY_ULT = 'pulsar-ultimo-acesso';
  const REPETE_MIN = 30;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  let cfg = { pessoas: [], planilha: { url: '', chave: '' }, ambiente: '', pagina: '' };

  const ler = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dispositivo = () => { let d = ler(KEY_DISP, ''); if (!d) { d = Math.random().toString(36).slice(2, 10); gravar(KEY_DISP, d); } return d; };

  function usuario() { return ler(KEY_USUARIO, null); }

  function selo() {
    const box = document.querySelector('.topo .chips') || document.querySelector('.hero .chips');
    if (!box) return;
    let b = document.getElementById('hUsuario');
    if (!b) {
      b = document.createElement('button');
      b.id = 'hUsuario'; b.type = 'button'; b.className = 'glass'; b.title = 'Trocar quem está usando';
      b.style.border = '0'; b.style.cursor = 'pointer';
      b.addEventListener('click', () => perguntar(true));
      box.appendChild(b);
    }
    const u = usuario();
    b.innerHTML = `<span style="opacity:.75">Usuário:</span> <b>${esc(u ? u.nome : 'identificar')}</b>`;
  }

  // Janela de identificação (usa as cores do painel): busca por nome, sem diferenciar acento e maiúscula
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function perguntar(trocar) {
    return new Promise(resolve => {
      const u = usuario(), ordem = { 'IAF': 0, 'GRVO': 1, 'GCVO/GPVO': 2, 'GVO': 3 };
      const lista = [...(cfg.pessoas || [])].sort((a, b) => (ordem[(a.papeis || [])[0]] ?? 4) - (ordem[(b.papeis || [])[0]] ?? 4) || a.nome.localeCompare(b.nome, 'pt-BR'));
      let escolhido = u && lista.find(p => p.nome === u.nome) ? u.nome : '';
      const d = document.createElement('dialog');
      d.style.cssText = 'border:1px solid var(--border);border-radius:20px;background:var(--card);color:var(--foreground);padding:24px;max-width:460px;width:calc(100% - 32px);box-shadow:0 20px 40px -16px rgba(0,0,0,.4)';
      d.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:12px">
        <h2 style="font-size:20px;margin:0">Quem está acessando?</h2>
        <p style="margin:0;color:var(--muted-fg);font-size:14px">Digite parte do seu nome e clique nele. A escolha fica salva neste navegador.</p>
        <input id="usoBusca" type="search" autocomplete="off" placeholder="Buscar nome…" value="${esc(escolhido)}" style="height:40px;width:100%">
        <div id="usoLista" role="listbox" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:4px"></div>
        <input id="usoOutro" placeholder="Seu nome e função" style="height:40px;width:100%;display:none">
        <p style="margin:0;color:var(--muted-fg);font-size:12px">Seu acesso (nome, data e hora, página e filtros usados) fica registrado na planilha do PULSAR (página Super Desafio CSAT).</p>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          ${trocar ? '<button type="button" id="usoCancelar" class="btn ghost">Cancelar</button>' : ''}
          <button type="submit" class="btn" style="background:var(--primary);color:var(--primary-fg);border:0;border-radius:10px;padding:9px 16px;font-weight:700">Entrar</button>
        </div></form>`;
      document.body.appendChild(d);
      const busca = d.querySelector('#usoBusca'), box = d.querySelector('#usoLista'), outro = d.querySelector('#usoOutro');
      const item = (nome, sub, val, on) => `<button type="button" role="option" data-v="${esc(val)}" style="display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;background:${on ? 'var(--primary)' : 'transparent'};color:${on ? 'var(--primary-fg)' : 'inherit'};font-weight:${on ? 800 : 600}"><span>${esc(nome)}</span><small style="opacity:.7;font-weight:600">${esc(sub)}</small></button>`;
      let visiveis = [];
      const desenhar = () => {
        const q = sem(busca.value).trim();
        visiveis = lista.filter(p => !q || sem(p.nome).includes(q) || sem((p.papeis || []).join(' ')).includes(q));
        box.innerHTML = visiveis.map(p => item(p.nome, (p.papeis || []).join(', '), p.nome, escolhido === p.nome)).join('') +
          (visiveis.length ? '' : `<p style="margin:8px 10px;color:var(--muted-fg);font-size:13px">Nenhum nome encontrado.</p>`) +
          item('Outro nome…', '', '__outro', escolhido === '__outro');
      };
      const escolher = v => {
        escolhido = v;
        outro.style.display = v === '__outro' ? 'block' : 'none'; outro.required = v === '__outro';
        if (v && v !== '__outro') busca.value = v;
        desenhar();
        if (v === '__outro') outro.focus();
      };
      busca.addEventListener('input', () => { if (escolhido && busca.value !== escolhido) escolhido = ''; desenhar(); });
      busca.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (visiveis.length) escolher(visiveis[0].nome); else escolher('__outro'); } });
      box.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) escolher(b.dataset.v); });
      d.addEventListener('cancel', e => { if (!trocar) e.preventDefault(); });
      const can = d.querySelector('#usoCancelar'); if (can) can.onclick = () => { d.close(); d.remove(); resolve(u); };
      d.querySelector('form').addEventListener('submit', e => {
        // sem clicar, vale o nome digitado se for exato (ou o único resultado da busca)
        if (!escolhido) { const ex = lista.find(p => sem(p.nome) === sem(busca.value)) || (visiveis.length === 1 ? visiveis[0] : null); if (ex) escolhido = ex.nome; }
        const nome = escolhido === '__outro' ? outro.value.trim() : escolhido;
        if (!nome) { e.preventDefault(); busca.focus(); return; }
        const pe = lista.find(p => p.nome === nome), papel = escolhido === '__outro' ? 'Outro' : (pe ? (pe.papeis || []).join(', ') : '');
        gravar(KEY_USUARIO, { nome, papel });
        gravar(KEY_ULT, {});                 // pessoa nova: o próximo acesso é registrado
        d.remove(); selo(); resolve(usuario());
        if (window.PulsarUso.aoTrocar) window.PulsarUso.aoTrocar(usuario());
      });
      desenhar();
      d.showModal();
      busca.focus(); busca.select();
    });
  }

  // Registra o acesso (página, aba e filtro). A mesma tela não é gravada de novo antes de 30 minutos.
  function registrar(tela) {
    const u = usuario();
    if (!u || !cfg.planilha || !cfg.planilha.url) return;
    const t = Object.assign({ pagina: cfg.pagina, aba: '', regional: '', praca: '', gvo: '', loja_id: '' }, tela || {});
    const chave = [u.nome, t.pagina, t.aba, t.regional, t.praca, t.gvo, t.loja_id].join('|');
    const ult = ler(KEY_ULT, {}), agora = Date.now();
    if (ult[chave] && agora - ult[chave] < REPETE_MIN * 60000) return;
    ult[chave] = agora; gravar(KEY_ULT, ult);
    if (local) return;
    const acesso = Object.assign({ nome: u.nome, papel: u.papel, dispositivo: dispositivo(), ambiente: cfg.ambiente }, t);
    fetch(cfg.planilha.url, { method: 'POST', keepalive: true, body: JSON.stringify({ chave: cfg.planilha.chave, op: 'acesso_csat', acesso }) }).catch(() => {});
  }

  // Lê os acessos do mês (aba Uso). Se o Apps Script ainda for a versão antiga, devolve null.
  async function acessos(mes) {
    if (!cfg.planilha || !cfg.planilha.url) return null;
    const r = await fetch(`${cfg.planilha.url}?chave=${encodeURIComponent(cfg.planilha.chave)}&tipo=acessos_csat&mes=${mes}`, { cache: 'no-store' }).then(x => x.json());
    return r && r.ok && Array.isArray(r.acessos) ? r.acessos : null;
  }

  async function iniciar(opcoes) {
    cfg = Object.assign(cfg, opcoes || {});
    selo();
    if (!usuario()) await perguntar(false);
    return usuario();
  }

  window.PulsarUso = { iniciar, usuario, registrar, acessos, trocar: () => perguntar(true), local };
})();
