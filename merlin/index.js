// The Merlin tab embeds the ESP-AI assistant (a Gradio app run as a separate
// process): https://github.com/nasa-jpl-exoplanet/ESP-AI
//
// Point this at wherever ESP-AI is running. It must match the interface mode
// you launch:
//   Chatbot only   ->  python main_chatbot.py   ->  http://localhost:7861
//   Combined       ->  python main.py           ->  http://localhost:7860
//   Query only     ->  python main_advanced.py  ->  http://localhost:7860
// For a shared deployment, replace the host with the ESP-AI server URL.
const ESP_AI_URL = 'http://localhost:7860';

document.addEventListener('DOMContentLoaded', () => {
    const frame = document.getElementById('esp-ai-frame');
    const notice = document.getElementById('esp-ai-notice');
    const urlHint = document.getElementById('esp-ai-url-hint');

    if (urlHint) urlHint.textContent = ESP_AI_URL;

    // Hide any banner avatar that fails to load (avoids a broken-image icon).
    document.querySelectorAll('.esp-ai-banner-img').forEach((img) => {
        img.addEventListener('error', () => { img.style.display = 'none'; });
    });

    // Once the Gradio app loads, reveal the iframe and drop the notice. The
    // load event fires for cross-origin frames even though we can't read them.
    frame.addEventListener('load', () => {
        frame.classList.add('loaded');
        if (notice) notice.remove();
    });

    // If ESP-AI hasn't loaded within a few seconds it's almost certainly not
    // running; keep the notice (with launch instructions) in place.
    setTimeout(() => {
        if (!frame.classList.contains('loaded') && notice) {
            notice.classList.add('esp-ai-notice-error');
            const p = notice.querySelector('p');
            if (p) p.textContent = "Couldn't reach the ESP-AI Merlin assistant.";
        }
    }, 6000);

    frame.src = ESP_AI_URL;
});
