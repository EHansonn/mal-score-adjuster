/**
 * MAL Score Adjuster Extension
 * Refactored for better maintainability and readability
 */

console.log('[MAL Score Adjuster] Content script loaded');


// Constants
const COLORS = {
  NEUTRAL: '#999',
  IMPROVED: '#00b300',
  DECREASED: '#e53935',
  HOVER: '#ffb300'
};

const THRESHOLD = 0.01;
const SELECTORS = {
  ANIME_BLOCKS: '.js-anime-category-producer.js-seasonal-anime',
  RANKING_ROWS: 'tr.ranking-list',
  DETAIL_SCORE: '.anime-detail-header-stats .score .score-label',
  SCORE_ELEMENT: '.scormem-item.score',
  RANKING_SCORE: 'td.score .text.on.score-label'
};

/**
 * Get anime ID from various sources
 */
function extractAnimeId(element, fallbackUrl = null) {
  // Try to get ID from element's ID attribute
  let id = element?.querySelector('.genres.js-genre')?.id;
  if (id) return id;

  // Try to get ID from link href
  const link = element?.querySelector('.h2_anime_title a')?.href ||
    element?.querySelector('a.hoverinfo_trigger')?.href;
  if (link) {
    const match = link.match(/anime\/(\d+)\//);
    if (match) return match[1];
  }

  // Try to get ID from hidden field or current URL
  if (fallbackUrl) {
    const match = fallbackUrl.match(/anime\/(\d+)\//);
    if (match) return match[1];
  }

  const hiddenId = document.querySelector('#myinfo_anime_id')?.value;
  if (hiddenId) return hiddenId;

  return null;
}

/**
 * Determine color based on score difference
 */
function getScoreColor(diff) {
  if (diff > THRESHOLD) return COLORS.IMPROVED;
  if (diff < -THRESHOLD) return COLORS.DECREASED;
  return COLORS.NEUTRAL;
}

/**
 * Create hover event handlers for score elements
 */
function createHoverHandlers(originalScore, adjustedScore, color) {
  return {
    onmouseover: function () {
      this.textContent = originalScore;
      this.style.color = COLORS.HOVER;
    },
    onmouseout: function () {
      this.textContent = adjustedScore;
      this.style.color = color;
    }
  };
}

/**
 * Apply adjusted score to a score element
 */
function applyScoreToElement(element, data, isDetailView = false) {
  const { adjustedScore, originalScore } = data;
  if (!adjustedScore) return;

  const diff = adjustedScore - originalScore;
  const color = getScoreColor(diff);
  const adjustedFormatted = adjustedScore.toFixed(2);
  const originalFormatted = originalScore.toFixed(2);

  if (isDetailView) {
    // For detail view, create a more complex HTML structure
    element.innerHTML = `
      <i class="fa-regular fa-star mr4"></i>
      <span style="color: ${color};" 
            data-original="${originalFormatted}" 
            data-adjusted="${adjustedFormatted}"
            onmouseover="this.textContent=this.dataset.original; this.style.color='${COLORS.HOVER}';" 
            onmouseout="this.textContent=this.dataset.adjusted; this.style.color='${color}';">
        ${adjustedFormatted}
      </span>
      <span style="color:#999;font-size:10px;margin-left:3px;" title="Original MAL score">
        (${originalFormatted})
      </span>
    `;
  } else {
    // For ranking and other views, just update the text content
    element.textContent = adjustedFormatted;
    element.setAttribute('data-original', originalFormatted);
    element.setAttribute('data-adjusted', adjustedFormatted);

    const handlers = createHoverHandlers(originalFormatted, adjustedFormatted, color);
    element.onmouseover = handlers.onmouseover;
    element.onmouseout = handlers.onmouseout;
    element.style.color = color;
  }
}

/**
 * Process anime blocks on seasonal pages
 */
function processAnimeBlocks(adjustedScores) {
  const animeBlocks = document.querySelectorAll(SELECTORS.ANIME_BLOCKS);

  animeBlocks.forEach(block => {
    const id = extractAnimeId(block);
    if (!id || !adjustedScores.anime[id]) return;

    const data = adjustedScores.anime[id];
    const scoreEl = block.querySelector(SELECTORS.SCORE_ELEMENT);

    if (scoreEl) {
      applyScoreToElement(scoreEl, data, true);
    }
  });
}

/**
 * Process ranking rows
 */
function processRankingRows(adjustedScores) {
  const rankingRows = document.querySelectorAll(SELECTORS.RANKING_ROWS);

  rankingRows.forEach(row => {
    const id = extractAnimeId(row);
    if (!id || !adjustedScores.anime[id]) return;

    const data = adjustedScores.anime[id];
    const scoreSpan = row.querySelector(SELECTORS.RANKING_SCORE);

    if (scoreSpan) {
      applyScoreToElement(scoreSpan, data, false);
    }
  });
}

/**
 * Process detail page score
 */
function processDetailScore(adjustedScores) {
  const detailScore = document.querySelector(SELECTORS.DETAIL_SCORE);
  if (!detailScore) return;

  const id = extractAnimeId(null, window.location.href);
  if (!id || !adjustedScores.anime[id]) return;

  const data = adjustedScores.anime[id];
  applyScoreToElement(detailScore, data, false);
}

/**
 * Main function to apply adjusted scores
 */
async function applyAdjustedScores() {
  try {
    console.log('[MAL Score Adjuster] Requesting adjusted scores...');
    const adjustedScores = await browser.runtime.sendMessage({ type: "getAdjustedScores" });

    console.log('[MAL Score Adjuster] Received data:', await adjustedScores);

    if (!adjustedScores?.anime) {
      console.warn('[MAL Score Adjuster] No adjusted scores data available');
      return;
    }

    console.log('[MAL Score Adjuster] Total anime scores available:', Object.keys(adjustedScores.anime).length);

    // Process different page types
    processAnimeBlocks(adjustedScores);
    processRankingRows(adjustedScores);
    processDetailScore(adjustedScores);

    console.log('[MAL Score Adjuster] Scores applied successfully');

  } catch (error) {
    console.error('[MAL Score Adjuster] Error applying adjusted scores:', error);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyAdjustedScores);
} else {

  applyAdjustedScores();
}