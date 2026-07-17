(function() {
    'use strict';

    // Como o script agora roda em todos os iframes, primeiro verificamos se há ordem de pesquisa
    chrome.storage.local.get(['dipol_data'], function(result) {
        if (!result.dipol_data) return; // Se não tem pesquisa, fica invisível e não faz nada.

        const data = result.dipol_data;
        if (Date.now() - data.timestamp > 300000) return; // Ignora se faz mais de 5 minutos

        let tentativas = 0;
        
        // Loop para caçar os campos DENTRO deste iframe específico
        const intervalo = setInterval(() => {
            tentativas++;

            // Procura pelos IDs exatos que você encontrou no F12
            const elRG = document.querySelector('input[appmagic-control*="TxtRgConsultado"]');
            const elNome = document.querySelector('input[appmagic-control*="TxtNomeConsultado"]');
            const elMae = document.querySelector('input[appmagic-control*="TxtNomeMaeConsultado"]');

            // Se achou os campos neste frame, BINGO! Estamos no lugar certo.
            if (elRG && elNome) {
                clearInterval(intervalo);
                console.log("🎯 [SEEU Flow] INFILTRAÇÃO BEM SUCEDIDA! Frame correto encontrado.");
                
                // Aguarda 2.5 segundos para o Power Apps terminar de carregar seus dados no topo
                setTimeout(() => {
                    console.log("⚡ [SEEU Flow] Injetando dados como se fosse digitação humana...");

                    simularDigitacao(elRG, data.rg);
                    simularDigitacao(elNome, data.nome);
                    if (elMae) simularDigitacao(elMae, data.mae);

                    // Limpa a ordem de pesquisa
                    chrome.storage.local.remove('dipol_data');

                    // Aguarda 1 segundo e tenta clicar no botão Consultar
                    setTimeout(() => {
                        const btnConsulta = document.querySelector('div[data-control-name="BtnConsultar"] button') 
                                         || Array.from(document.querySelectorAll('button')).find(b => (b.innerText||"").toUpperCase().includes("CONSULTAR"));
                        
                        if (btnConsulta) {
                            console.log("✅ [SEEU Flow] Pesquisa ativada!");
                            btnConsulta.click();
                        }
                    }, 1000);

                }, 2500); 
            }

            if (tentativas > 40) {
                clearInterval(intervalo); // Desiste após 20s neste frame
            }
            
        }, 500); 
    });

    // Função suprema para enganar sistemas protegidos (Simula clipboard/teclado)
    function simularDigitacao(inputElement, texto) {
        if (!inputElement || !texto) return;
        
        inputElement.focus();
        inputElement.select(); // Seleciona qualquer coisa que esteja lá para sobrescrever

        // Tenta injetar via comando nativo do navegador (como se fosse um CTRL+V)
        if (!document.execCommand('insertText', false, texto)) {
            // Se o navegador bloquear o CTRL+V, usamos força bruta no React
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            if (nativeSetter) {
                nativeSetter.call(inputElement, texto);
            } else {
                inputElement.value = texto;
            }
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        inputElement.blur();
    }

})();