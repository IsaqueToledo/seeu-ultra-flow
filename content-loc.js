(function(){
'use strict';
if(!location.hostname.includes('seeu.pje.jus.br')) return;
if(window!==window.top) return;

const APP='seeu-loc-v34';

function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();}
function decodeHtml(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}

function toast(msg, cls='', dur=12000){
  let t=document.getElementById(APP+'-toast');
  if(!t){
    t=document.createElement('div');
    t.id=APP+'-toast';
    document.documentElement.appendChild(t);
  }
  t.textContent=msg;
  t.className='show '+cls;
  if(t.timer) clearTimeout(t.timer);
  t.timer=setTimeout(()=>t.classList.remove('show'), dur);
}

async function copy(txt){try{await navigator.clipboard.writeText(txt)}catch(e){console.warn("[Localizadores] Erro clipboard:", e);}}

async function pedirScan(){return await chrome.runtime.sendMessage({type:'SEEU_LOC34_SCAN'});}
async function fetchText(url){ if(!url) return ''; try{const r=await fetch(url,{credentials:'include'}); return await r.text();}catch(e){ console.error("[Localizadores] Falha fetchText", url, e); return '';} }
function extractNumeroProcessoInterno(htmlOrUrl){const s=decodeHtml(htmlOrUrl);const pats=[/name=["']numeroProcesso["'][^>]*value=["'](\d{8,})["']/i,/name=["']id["'][^>]*value=["'](\d{8,})["']/i,/visualizacaoProcesso\.do\?actionType=visualizar&id=(\d{8,})/i,/numeroProcesso=(\d{8,})/i,/numeroProcesso["'=:\s]+(\d{8,})/i,/processo-numero=["'](\d{8,})["']/i];for(const p of pats){const m=s.match(p);if(m)return m[1]}return''}
async function resolveNumero(row){for(const c of [row.link,...(row.anchors||[]).map(a=>a.href),...(row.anchors||[]).map(a=>a.onclick)].filter(Boolean)){const n=extractNumeroProcessoInterno(c);if(n)return n}const urls=[row.link,...(row.anchors||[]).map(a=>a.href)].filter(x=>/^https?:/.test(x)&&x.includes('seeu.pje.jus.br'));for(const url of urls){const html=await fetchText(url);const n=extractNumeroProcessoInterno(html);if(n)return n}return''}

async function buscarLocalizadores(force=false){if(!force&&window.__seeuLoc34Cache&&Date.now()-window.__seeuLoc34CacheAt<300000)return window.__seeuLoc34Cache;const resp=await fetch('/seeu/processo/localizadorProcesso.do?actionType=listarLocalizadoresAjax',{method:'POST',credentials:'include',headers:{accept:'*/*','content-type':'application/x-www-form-urlencoded','x-requested-with':'XMLHttpRequest'},body:''});const buffer=await resp.arrayBuffer();const text=new TextDecoder('iso-8859-1').decode(buffer);let arr=[];try{arr=JSON.parse(text)}catch(e){console.error("[Localizadores] Erro ao parsear JSON Localizadores", e);}const out=[];for(const x of arr){const codigo=String(x.key||x.codLocalizador||x.codigo||x.id||'').trim();const nome=String(x.label||x.description||x.nome||x.text||'').trim();const qtde=x.totalProcesso==null?'':String(x.totalProcesso);const status=String(x.status||'');if(codigo&&nome&&(!status||norm(status)==='ATIVO'))out.push({codigo,nome,qtde})}out.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));window.__seeuLoc34Cache=out;window.__seeuLoc34CacheAt=Date.now();return out}
async function listarDoProcesso(numero){const url='/seeu/processo/localizadorProcesso.do?actionType=listarLocalizadoresDoProcessoAjax&numeroProcesso='+encodeURIComponent(numero);const r=await fetch(url,{method:'POST',credentials:'include',headers:{accept:'*/*','content-type':'application/x-www-form-urlencoded','x-requested-with':'XMLHttpRequest'},body:''});const text=await r.text();let arr=[];try{arr=JSON.parse(text)}catch(e){return{ok:false,status:r.status,text,url,arr:[]}}return{ok:r.ok,status:r.status,text,url,arr}}
function localizadorMatch(item,loc){const k=String(item.key||item.codLocalizador||item.codigo||item.idLocalizador||item.id||'');const label=String(item.label||item.description||item.nome||item.text||'');return k===String(loc.codigo)||norm(label)===norm(loc.nome)||norm(label).includes(norm(loc.nome))}
function extrairCodVinculo(item){const keys=['codProcessoLocalizador','codLocalizadorProcesso','idLocalizadorProcesso','idProcessoLocalizador','codigoProcessoLocalizador','codigoLocalizadorProcesso','codVinculo','idVinculo'];for(const k of keys){if(item[k]!=null&&String(item[k]).trim())return String(item[k]).trim()}return''}

async function post(url){const r=await fetch(url,{method:'POST',credentials:'include',headers:{accept:'*/*','content-type':'application/x-www-form-urlencoded','x-requested-with':'XMLHttpRequest'},body:''});let text='';try{text=await r.text()}catch(e){}return{ok:r.ok,status:r.status,text,url}}
async function associar(loc,row){const numero=await resolveNumero(row);if(!numero)return{ok:false,status:'sem_numeroProcesso',row};const res=await post('/seeu/processo/localizadorProcesso.do?actionType=adicionarAjax&codLocalizador='+encodeURIComponent(loc.codigo)+'&numeroProcesso='+encodeURIComponent(numero));res.numeroProcesso=numero;return res}
async function desassociar(loc,row){const numero=await resolveNumero(row);if(!numero)return{ok:false,status:'sem_numeroProcesso',row};const lista=await listarDoProcesso(numero);if(!lista.ok)return{ok:false,status:'falha_listarLocalizadoresDoProcessoAjax',numeroProcesso:numero,lista,row};const item=(lista.arr||[]).find(x=>localizadorMatch(x,loc));if(!item)return{ok:false,status:'localizador_nao_vinculado_ou_nao_encontrado',numeroProcesso:numero,localizador:loc,lista:lista.arr,row};const cod=extrairCodVinculo(item);if(!cod)return{ok:false,status:'sem_codProcessoLocalizador_no_json',numeroProcesso:numero,item,lista:lista.arr,row};const res=await post('/seeu/processo/localizadorProcesso.do?actionType=removerAjax&codLocalizadorProcesso='+encodeURIComponent(cod));res.codLocalizadorProcesso=cod;res.numeroProcesso=numero;return res}

async function executar(rows,loc,modo){
    let ok=0,fail=0,debug=[];
    toast((modo==='remove'?'Desassociando ':'Associando ')+loc.nome+' em '+rows.length+' processo(s)...');
    for(const row of rows){
        let res;
        try{
            res=modo==='remove'?await desassociar(loc,row):await associar(loc,row)
        }catch(e){
            res={ok:false,status:'exception',message:e.message,row}
        }
        
        if(res.ok) ok++;
        else{fail++;debug.push({cnj:row.cnj,res})}
        
        await new Promise(r=>setTimeout(r, 300 + Math.random() * 400));
    }
    
    const msg=loc.nome+': '+ok+' '+(modo==='remove'?'desassociado(s)':'associado(s)')+', '+fail+' falha(s).';
    toast(msg,ok?'ok':'warn');
    if(debug.length){
        await copy('DEBUG SEEU Localizadores v3.4\n'+msg+'\n'+JSON.stringify(debug,null,2));
        toast(msg+' Debug copiado.','warn')
    }
}

async function openPanel(forceLocs=false){
  let scan;
  try{scan=await pedirScan()}catch(e){toast('Erro ao acionar varredura: '+e.message,'warn');return}
  if(!scan||!scan.ok){toast('Erro na varredura: '+(scan&&scan.error?scan.error:'sem resposta'),'warn');return}
  const rows=scan.rows||[];
  
  if(!rows.length){
    toast('Nenhum processo selecionado.','warn', 2000);
    return;
  }
  
  const locs=await buscarLocalizadores(forceLocs);
  renderPanel(rows,locs,scan.summary);
}

// =========================================================
// FUNÇÃO PARA FORMATAR CAIXA ALTA (ALL CAPS) PARA CAIXA BAIXA
// =========================================================
function formatLocName(str) {
    if (!str) return '';
    // Verifica se a string está totalmente em maiúsculo (não tem letras minúsculas)
    if (!/[a-zà-ú]/.test(str)) {
        // Converte para minúsculo e capitaliza apenas a 1ª letra de cada palavra
        return str.toLowerCase().replace(/(?:^|[\s\-\.\/])\S/g, function(match) { 
            return match.toUpperCase(); 
        });
    }
    // Se a string já tiver letras minúsculas (Ex: "Expedir Mandado..."), não mexe.
    return str;
}

function renderPanel(rows, locs, summary) {
    let p = document.getElementById(APP + '-panel');
    if (p) p.remove();
    
    p = document.createElement('div');
    p.id = APP + '-panel';
    
    p.innerHTML = `
        <div class="slh">
            <div><b>Localizadores em Lote</b><br><small>${rows.length} processo(s) selecionado(s)</small></div>
            <button class="x">×</button>
        </div>
        <div class="mode">
            <label><input name="slmodo34" type="radio" value="add" checked> Associar</label>
            <label><input name="slmodo34" type="radio" value="remove"> Desassociar</label>
        </div>
        <input class="search" placeholder="Filtrar localizador...">
        <div class="list"></div>
        
        <div class="main-action">
            <button class="exec" disabled>✅ Selecione um item na lista...</button>
        </div>
        
        <div class="actions">
            <button class="diag">Copiar diagnóstico</button>
            <button class="refresh">Atualizar lista</button>
            <button class="close">Fechar</button>
        </div>
        <small>Painel arrastável pelo cabeçalho.</small>
    `;
    
    document.documentElement.appendChild(p);
    restorePosition(p, 'v34panel', { left: 20, top: 230 });
    makeDraggable(p, p.querySelector('.slh'), 'v34panel', { allowButtons: false });
    
    const list = p.querySelector('.list');
    const search = p.querySelector('.search');
    const btnExec = p.querySelector('.exec');
    let selectedLoc = null; 
    
    function modo() { 
        return p.querySelector('input[name="slmodo34"]:checked').value === 'remove' ? 'remove' : 'add'; 
    }
    
    p.querySelectorAll('input[name="slmodo34"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (selectedLoc) {
                const acao = radio.value === 'remove' ? 'Desassociar' : 'Associar';
                btnExec.textContent = `✅ Confirmar: ${acao}`;
            }
        });
    });

    function fill() {
        const f = norm(search.value);
        list.innerHTML = '';
        selectedLoc = null; 
        btnExec.disabled = true;
        btnExec.textContent = "✅ Selecione um item na lista...";
        
        locs.filter(l => !f || norm(l.nome).includes(f)).forEach(l => {
            const b = document.createElement('button');
            
            // APLICA O FORMATADOR INTELIGENTE NO NOME DO LOCALIZADOR
            b.textContent = formatLocName(l.nome) + (l.qtde !== '' ? ' [' + l.qtde + ']' : '');
            
            b.onclick = () => {
                [...list.children].forEach(child => child.classList.remove('selected'));
                b.classList.add('selected');
                
                selectedLoc = l;
                btnExec.disabled = false;
                const acao = modo() === 'remove' ? 'Desassociar' : 'Associar';
                btnExec.textContent = `✅ Confirmar: ${acao}`;
            };
            
            list.appendChild(b);
        });
        
        if (!list.children.length) list.textContent = 'Nenhum localizador encontrado.';
    }
    
    btnExec.onclick = () => {
        if (selectedLoc) {
            executar(rows, selectedLoc, modo());
        }
    };

    search.oninput = fill;
    p.querySelector('.x').onclick = p.querySelector('.close').onclick = () => p.remove();
    p.querySelector('.refresh').onclick = () => openPanel(true);
    
    p.querySelector('.diag').onclick = async () => {
        await copy('DIAGNÓSTICO SEEU Localizadores v3.4\nSelecionados=' + rows.length + '\nResumo scan=' + JSON.stringify(summary, null, 2) + '\nRows=' + JSON.stringify(rows, null, 2));
        toast('Diagnóstico copiado.', 'ok');
    };
    
    fill();
    search.focus();
}

