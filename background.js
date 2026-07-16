/* =========================================================
   PARTE 1: LÓGICA DO SEEU FLOW (Alertas e Downloads)
   ========================================================= */
const RE_PROC = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const PADRAO_KW = ["progress", "livramento condicional", "recaptura", "alvara", "contramandado"];
const INTERVALO_MIN = 10;

function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
function rotulo(kw) {
  const n = norm(kw);
  if (n.includes("progress")) return "progressao";
  if (n.includes("livramento")) return "livramento";
  if (n.includes("recaptura")) return "recaptura";
  if (n.includes("alvara")) return "alvara";
  if (n.includes("contramandado")) return "contramandado";
  return kw;
}

chrome.runtime.onInstalled.addListener(() => agendar());
chrome.runtime.onStartup.addListener(() => agendar());

function agendar() {
  chrome.alarms.create("seeu-poll", { periodInMinutes: INTERVALO_MIN, delayInMinutes: 0.2 });
  chrome.alarms.create("seeu-gc", { periodInMinutes: 10080 }); 
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "seeu-poll") verificar();
  if (a.name === "seeu-gc") runGarbageCollector();
});

async function verificar() {
  const d = await chrome.storage.local.get(["alertas", "retornoUrls", "keywords", "alertas_itens"]);
  if (d.alertas === false) return;

  const urls = (Array.isArray(d.retornoUrls) ? d.retornoUrls : []).filter(Boolean);
  if (!urls.length) return; 

  const keywords = Array.isArray(d.keywords) && d.keywords.length ? d.keywords : PADRAO_KW;
  const set = new Map((d.alertas_itens || []).map((i) => [i.numero + "|" + i.categoria, i]));
  let novos = 0;

  for (const url of urls) {
    let html = "";
    try {
      const resp = await fetch(url, { credentials: "include" });
      html = await resp.text();
    } catch (e) { 
      console.error("[SEEU Flow] Falha ao verificar URL de alertas:", url, e);
      continue; 
    }
    if (/acesso|login|autentic/i.test(html) && !RE_PROC.test(html)) continue;

    for (const bloco of html.split(/<tr[\s>]/i)) {
      const proc = (bloco.match(RE_PROC) || [])[0];
      if (!proc) continue;
      const texto = norm(bloco.replace(/<[^>]+>/g, " "));
      for (const kw of keywords) {
        if (texto.includes(norm(kw))) {
          const chave = proc + "|" + rotulo(kw);
          if (!set.has(chave)) { set.set(chave, { numero: proc, categoria: rotulo(kw) }); novos++; }
          break;
        }
      }
    }
  }

  const todos = [...set.values()];
  await chrome.storage.local.set({ alertas_itens: todos });
  chrome.action.setBadgeText({ text: todos.length ? String(todos.length) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#b45309" });

  if (novos > 0) {
    const c = {};
    for (const i of todos) c[i.categoria] = (c[i.categoria] || 0) + 1;
    const resumo = Object.entries(c).map(([k, v]) => `${k} (${v})`).join(", ");
    chrome.notifications.create({
      type: "basic", iconUrl: "icons/icon48.png",
      title: "Retorno de Conclusão", message: `${novos} nova(s) decisão(ões). Total: ${resumo}`, priority: 2,
    });
  }
}

function baixarDocs(msg) {
  const proc = (msg.proc || "processo").replace(/[^\w.-]+/g, "_");
  (msg.docs || []).forEach((d, i) => {
    const nome = (d.nome || "doc").replace(/[^\w.-]+/g, "_");
    try {
      chrome.downloads.download({
        url: d.url,
        filename: `SEEU/${proc}/${String(i + 1).padStart(2, "0")}-${nome}.pdf`,
        conflictAction: "uniquify",
      });
    } catch (e) {
      console.error("[SEEU Flow] Erro ao baixar documento:", d.url, e);
    }
  });
}

async function runGarbageCollector() {
    try {
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = [];
        const now = Date.now();
        const trintaDiasMs = 30 * 24 * 60 * 60 * 1000;

        for (const [key, value] of Object.entries(allData)) {
            if (key.startsWith("pdfcls:")) {
                if (!value.ts || (now - value.ts > trintaDiasMs)) {
                    keysToRemove.push(key);
                }
            }
        }

        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
    } catch (e) { console.error("[SEEU Flow] Erro ao rodar GC:", e); }
}

function scanSelectedRowsInFrame(){
  if(!location.hostname.includes('seeu.pje.jus.br')) return {href:location.href,selected:[],totalChecked:0,totalChecks:0};
  const CNJ=/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
  function abs(u){try{return new URL(u,location.href).href}catch(e){return u||''}}
  const selected=[];
  const inputs=[...document.querySelectorAll('input[type="checkbox"]:checked')]
    .filter(cb=>!cb.closest('thead') && (cb.name==='idJuntadas' || cb.closest('table.resultTable') || cb.closest('table')));
  for(const cb of inputs){
    const tr=cb.closest('tr'); if(!tr) continue;
    const text=tr.innerText||''; const html=tr.outerHTML||'';
    const cnj=(text.match(CNJ)||html.match(CNJ)||[''])[0]; if(!cnj) continue;
    const anchors=[...tr.querySelectorAll('a[href]')].map(a=>({text:(a.innerText||'').trim(),href:abs(a.getAttribute('href')||a.href),onclick:a.getAttribute('onclick')||''}));
    const main=anchors.find(a=>a.text===cnj) || anchors.find(a=>/visualizacaoProcesso\.do/i.test(a.href)) || anchors[0];
    selected.push({cnj,link:main?main.href:'',anchors,selectedValue:cb.value||'',rowText:text.slice(0,1200),frameHref:location.href});
  }
  return {href:location.href,title:document.title,selected,totalChecked:document.querySelectorAll('input[type="checkbox"]:checked').length,totalChecks:document.querySelectorAll('input[type="checkbox"]').length};
}

async function runScan(tabId){
  const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:scanSelectedRowsInFrame,world:'MAIN'});
  let rows=[]; const summary=[];
  for(const r of results){const res=r.result||{}; summary.push({frameId:r.frameId,href:res.href,selected:(res.selected||[]).length,totalChecked:res.totalChecked,totalChecks:res.totalChecks}); rows.push(...(res.selected||[]));}
  const map=new Map(); rows.forEach(r=>map.set(r.cnj+'|'+r.link+'|'+r.selectedValue,r));
  return {rows:[...map.values()],summary};
}

