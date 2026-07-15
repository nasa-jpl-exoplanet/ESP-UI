// The Merlin tab connects to the ESP-AI assistant via its REST API.
// https://github.com/nasa-jpl-exoplanet/ESP-AI
const ESP_AI_URL = 'https://mentor0.jpl.nasa.gov:10443';

document.addEventListener('DOMContentLoaded', () => {
    const notice = document.getElementById('esp-ai-notice');
    const urlHint = document.getElementById('esp-ai-url-hint');
    const docsLink = document.getElementById('esp-ai-docs-link');
    const chatContainer = document.getElementById('chat-container');
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');

    let history = []; // Stores [user, bot] pairs for the API

    if (urlHint) urlHint.textContent = ESP_AI_URL;
    if (docsLink) docsLink.href = `${ESP_AI_URL}/docs`;

    // Hide any banner avatar that fails to load (avoids a broken-image icon).
    document.querySelectorAll('.esp-ai-banner-img').forEach((img) => {
        img.addEventListener('error', () => { img.style.display = 'none'; });
    });

    /**
     * Verifies connectivity to the ESP-AI REST API.
     */
    async function checkHealth() {
        try {
            console.log("Checking ESP-AI health via proxy...");
            const response = await fetch('/api/health');
            if (!response.ok) {
                const errorText = await response.text().catch(() => "No error details available");
                throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 100)}`);
            }
            const data = await response.json();
            
            // If data is loaded, reveal the chat interface
            if (data.status === "ok" || data.status === "success" || data.status === "healthy") {
                console.log("ESP-AI is healthy.");
                if (notice) notice.remove();
                if (chatContainer) chatContainer.style.display = 'flex';
                addMessage('bot', "Hello! I'm Merlin, your EXCALIBUR assistant. How can I help you today?");
            } else {
                showError(`ESP-AI API reported an unhealthy status: ${data.status || 'unknown'}`);
            }
        } catch (err) {
            console.error("Health check error:", err);
            let detail = err.message;
            if (detail === "Failed to fetch") {
                detail = "Could not reach the local proxy. Please ensure you have run 'npm start' and the terminal shows '[Browsersync] Access URLs'.";
            }
            showError(`Connectivity Error: ${detail}. (Target: ${ESP_AI_URL})`);
        }
    }

    /**
     * Updates the notice overlay with an error message.
     */
    function showError(msg) {
        if (notice) {
            notice.classList.add('esp-ai-notice-error');
            const p = notice.querySelector('p');
            if (p) p.textContent = msg;
        }
    }

    /**
     * Appends a message to the chat history UI.
     */
    function addMessage(role, text, isError = false, id = null) {
        if (!chatHistory) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role}-message${isError ? ' error' : ''}`;
        if (id) msgDiv.id = id;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (role === 'bot' && typeof marked !== 'undefined' && text !== '...') {
            contentDiv.innerHTML = marked.parse(text);
        } else {
            contentDiv.textContent = text;
        }
        
        msgDiv.appendChild(contentDiv);
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        
        // Return the div in case we need to remove/update it
        return msgDiv;
    }

    /**
     * Sends the current input to the /api/chat endpoint.
     */
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // UI state: disable input while thinking
        chatInput.value = '';
        chatInput.disabled = true;
        chatSendBtn.disabled = true;

        addMessage('user', text);

        // Show thinking indicator
        const thinkingMsg = addMessage('bot', '...');
        thinkingMsg.classList.add('thinking');

        try {
            // Using a relative path to leverage the proxy in proxy.config.js
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: history
                })
            });

            // Remove thinking indicator
            thinkingMsg.remove();

            if (!response.ok) {
                const errorText = await response.text().catch(() => "Unknown error");
                let errorMsg = `API error: ${response.status}`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMsg = errorData.detail?.[0]?.msg || errorData.error || errorMsg;
                } catch(e) {}
                throw new Error(errorMsg);
            }
            
            const data = await response.json();
            if (data.status === 'success' || data.status === 'ok') {
                addMessage('bot', data.response);
                history.push([text, data.response]);
            } else {
                throw new Error(data.error || data.message || "Unknown API error");
            }
        } catch (err) {
            // Remove thinking indicator if still there
            if (thinkingMsg.parentNode) thinkingMsg.remove();
            
            console.error("Chat error:", err);
            addMessage('bot', `Error: ${err.message}`, true);
        } finally {
            chatInput.disabled = false;
            chatSendBtn.disabled = false;
            chatInput.focus();
        }
    }

    // Event Listeners
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    checkHealth();
});
