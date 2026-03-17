# VLR.gg Scraper

Picks&Bans, Stats e Pistols em uma única interface flutuante para facilitar a extração e análise de dados no VLR.gg. Desenvolvido para atuar como uma extensão Tampermonkey, este script extrai automaticamente estatísticas de jogos e mapas, poupando tempo em pesquisas manuais.

Leia isto em: [English](README_en.md)

## 🚀 Funcionalidades

O script adiciona um botão flutuante 📊 no canto inferior direito do site do vlr.gg. Ao clicar nele, você tem acesso a três módulos principais:

### 1. Picks&Bans (Scraper Comparativo)
Descubra rapidamente os mapas mais jogados, mais banidos e mais escolhidos entre os times.
- Permite filtrar a taxa de picks e bans de até dois times diferentes ao mesmo tempo.
- Busca por evento ou data específica (ex.: apenas Champions, ou apenas os últimos 3 meses).
- Limite personalizável de número de partidas analisadas.

### 2. Stats (Stats Extractor)
Extrai informações sobre taxas de vitórias por mapa e lados (Attacker x Defender).
- Pega a tabela de vitórias por mapa ("w", "l", "win%").
- Pinta as taxas de vitórias na tabela com base na % (de 0% a 100%, em escalas de vermelho a verde).
- Exibe métricas de `first blood` de cada lado.
- Botão "COPIAR TABELA" que formata os dados perfeitamente para colar no Excel, Google Sheets, Discord ou Notion, mantendo cores e estrutura.

### 3. Pistols (Omniscient Scraper)
Módulo específico focado nas estatísticas de vitórias e derrotas em *Pistol Rounds*.
- Filtra por times (até dois) para comparar performances.
- Mostra um "Total Geral" dos *Pistols* ganhos em todos os mapas filtrados.
- Cria uma quebra dos *Pistols* ganhos dividida mapa por mapa.
- Exibe taxas de vitórias (% de w/l) nos *pistols*.

## 🛡️ Estabilidade & Segurança
- **Isolamento via SecureStorage:** Usa os métodos GM_setValue nativos do Tampermonkey, protegendo os dados salvos e o cache interno no seu navegador.
- **Requisições (Fetch) Controladas:** Só conecta no domínio oficial do vlr.gg, prevenindo tráfego para qualquer outro lugar.

## ⚙️ Como Instalar e Usar

1. No seu navegador, instale a extensão do [Tampermonkey](https://www.tampermonkey.net/).
2. Abra o painel (Dashboard) do Tampermonkey e clique na aba com sinal de `+` para criar um novo script.
3. Copie todo o código contido no arquivo `script.user.js` deste repositório e cole lá.
4. Salve (`Ctrl+S` ou aba Arquivo > Salvar).
5. Acesse o site do [VLR.gg](https://www.vlr.gg) e verifique se o botão de ferramenta 📊 aparece no canto de sua tela.
42: 
43: > [!IMPORTANT]
44: > **Usuários do Opera:** Para que o script funcione, você deve ativar o **Modo do Desenvolvedor** (Developer Mode) nas configurações de extensões do Opera e habilitar a opção **"Permitir Scripts de Usuário"** (Allow User Scripts). Além disso, o Opera pode exibir um aviso informando que a extensão executará código não revisado; você deve confirmar que confia no script para que ele seja ativado.

## 🧑‍💻 Autores

- **Nyang**
- **dollyzn**
