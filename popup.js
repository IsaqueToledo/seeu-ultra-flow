async function carregar() {
  const d = await chrome.storage.local.get([
    "alertas", "retornoUrls", "coluna", "obs", "lerPdf", 
    "defesaCapa", "agrupadores", "btnLocalizadores", 
    "autoDownload", "autoOficio", "congelarPaineis"
  ]);
  
  document.getElementById("alertas").checked = d.alertas ?? true;
  document.getElementById("retornoUrls").value = (d.retornoUrls || []).join("\n");
  document.getElementById("coluna").checked = d.coluna ?? true;
  document.getElementById("obs").checked = d.obs ?? true;
  document.getElementById("lerPdf").checked = d.lerPdf ?? true;
  document.getElementById("defesaCapa").checked = d.defesaCapa ?? true;
  document.getElementById("agrupadores").checked = d.agrupadores ?? true;
  document.getElementById("btnLocalizadores").checked = d.btnLocalizadores ?? true;
  document.getElementById("autoDownload").checked = d.autoDownload ?? true; 
  document.getElementById("autoOficio").checked = d.autoOficio ?? true; 
  document.getElementById("congelarPaineis").checked = d.congelarPaineis ?? true; 
}

async function salvar() {
  const urls = document.getElementById("retornoUrls").value.split("\n").map(u => u.trim()).filter(Boolean);
  
  await chrome.storage.local.set({
    alertas: document.getElementById("alertas").checked,
    retornoUrls: urls,
    coluna: document.getElementById("coluna").checked,
    obs: document.getElementById("obs").checked,
    lerPdf: document.getElementById("lerPdf").checked,
    defesaCapa: document.getElementById("defesaCapa").checked,
    agrupadores: document.getElementById("agrupadores").checked,
    btnLocalizadores: document.getElementById("btnLocalizadores").checked,
    autoDownload: document.getElementById("autoDownload").checked,
    autoOficio: document.getElementById("autoOficio").checked,
    congelarPaineis: document.getElementById("congelarPaineis").checked
  });
  
  flash("Salvo com sucesso. Recarregue o SEEU.");
}

function flash(t) {
  const f = document.getElementById("flag");
  f.textContent = t;
  setTimeout(() => (f.textContent = ""), 2400);
}

document.getElementById("salvar").addEventListener("click", salvar);
carregar();