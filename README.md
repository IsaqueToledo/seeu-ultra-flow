# ⚖️ SEEU Ultra Flow Automaker

Uma poderosa extensão para Google Chrome/Edge desenvolvida para revolucionar a produtividade de servidores e advogados que utilizam o sistema **SEEU (Sistema Eletrônico de Execução Unificado)**.

Esta ferramenta injeta recursos modernos em uma interface legada, reduzindo o tempo de cliques e automatizando tarefas burocráticas repetitivas.

## ✨ Principais Funcionalidades

- **🧠 Inteligência Artificial (Leitura de PDFs Local):** Lê os PDFs diretamente na aba "Análise de Juntadas" em background (sem abrir o arquivo), identifica se é Alvará, Recaptura, Progressão, e se foi juntado por Defensoria ou Advogado.
- **🚀 Automação de Lotes (Bypass Struts):** Analisa e dispensa juntadas em lote (ofícios ou manifestações do MP) com um único clique, burlando os *pop-ups* lentos do sistema nativo.
- **📥 Unificador de PDFs:** Botão inteligente que varre todos os eventos de um processo, baixa os PDFs fragmentados e os junta em um **ÚNICO arquivo PDF** direto no navegador.
- **📍 Gestão de Localizadores em Massa:** Painel flutuante exclusivo que permite associar e desassociar localizadores de dezenas de processos simultaneamente via requisições AJAX.
- **📦 Memória de Agrupadores:** Transporta de forma inteligente os agrupadores de processos da fila de Minutas diretamente para a fila de Juntadas.
- **📌 Cabeçalho Congelado:** Fixa o número do processo, as datas de Progressão, Livramento e Término no topo da tela enquanto você rola a página.

## 🛠️ Como Instalar (Modo Desenvolvedor)

Como esta extensão possui automações avançadas e não está na Chrome Web Store, a instalação é feita manualmente:

1. Faça o download deste repositório clicando no botão verde **"Code"** -> **"Download ZIP"**.
2. Extraia o arquivo ZIP em uma pasta no seu computador.
3. Abra o Google Chrome e digite na barra de endereços: `chrome://extensions/`
4. No canto superior direito, ative o **"Modo do desenvolvedor"**.
5. Clique no botão **"Carregar sem compactação"** (Load unpacked) no canto superior esquerdo.
6. Selecione a pasta que você extraiu no Passo 2.
7. Pronto! A extensão já está ativa no seu SEEU. Clique no ícone dela nas extensões para abrir o painel de configurações.

## 🔒 Privacidade e Segurança
Esta extensão roda **100% no seu navegador (Client-side)**. Nenhuma informação de processos, PDFs ou dados sigilosos é enviada para servidores externos. O uso da biblioteca `pdf-lib` e `pdf.js` ocorre localmente na máquina do usuário.

## 💻 Tecnologias Utilizadas
* JavaScript (ES6+)
* Chrome Extensions API (Manifest V3)
* Web Workers (Processamento Assíncrono)
* `pdf.js` (Leitura) & `pdf-lib` (Manipulação)



######################### ATUALIZAÇÃO 17/07/2026 #################################

## 🆕 Novas Integrações (Pesquisas Automáticas)

A extensão agora conecta o SEEU a plataformas de consulta externa, eliminando a necessidade de copiar e colar dados manualmente entre abas.

- **🔍 Pesquisa e-SAJ Automática:** Um botão injetado no cabeçalho do processo extrai inteligentemente o nome do sentenciado da tela do SEEU e já abre a consulta de 1º Grau no **e-SAJ (TJSP)** preenchida e pesquisada.
- **🚨 Integração DIPOL (Power Apps):** O botão "Pesquisa DIPOL" lê os dados do apenado (RG, Nome e Nome da Mãe), abre a interface do Microsoft Power Apps da DIPOL, quebra os bloqueios de segurança do sistema da Microsoft, preenche os campos automaticamente e realiza a consulta de antecedentes criminais em segundos.


######################### ATUALIZAÇÃO 20/07/2026 #################################

## O Painel fixo da tela do processo ficou mais compacto, liberando mais espaço na tela;
## A tecla F5 deixou de funcionar no site, para evitar logoffs;
