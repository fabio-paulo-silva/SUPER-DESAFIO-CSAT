"""
Atualiza os dados do painel do Super Desafio CSAT (São Luís e Paraíba).

Uso:
    python atualizar_dados.py                 # lê todos os .xlsx dentro de Dados/ (subpastas incluídas)
    python atualizar_dados.py arquivo1.xlsx … # lê só os arquivos informados

Gera `dados.js` (window.DADOS = {...}) com contagens AGREGADAS por dia x unidade x nota.
Nenhum dado pessoal (e-mail, nome, código de revendedor, comentários) é gravado.
"""
import glob
import json
import os
import sys
from datetime import datetime

import pandas as pd
from temas_comentarios import TODOS, classificar, mascarar
import revendedores
import cripto_ativacao
import warnings

warnings.filterwarnings("ignore")

PASTA = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- configuração do desafio
CONFIG = {
    "meta": 0.89,
    "fim_plano": "2026-11-30",
    "janela_ritmo": 30,
    "inicio_base": "2026-01-01",
    # data do plano "aprovado" usado no acompanhamento (realizado x plano)
    "baseline": "2026-11-08",
    "entrega_entra": True,
    # Premiação: Gerente de Canal ganha se a PRAÇA fechar >= meta em 30/11;
    # cada Gerente (GVO) ganha se o resultado AGREGADO das suas PDVs com meta fechar >= meta.
    "incentivo": {
        "valor_canal": 500,
        "valor_gerente": 300,
        "gerente_canal": {"SLZ": "Idayane Celles", "PB": "Padã Feitosa"},
    },
    "pracas": {
        "SLZ": {
            "nome": "São Luís",
            # papel: meta = tem meta própria de 89%; praca = só soma na praça;
            #        descontinuada = só histórico na praça; fora = fora do desafio (opcional na tela)
            "unidades": {
                "21123": "meta",
                "21124": "meta",
                "21125": "meta",
                "24522": "meta",
                "21422": "descontinuada",
            },
        },
        "PB": {
            "nome": "Paraíba",
            "unidades": {
                "21559": "meta",
                "21561": "meta",
                "21232": "meta",
                "21767": "meta",
            },
        },
    },
}

COLS = {
    "Satisfação Supervisora": "sup",
    "Data da resposta": "data",
    "Código ER captação": "cod",
    "Satisfação ER": "er",
    "Satisfação Entrega": "ent",
}
ID_COL = "ID da Pesquisa"
# comentários abertos (classificados em temas; só o texto de notas 1–3 vai para o painel, mascarado)
# colunas opcionais: cidade (visão por cidade) e revendedor/ciclo (página Ativação CSAT)
OPC = {
    "Cidade cadastro revendedor": "cidade",
    "Código do Revendedor": "rev",
    "Ciclo": "ciclo",
    "Celular": "celular",  # só vai para ativacao.js (local)
}
COMENT = {
    "Satisfação Supervisora Pergunta Aberta": "c_sup",
    "Satisfação ER Pergunta Aberta": "c_er",
    "Satisfação Entrega Pergunta Aberta": "c_ent",
}


def ler_export(caminho):
    bruto = pd.read_excel(caminho, sheet_name=0, header=None, nrows=10, dtype=str)
    linha_cab = None
    for i in range(len(bruto)):
        if (bruto.iloc[i].astype(str).str.strip() == "Data da resposta").any():
            linha_cab = i
            break
    if linha_cab is None:
        raise ValueError(f"Cabeçalho 'Data da resposta' não encontrado em {caminho}")
    usar = list(COLS) + [ID_COL] + list(COMENT) + list(OPC)
    df = pd.read_excel(caminho, sheet_name=0, header=linha_cab, dtype=str,
                       usecols=lambda c: c in usar)
    faltando = [c for c in COLS if c not in df.columns]
    if faltando:
        raise ValueError(f"Colunas ausentes em {caminho}: {faltando}")
    return df


