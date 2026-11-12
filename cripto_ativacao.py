"""Criptografa os dados da Ativação CSAT (nomes e telefones) para publicar no site.

Cada praça vira um pacote: os dados (JSON compactado com gzip) são cifrados com AES-GCM usando uma
chave aleatória; essa chave é guardada várias vezes, cada uma cifrada com uma senha (a da praça e a geral),
derivada por PBKDF2-SHA256. O navegador faz o caminho inverso com a Web Crypto API.
As senhas ficam em senhas_ativacao.json (só no computador, fora do Git).
"""
import base64
import gzip
import hashlib
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 600_000
b64 = lambda b: base64.b64encode(b).decode()


def _envelope(chave, senha):
    salt, iv = os.urandom(16), os.urandom(12)
    k = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), salt, ITER, 32)
    return {"s": b64(salt), "i": b64(iv), "c": b64(AESGCM(k).encrypt(iv, chave, None))}


def pacote(dados, senhas):
    chave, iv = AESGCM.generate_key(256), os.urandom(12)
    bruto = gzip.compress(json.dumps(dados, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    return {"i": b64(iv), "c": b64(AESGCM(chave).encrypt(iv, bruto, None)),
            "k": [_envelope(chave, s) for s in senhas if s]}


def gravar(pasta, ativacao, pracas_ers):
    """pracas_ers: {"SLZ": ["21123", ...], ...}. Grava ativacao_cripto.js se houver senhas."""
    arq = os.path.join(pasta, "senhas_ativacao.json")
    if not os.path.exists(arq) or not ativacao:
        print("ativação: sem senhas_ativacao.json, nada publicado")
        return
    senhas = json.load(open(arq, encoding="utf-8"))
    saida = {"ciclo": ativacao["ciclo"], "iter": ITER, "pracas": {}}
    for praca, ers in pracas_ers.items():
        rows = [r for r in ativacao["revendedores"] if str(r[1]) in ers]
        dados = {k: v for k, v in ativacao.items() if k != "revendedores"}
        dados["revendedores"] = rows
        saida["pracas"][praca] = pacote(dados, [senhas.get(praca), senhas.get("geral")])
    with open(os.path.join(pasta, "ativacao_cripto.js"), "w", encoding="utf-8") as f:
        f.write("// Gerado por atualizar_dados.py - dados da Ativação CRIPTOGRAFADOS (AES-GCM + PBKDF2)\n")
        f.write("window.ATIV_CRIPTO = ")
        json.dump(saida, f, separators=(",", ":"))
        f.write(";\n")
    print("ativação: ativacao_cripto.js gravado (" + ", ".join(f"{p}: {sum(1 for r in ativacao['revendedores'] if str(r[1]) in e)}" for p, e in pracas_ers.items()) + " revendedores)")
