"""Classificação dos comentários abertos do survey em temas acionáveis (palavras-chave, pt-BR).

Cada comentário pode cair em mais de um tema. Os que não casam com nenhum vão para "outros".
Para ajustar: edite as listas de palavras (sem acento, em minúsculas; casam por início de palavra).
"""
import re
import unicodedata

# id, nome, palavras-chave, ação sugerida
TEMAS = [
    ("sem_contato", "Sem contato / não conhece a supervisora",
     ["nunca vi", "nunca a vi", "nao conheco", "nem conheco", "nao sei quem", "nem sei quem", "nunca entrou em contato",
      "nunca me procur", "sem contato", "nao tenho supervisora", "nao tive contato", "nunca falei", "nunca conversei",
      "pouco falo", "quase nao convers", "nao conheci", "nao fala comigo", "nunca falou", "nao me procur", "sumiu",
      "nao tenho contato", "nao sei qual", "desconheco", "nunca nem vi", "nao sei nem", "nunca tive contato",
      "nao tenho supervisor", "sem supervisor", "ainda nao tenho", "a conheco", "nao tenho interac", "pouca interac",
      "pouco se comunica", "nao manda mensagem", "nenhum contato", "nao consigo falar", "preciso conhecer", "nao sei o nome",
      "estou sem supervis", "outro estado", "interacao"],
     "Supervisora fazer contato ativo com a base sem relacionamento"),
    ("demora_resposta", "Demora para responder / falta de retorno",
     ["demora responder", "demora para responder", "demora pra responder", "demora a responder", "custa responder",
      "nao responde", "nao respondeu", "sem retorno", "nao retorna", "nao deu retorno", "retorno", "visualiza e nao",
      "demora muito pra responder", "demora no retorno", "pessimo pra responder", "responde", "suporte",
      "nao obtive resposta", "nao fui atendid", "mandei mensagem", "mandei uma mensagem", "sem resposta"],
     "Combinar prazo de resposta no WhatsApp e cobrir ausências"),
    ("informacao", "Falta de informação de promoções e campanhas",
     ["nao manda as promo", "nao avisa", "nao informa", "informac", "novidade", "lancamento", "campanha", "promoc",
      "nao divulga", "divulg", "grupo", "material"],
     "Enviar campanhas, lançamentos e regras do ciclo para toda a base"),
    ("falta_produto", "Falta de produtos / ruptura",
     ["falta de produto", "faltando muitos", "falta produto", "faltam produto", "ruptura", "estoque", "nunca tem",
      "nao tem o produto", "nao tinha", "indisponiv", "em falta", "acabou", "sem produto", "disponibilidade", "falta",
      "esgota", "poucas unidades", "nao tem o que", "produtos disponiveis", "mais produtos", "nao tem nada"],
     "Revisar ruptura e alinhar o estoque do app com a loja"),
    ("demora_caixa", "Demora / fila no atendimento e no caixa",
     ["demora no caixa", "fila", "caixa", "demor", "esper", "lento", "lentidao", "muito tempo"],
     "Reforçar caixa e atendimento nos horários de pico"),
    ("atendimento", "Atendimento / postura da equipe",
     ["atendimento", "atender", "atendeu", "atencao", "grosse", "mal educad", "educac", "antipatic", "ignor",
      "mal humor", "descaso", "desrespeit", "funcionari", "colaborador", "despreparad", "conversando", "atendente",
      "carismatic", "acessivel", "nem olhou", "explicac", "apoio", "vontade", "simpatia", "acolh"],
     "Briefing de atendimento e acolhimento do revendedor"),
    ("estrutura", "Organização e estrutura da loja",
     ["organiz", "desorganiz", "espaco", "estacion", "calor", "ar condicionado", "apertad", "sujo", "limpez",
      "exposicao", "exposto", "prateleira", "bagunc", "sinaliz", "placa", "acompanhante", "autoatendimento"],
     "Organizar exposição, espaço e conforto da loja"),
    ("brindes", "Brindes, amostras e sacolas",
     ["brinde", "amostra", "sacola", "demonstrador", "tester"],
     "Garantir brindes, amostras e sacolas disponíveis no caixa"),
    ("sistema", "App, sistema e pagamento",
     ["aplicativo", "app", "sistema", "site", "online", "on-line", "boleto", "pix", "cartao", "pagamento", "credito",
      "cadastro", "senha", "portal"],
     "Apoiar o revendedor no app e pagamento; reportar falhas"),
    ("localizacao", "Localização / mudança de loja",
     ["cidade operaria", "longe", "localizac", "mudanca", "mudou", "fechou", "fecharam", "distante", "voltar para"],
     "Comunicar mudanças de endereço e opções de retirada"),
    ("atraso_entrega", "Atraso na entrega",
     ["atras", "prazo", "nao chegou", "ainda nao chegou", "chegou depois", "demorou para chegar", "demorou a chegar",
      "demorou pra chegar", "dias para chegar", "previsao"],
     "Acompanhar prazos da transportadora e avisar atrasos"),
    ("pedido_errado", "Pedido errado, incompleto ou avariado",
     ["errad", "troca", "trocad", "incomplet", "veio faltando", "faltou", "quebr", "avari", "vazad", "vazou",
      "danific", "amassad", "violad", "aberto"],
     "Conferir o pedido antes do envio e agilizar a troca"),
    ("entregador", "Entregador / transportadora",
     ["entregador", "transportadora", "motoboy", "motorista", "correio", "nao entregou", "nao entregaram", "endereco", "localizad", "a caminho", "em casa"],
     "Dar feedback à transportadora sobre a entrega"),
]
ELOGIO = ("elogio", "Elogio",
          ["otim", "excelente", "maravilh", "parabens", "amo ", "adoro", "perfeit", "top", "muito bom", "muito boa",
           "nota 10", "nota dez", "satisfeit", "atencios", "prestativ", "eficiente", "nada a reclamar", "show"],
          "Reconhecer a equipe e manter o padrão")
OUTROS = ("outros", "Outros", [], "Ler os comentários e identificar a causa")
TODOS = TEMAS + [ELOGIO, OUTROS]


def normalizar(t):
    t = unicodedata.normalize("NFKD", str(t).lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " " + re.sub(r"\s+", " ", t) + " "


_RX = {tid: [re.compile(r"(?<![a-z])" + re.escape(k.strip())) for k in kws] for tid, _, kws, _ in TODOS}


def classificar(texto, nota):
    """Retorna a lista de ids de tema do comentário."""
    n = normalizar(texto)
    achou = [tid for tid, _, kws, _ in TEMAS if any(r.search(n) for r in _RX[tid])]
    if nota is not None and nota >= 4 and any(r.search(n) for r in _RX["elogio"]):
        achou = ["elogio"] + [a for a in achou if a not in ("demora_resposta",)]
    elif nota is not None and nota >= 4 and not achou:
        achou = ["elogio"]
    return achou or ["outros"]


_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_FONE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")


def mascarar(texto, limite=220):
    t = re.sub(r"\s+", " ", str(texto)).strip()
    t = _EMAIL.sub("[e-mail]", t)
    t = _FONE.sub("[número]", t)
    return t if len(t) <= limite else t[:limite - 1].rstrip() + "…"
