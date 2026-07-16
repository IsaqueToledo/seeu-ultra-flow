(function () {
  "use strict";

  const RE_PROC = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
  const KEYWORDS_PADRAO = ["progress", "livramento condicional", "recaptura", "alvara", "contramandado"];

  window.__seeuFlowErrors = [];
  function logError(contexto, erro) {
    console.error(`[SEEU Flow] Erro em ${contexto}:`, erro);
    window.__seeuFlowErrors.push({ time: new Date().toLocaleTimeString(), contexto, msg: erro.message || erro });
  }

  const cfg = {
    alertas: false, coluna: true, lerPdf: true,
    obs: true, pdfUnico: true, defesaCapa: true, agrupadores: true,
    btnLocalizadores: true, autoDownload: true, autoOficio: true, congelarPaineis: true,
    autoDispensarOficios: true, autoDispensarMP: true,
    keywords: KEYWORDS_PADRAO.slice(),
  };

  let modoFiltroDefesa = 0; 
  let filtroAgrupadorAtual = "todos"; 
  let memoriaAgrupadores = {}; 
  let cacheDefesaGlobal = {}; 

  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); }

  async function carregarConfig() {
    const d = await chrome.storage.local.get(null);
    cfg.alertas = d.alertas ?? false;
    cfg.coluna = d.coluna ?? true;
    cfg.lerPdf = d.lerPdf ?? true;
    cfg.obs = d.obs ?? true;
    cfg.agrupadores = d.agrupadores ?? true;
    cfg.autoDownload = d.autoDownload ?? true;
    cfg.autoOficio = d.autoOficio ?? true;
    cfg.congelarPaineis = d.congelarPaineis ?? true;
    cfg.autoDispensarOficios = d.autoDispensarOficios ?? true;
    cfg.autoDispensarMP = d.autoDispensarMP ?? true;
  }

  function mostrarBalaoSucesso(mensagem) {
      const balao = document.createElement("div");
      balao.textContent = mensagem;
      balao.style.position = "fixed";
      balao.style.top = "20px";
      balao.style.left = "50%";
      balao.style.transform = "translateX(-50%)";
      balao.style.backgroundColor = "#059669"; 
      balao.style.color = "#fff";
      balao.style.padding = "16px 24px";
      balao.style.borderRadius = "8px";
      balao.style.boxShadow = "0 10px 25px rgba(0,0,0,0.3)";
      balao.style.fontWeight = "bold";
      balao.style.fontSize = "16px";
      balao.style.zIndex = "2147483647";
      document.body.appendChild(balao);

      setTimeout(() => {
          balao.style.opacity = "0";
          balao.style.transition = "opacity 0.6s ease";
          setTimeout(() => balao.remove(), 600);
      }, 3500);
  }

  function avisoToolbar(txt) {
    let tb = document.getElementById("seeu-flow-toolbar");
    if (!tb) {
      tb = document.createElement("div");
      tb.id = "seeu-flow-toolbar";
      const tit = document.createElement("strong");
      tit.textContent = "⚙ SEEU Flow Automaker";
      tb.appendChild(tit);
      document.documentElement.appendChild(tb);
    }
    let msg = tb.querySelector(".sf-msg");
    if (!msg) {
      msg = document.createElement("div");
      msg.className = "sf-msg";
      tb.appendChild(msg);
    }
    msg.textContent = txt;
  }

  /* =========================================================
     CAIXA DE CONFIRMAÇÃO DESTACADA
     ========================================================= */
  function mostrarConfirmacaoDestacada(onConfirm) {
      if (document.getElementById('sf-custom-confirm')) return;

      const overlay = document.createElement('div');
      overlay.id = 'sf-custom-confirm';
      overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:2147483647; display:flex; justify-content:center; align-items:center;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#fff; border:4px solid #dc2626; border-radius:10px; padding:24px 32px; max-width:480px; text-align:center; box-shadow:0 15px 35px rgba(0,0,0,0.5); font-family:system-ui, sans-serif;';

      box.innerHTML = `
          <div style="font-size:45px; margin-bottom:10px; line-height:1;">⚠️</div>
          <h2 style="color:#b91c1c; margin:0 0 16px 0; font-size:24px; font-weight:800;">CUIDADO</h2>
          <p style="color:#0f172a; font-size:16px; line-height:1.5; margin-bottom:24px; font-weight:500;">
              Você já salvou os ofícios?<br><br>
              A ação será <b style="color:#dc2626;">irreversível</b>. Os itens serão removidos desta tela.<br>
              Tem certeza que deseja prosseguir?
          </p>
          <div style="display:flex; gap:12px; justify-content:center;">
              <button id="sf-btn-cancelar" style="background:#64748b; color:white; border:none; padding:12px 20px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px; transition:0.2s;">❌ Cancelar</button>
              <button id="sf-btn-prosseguir" style="background:#dc2626; color:white; border:none; padding:12px 20px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px; transition:0.2s;">✅ Sim, Prosseguir</button>
          </div>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const btnCanc = document.getElementById('sf-btn-cancelar');
      const btnPros = document.getElementById('sf-btn-prosseguir');
      btnCanc.onmouseover = () => btnCanc.style.background = '#475569';
      btnCanc.onmouseout = () => btnCanc.style.background = '#64748b';
      btnPros.onmouseover = () => btnPros.style.background = '#b91c1c';
      btnPros.onmouseout = () => btnPros.style.background = '#dc2626';

      btnCanc.onclick = () => overlay.remove();
      btnPros.onclick = () => {
          overlay.remove();
          onConfirm();
      };
  }

  /* =========================================================
     CENÁRIO 1 - JUNTAR E DISPENSAR LOTE 
     ========================================================= */
  function injetarBotaoJuntarEDispensar(tabela, headerTr) {
    if (!cfg.autoDispensarOficios || !ehFilaJuntadas(headerTr)) return;
    const btnJuntarNativo = document.getElementById("documentosEmLoteButton");
    
    if (btnJuntarNativo && !document.getElementById("btn-juntar-dispensar")) {
        const btnNovo = document.createElement("button");
        btnNovo.id = "btn-juntar-dispensar";
        btnNovo.textContent = "🚀 Analisar e Dispensar (somente OFÍCIOS)";
        btnNovo.className = "sf-btn"; 
        btnNovo.style.backgroundColor = "#2563eb"; 
        btnNovo.style.borderColor = "#1d4ed8";
        btnNovo.style.fontWeight = "bold";
        btnNovo.style.width = "auto";
        btnNovo.style.marginRight = "6px";
        btnNovo.style.padding = "4px 10px";
        
        btnNovo.addEventListener("click", async (e) => {
            e.preventDefault();
            
            const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
            if (checkboxes.length === 0) {
                alert("SEEU Ultra Flow: Selecione os processos na lista primeiro!");
                return;
            }

            mostrarConfirmacaoDestacada(() => {
                btnNovo.textContent = "⚡ Dispensando Lote Único...";
                btnNovo.style.opacity = "0.7";
                btnNovo.style.pointerEvents = "none";
                avisoToolbar(`⚡ Dispensando ${checkboxes.length} processo(s) em lote único (Aguarde 1 segundo)...`);

                const form = document.querySelector('form[name="analisarJuntadaForm"]') || document.forms[0];
                const oldTarget = form.target || "";
                const actionTypeInput = form.querySelector('input[name="actionType"]');
                const oldActionType = actionTypeInput ? actionTypeInput.value : "";

                const iframe = document.createElement("iframe");
                iframe.name = "flow_dispensa_batch";
                iframe.style.display = "none";
                document.body.appendChild(iframe);

                let loadCount = 0;
                iframe.onload = async function() {
                    loadCount++;
                    if (loadCount === 1) return;

                    try {
                        btnNovo.textContent = "🔄 Autenticando...";
                        const resp = await fetch(window.location.href);
                        const html = await resp.text();
                        const doc = new DOMParser().parseFromString(html, "text/html");
                        
                        const newForm = doc.querySelector('form[name="analisarJuntadaForm"]') || doc.forms[0];
                        if (newForm) {
                            const newHiddens = newForm.querySelectorAll('input[type="hidden"]');
                            newHiddens.forEach(newInp => {
                                const oldInp = form.querySelector(`input[name="${newInp.name}"]`);
                                if (oldInp) oldInp.value = newInp.value;
                            });
                        }
                    } catch(err) { console.error("Erro token:", err); }

                    form.target = oldTarget;
                    if (actionTypeInput) actionTypeInput.value = oldActionType;

                    mostrarBalaoSucesso("DISPENSA EM LOTE REALIZADA COM SUCESSO!");
                    
                    btnNovo.textContent = "✅ Pronto! Redirecionando...";
                    btnNovo.style.backgroundColor = "#059669";
                    btnNovo.style.borderColor = "#047857";

                    setTimeout(() => { btnJuntarNativo.click(); }, 300);
                };

                form.target = "flow_dispensa_batch";
                chrome.runtime.sendMessage({ tipo: "burlarConfirmStruts" });
            });
        });

        btnJuntarNativo.parentNode.insertBefore(btnNovo, btnJuntarNativo);
    }
  }

  /* =========================================================
     BAIXAR TODOS OS OFÍCIOS DA TELA (SOMENTE SELECIONADOS)
     ========================================================= */
  async function baixarOficiosEmLote() {
      const btn = document.getElementById("btn-baixar-oficios");
      if (btn) { btn.textContent = "⏳ Lendo a tela..."; btn.style.pointerEvents = "none"; }

      const tabela = acharTabela();
      const headerTr = acharCabecalho(tabela);
      if (!tabela || !headerTr) {
          if (btn) { btn.textContent = "📥 Baixar ofícios selecionados"; btn.style.pointerEvents = "auto"; }
          return;
      }

      const linhas = linhasDados(tabela, headerTr);
      let oficiosEncontrados = 0;
      let linhasAlvo = [];

      for (const tr of linhas) {
          const checkbox = tr.querySelector('input[type="checkbox"]');
          if (checkbox && !checkbox.checked) continue;

          const texto = (tr.textContent || "").toUpperCase();
          if (texto.includes("EXPEDIÇÃO DE OFÍCIO")) {
              const btnMais = tr.querySelector('img[src*="iPlus.gif"]');
              if (btnMais) {
                  const onclickAttr = btnMais.getAttribute('onclick') || "";
                  const match = onclickAttr.match(/showDetail\(['"]([^'"]+)['"]/);
                  if (match) {
                      linhasAlvo.push({ trRaiz: tr, idExpandido: match[1] });
                      
                      const aBtn = btnMais.closest('a');
                      if (aBtn && (aBtn.getAttribute('href') || '').toLowerCase().startsWith('javascript:')) {
                          aBtn.removeAttribute('href'); 
                      }
                      
                      btnMais.click(); 
                      oficiosEncontrados++;
                  }
              }
          }
      }

      if (oficiosEncontrados === 0) {
          alert("Nenhum ofício SELECIONADO foi encontrado nesta página. Por favor, marque as caixinhas dos processos desejados.");
          if (btn) { btn.textContent = "📥 Baixar ofícios selecionados"; btn.style.pointerEvents = "auto"; }
          return;
      }

      avisoToolbar(`⏳ Expandindo ${oficiosEncontrados} ofícios e baixando (aguarde 4s)...`);
      if (btn) { btn.textContent = "⏳ Baixando PDFs..."; }

      await new Promise(r => setTimeout(r, 4500));

      let baixados = 0;
      for (const item of linhasAlvo) {
          const trExpandida = document.getElementById(item.idExpandido);
          if (!trExpandida) continue;

          const cnjMatch = item.trRaiz.textContent.match(RE_PROC);
          const cnj = cnjMatch ? cnjMatch[0].replace(/[^\w.-]+/g, "_") : "Oficio";

          const links = Array.from(trExpandida.querySelectorAll('a[href]'));
          const pdfLink = links.find(a => {
              const txt = (a.textContent || "").trim().toLowerCase();
              return txt === "online.pdf" || a.href.toLowerCase().includes('.pdf');
          });

          if (pdfLink) {
              chrome.runtime.sendMessage({
                  tipo: "baixarOficio",
                  url: pdfLink.href,
                  nomeArquivo: `${cnj}.pdf`
              });
              baixados++;
          }

          const btnMenos = item.trRaiz.querySelector('img[src*="iMinus.gif"]');
          if (btnMenos) btnMenos.click();
      }

      avisoToolbar(`✅ Pronto! ${baixados} ofícios foram enviados para download.`);
      if (btn) { 
          btn.textContent = "✅ Concluído!"; 
          setTimeout(() => {
              btn.textContent = "📥 Baixar ofícios selecionados"; 
              btn.style.pointerEvents = "auto";
          }, 3000);
      }
  }

  /* =========================================================
     CENÁRIO 2 - INTERCEPTAR "REALIZAR REMESSA" P/ DISPENSAR MP
     ========================================================= */
  if (!window.__flowDispensaListenerAtivo) {
      window.__flowDispensaListenerAtivo = true;
      window.addEventListener('message', (e) => {
          if (e.data && e.data.type === "FLOW_DISPENSA_OK") {
              if (typeof window.__flowCallback === "function") window.__flowCallback();
          }
      });
  }

  function interceptarRealizarRemessa() {
    if (!cfg.autoDispensarMP) return;

    const links = Array.from(document.querySelectorAll('a'));
    const btnRemessa = links.find(a => (a.textContent || '').toUpperCase().includes('REALIZAR REMESSA'));
    
    if (!btnRemessa || btnRemessa.dataset.flowIntercepted) return;
    btnRemessa.dataset.flowIntercepted = "1"; 

    btnRemessa.addEventListener("click", async (e) => {
        e.preventDefault(); 
        const urlDestino = btnRemessa.href;
        
        const linkPendencias = links.find(a => (a.textContent || '').includes('pendência') && a.href.includes('analisarJuntada'));
        if (!linkPendencias) { window.location.href = urlDestino; return; }

        const spanText = btnRemessa.querySelector('span') || btnRemessa;
        spanText.textContent = "⏳ Dispensando MP Silenciosamente...";
        btnRemessa.style.pointerEvents = "none";
        btnRemessa.style.color = "#ea580c";

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        
        window.__flowCallback = function() {
            clearTimeout(timeoutId);
            setTimeout(() => iframe.remove(), 500);
            window.__flowCallback = null;
            mostrarBalaoSucesso("A DISPENSA DE JUNTADA DO MP FOI REALIZADA COM SUCESSO!");
            setTimeout(() => { window.location.href = urlDestino; }, 300);
        };

        iframe.src = linkPendencias.href + "#autoDispensaMP";
        document.body.appendChild(iframe);

        const timeoutId = setTimeout(() => {
            if (window.__flowCallback) {
                iframe.remove();
                window.__flowCallback = null;
                window.location.href = urlDestino;
            }
        }, 12000);
    });
  }

  function executarAutoDispensaMP() {
      if (sessionStorage.getItem("flowDispensaMPExecutando") === "1") {
          sessionStorage.removeItem("flowDispensaMPExecutando");
          window.parent.postMessage({ type: "FLOW_DISPENSA_OK" }, "*");
          return;
      }

      setTimeout(() => {
          const linhas = Array.from(document.querySelectorAll("tr"));
          let cbAchou = null;

          for (const tr of linhas) {
              const textoTr = (tr.textContent || "").toUpperCase();
              if (textoTr.includes("JUNTADA DE MANIFESTAÇÃO") && textoTr.includes("MINISTÉRIO PÚBLICO")) {
                  const cb = tr.querySelector('input[type="checkbox"]');
                  if (cb) { cbAchou = cb; break; }
              }
          }

          if (cbAchou) {
              cbAchou.click();
              cbAchou.checked = true;
              cbAchou.dispatchEvent(new Event('change', { bubbles: true }));

              sessionStorage.setItem("flowDispensaMPExecutando", "1");

              setTimeout(() => {
                  chrome.runtime.sendMessage({ tipo: "burlarConfirmStruts" });
              }, 400);

          } else {
              window.parent.postMessage({ type: "FLOW_DISPENSA_OK" }, "*");
          }
      }, 700);
  }

  function temCabecalhoProcesso(tr) { return norm(tr.textContent).includes("processo") && !RE_PROC.test(tr.textContent); }
  function tabelaListaProcessos(t) {
    let c = 0;
    for (const tr of t.querySelectorAll("tr")) { if (RE_PROC.test(tr.textContent)) { c++; if (c >= 1) return true; } }
    return false;
  }
  function acharTabela() {
    for (const t of document.querySelectorAll("table")) { if ([...t.querySelectorAll("tr")].some(temCabecalhoProcesso) && tabelaListaProcessos(t)) return t; }
    return null;
  }
  function acharCabecalho(tabela) {
    for (const tr of tabela.querySelectorAll("tr")) if (temCabecalhoProcesso(tr)) return tr;
    return null;
  }

  function mapaColunas(headerTr) {
    const cells = [...headerTr.children];
    const mapa = {};
    cells.forEach((c, i) => {
      const n = norm(c.textContent);
      if (mapa.movimento == null && (n.includes("tipo de movimento") || n.includes("tipo de pendencia") || n.includes("tipo de conclusão"))) mapa.movimento = i;
      if (mapa.juntadoPor == null && n.includes("juntado por")) mapa.juntadoPor = i;
      if (mapa.processo == null && n.includes("processo")) mapa.processo = i;
      if (mapa.agrupador == null && n.includes("agrupador")) mapa.agrupador = i;
    });
    return mapa;
  }

  function linhasDados(tabela, headerTr) {
    const todas = [...tabela.querySelectorAll("tr")];
    const ini = todas.indexOf(headerTr);
    return todas.slice(ini + 1).filter((tr) => RE_PROC.test(tr.textContent));
  }
  function celula(tr, idx) { return (idx == null || !tr.children[idx]) ? "" : tr.children[idx].textContent.replace(/\s+/g, " ").trim(); }

  function classificar(movimento, quem) {
    const m = norm(movimento); const q = norm(quem);
    if (/recaptura/.test(m)) return "\u26A0 Recaptura \u2014 providencia urgente";
    if (/contramandado/.test(m)) return "\u26A0 Contramandado \u2014 providencia urgente";
    if (/alvara/.test(m)) return "\u26A0 Alvara de soltura \u2014 cumprir";
    if (/progress/.test(m)) return "\u26A0 Progressao \u2014 decisao p/ cumprir";
    if (/livramento condicional/.test(m)) return "\u26A0 Livramento condicional \u2014 decisao p/ cumprir";
    if (/procuracao/.test(m)) return "Procuracao \u2014 habilitar/vincular advogado";
    if (/substabelec/.test(m)) return "Substabelecimento \u2014 atualizar representacao";
    if (/manifesta/.test(m)) return "Manifestacao \u2014 analisar / concluso";
    if (/oficio/.test(m)) return "Oficio \u2014 conferir resposta";
    if (/peticao/.test(m)) return q.includes("advogado") ? "Peticao da defesa \u2014 analisar" : "Peticao \u2014 analisar";
    return movimento ? movimento.slice(0, 60) : "\u2014";
  }

  function ehFilaJuntadas(headerTr) { return norm(headerTr.textContent).includes("juntado por"); }
  function ehFilaMinutas(headerTr, mapa) { return mapa.processo != null && mapa.agrupador != null && !ehFilaJuntadas(headerTr); }
  
  async function lerMinutasParaAgrupadores(tabela, headerTr, mapa) {
    if (!cfg.agrupadores) return;
    const badgeEl = document.getElementById("sf-agr-badge");
    if (badgeEl) { badgeEl.className = "sf-badge-coletando"; badgeEl.innerHTML = "🟢 Coletando..."; }
    let salvosAgora = 0;
    for (const tr of linhasDados(tabela, headerTr)) {
        let numProc = (tr.textContent.match(RE_PROC) || [""])[0];
        let txtAgr = celula(tr, mapa.agrupador);
        if (numProc && txtAgr && txtAgr.length > 2 && txtAgr !== "—") {
            memoriaAgrupadores[numProc] = txtAgr;
            salvosAgora++;
        }
    }
    if (salvosAgora > 0) {
        await chrome.storage.local.set({ seeu_agrupadores: memoriaAgrupadores });
        const qtdEl = document.getElementById("sf-agr-qtd");
        if (qtdEl) qtdEl.textContent = Object.keys(memoriaAgrupadores).length;
    }
    if (badgeEl) setTimeout(() => { badgeEl.className = "sf-badge-sucesso"; badgeEl.innerHTML = "✅ Ok. Coletado com sucesso"; }, 300);
  }

  /* =========================================================
     PERFURADOR DE SHADOW DOM (BUSCA MINUTAS) COM DECODER ISO
     ========================================================= */
  async function buscarAgrupadoresEmBackground() {
      const badge = document.getElementById("sf-agr-badge");
      if (badge) { badge.className = "sf-badge-coletando"; badge.innerHTML = "🟢 Buscando Minutas (100/pág)..."; }

      try {
          let urlsAlvo = [];
          function buscarEmShadowDOM(node) {
              if (!node) return;
              const elementos = node.querySelectorAll('*');
              for (let el of elementos) {
                  if (el.shadowRoot) buscarEmShadowDOM(el.shadowRoot);
                  
                  if (el.tagName && el.tagName.toLowerCase() === 'seeu-menu-item') {
                      const txt = (el.getAttribute('text') || '').toLowerCase();
                      if (txt.includes('despacho') || txt.includes('decis')) {
                          const href = el.getAttribute('href');
                          if (href && !urlsAlvo.includes(href)) urlsAlvo.push(href);
                      }
                  }
              }
          }
          
          buscarEmShadowDOM(document);

          if (urlsAlvo.length === 0) {
              urlsAlvo = [
                  "/seeu/processo/conclusaoJuiz.do?actionType=listar&tipoConclusao=DESPACHO",
                  "/seeu/processo/conclusaoJuiz.do?actionType=listar&tipoConclusao=DECISAO"
              ];
          }

          let salvos = 0;
          const decoder = new TextDecoder("iso-8859-1"); 

          for (const url of urlsAlvo) {
              
              const respGet = await fetch(url, { credentials: "include" });
              const bufGet = await respGet.arrayBuffer();
              const htmlGet = decoder.decode(bufGet);
              
              const docGet = new DOMParser().parseFromString(htmlGet, "text/html");
              
              const form = docGet.querySelector('form[name="processoConclusaoForm"]');
              let htmlFinal = htmlGet;
              let docFinal = docGet;

              if (form) {
                  const formData = new URLSearchParams();
                  const inputs = form.querySelectorAll('input, select, textarea');
                  
                  for (const inp of inputs) {
                      if (inp.name) {
                          if (inp.type === 'radio' || inp.type === 'checkbox') {
                              if (inp.checked) formData.append(inp.name, inp.value);
                          } else {
                              formData.append(inp.name, inp.value);
                          }
                      }
                  }
                  
                  formData.set('conclusaoPageSize', '100');
                  formData.set('conclusaoPageSizeOptions', '100');
                  
                  const actionUrl = form.getAttribute('action') || url;
                  
                  const respPost = await fetch(actionUrl, {
                      method: 'POST',
                      body: formData,
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      credentials: 'include'
                  });
                  
                  const bufPost = await respPost.arrayBuffer();
                  htmlFinal = decoder.decode(bufPost);
                  docFinal = new DOMParser().parseFromString(htmlFinal, "text/html");
              }

              const linhas = docFinal.querySelectorAll('tr');
              let idxProc = -1;
              let idxAgr = -1;

              for(const tr of linhas) {
                  const textoTr = norm(tr.textContent);
                  if(textoTr.includes("processo") && textoTr.includes("agrupador")) {
                      const ths = Array.from(tr.children);
                      ths.forEach((th, i) => {
                          const txtTh = norm(th.textContent);
                          if (txtTh.includes("processo")) idxProc = i;
                          if (txtTh.includes("agrupador")) idxAgr = i;
                      });
                      break; 
                  }
              }

              if (idxProc !== -1 && idxAgr !== -1) {
                  for (const tr of linhas) {
                      if (tr.children.length > Math.max(idxProc, idxAgr)) {
                          const tdProc = tr.children[idxProc].textContent;
                          const numProc = (tdProc.match(RE_PROC) || [""])[0];
                          if (numProc) {
                              const txtAgr = tr.children[idxAgr].textContent.replace(/\s+/g, " ").trim();
                              if (txtAgr && txtAgr.length > 1 && txtAgr !== "—" && txtAgr !== "-") {
                                  memoriaAgrupadores[numProc] = txtAgr;
                                  salvos++;
                              }
                          }
                      }
                  }
              }
          } 
          
          if (salvos > 0) {
              await chrome.storage.local.set({ seeu_agrupadores: memoriaAgrupadores });
          }

          if (badge) { badge.className = "sf-badge-sucesso"; badge.innerHTML = `✅ ${salvos} memórias salvas`; }
          
          document.querySelectorAll('.td-agrupador').forEach(td => {
              const tr = td.closest('tr');
              const num = (tr.textContent.match(RE_PROC) || [""])[0];
              if (memoriaAgrupadores[num]) {
                  td.innerHTML = `<span class="agr-tag">${memoriaAgrupadores[num]}</span>`;
                  tr.dataset.agrupador = memoriaAgrupadores[num];
              } else if (Object.keys(memoriaAgrupadores).length > 0) {
                  td.innerHTML = `<span class="agr-vazio">—</span>`;
              }
          });
          
          const qtdEl = document.getElementById("sf-agr-qtd");
          if (qtdEl) qtdEl.textContent = Object.keys(memoriaAgrupadores).length;
          atualizarFiltroAgrupadorSelect();

      } catch(e) {
          if (badge) { badge.className = "sf-badge-coletando"; badge.style.background = "#dc2626"; badge.innerHTML = "❌ Erro no sync"; }
          console.error("[SEEU Flow] Erro no Background Fetch dos Agrupadores:", e);
      }
  }

  function injetarColunas(tabela, headerTr, mapa, comResumo) {
    if (comResumo && !headerTr.querySelector(".seeu-flow-col")) {
      const th = document.createElement("th"); th.className = "seeu-flow-col"; th.textContent = "Resumo / Encaminhar"; headerTr.appendChild(th);
    }
    if (comResumo && !headerTr.querySelector(".seeu-flow-defesa-h")) {
      const th = document.createElement("th"); th.className = "seeu-flow-col seeu-flow-defesa-h"; th.textContent = "Defesa"; headerTr.appendChild(th);
    }
    if (cfg.agrupadores && !headerTr.querySelector(".agr-col-header")) {
      const th = document.createElement("th"); th.className = "seeu-flow-col agr-col-header"; th.textContent = "Agrupador (Memória)"; headerTr.appendChild(th);
    }
    if (cfg.obs && !headerTr.querySelector(".seeu-flow-obs-h")) {
      const th = document.createElement("th"); th.className = "seeu-flow-col seeu-flow-obs-h"; th.textContent = "Observação"; headerTr.appendChild(th);
    }

    const totalMemoria = Object.keys(memoriaAgrupadores).length;

    for (const tr of linhasDados(tabela, headerTr)) {
      if (tr.dataset.seeuFlowRow) continue;
      const numero = (tr.textContent.match(RE_PROC) || [""])[0];
      const quem = mapa.juntadoPor != null ? celula(tr, mapa.juntadoPor) : "";
      
      const quemNorm = norm(quem);
      if (quemNorm.includes("advogad") || quemNorm.includes("oab")) tr.dataset.juntadoPorAdv = "1";

      const mov = mapa.movimento != null ? celula(tr, mapa.movimento) : tr.textContent;

      if (comResumo) {
        const td = document.createElement("td"); td.className = "seeu-flow-col seeu-flow-resumo"; td.textContent = classificar(mov, quem); tr.appendChild(td);
        
        const tdD = document.createElement("td"); tdD.className = "seeu-flow-col seeu-flow-defesa"; 
        let defesaImediata = cacheDefesaGlobal["defesa:" + numero];
        if (!defesaImediata) {
            if (quemNorm.includes("defensor")) defesaImediata = "Defensoria";
            else if (quemNorm.includes("advogad") || quemNorm.includes("oab")) defesaImediata = "Advogado";
        }
        if (defesaImediata) {
            aplicarDefesa(tdD, defesaImediata, tr);
            tr.dataset.seeuDefesa = "1"; 
            if (!cacheDefesaGlobal["defesa:" + numero]) chrome.storage.local.set({ ["defesa:" + numero]: defesaImediata });
        } else {
            aplicarDefesa(tdD, "Aguardando...", tr);
        }
        tr.appendChild(tdD);
      }
      
      if (cfg.agrupadores) {
        const tdNovo = document.createElement("td");
        tdNovo.className = "seeu-flow-col td-agrupador"; 
        tdNovo.style.textAlign = "center";
        let txtTag = "";
        if (totalMemoria === 0) {
            tdNovo.innerHTML = `<span class="agr-alerta-vazio">Memória vazia<br>Buscando...</span>`;
        } else if (!memoriaAgrupadores[numero]) {
            tdNovo.innerHTML = `<span class="agr-vazio">—</span>`;
        } else {
            txtTag = memoriaAgrupadores[numero];
            tdNovo.innerHTML = `<span class="agr-tag">${txtTag}</span>`;
        }
        tr.dataset.agrupador = txtTag;
        tr.appendChild(tdNovo);
      }

      if (cfg.obs) {
        const tdObs = document.createElement("td"); 
        tdObs.className = "seeu-flow-col seeu-flow-obs";
        tr.appendChild(tdObs); 
        // Agora passamos também o movimento e o "quem" para criar uma chave única
        preencherObs(tdObs, numero, mov, quem);
      }

      tr.dataset.seeuFlowRow = "1";
    }
  }
  
  function aplicarDefesa(td, valor, tr) {
    let isProcuracao = (tr && tr.dataset.juntadoPorAdv === "1" && valor === "Defensoria");
    if (valor === "Advogados" || valor === "Outros") valor = "Advogado";
    if (isProcuracao) td.textContent = "Procuração?";
    else td.textContent = valor || (valor === "Aguardando..." ? "Aguardando..." : "\u2014");
    
    td.classList.remove("sf-def-dp", "sf-def-adv", "sf-def-mp", "sf-def-up");
    td.style.color = ""; td.style.fontWeight = ""; td.style.backgroundColor = "";
    if (isProcuracao) { td.style.color = "#d9534f"; td.style.fontWeight = "bold"; td.style.backgroundColor = "#fff3cd"; } 
    else if (valor === "Defensoria") { td.style.color = "#000000"; td.style.fontWeight = "bold"; td.style.backgroundColor = "#e2d9f3"; } 
    else if (valor === "Advogado") { td.style.color = "#000000"; td.style.fontWeight = "bold"; td.style.backgroundColor = "#d4edda"; }
    aplicarTodosFiltros();
  }

  function extrairDefesaDaCapa(html) {
    const regex = /Advogados\/Defensoria:.*?<\/label>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
    const match = html.match(regex);
    if (match && match[1]) {
        const textoDefesa = match[1].replace(/<[^>]+>/g, "").replace(/"/g, "").trim();
        if (textoDefesa.length > 2 && textoDefesa !== "—") {
            if (/defensoria/i.test(textoDefesa)) return "Defensoria";
            return "Advogado";
        }
    }
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
        return { seguirFrame: iframeMatch[1].replace(/&amp;/g, '&') };
    }
    return "Advogado"; 
  }

  /* =========================================================
     BUSCA DE DEFESAS ACELERADA (MAX_CONCURRENT = 35)
     ========================================================= */
  let defesaRodando = false;
  async function buscarDefesaCapa(auto) {
    const tabela = acharTabela(); if (!tabela) return;
    const headerTr = acharCabecalho(tabela); if (!headerTr || !ehFilaJuntadas(headerTr)) return;
    if (defesaRodando) return; defesaRodando = true;

    const linhasPendentes = [];
    for (const tr of linhasDados(tabela, headerTr)) {
        if (!tr.dataset.seeuDefesa) {
            const num = (tr.textContent.match(RE_PROC) || [""])[0];
            const a = [...tr.querySelectorAll("a")].find(x => RE_PROC.test(x.textContent) && x.href && !x.href.endsWith("#"));
            if (num && a) linhasPendentes.push({ tr, num, url: a.href });
            else tr.dataset.seeuDefesa = "1"; 
        }
    }

    if (linhasPendentes.length === 0) { 
        defesaRodando = false; 
        atualizarBotaoFiltroDef(); 
        return; 
    }

    let restam = linhasPendentes.length;
    atualizarBotaoFiltroDef(`<span style="font-size:11px">⚡ Lendo Capas: ${restam}</span>`);

    const MAX_CONCURRENT = 35; 
    let indiceAtual = 0;
    let cacheUpdateBatch = {};
    let processadosBatch = 0;

    async function processarProxima() {
        if (indiceAtual >= linhasPendentes.length) return;
        const item = linhasPendentes[indiceAtual++];
        const cell = item.tr.querySelector(".seeu-flow-defesa");
        const chave = "defesa:" + item.num;
        let val = "";
        try {
            await new Promise(r => setTimeout(r, 5 + Math.random() * 10));
            const resp = await fetch(item.url, { signal: AbortSignal.timeout(10000) });
            const buf = await resp.arrayBuffer();
            let html = new TextDecoder("iso-8859-1").decode(buf);
            val = extrairDefesaDaCapa(html);
            
            if (val && val.seguirFrame) {
                const fsrc = new URL(val.seguirFrame, item.url).href;
                const r2 = await fetch(fsrc, { signal: AbortSignal.timeout(10000) });
                const buf2 = await r2.arrayBuffer();
                val = extrairDefesaDaCapa(new TextDecoder("iso-8859-1").decode(buf2));
            }
        } catch (e) {
            logError(`Buscar Defesa: ${item.num}`, e);
        }
        item.tr.dataset.seeuDefesa = "1";
        if (typeof val === "string" && val) {
            cacheUpdateBatch[chave] = val; 
            if (cell) aplicarDefesa(cell, val, item.tr);
        }
        restam--;
        processadosBatch++;
        if (restam % 3 === 0 || restam === 0) atualizarBotaoFiltroDef(`<span style="font-size:11px">⚡ Lendo Capas: ${restam}</span>`);
        if (processadosBatch >= 40 || restam === 0) {
            if (Object.keys(cacheUpdateBatch).length > 0) {
                await chrome.storage.local.set(cacheUpdateBatch);
                cacheUpdateBatch = {}; 
                processadosBatch = 0;
            }
        }
        await processarProxima();
    }

    const workers = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT, linhasPendentes.length); i++) workers.push(processarProxima());
    await Promise.all(workers);
    defesaRodando = false; 
    atualizarBotaoFiltroDef();
  }

  // ATUALIZADO: Recebe movimento e quem para criar chave única
  async function preencherObs(td, numero, mov, quem) {
    const ta = document.createElement("textarea"); 
    ta.className = "sf-obs-input"; 
    ta.placeholder = "observação\u2026";
    ta.addEventListener("click", (e) => e.stopPropagation());
    
    const movLimpo = norm(mov).substring(0, 30);
    const quemLimpo = norm(quem).substring(0, 20);
    const chave = `obs:${numero}|${movLimpo}|${quemLimpo}`;

    try { 
        const v = (await chrome.storage.local.get(chave))[chave]; 
        if (v) ta.value = v; 
    } catch (e) {}
    
    let t;
    ta.addEventListener("input", () => {
      clearTimeout(t); td.classList.add("sf-salvando");
      t = setTimeout(async () => { await chrome.storage.local.set({ [chave]: ta.value }); td.classList.remove("sf-salvando"); }, 400);
    });
    
    td.appendChild(ta);
  }

  function aplicarTodosFiltros() {
    const tabela = acharTabela(); if (!tabela) return;
    const headerTr = acharCabecalho(tabela); if (!headerTr) return;
    if(!ehFilaJuntadas(headerTr)) return; 

    const linhas = linhasDados(tabela, headerTr);
    linhas.forEach(tr => {
      let mostrar = true;
      if (modoFiltroDefesa !== 0) {
        const tdDefesa = tr.querySelector(".seeu-flow-defesa");
        if (tdDefesa) {
          const txt = tdDefesa.textContent;
          if (txt.includes("Aguardando")) mostrar = false;
          else if (modoFiltroDefesa === 1 && (!txt.includes("Defensoria") || txt.includes("Procuração?"))) mostrar = false;
          else if (modoFiltroDefesa === 2 && !txt.includes("Procuração?")) mostrar = false;
          else if (modoFiltroDefesa === 3 && (!txt.includes("Advogado") || txt.includes("Procuração?"))) mostrar = false;
        }
      }
      if (cfg.agrupadores && mostrar && filtroAgrupadorAtual !== "todos") {
        const txtAgr = tr.dataset.agrupador || "";
        const tem = txtAgr !== "";
        if (filtroAgrupadorAtual === "com" && !tem) mostrar = false;
        else if (filtroAgrupadorAtual === "sem" && tem) mostrar = false;
        else if (filtroAgrupadorAtual.startsWith("especifico|")) {
           const alvo = filtroAgrupadorAtual.replace("especifico|", "");
           if (!tem || txtAgr !== alvo) mostrar = false;
        }
      }
      tr.style.display = mostrar ? '' : 'none';
    });
  }

  function atualizarBotaoFiltroDef(htmlOpcional) {
    const btn = document.getElementById("btn-filtro-def"); if (!btn) return;
    if (htmlOpcional) { btn.innerHTML = htmlOpcional; return; }
    const labels = ["Filtro Defesa: OFF", "Filtro Defesa: Defensoria", "Filtro Defesa: Procuração?", "Filtro Defesa: Advogado"];
    const bgColors = ["", "#e2d9f3", "#fff3cd", "#d4edda"];
    const textColors = ["", "#000000", "#d9534f", "#000000"];
    btn.textContent = labels[modoFiltroDefesa]; btn.style.background = bgColors[modoFiltroDefesa];
    btn.style.color = textColors[modoFiltroDefesa]; btn.style.fontWeight = modoFiltroDefesa !== 0 ? "bold" : "";
  }
  
  function atualizarFiltroAgrupadorSelect() {
    const select = document.getElementById("seeu-agr-select"); if(!select) return;
    const optGroup = document.getElementById("seeu-agr-select-grupo"); if(!optGroup) return;
    const tabela = acharTabela(); if (!tabela) return;
    const headerTr = acharCabecalho(tabela); if (!headerTr) return;
    const encontrados = new Set();
    linhasDados(tabela, headerTr).forEach(tr => { if(tr.dataset.agrupador) encontrados.add(tr.dataset.agrupador); });
    optGroup.innerHTML = "";
    Array.from(encontrados).sort().forEach(nome => {
        const opt = document.createElement("option"); opt.value = "especifico|" + nome; opt.textContent = nome;
        optGroup.appendChild(opt);
    });
    if (Array.from(select.options).some(o => o.value === filtroAgrupadorAtual)) select.value = filtroAgrupadorAtual;
    else { filtroAgrupadorAtual = "todos"; select.value = "todos"; }
  }

  function injetarToolbarFila(isJuntadas, isMinutas) {
    if (document.getElementById("seeu-flow-fila")) {
        if(isJuntadas && cfg.agrupadores) atualizarFiltroAgrupadorSelect();
        if(isMinutas && cfg.agrupadores) {
            const b = document.getElementById("sf-agr-badge");
            if (b) { b.className = "sf-badge-coletando"; b.innerHTML = "🟢 Coletando..."; }
        }
        return;
    }
    const tb = document.createElement("div"); tb.id = "seeu-flow-fila";
    const cab = document.createElement("div"); cab.className = "sf-fila-cab";
    const tit = document.createElement("strong"); tit.textContent = "⚙ SEEU Ultra Flow";
    const min = document.createElement("span"); min.className = "sf-fila-min"; min.textContent = "\u2013";
    cab.append(tit, min); tb.appendChild(cab);
    const corpo = document.createElement("div"); corpo.className = "sf-fila-corpo";
    
    if (isJuntadas) {
        const btnRow = document.createElement("div"); btnRow.className = "sf-fila-row-btns";
        
        btnRow.appendChild(botao("Expandir Todos", () => { 
            const btnExpandir = [...document.querySelectorAll("a, button")].find(e => (e.textContent||'').toLowerCase().includes("expandir todos"));
            if(btnExpandir) {
                if (btnExpandir.tagName === 'A' && (btnExpandir.getAttribute('href') || '').toLowerCase().startsWith('javascript:')) {
                    btnExpandir.removeAttribute('href'); 
                }
                btnExpandir.click();
            }
        }));
        
        btnRow.appendChild(botao("Reler PDFs", () => { document.querySelectorAll("tr[data-seeu-pdf-done]").forEach(t => t.removeAttribute("data-seeu-pdf-done")); lidosNaPagina = 0; rodar(); }));
        
        const btnFiltroDef = botao("Filtro Defesa: OFF", () => {
            modoFiltroDefesa = (modoFiltroDefesa + 1) % 4; atualizarBotaoFiltroDef();
            if (modoFiltroDefesa !== 0) buscarDefesaCapa(true);
            aplicarTodosFiltros();
        });
        btnFiltroDef.id = "btn-filtro-def"; 
        btnRow.appendChild(btnFiltroDef);
        
        if (cfg.btnLocalizadores) {
          const btnLoc = botao("📍 Localizadores", () => {
              try { window.top.postMessage({ type: 'SEEU_LOC34_OPEN' }, '*'); } catch (e) { logError('Mensagem PostMessage Localizadores', e); }
          });
          btnLoc.style.background = "#2563eb"; btnLoc.style.borderColor = "#1d4ed8"; btnLoc.style.fontWeight = "bold";
          btnRow.appendChild(btnLoc);
        }

        if (cfg.autoOficio) {
            const btnOficios = botao("📥 Baixar ofícios selecionados", baixarOficiosEmLote);
            btnOficios.id = "btn-baixar-oficios";
            btnOficios.style.background = "#059669"; 
            btnOficios.style.borderColor = "#047857";
            btnOficios.style.fontWeight = "bold";
            btnRow.appendChild(btnOficios);
        }

        corpo.appendChild(btnRow);
    }
    if (cfg.agrupadores) {
        const agrBox = document.createElement("div");
        if(isJuntadas) { agrBox.style.marginTop = "6px"; agrBox.style.borderTop = "1px solid #334155"; agrBox.style.paddingTop = "6px"; }
        const info = document.createElement("div"); info.className = "sf-agr-info";
        let badgeHTML = isMinutas ? `<span id="sf-agr-badge" class="sf-badge-coletando">🟢 Coletando...</span>` : `<span id="sf-agr-badge"></span>`;
        info.innerHTML = `<span>📦 Memória: <b id="sf-agr-qtd">${Object.keys(memoriaAgrupadores).length}</b> procs.</span> ${badgeHTML}`;
        agrBox.appendChild(info);
        if (isJuntadas) {
            const sel = document.createElement("select"); sel.id = "seeu-agr-select";
            sel.innerHTML = `<option value="todos">Mostrar Todas Juntadas</option><option value="com">Somente COM Agrupador</option><option value="sem">Somente SEM Agrupador</option><optgroup label="Agrupadores encontrados:" id="seeu-agr-select-grupo"></optgroup></select>`;
            sel.addEventListener("change", (e) => { filtroAgrupadorAtual = e.target.value; aplicarTodosFiltros(); });
            agrBox.appendChild(sel);
            
            const btnSync = botao("🔄 Sincronizar Agora", buscarAgrupadoresEmBackground);
            btnSync.style.background = "#0284c7";
            agrBox.appendChild(btnSync);
        }
        const limpa = botao("🗑️ Limpar", async () => {
            await chrome.storage.local.remove("seeu_agrupadores"); memoriaAgrupadores = {};
            document.getElementById("sf-agr-qtd").textContent = "0";
            if (isJuntadas) {
                document.querySelectorAll(".agr-tag, .agr-vazio").forEach(el => { el.className = "agr-alerta-vazio"; el.innerHTML = "Memória vazia"; });
                filtroAgrupadorAtual = "todos"; const sel = document.getElementById("seeu-agr-select"); if (sel) sel.value = "todos"; 
                aplicarTodosFiltros();
            }
            alert("Memória de Agrupadores limpa!");
        });
        agrBox.appendChild(limpa); corpo.appendChild(agrBox);
    }
    
    tb.style.visibility = "hidden"; 
    tb.appendChild(corpo); 
    document.documentElement.appendChild(tb);

    chrome.storage.local.get(["tbFilaPos", "tbFilaMin"]).then(estado => {
        if (estado.tbFilaPos && estado.tbFilaPos.left && estado.tbFilaPos.top) {
            let l = parseInt(estado.tbFilaPos.left);
            let t = parseInt(estado.tbFilaPos.top);
            if (!isNaN(l) && !isNaN(t)) {
                l = Math.max(0, Math.min(l, window.innerWidth - 60));
                t = Math.max(0, Math.min(t, window.innerHeight - 30));
                tb.style.left = l + "px";
                tb.style.top = t + "px";
                tb.style.right = "auto";
                tb.style.bottom = "auto";
            }
        }
        if (estado.tbFilaMin) {
            corpo.style.display = "none";
            min.textContent = "+";
        }
        tb.style.visibility = "visible";
    });

    min.addEventListener("click", () => { 
        const isMin = corpo.style.display !== "none"; 
        corpo.style.display = isMin ? "none" : ""; 
        min.textContent = isMin ? "+" : "\u2013"; 
        chrome.storage.local.set({ tbFilaMin: isMin });
    });

    let ax=0, ay=0, ox=0, oy=0, dragging=false; cab.style.cursor = "move";
    cab.addEventListener("mousedown", (e) => { dragging=true; ox=tb.offsetLeft; oy=tb.offsetTop; ax=e.clientX; ay=e.clientY; e.preventDefault(); });
    document.addEventListener("mousemove", (e) => {
        if(!dragging) return;
        tb.style.left = Math.max(0, Math.min(ox + (e.clientX - ax), window.innerWidth - 60)) + "px";
        tb.style.top = Math.max(0, Math.min(oy + (e.clientY - ay), window.innerHeight - 30)) + "px";
        tb.style.right = "auto"; tb.style.bottom = "auto";
    });
    
    document.addEventListener("mouseup", () => { 
        if (dragging) {
            dragging = false; 
            chrome.storage.local.set({ tbFilaPos: { left: tb.style.left, top: tb.style.top } });
        }
    });
  }

  function botao(label, onClick) {
    const b = document.createElement("button"); b.textContent = label; b.className = "sf-btn"; b.addEventListener("click", onClick); return b;
  }

  const filaPdf = []; let lendoPdf = false; let lidosNaPagina = 0; const LIMITE_PDF = 30;

  function ehLinkPdf(a) { return /\.pdf(\?|$)/i.test(a.href || "") || /\.pdf$/i.test((a.textContent || "").trim()); }
  function acharLinkDocLinha(tr) {
    let el = tr;
    for (let i = 0; i < 3 && el; i++) {
      for (const a of el.querySelectorAll("a[href]")) if (ehLinkPdf(a)) return a.href;
      const p = el.nextElementSibling; if (p && !RE_PROC.test(p.textContent)) el = p; else break;
    }
    return null;
  }
  function processarPdfsPendentes(tabela, headerTr) {
    if (!cfg.lerPdf) return;
    for (const tr of linhasDados(tabela, headerTr)) {
      if (tr.dataset.seeuPdfDone) continue;
      const td = [...tr.children].reverse().find(c => c.classList && c.classList.contains("seeu-flow-resumo"));
      if (td) { filaPdf.push({ tr, td }); tr.dataset.seeuPdfDone = "1"; }
    }
    if(!lendoPdf) processarFilaPdf();
  }
  async function processarFilaPdf() {
    lendoPdf = true;
    while (filaPdf.length) {
      const { tr, td } = filaPdf.shift();
      try { await lerEReclassificar(tr, td); } catch (e) { logError(`Processar Fila PDF`, e); }
      await new Promise(r => setTimeout(r, 100 + Math.random() * 150)); 
    }
    lendoPdf = false;
  }
  
  async function lerEReclassificar(tr, td) {
    const url = acharLinkDocLinha(tr); if (!url) return;
    const chave = "pdfcls:" + url;
    const cache = (await chrome.storage.local.get(chave))[chave];
    if (cache) { 
        td.classList.add("seeu-flow-pdf"); td.innerHTML = `<div class="sf-cat">${cache.r}</div><div class="sf-teor">${cache.s}</div>`;
        if (cache.d) { const c = tr.querySelector(".seeu-flow-defesa"); if (c && !c.textContent.includes("Procuração?")) aplicarDefesa(c, cache.d, tr); }
        await chrome.storage.local.set({ [chave]: { ...cache, ts: Date.now() } });
        return; 
    }
    if (lidosNaPagina >= LIMITE_PDF) return; lidosNaPagina++;
    const orig = td.textContent; td.textContent = orig + " \u2022 lendo...";
    let texto = "";
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const buf = await resp.arrayBuffer();
      if (!String.fromCharCode(...new Uint8Array(buf.slice(0, 5))).startsWith("%PDF")) { td.textContent = orig; return; }
      if (typeof pdfjsLib !== "undefined") {
         pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.js");
         const doc = await pdfjsLib.getDocument({ data: buf }).promise;
         for (let i = 1; i <= Math.min(5, doc.numPages); i++) texto += " " + (await (await doc.getPage(i)).getTextContent()).items.map(it => it.str).join(" ");
      }
    } catch (e) { logError(`Baixar e Converter PDF: ${url}`, e); td.textContent = orig; return; }
    const limpo = texto.replace(/\s+/g, " ").trim();
    if (!limpo) { td.textContent = orig + " (imagem)"; return; }
    const rotulo = (limpo.match(/alvar[aá]|progress[aã]o|livramento condicional|recaptura|procuracao/i) || [orig])[0];
    const defesa = /defensoria publica|defensor/i.test(limpo) ? "Defensoria" : (/oab|advogad/i.test(limpo) ? "Advogado" : "");
    const resumo = limpo.slice(0, 200) + "...";
    await chrome.storage.local.set({ [chave]: { r: rotulo, s: resumo, d: defesa, ts: Date.now() } });
    td.classList.add("seeu-flow-pdf"); td.innerHTML = `<div class="sf-cat">${rotulo}</div><div class="sf-teor">${resumo}</div>`;
    if (defesa) { const c = tr.querySelector(".seeu-flow-defesa"); if (c && !c.textContent.includes("Procuração?")) aplicarDefesa(c, defesa, tr); }
  }

  function coletarPdfsParaDownload() {
    const urls = [];
    const vistos = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute('href') || "";
      const txt = (a.textContent || "").trim().toLowerCase();
      if (href.includes('/seeu/arquivo.do') || txt.endsWith('.pdf')) {
        const absoluteHref = a.href; 
        if (!vistos.has(absoluteHref)) {
          vistos.add(absoluteHref);
          urls.push(absoluteHref);
        }
      }
    }
    return urls;
  }

  async function baixarProcessoPdfUnico(urls) {
    if (typeof PDFLib === "undefined") { avisoToolbar("\u274C Erro: Biblioteca PDF não encontrada."); return; }
    const matchProc = document.body.innerText.match(RE_PROC);
    const proc = (matchProc ? matchProc[0] : "processo").replace(/[^\w.-]+/g, "_");

    try {
        const merged = await PDFLib.PDFDocument.create();
        let ok = 0;
        for (let i = 0; i < urls.length; i++) {
            avisoToolbar(`\u23F3 Baixando arquivo ${i + 1} de ${urls.length}...`);
            const response = await chrome.runtime.sendMessage({ action: "fetchPdf", url: urls[i] });
            if (response && response.success) {
                try {
                    const uint8Array = Uint8Array.from(atob(response.base64), c => c.charCodeAt(0));
                    const src = await PDFLib.PDFDocument.load(uint8Array, { ignoreEncryption: true });
                    const pages = await merged.copyPages(src, src.getPageIndices());
                    pages.forEach((p) => merged.addPage(p));
                    ok++;
                } catch (e) { console.warn(`Falha ao processar o PDF ${i + 1}:`, e); }
            }
        }
        if (ok === 0) {
          avisoToolbar("\u274C Nenhum arquivo pôde ser convertido.");
          return;
        }
        avisoToolbar(`\u2705 Juntando os arquivos e salvando...`);
        const bytes = await merged.save();
        const blob = new Blob([bytes], { type: "application/pdf" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = proc + "_unificado.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        avisoToolbar(`\u2705 Sucesso! ${ok} arquivo(s) unidos.`);
    } catch (err) {
        avisoToolbar("\u274C Erro interno ao juntar os PDFs.");
        console.error(err);
    }
  }

  async function autoExpandirEBaixar() {
    avisoToolbar("\u26A1 Iniciando automação: procurando botões '+'...");
    const botoesMais = [...document.querySelectorAll('img[src*="iPlus.gif"]')];
    let clicados = 0;
    botoesMais.forEach(btn => {
        if (btn.offsetWidth > 0 || btn.offsetHeight > 0) { 
            const a = btn.closest('a');
            if (a && (a.getAttribute('href') || '').toLowerCase().startsWith('javascript:')) {
                a.removeAttribute('href'); 
            }
            btn.click(); 
            clicados++; 
        }
    });

    if (clicados > 0) {
        avisoToolbar(`\u23F3 Expandindo ${clicados} evento(s)... Aguardando (5s)...`);
        await new Promise(r => setTimeout(r, 5500));
    }
    const urls = coletarPdfsParaDownload();
    if (urls.length > 0) {
        avisoToolbar(`\u23F3 Iniciando junção de ${urls.length} PDF(s)...`);
        await baixarProcessoPdfUnico(urls);
    } else {
        avisoToolbar("\u274C Nenhum PDF encontrado após a expansão.");
    }
  }

  /* =========================================================
     CABEÇALHO CONGELADO (LEITOR NATIVO DE PDF ROBUSTO)
     ========================================================= */
  async function fixarCabecalhoProcesso() {
    if (cfg.congelarPaineis === false) return; 

    const cabecalho = document.getElementById("barraTituloStatusProcessual");
    if (!cabecalho) return;
    
    if (!document.getElementById('sf-sticky-style')) {
        const style = document.createElement('style');
        style.id = 'sf-sticky-style';
        style.innerHTML = `
            .sf-sticky-header {
                position: sticky !important;
                top: 0 !important;
                z-index: 2147483640 !important;
                background-color: #fff3cd !important; 
                padding: 12px 10px !important;
                margin: -10px -10px 15px -10px !important;
                border-bottom: 2px solid #fde047 !important; 
                box-shadow: 0 8px 16px -4px rgba(0,0,0,0.2) !important; 
                border-radius: 0 0 6px 6px;
            }
        `;
        document.head.appendChild(style);
    }

    if (!cabecalho.classList.contains("sf-sticky-header")) {
        cabecalho.classList.add("sf-sticky-header");
    }

    let p = cabecalho.parentElement;
    while (p && p !== document.body) {
        const s = window.getComputedStyle(p);
        if (s.overflow === 'hidden' || s.overflowY === 'hidden') {
            p.style.setProperty('overflow', 'visible', 'important');
        }
        p = p.parentElement;
    }

    if (document.getElementById("sf-info-congelada-container")) return;

    cabecalho.style.display = 'flex';
    cabecalho.style.alignItems = 'center';
    cabecalho.style.justifyContent = 'space-between';

    const textoPagina = document.body.innerText;
    
    const terminoMatch = textoPagina.match(/T[EÉ]RMINO:\s*([\d]{2}\/[\d]{2}\/[\d]{4})/i);
    const progressaoMatch = textoPagina.match(/PROGRESS[AÃ]O:\s*([\d]{2}\/[\d]{2}\/[\d]{4})/i);
    const livramentoMatch = textoPagina.match(/LIVRAMENTO\s*CONDICIONAL:\s*([\d]{2}\/[\d]{2}\/[\d]{4})/i);

    if (!terminoMatch && !progressaoMatch && !livramentoMatch) return;

    const termino = terminoMatch ? terminoMatch[1] : '---';
    const progressao = progressaoMatch ? progressaoMatch[1] : '---';
    const livramento = livramentoMatch ? livramentoMatch[1] : '---';

    const infoContainer = document.createElement('div');
    infoContainer.id = "sf-info-congelada-container";
    infoContainer.style.cssText = "font-size: 13px; font-weight: bold; background: rgba(255,255,255,0.7); padding: 4px 10px; border-radius: 6px; border: 1px dashed #ca8a04; display: flex; gap: 15px; align-items: center;";
    
    infoContainer.innerHTML = `
        <span id="sf-txt-regime-atual" style="display: none;"></span>
        <span style="color: #1d4ed8;">
            Progressão: ${progressao} 
            ${progressao !== '---' ? `<span id="sf-txt-regime" style="font-size: 11px; font-weight: normal; color: #78716c; font-style: italic; margin-left: 4px;">(lendo PDF...)</span>` : ''}
        </span>
        <span style="color: #15803d;">Livramento: ${livramento}</span>
        <span style="color: #b91c1c;">Término: ${termino}</span>
    `;
    cabecalho.appendChild(infoContainer);

    if (progressao === '---') return;

    let idProcesso = null;
    const htmlString = document.documentElement.innerHTML;
    const matches = htmlString.match(/100\d{12}/g);
    if (matches && matches.length > 0) {
        const counts = {};
        let maxId = matches[0];
        let maxCount = 0;
        for (let m of matches) {
            counts[m] = (counts[m] || 0) + 1;
            if (counts[m] > maxCount) { maxCount = counts[m]; maxId = m; }
        }
        idProcesso = maxId;
    }

    const spanRegime = document.getElementById('sf-txt-regime');
    if (!spanRegime) return;

    if (idProcesso) {
        const urlRelatorio = '/seeu/processo/criminal/execucao/processoExecucaoPenal.do?actionType=emitirRelatorioSituacaoProcessualExecutoria&report=relatorioSituacaoProcessualExecutoriaV2&idProcessoExecucaoPenal=' + idProcesso;
        
        try {
            const resp = await fetch(urlRelatorio, { credentials: 'include' });
            const buf = await resp.arrayBuffer();

            const headerBytes = new Uint8Array(buf.slice(0, 5));
            const isPdf = String.fromCharCode(...headerBytes).startsWith("%PDF");

            if (isPdf && typeof pdfjsLib !== "undefined") {
                
                pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.js");
                const doc = await pdfjsLib.getDocument({ data: buf }).promise;
                
                const page = await doc.getPage(1);
                const textContent = await page.getTextContent();
                
                const textoMocado = textContent.items.map(it => it.str).join("").replace(/\s+/g, "").toUpperCase();
                
                const regimeMatch = textoMocado.match(/REGIMEATUAL:?(FECHADO|SEMIABERTO|ABERTO)/);
                const spanRegimeAtual = document.getElementById('sf-txt-regime-atual');
                
                if (regimeMatch) {
                    const regimeAtual = regimeMatch[1]; 
                    
                    if (spanRegimeAtual) {
                        spanRegimeAtual.style.display = 'inline-block';
                        spanRegimeAtual.innerHTML = `<span style="background:#f8fafc; color:#475569; padding:2px 8px; border-radius:4px; border:1px solid #cbd5e1; font-weight:bold; font-size: 12.5px; margin-right: 6px;">Regime atual: ${regimeAtual}</span>`;
                    }

                    if (regimeAtual === "FECHADO") {
                        spanRegime.innerHTML = '<span style="color:#4338ca; background:#e0e7ff; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold;">ao Semiaberto</span>';
                    } else if (regimeAtual === "SEMIABERTO") {
                        spanRegime.innerHTML = '<span style="color:#4338ca; background:#e0e7ff; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold;">ao Aberto</span>';
                    } else {
                        spanRegime.innerHTML = '<span style="color:#78716c; font-style:italic; font-weight:normal; margin-left:4px;">(Já no Aberto)</span>';
                    }
                } else {
                    spanRegime.innerHTML = '<span style="color:#dc2626; font-style:italic; margin-left:4px;">(Ausente no PDF)</span>';
                }

            } else {
                spanRegime.innerHTML = '<span style="color:#dc2626; font-style:italic; margin-left:4px;">(Relatório não é PDF)</span>';
            }

        } catch (err) {
            console.error("[SEEU Flow] Erro ao processar o PDF em background:", err);
            spanRegime.innerHTML = '<span style="color:#dc2626; font-style:italic; margin-left:4px;">(Erro de leitura)</span>';
        }

    } else {
        spanRegime.innerHTML = '<span style="color:#dc2626; font-style:italic; margin-left:4px;">(ID invisível na tela)</span>';
    }
  }

  /* =========================================================
     BOTÃO DE DOWNLOAD MANUAL NA TELA DO PROCESSO
     ========================================================= */
  function injetarBotaoDownloadUnificado() {
      const cabecalho = document.getElementById("barraTituloStatusProcessual");
      if (!cabecalho) return; 
      
      if (document.getElementById("seeu-flow-pdfbtn")) return;

      const btn = document.createElement("button");
      btn.id = "seeu-flow-pdfbtn";
      btn.innerHTML = "📥 Unificar PDFs do Processo";
      btn.title = "Abre todos os '+', coleta os PDFs pendentes e gera um arquivo único.";
      
      btn.style.position = "static";
      btn.style.margin = "0 0 0 15px"; 
      
      btn.onclick = (e) => {
          e.preventDefault();
          btn.innerHTML = "⏳ Processando...";
          btn.style.backgroundColor = "#ca8a04"; 
          btn.style.pointerEvents = "none";
          
          autoExpandirEBaixar().finally(() => {
              setTimeout(() => {
                  btn.innerHTML = "📥 Unificar PDFs do Processo";
                  btn.style.backgroundColor = "#0f172a";
                  btn.style.pointerEvents = "auto";
              }, 3000);
          });
      };

      const infoContainer = document.getElementById("sf-info-congelada-container");
      if (infoContainer) {
          infoContainer.appendChild(btn);
      } else {
          cabecalho.appendChild(btn);
      }
  }

  let pendente = false;
  async function rodar() {
    if (pendente) return; pendente = true;
    setTimeout(async () => {
      pendente = false;
      
      fixarCabecalhoProcesso();
      injetarBotaoDownloadUnificado(); 
      interceptarRealizarRemessa();

      const tabela = acharTabela(); if (!tabela) return;
      const headerTr = acharCabecalho(tabela); if (!headerTr) return;
      const mapa = mapaColunas(headerTr);
      
      const isJuntadas = ehFilaJuntadas(headerTr);
      const isMinutas = ehFilaMinutas(headerTr, mapa);
      
      if (isJuntadas || isMinutas) {
          if (cfg.agrupadores) memoriaAgrupadores = (await chrome.storage.local.get("seeu_agrupadores")).seeu_agrupadores || {};
          injetarToolbarFila(isJuntadas, isMinutas);
      }
      if (isMinutas) {
          await lerMinutasParaAgrupadores(tabela, headerTr, mapa);
      }
      if (isJuntadas) {
          const procVisiveis = linhasDados(tabela, headerTr).map(tr => (tr.textContent.match(RE_PROC) || [""])[0]).filter(Boolean);
          const chavesCache = procVisiveis.map(p => "defesa:" + p);
          cacheDefesaGlobal = await chrome.storage.local.get(chavesCache);

          injetarBotaoJuntarEDispensar(tabela, headerTr);

          injetarColunas(tabela, headerTr, mapa, cfg.coluna);
          if (cfg.lerPdf) processarPdfsPendentes(tabela, headerTr);
          if (cfg.defesaCapa) buscarDefesaCapa(true);
          aplicarTodosFiltros();
          
          if (cfg.agrupadores && Object.keys(memoriaAgrupadores).length === 0) {
              buscarAgrupadoresEmBackground();
          }
      }
      
    }, 250);
  }

  async function iniciar() {
    await carregarConfig();

    if (window.location.hash.includes("autoDispensaMP") || sessionStorage.getItem("flowDispensaMPExecutando") === "1") {
        executarAutoDispensaMP();
        return;
    }
    
    setTimeout(fixarCabecalhoProcesso, 800);
    
    rodar();
    
    const target = document.querySelector(".resultTable")?.closest('div') || document.querySelector("form") || document.body;
    new MutationObserver(rodar).observe(target, { childList: true, subtree: true });
    
    chrome.storage.onChanged.addListener(carregarConfig);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();