console.log('[MAL Score Adjuster] Background script loaded');

let adjustedScores = {};

async function fetchAdjustedScores() {
  const url = "https://raw.githubusercontent.com/EHansonn/mal-score-adjuster/main/output/adjusted-scores.json";
  console.log('[MAL Score Adjuster] Fetching adjusted scores from:', url);

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    adjustedScores = await res.json();
    console.log('[MAL Score Adjuster] Adjusted scores loaded successfully');
    console.log('[MAL Score Adjuster] Metadata:', adjustedScores.metadata);
    console.log('[MAL Score Adjuster] Total anime:', Object.keys(adjustedScores.anime || {}).length);
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error('[MAL Score Adjuster] Fetch timeout after 10 seconds');
    } else {
      console.error('[MAL Score Adjuster] Failed to fetch adjusted scores:', e);
    }
  }
}

// Fetch at startup and refresh periodically
fetchAdjustedScores();
setInterval(fetchAdjustedScores, 24 * 60 * 60 * 1000); // every 24 hours

// Listen for requests from content scripts
browser.runtime.onMessage.addListener((msg) => {
  console.log('[MAL Score Adjuster] Received message:', msg);
  if (msg.type === "getAdjustedScores") {
    console.log('[MAL Score Adjuster] Sending adjusted scores to content script');
    return Promise.resolve(adjustedScores);
  }
});