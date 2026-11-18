// SUPER DESAFIO CSAT - planilha dos acionamentos (mesma planilha e Apps Script do PULSAR, aba acionamentos_csat).
// Segurança: a URL do Apps Script e a chave NÃO ficam no repositório. Os marcadores abaixo são trocados na
// publicação (GitHub Actions) pelos segredos PULSAR_PLANILHA_URL e PULSAR_PLANILHA_CHAVE deste repositório.
// Sem os segredos (ex.: painel aberto no computador), a planilha fica desligada.
window.CSAT_PLANILHA = (function () {
  var url = '__PULSAR_PLANILHA_URL__', chave = '__PULSAR_PLANILHA_CHAVE__';
  return url.indexOf('__') === 0 ? null : { url: url, chave: chave };
})();