def ler_centros():
    arq = glob.glob(os.path.join(PASTA, "dCentros", "*.xlsx"))[0]
    c = pd.read_excel(arq)
    c.columns = ["cod", "loja", "praca", "gvo", "gcvo", "grvo", "canal"]
    c["cod"] = pd.to_numeric(c["cod"], errors="coerce")
    def nome(s):
        t = str(s).strip().title()
        for a, b in (("Er ", "ER "), ("Hub ", "HUB "), ("Qdb ", "QDB ")):
            if t.startswith(a):
                t = b + t[len(a):]
        return t.replace(" Da ", " da ").replace(" De ", " de ").replace(" Do ", " do ")

    return {str(int(r.cod)): {"nome": nome(r.loja),"canal": r.canal, "gvo": r.gvo,
                              "gcvo": r.gcvo, "grvo": r.grvo, "praca_dc": r.praca}
            for r in c.itertuples() if pd.notna(r.cod)}


TEMA_IDX = {tid: i for i, (tid, *_r) in enumerate(TODOS)}


def main():
    arquivos = sys.argv[1:] or sorted(glob.glob(os.path.join(PASTA, "Dados", "**", "*.xlsx"), recursive=True))
    arquivos = [a for a in arquivos if not os.path.basename(a).startswith("~$")]
    if not arquivos:
        sys.exit("Nenhum .xlsx encontrado em Dados/")
    frames = []
    for a in arquivos:
        print("lendo", os.path.relpath(a, PASTA))
        frames.append(ler_export(a))
    df = pd.concat(frames, ignore_index=True)
    if ID_COL in df.columns:
        antes = len(df)
        df = df.drop_duplicates(subset=[ID_COL])
        if antes != len(df):
            print(f"removidas {antes - len(df)} respostas duplicadas (mesmo ID da Pesquisa)")
    for c in list(COMENT) + list(OPC):
        if c not in df.columns:
            df[c] = pd.NA
    df = df.rename(columns={**COLS, **COMENT, **OPC})[list(COLS.values()) + list(COMENT.values()) + list(OPC.values())]
    df_rev = df[["rev", "ciclo", "data", "sup", "celular"]].copy()
    df_rev["dia"] = pd.to_datetime(df_rev["data"], errors="coerce").dt.strftime("%Y-%m-%d")
    df_rev["sup"] = pd.to_numeric(df_rev["sup"], errors="coerce")

    codigos = {c for p in CONFIG["pracas"].values() for c in p["unidades"]}
    df["cod"] = pd.to_numeric(df["cod"], errors="coerce")
    df = df[df["cod"].notna()]
    df["cod"] = df["cod"].astype(int).astype(str)
    df = df[df["cod"].isin(codigos)]
    df["data"] = pd.to_datetime(df["data"], errors="coerce")
    df = df[df["data"].notna()]
    df["dia"] = df["data"].dt.strftime("%Y-%m-%d")
    for d in ("sup", "er", "ent"):
        df[d] = pd.to_numeric(df[d], errors="coerce")
        df.loc[~df[d].isin([1, 2, 3, 4, 5]), d] = pd.NA

    linhas = []
    for (dia, cod), g in df.groupby(["dia", "cod"]):
        cont = []
        for d in ("sup", "er", "ent"):
            vc = g[d].dropna().astype(int).value_counts()
            cont.append([int(vc.get(k, 0)) for k in range(1, 6)])
        linhas.append([dia, int(cod)] + cont)

    # CSAT por cidade (cidade de cadastro do revendedor)
    cidade_idx = {}
    df["cidade"] = df["cidade"].fillna("").astype(str).str.strip().str.upper()
    linhas_cidade = []
    for (dia, cod, cid), g in df.groupby(["dia", "cod", "cidade"]):
        if not cid:
            continue
        if cid not in cidade_idx:
            cidade_idx[cid] = len(cidade_idx)
        cont = []
        for d in ("sup", "er", "ent"):
            vc = g[d].dropna().astype(int).value_counts()
            cont.append([int(vc.get(k, 0)) for k in range(1, 6)])
        linhas_cidade.append([dia, int(cod), cidade_idx[cid]] + cont)

    ciclo_pub, ativacao = revendedores.montar(PASTA, df_rev, codigos, cidade_idx)
    if ativacao:
        with open(os.path.join(PASTA, "ativacao.js"), "w", encoding="utf-8") as f:
            f.write("// Gerado por atualizar_dados.py - DADOS PESSOAIS: fica só no computador (.gitignore)\n")
            f.write("window.ATIVACAO = ")
            json.dump(ativacao, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")
        # versão criptografada (vai para o site; abre com a senha da praça)
        cripto_ativacao.gravar(PASTA, ativacao, {sg: [c for c, papel in pr["unidades"].items() if papel != "fora"]
                                                 for sg, pr in CONFIG["pracas"].items()})

    comentarios = []
    for r in df.itertuples():
        for i, d in enumerate(("sup", "er", "ent")):
            txt = getattr(r, "c_" + d)
            nota = getattr(r, d)
            if pd.isna(txt) or pd.isna(nota):
                continue
            txt = str(txt).strip()
            if len(txt) < 3:
                continue
            nota = int(nota)
            temas = [TEMA_IDX[t] for t in classificar(txt, nota)]
            comentarios.append([r.dia, int(r.cod), i, nota, temas, mascarar(txt) if nota <= 3 else ""])

    centros = ler_centros()
    unidades = {}
    for sigla, p in CONFIG["pracas"].items():
        for cod in p["unidades"]:
            info = centros.get(cod, {"nome": cod, "canal": "", "gvo": "", "gcvo": ""})
            unidades[cod] = {k: info.get(k, "") for k in ("nome", "canal", "gvo", "gcvo")}
            unidades[cod]["praca"] = sigla

    # pessoas que podem se identificar no painel (controle de acessos, igual ao PULSAR)
    pessoas = {}
    def _add(nome, papel, cod):
        nome = str(nome or "").strip()
        if not nome or nome.lower() == "nan":
            return
        pe = pessoas.setdefault(nome, {"nome": nome, "papeis": [], "lojas": []})
        if papel not in pe["papeis"]:
            pe["papeis"].append(papel)
        if cod and cod not in pe["lojas"]:
            pe["lojas"].append(cod)
    for sigla, p in CONFIG["pracas"].items():
        for cod, papel_u in p["unidades"].items():
            if papel_u not in ("meta", "praca"):
                continue
            info = centros.get(cod, {})
            _add(info.get("gvo"), "GVO", cod)
            _add(info.get("gcvo"), "GCVO/GPVO", cod)
            _add(info.get("grvo"), "GRVO", cod)
        _add(CONFIG.get("incentivo", {}).get("gerente_canal", {}).get(sigla), "Gerente de Canal", "")

    ultimo = df["data"].max()
    # Se a base vai até HOJE, o dia de hoje está incompleto: o corte fica em ontem
    # (meta de hoje = dia de hoje) e o que já entrou hoje vai em "parcial".
    corte = ultimo.normalize()
    parcial = None
    if corte.date() >= datetime.now().date():
        parcial = {"dia": corte.strftime("%Y-%m-%d"), "ate": ultimo.strftime("%H:%M")}
        corte = corte - pd.Timedelta(days=1)
    saida = {
        "gerado_em": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "corte": corte.strftime("%Y-%m-%d"),
        "parcial": parcial,
        "ultima_resposta": ultimo.strftime("%Y-%m-%d %H:%M"),
        "config": CONFIG,
        "unidades": unidades,
        "linhas": linhas,
        "temas": [[tid, nome, acao] for tid, nome, _, acao in TODOS],
        "comentarios": comentarios,
        "cidades": [c for c, _ in sorted(cidade_idx.items(), key=lambda kv: kv[1])],
        "linhas_cidade": linhas_cidade,
        "ciclo": ciclo_pub,
        "pessoas": sorted(pessoas.values(), key=lambda x: x["nome"]),
    }
    with open(os.path.join(PASTA, "dados.js"), "w", encoding="utf-8") as f:
        f.write("// Gerado por atualizar_dados.py - contagens agregadas + comentarios de notas 1-3 mascarados\n")
        f.write("window.DADOS = ")
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"dados.js gravado: {len(linhas)} linhas agregadas, corte {saida['corte']} "
          f"(última resposta {saida['ultima_resposta']})")
    for cod in sorted(unidades):
        n = int((df["cod"] == cod).sum())
        print(f"  {cod} {unidades[cod]['nome']:<28} {n:>5} respostas")


if __name__ == "__main__":
    main()
