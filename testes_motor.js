// Testes de aceitação do motor (seção 12 da especificação, snapshot 09/11, regra antiga: HUB 24522 só na praça)
// Rodar: node testes_motor.js
const M = require('./motor.js');
let falhas = 0;
const eq = (nome, obtido, esperado, tol = 0) => {
  const ok = typeof esperado === 'number' ? Math.abs(obtido - esperado) <= tol : obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${obtido}${ok ? '' : ` (esperado ${esperado})`}`);
};
const dim = (p, n) => ({ p, n });
const u = (cod, papel, sup, er, ent, winSup, winEr = winSup) => ({
  cod, papel,
  base: { sup: dim(...sup), er: dim(...er), ent: dim(...ent) },
  win: { sup: dim(winSup, winSup), er: dim(winEr, winEr), ent: dim(0, 0) },
});
const lojas = (com24522) => [
  u('21123', 'meta', [877, 1045], [745, 860], [154, 185], 87),
  u('21124', 'meta', [1312, 1526], [1286, 1526], [0, 0], 269),
  u('21125', 'meta', [1147, 1330], [1059, 1215], [96, 115], 142),
  u('21422', 'descontinuada', [34, 39], [31, 39], [0, 0], 0),
  ...(com24522 ? [u('24522', 'praca', [633, 756], [0, 0], [692, 756], 0)] : []),
];
const P = { meta: 0.89, dias: 21, janela: 30, entregaEntra: true };

const r = M.planoPraca(lojas(true), P);
const by = Object.fromEntries(r.unidades.map((x) => [x.cod, x]));
eq('y 21123', by['21123'].y, 61); eq('y 21124', by['21124'].y, 188); eq('y 21125', by['21125'].y, 99);
eq('T 21123', by['21123'].T, 0.91878, 5e-6); eq('T 21124', by['21124'].T, 0.89, 1e-9); eq('T 21125', by['21125'].T, 0.91761, 5e-6);
eq('xmin 21123 sup', by['21123'].xmin.sup, 1024); eq('xmin 21123 er', by['21123'].xmin.er, 556);
eq('xmin 21124 sup', by['21124'].xmin.sup, 420); eq('xmin 21124 er', by['21124'].xmin.er, 656);
eq('xmin 21125 sup', by['21125'].xmin.sup, 892); eq('xmin 21125 er', by['21125'].xmin.er, 679);
eq('K 21123', by['21123'].K, 1024); eq('K 21124', by['21124'].K, 656); eq('K 21125', by['21125'].K, 892);
eq('Y', r.Y, 2572);
eq('L 21123 sup/er', `${by['21123'].L.sup}/${by['21123'].L.er}`, '1024/986');
eq('L 21124 sup/er', `${by['21124'].L.sup}/${by['21124'].L.er}`, '630/656');
eq('L 21125 sup/er', `${by['21125'].L.sup}/${by['21125'].L.er}`, '892/875');
eq('extras e', r.e, 0);
eq('praça atual', r.atual.total, 0.8673, 5e-5);
eq('praça final Sup', r.final.sup.csat, 0.9011, 5e-5);
eq('praça final ER', r.final.er.csat, 0.9076, 5e-5);
eq('praça final Ent', r.final.ent.csat, 0.8920, 5e-5);
eq('praça final', r.final.total, 0.9002, 5e-5);
eq('múltiplo 21123', by['21123'].multiplo, 16.8, 0.05);
eq('múltiplo praça', r.multiplo, 7.4, 0.05);
eq('por dia praça', r.R / 21, 122.5, 0.05);
eq('viável praça', r.viavel, false);
for (const c of ['21123', '21124', '21125']) eq(`final ${c} >= 89%`, by[c].totalFinal >= 0.89 - 1e-9, true);
eq('21422 sem plano', by['21422'].temPlano, false);
eq('gap 21422 sup/er', `${r.gapDesc['21422'].sup}/${r.gapDesc['21422'].er}`, '1/4');

const d = M.diario(1024, 21);
eq('diário 21123 soma', d.reduce((a, b) => a + b, 0), 1024);
eq('diário 21 dias', d.length, 21);

// regressão: sem o 24522 a praça precisa de extras (spec: 817 pela fórmula fechada; o motor busca o mínimo exato)
const s = M.planoPraca(lojas(false), P);
eq('sem 24522: atual', s.atual.total, 0.8487, 5e-5);
eq('sem 24522: extras > 0 e <= 817', s.e > 0 && s.e <= 817, true);
eq('sem 24522: praça final >= 89%', s.final.total >= 0.89 - 1e-9, true);
console.log(`   (sem 24522: extras ${s.e}, total ${s.R})`);

// regra "pela média": cada unidade fecha o CSAT TOTAL na meta com menos respostas que a regra por dimensão
const m = M.planoPraca(lojas(true), Object.assign({}, P, { regra: 'media' }));
for (const x of m.unidades.filter((x) => x.temPlano)) {
  eq(`média: final ${x.cod} >= 89%`, x.totalFinal >= 0.89 - 1e-9, true);
  eq(`média: K ${x.cod} <= regra por dimensão`, x.K <= by[x.cod].K, true);
}
const acima = M.planoUnidade(u('X', 'meta', [85, 100], [99, 100], [0, 0], 10), Object.assign({}, P, { regra: 'media' }));
eq('média: unidade já acima da meta só precisa do ritmo', acima.K, M.rhu(10 / 30 * 21));
console.log(`   (média SLZ: ${m.unidades.filter((x) => x.temPlano).map((x) => x.cod + '=' + x.K).join(' ')})`);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