/* =========================================================
   PARTE 3: LISTENER GLOBAL DE MENSAGENS 
   ========================================================= */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  
  if (msg.tipo === "notificar") {
    chrome.notifications.create({
      type: "basic", iconUrl: "icons/icon48.png",
      title: msg.titulo || "SEEU Flow", message: msg.corpo || "", priority: 2,
    });
  }
  if (msg.tipo === "badge") {
    chrome.action.setBadgeText({ text: msg.texto || "" });
    chrome.action.setBadgeBackgroundColor({ color: "#b45309" });
  }
  if (msg.tipo === "verificarAgora") verificar();
  if (msg.tipo === "baixarDocs") baixarDocs(msg);
  
  if (msg.tipo === "baixarOficio") {
    try {
      chrome.downloads.download({
        url: msg.url,
        filename: `SEEU_Oficios/${msg.nomeArquivo}`,
        conflictAction: "uniquify",
      });
    } catch (e) {
      console.error("[SEEU Flow] Erro ao baixar Ofício:", e);
    }
  }

  // BYPASS DO STRUTS - AGORA IDENTIFICANDO O FRAME ESPECÍFICO (IFRAME INVISÍVEL)
  if (msg.tipo === "burlarConfirmStruts") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, // Alvo: Iframe Oculto
      world: "MAIN", 
      func: () => {
        try {
          // Esmaga a janela de confirmação nativa no frame e no documento pai
          window.confirm = function() { return true; };
          if (window.parent) window.parent.confirm = function() { return true; };
          if (window.top) window.top.confirm = function() { return true; };
          
          let btn = document.getElementById('dispensarButton');
          if (!btn) {
              const els = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
              for (let el of els) {
                  if ((el.textContent || el.value || '').trim().toUpperCase() === 'DISPENSAR') {
                      btn = el; break;
                  }
              }
          }
          if (btn) btn.click();
        } catch(e) { console.error("[SEEU Flow] Erro no Bypass via Background:", e); }
      }
    });
    return true; 
  }

  if (msg.type === 'SEEU_LOC34_SCAN') {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) { sendResponse({ok: false, error: 'sem tabId'}); return true; }
    runScan(tabId).then(r => sendResponse({ok: true, ...r})).catch(e => sendResponse({ok: false, error: e.message || String(e)}));
    return true; 
  }

  if (msg.action === "fetchPdf") {
    fetchSinglePdf(msg.url).then(sendResponse);
    return true; 
  }
});

async function fetchSinglePdf(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return { success: false, reason: "http_error" };

        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);

        if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.byteLength; i += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            return { success: true, base64: btoa(binary) };
        }
        return { success: false, reason: "not_a_raw_pdf" };
    } catch (e) {
        return { success: false, reason: e.toString() };
    }
}