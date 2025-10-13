let adjustedScores = {};

async function fetchAdjustedScores() {
  const url = "https://raw.githubusercontent.com/EHansonn/mal-score-adjuster/main/output/adjusted-scores.json";
  try {
    const res = await fetch(url);
    adjustedScores = await res.json();
    console.log("Adjusted scores loaded:", Object.keys(adjustedScores).length);
  } catch (e) {
    console.error("Failed to fetch adjusted scores:", e);
  }
}

// Fetch at startup and refresh periodically
fetchAdjustedScores();
setInterval(fetchAdjustedScores, 24 * 60 * 60 * 1000); // every 24 hours

// Listen for requests from content scripts
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "getAdjustedScores") {
    return Promise.resolve(adjustedScores);
  }
});