async function restorePosition(el,key,def){let data={};try{data=await chrome.storage.local.get([key])}catch(e){}const p=data[key]||def;el.style.left=p.left+'px';el.style.top=p.top+'px';el.style.right='auto';el.style.bottom='auto';el.style.transform='none'}
function makeDraggable(el,handle,key,opts={}){if(!handle||handle.dataset.dragReady)return;handle.dataset.dragReady='1';let on=false,sx=0,sy=0,sl=0,st=0,pid=null,moved=false;handle.addEventListener('pointerdown',e=>{if(opts.allowButtons===false && ['BUTTON','INPUT','LABEL'].includes(e.target.tagName))return;on=true;pid=e.pointerId;sx=e.clientX;sy=e.clientY;const r=el.getBoundingClientRect();sl=r.left;st=r.top;moved=false;try{handle.setPointerCapture(pid)}catch(_){}e.preventDefault();e.stopPropagation()});handle.addEventListener('pointermove',e=>{if(!on)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;const nl=Math.max(0,Math.min(innerWidth-el.offsetWidth,sl+dx));const nt=Math.max(0,Math.min(innerHeight-el.offsetHeight,st+dy));el.style.left=nl+'px';el.style.top=nt+'px';el.style.right='auto';el.style.bottom='auto';el.style.transform='none'});handle.addEventListener('pointerup',async e=>{if(!on)return;on=false;try{handle.releasePointerCapture(pid)}catch(_){}const r=el.getBoundingClientRect();const obj={};obj[key]={left:Math.round(r.left),top:Math.round(r.top)};try{await chrome.storage.local.set(obj)}catch(_){}});handle.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false}},true)}

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SEEU_LOC34_OPEN') {
    openPanel(false);
  }
});

})();