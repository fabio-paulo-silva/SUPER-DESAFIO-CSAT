# Publicar o SUPER DESAFIO CSAT no GitHub Pages

Repositório: https://github.com/fabio-paulo-silva/SUPER-DESAGIO-CSAT
Endereço: https://fabio-paulo-silva.github.io/SUPER-DESAGIO-CSAT/

A cada `push` na `main`, o GitHub Actions (`.github/workflows/pages.yml`) publica `index.html`, `motor.js` e `dados.js`.

> O site é **público**: qualquer pessoa com o link vê os números e os comentários de notas 1–3.

## Configuração única
No GitHub, abra o repositório > **Settings > Pages** > em **Source**, escolha **GitHub Actions**.
Depois, em **Actions**, rode de novo o último "Publicar no GitHub Pages" (ou faça um novo push).

## Dia a dia: atualizar os dados
1. Salve a exportação nova do survey em `Dados/` (subpasta do mês).
2. Rode:
   ```
   python atualizar_dados.py
   ```
3. Envie:
   ```
   git add dados.js
   git commit -m "Dados até DD/MM"
   git push
   ```
4. Em 1 a 2 minutos o site atualiza.
