# SUPER DESAFIO CSAT · São Luís e Paraíba

Painel de acompanhamento do desafio CSAT: cada PDV (ERs, HUB e Híbridas) e cada praça fechando **89% de CSAT TOTAL até 30/11/2026**.

Endereço: https://fabio-paulo-silva.github.io/SUPER-DESAGIO-CSAT/

## Abas
- **Plano do dia:** KPIs da praça, prioridades, meta de hoje (diarização) e atingimento por PDV.
- **Comentários e focos:** temas das notas 1–3, ações sugeridas, matriz tema × PDV e os comentários.
- **Premiação:** Gerente de Canal (R$ 500) e ranking dos gerentes (R$ 300).
- **Simulações:** parâmetros, cenários, plano por dimensão, calendário e acompanhamento.

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html` | O painel (abre direto no navegador) |
| `motor.js` | Cálculo do plano (funções puras) |
| `dados.js` | Dados gerados pelo script: contagens agregadas + comentários de notas 1–3 mascarados |
| `atualizar_dados.py` | Lê as exportações do survey em `Dados/` e gera `dados.js`; configuração do desafio no topo |
| `temas_comentarios.py` | Palavras-chave dos temas dos comentários |
| `testes_motor.js` | Testes do motor (`node testes_motor.js`) |

As planilhas brutas (`Dados/`, `dCentros/`) ficam só no computador e não vão para o GitHub.

Para atualizar os dados e publicar, veja [PUBLICAR.md](PUBLICAR.md).
