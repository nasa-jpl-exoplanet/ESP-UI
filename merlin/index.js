// The Merlin tab connects to the ESP-AI assistant via its REST API.
// https://github.com/nasa-jpl-exoplanet/ESP-AI
let ESP_AI_URL = 'https://excalibur.jpl.nasa.gov:10443'; // Default fallback
// let ESP_AI_URL = 'http://localhost:8000'; for testing locally

document.addEventListener('DOMContentLoaded', () => {
    const notice = document.getElementById('esp-ai-notice');
    const urlHint = document.getElementById('esp-ai-url-hint');
    const docsLink = document.getElementById('esp-ai-docs-link');
    const chatContainer = document.getElementById('chat-container');
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    
    const chatModeBtn = document.getElementById('chat-mode-btn');
    const queryModeBtn = document.getElementById('query-mode-btn');
    const queryContainer = document.getElementById('query-container');
    const queryInput = document.getElementById('query-input');
    const querySearchBtn = document.getElementById('query-search-btn');
    const resultsTbody = document.getElementById('results-tbody');
    const resultsCount = document.getElementById('results-count');
    const resultsShowing = document.getElementById('results-showing');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    let history = []; // Stores [user, bot] pairs for the API
    let currentMode = 'chat';
    let queryResults = [];
    let queryTotal = 0;
    let currentPage = 0;
    const resultsPerPage = 100;

    function updateUrlHints() {
        if (urlHint) urlHint.textContent = ESP_AI_URL;
        if (docsLink) docsLink.href = `${ESP_AI_URL}/docs`;
    }

    updateUrlHints();

    // Fetch actual target from proxy config if available
    async function loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                if (config.merlinTarget) {
                    ESP_AI_URL = config.merlinTarget;
                    updateUrlHints();
                }
            }
        } catch (e) {
            console.warn("Could not fetch proxy config, using hardcoded default hint.");
        }
    }

    // Hide any banner avatar that fails to load (avoids a broken-image icon).
    document.querySelectorAll('.esp-ai-banner-img').forEach((img) => {
        img.addEventListener('error', () => { img.style.display = 'none'; });
    });

    /**
     * Verifies connectivity to the ESP-AI REST API.
     */
    async function checkHealth() {
        try {
            console.log("Checking ESP-AI health...");
            const response = await fetch(`${ESP_AI_URL}/api/health`);
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
            let detail = err.message || String(err);
            if (detail && detail.includes("Failed to fetch")) {
                detail = `Could not reach ${ESP_AI_URL}. Please ensure the ESP-AI service is running.`;
                if (window.location.protocol === 'https:' && ESP_AI_URL.startsWith('http:')) {
                    detail += " Note: Your browser (especially Safari) may block this request due to 'Mixed Content' rules (loading HTTP resources on an HTTPS site). Consider using an HTTPS endpoint for ESP-AI.";
                }
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
        if (!chatInput) {
            console.error('Chat input element missing; aborting sendMessage.');
            return;
        }
        const text = chatInput.value.trim();
        if (!text) return;

        // UI state: disable input while thinking
        chatInput.value = '';
        chatInput.disabled = true;
        if (chatSendBtn) chatSendBtn.disabled = true;

        addMessage('user', text);

        // Show thinking indicator
        const thinkingMsg = addMessage('bot', '...');
        if (thinkingMsg && thinkingMsg.classList) thinkingMsg.classList.add('thinking');

        try {
            // Calling the REST API directly using the configured target URL
            const response = await fetch(`${ESP_AI_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: history
                })
            });

            // Remove thinking indicator
            if (thinkingMsg && thinkingMsg.parentNode) thinkingMsg.remove();

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
            if (thinkingMsg && thinkingMsg.parentNode) thinkingMsg.remove();
            
            console.error("Chat error:", err);
            addMessage('bot', `Error: ${err.message}`, true);
        } finally {
            chatInput.disabled = false;
            chatSendBtn.disabled = false;
            chatInput.focus();
        }
    }

    /**
     * Switches between chat and query modes.
     */
    function switchMode(mode) {
        currentMode = mode;
        
        if (mode === 'chat') {
            chatModeBtn.classList.add('active');
            queryModeBtn.classList.remove('active');
            chatContainer.style.display = 'flex';
            queryContainer.classList.remove('active');
        } else {
            queryModeBtn.classList.add('active');
            chatModeBtn.classList.remove('active');
            chatContainer.style.display = 'none';
            queryContainer.classList.add('active');
        }
    }

    /**
     * Executes a query against the ESP-AI API.
     */
    async function executeQuery(queryText) {
        if (!queryText.trim()) return;

        querySearchBtn.disabled = true;
        queryInput.disabled = true;
        resultsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #888;">Searching...</td></tr>';

        try {
            const response = await fetch(`${ESP_AI_URL}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryText })
            });

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
                queryResults = data.results || [];
                queryTotal = data.total || queryResults.length; // use real total
                currentPage = 0;
                renderResults();
            } else {
                throw new Error(data.error || data.message || "Unknown API error");
            }
        } catch (err) {
            console.error("Query error:", err);
            resultsTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: #c0392b;">Error: ${err.message}</td></tr>`;
            resultsCount.textContent = 'Total: 0 results';
            resultsShowing.textContent = '';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        } finally {
            querySearchBtn.disabled = false;
            queryInput.disabled = false;
        }
    }

    /**
     * Renders the current page of results.
     */
    function renderResults() {
        if (queryResults.length === 0) {
            resultsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #888;">No results found</td></tr>';
            resultsCount.textContent = 'Total: 0 results';
            resultsShowing.textContent = '';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }

        const startIdx = currentPage * resultsPerPage;
        const endIdx = Math.min(startIdx + resultsPerPage, queryResults.length);
        const pageResults = queryResults.slice(startIdx, endIdx);

        resultsTbody.innerHTML = '';
        pageResults.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(row.run_id || '')}</td>
                <td>${escapeHtml(row.target || '')}</td>
                <td>${escapeHtml(row.task || '')}</td>
                <td>${escapeHtml(row.alg || '')}</td>
                <td>${escapeHtml(row.sv || '')}</td>
            `;
            resultsTbody.appendChild(tr);
        });

        resultsCount.textContent = `Total: ${queryTotal} results`;
        resultsShowing.textContent = `Showing ${startIdx + 1}-${endIdx}`;

        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = endIdx >= queryResults.length;
    }

    /**
     * Escapes HTML to prevent XSS.
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    if (chatModeBtn) {
        chatModeBtn.addEventListener('click', () => switchMode('chat'));
    }

    if (queryModeBtn) {
        queryModeBtn.addEventListener('click', () => switchMode('query'));
    }

    if (querySearchBtn) {
        querySearchBtn.addEventListener('click', () => {
            executeQuery(queryInput.value);
        });
    }

    if (queryInput) {
        queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeQuery(queryInput.value);
            }
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage--;
                renderResults();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const maxPage = Math.ceil(queryResults.length / resultsPerPage) - 1;
            if (currentPage < maxPage) {
                currentPage++;
                renderResults();
            }
        });
    }

    document.querySelectorAll('.example-query-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            queryInput.value = btn.textContent;
            executeQuery(btn.textContent);
        });
    });

    loadConfig().finally(() => {
        checkHealth();
    });
});
