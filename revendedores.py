"""Base de revendedores do ciclo x respostas do CSAT (página Ativação CSAT).

Regra: todo revendedor ativo no ciclo (Atividade I, R ou A0) recebe a pesquisa após o primeiro
pedido do ciclo. Quem tem resposta no survey com o mesmo Ciclo e Código do Revendedor já respondeu.

Gera dois conjuntos:
- público (vai para dados.js): contagens por ER x cidade (ativos e respondidos), sem nomes;
- local (ativacao.js, fica fora do GitHub): lista nominal com telefone para o WhatsApp.
"""
import glob
import os
import re

import pandas as pd

ATIVOS = {"I", "R", "A0"}
FONE_COLS = re.compile(r"(celular|telefone|fone|whats|contato|numero|número)", re.I)


def _ler(arq):
    if arq.lower().endswith(".csv"):
        # o separador muda conforme a exportação (";" ou ","): decide pela 1ª linha
        enc = "utf-8"
        try:
            primeira = open(arq, encoding=enc).readline()
        except UnicodeDecodeError:
            enc = "latin-1"
            primeira = open(arq, encoding=enc).readline()
        sep = ";" if primeira.count(";") >= primeira.count(",") else ","
        b = pd.read_csv(arq, sep=sep, dtype=str, encoding=enc)
    else:
        b = pd.read_excel(arq, dtype=str)
    b.columns = [str(c).strip() for c in b.columns]
    return b


def ler_bases(pasta):
    """Retorna (base do ciclo, arquivo, base de telefones, arquivo). Escolhe pelo conteúdo, não pelo nome."""
    arqs = sorted(glob.glob(os.path.join(pasta, "dCentros", "Revendedores", "*.csv")) +
                  glob.glob(os.path.join(pasta, "dCentros", "Revendedores", "*.xlsx")),
                  key=os.path.getmtime, reverse=True)
    base = fones = None
    arq_b = arq_f = None
    for a in arqs:
        if os.path.basename(a).startswith("~$"):
            continue
        b = _ler(a)
        low = [c.lower() for c in b.columns]
        if base is None and "cod er" in low and "atividade" in low:
            base, arq_b = b, a
        elif fones is None and any(FONE_COLS.search(c) for c in b.columns):
            fones, arq_f = b, a
    return base, arq_b, fones, arq_f


def _col(b, *nomes):
    low = {c.lower(): c for c in b.columns}
    for n in nomes:
        if n.lower() in low:
            return low[n.lower()]
    return None


def _fone(v):
    if v is None or pd.isna(v):
        return None
    d = re.sub(r"\D", "", str(v)).lstrip("0")
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) == 10 and d[2] in "6789":
        d = d[:2] + "9" + d[2:]
    if len(d) != 11 or d[2] != "9" or d[:2] < "11":
        return None
    return "55" + d


def montar(pasta, df_survey, codigos, cidade_idx):
    """df_survey: respostas (todas as ERs) com colunas rev, ciclo, dia, sup."""
    b, arq, fb, arq_f = ler_bases(pasta)
    if b is None:
        return None, None
    fone_base = {}
    if fb is not None:
        c_id = _col(fb, "ID", "Cod Revendedor", "Código do Revendedor", "Código Revendedor")
        c_tel = next((c for c in fb.columns if FONE_COLS.search(c)), None)
        if c_id and c_tel:
            fone_base = {str(k).strip().lstrip("0"): _fone(v) for k, v in zip(fb[c_id], fb[c_tel])}
    c_ciclo = _col(b, "Cod Ciclo", "Ciclo")
    c_er = _col(b, "Cod ER", "Código ER", "ER")
    c_rev = _col(b, "Cod Revendedor", "Código do Revendedor", "Revendedor")
    c_nome = _col(b, "Nome Revendedor", "Nome")
    c_cid = _col(b, "Cidade")
    c_atv = _col(b, "Atividade")
    c_fone = next((c for c in b.columns if FONE_COLS.search(c)), None)
    if not all([c_ciclo, c_er, c_rev, c_atv]):
        print("base de revendedores sem as colunas esperadas:", list(b.columns))
        return None, None

    ciclo = b[c_ciclo].mode().iat[0]
    b = b[(b[c_ciclo] == ciclo) & (b[c_er].isin(codigos)) & (b[c_atv].str.strip().isin(ATIVOS))].copy()
    b["k"] = b[c_rev].astype(str).str.strip().str.lstrip("0")

    todas = df_survey.copy()
    todas["k"] = todas["rev"].astype(str).str.strip().str.lstrip("0")
    # celular mais recente que o revendedor informou em qualquer pesquisa do ano
    cel = todas.dropna(subset=["celular"]).sort_values("dia").drop_duplicates("k", keep="last")
    fone_pesq = {k: _fone(v) for k, v in zip(cel["k"], cel["celular"])}
    s = todas[todas["ciclo"].astype(str).str.strip() == str(ciclo)].copy()
    s = s.sort_values("dia").drop_duplicates("k", keep="first")
    resp = dict(zip(s["k"], zip(s["dia"], s["sup"])))

    lista, agg = [], {}
    for vals in b.itertuples(index=False, name=None):
        row = dict(zip(b.columns, vals))
        k = row["k"]
        cid = str(row.get(c_cid) or "").strip().upper() if c_cid else ""
        if cid and cid not in cidade_idx:
            cidade_idx[cid] = len(cidade_idx)
        ci = cidade_idx.get(cid, -1)
        rsp = resp.get(k)
        nota = None if rsp is None or pd.isna(rsp[1]) else int(rsp[1])
        lista.append([row[c_rev].strip(), row[c_er], (row.get(c_nome) or "").strip().title() if c_nome else "",
                      ci, row[c_atv].strip(), (_fone(row.get(c_fone)) if c_fone else None) or fone_base.get(k) or fone_pesq.get(k),
                      rsp[0] if rsp else None, nota])
        a = agg.setdefault((row[c_er], ci), [0, 0])
        a[0] += 1
        a[1] += 1 if rsp else 0

    com_fone = sum(1 for x in lista if x[5])
    publico = {"ciclo": ciclo, "por_er_cidade": [[er, ci, a[0], a[1]] for (er, ci), a in agg.items()]}
    local = {"ciclo": ciclo, "arquivo": os.path.basename(arq), "com_fone": com_fone,
             "fonte_fone": c_fone or (os.path.basename(arq_f) if arq_f else "pesquisas CSAT do ano"), "revendedores": lista}
    print(f"revendedores ciclo {ciclo}: {len(lista)} ativos (I/R/A0) nas ERs do desafio, "
          f"{sum(1 for x in lista if x[6])} responderam · {com_fone} com celular"
          f" (pendentes com celular: {sum(1 for x in lista if x[5] and not x[6])})")
    return publico, local
