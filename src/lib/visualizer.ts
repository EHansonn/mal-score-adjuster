import * as fs from "fs";
import * as path from "path";
import type { AnimeData, CalculatorConfig } from "./calculator";

interface YearPercentiles {
  year: number;
  count: number;
  min: number;
  p50: number; // Median
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
}

function calculatePercentile(sortedScores: number[], percentile: number): number {
  const index = Math.floor((percentile / 100) * sortedScores.length);
  return sortedScores[Math.min(index, sortedScores.length - 1)];
}

export function analyzePercentilesByYear(
  animeList: AnimeData[],
  startYear: number = 2005,
  endYear: number = 2025
): YearPercentiles[] {
  console.log("\n=== Analyzing Score Percentiles by Year ===\n");

  const results: YearPercentiles[] = [];

  // Group anime by year
  const animeByYear = new Map<number, AnimeData[]>();
  for (const anime of animeList) {
    if (anime.startYear && anime.startYear >= startYear && anime.startYear <= endYear) {
      if (!animeByYear.has(anime.startYear)) {
        animeByYear.set(anime.startYear, []);
      }
      animeByYear.get(anime.startYear)!.push(anime);
    }
  }

  // Calculate percentiles for each year
  for (let year = startYear; year <= endYear; year++) {
    const yearAnime = animeByYear.get(year) || [];

    if (yearAnime.length < 10) {
      console.log(`${year}: Insufficient data (${yearAnime.length} anime)`);
      continue;
    }

    const scores = yearAnime.map((a) => a.mean).sort((a, b) => a - b);

    results.push({
      year,
      count: scores.length,
      min: scores[0],
      p50: calculatePercentile(scores, 50),
      p75: calculatePercentile(scores, 75),
      p90: calculatePercentile(scores, 90),
      p95: calculatePercentile(scores, 95),
      p99: calculatePercentile(scores, 99),
      max: scores[scores.length - 1],
    });

    console.log(`${year}: ${scores.length} anime analyzed`);
  }

  console.log(`\n✓ Analyzed ${results.length} years\n`);
  return results;
}

function generateTableRows(data: YearPercentiles[], baselineYearRange: string, baselineYears: number[]): string {
  // Calculate baseline 95th percentile from the specified range
  const baselineData = data.filter((d) => baselineYears.includes(d.year));
  const baseline95th = baselineData.length > 0
    ? baselineData.reduce((sum, d) => sum + d.p95, 0) / baselineData.length
    : 0;

  return data
    .map((row) => {
      const delta95 = row.p95 - baseline95th;
      const deltaStr =
        delta95 > 0 ? `+${delta95.toFixed(2)}` : delta95.toFixed(2);

      const isBaseline = baselineYears.includes(row.year);
      const absDelta = Math.abs(delta95);

      let highlightClass = "";
      if (isBaseline) {
        highlightClass = 'class="baseline"';
      } else if (absDelta >= 0.4) {
        highlightClass = 'class="highlight-severe"';
      } else if (absDelta >= 0.3) {
        highlightClass = 'class="highlight-high"';
      } else if (absDelta >= 0.15) {
        highlightClass = 'class="highlight-medium"';
      }

      return `
                <tr ${highlightClass}>
                    <td><strong>${row.year}</strong></td>
                    <td>${row.count}</td>
                    <td>${row.min.toFixed(2)}</td>
                    <td>${row.p50.toFixed(2)}</td>
                    <td>${row.p75.toFixed(2)}</td>
                    <td>${row.p90.toFixed(2)}</td>
                    <td><strong>${row.p95.toFixed(2)}</strong></td>
                    <td>${row.p99.toFixed(2)}</td>
                    <td>${row.max.toFixed(2)}</td>
                    <td><strong>${deltaStr}</strong></td>
                </tr>`;
    })
    .join("");
}

function generateHTMLChart(data: YearPercentiles[], baselineYearRange: string, baselineYears: number[], minScoringUsers: number, generatedDate: string): string {
  const years = data.map((d) => d.year);
  const minData = data.map((d) => d.min);
  const p50Data = data.map((d) => d.p50);
  const p75Data = data.map((d) => d.p75);
  const p90Data = data.map((d) => d.p90);
  const p95Data = data.map((d) => d.p95);
  const p99Data = data.map((d) => d.p99);
  const maxData = data.map((d) => d.max);

  // Calculate dynamic y-axis range with 0.5 padding, rounded to 0.5 intervals
  const allScores = [...p50Data, ...p75Data, ...p90Data, ...p95Data, ...p99Data, ...maxData];
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  const yAxisMin = Math.max(0, Math.floor((minScore - 0.5) * 2) / 2);
  const yAxisMax = Math.min(10, Math.ceil((maxScore + 0.5) * 2) / 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MAL Score Percentiles Over Time</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
        }
        .chart-container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        canvas {
            max-height: 500px;
        }
        .stats-table {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 10px;
            text-align: center;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #4CAF50;
            color: white;
            font-weight: bold;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .highlight-medium {
            background-color: #ffe4b3;
        }
        .highlight-high {
            background-color: #ffb84d;
        }
        .highlight-severe {
            background-color: #ff6b6b;
        }
        .baseline {
            background-color: #c6f6d5;
        }
        .insight {
            background: #e7f3ff;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #2196F3;
        }
        .insight h3 {
            margin-top: 0;
            color: #1976D2;
        }
        .extension-box {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            color: white;
            text-align: center;
        }
        .extension-box h3 {
            margin-top: 0;
            color: white;
        }
        .extension-box a {
            display: inline-block;
            background: white;
            color: #667eea;
            padding: 12px 24px;
            border-radius: 5px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 10px;
            transition: transform 0.2s;
        }
        .extension-box a:hover {
            transform: scale(1.05);
        }
    </style>
</head>
<body>
    <h1>📊 MAL Score Percentiles Over Time</h1>
    <p class="subtitle">Analyzing score inflation trends (Anime with ${minScoringUsers.toLocaleString()}+ scoring users)</p>
    <p class="subtitle" style="font-size: 0.9em; color: #999;">Last updated: ${generatedDate}</p>

    <div class="extension-box">
        <h3>🔧 Install the Browser Extension</h3>
        <p>See adjusted scores directly on MyAnimeList while you browse!</p>
        <a href="https://github.com/EHansonn/mal-score-adjuster/releases/latest" target="_blank">Download Extension</a>
    </div>

    <div class="insight">
        <h3>📈 Key Insights</h3>
        <p><strong>What this shows:</strong> How the same percentile rank (e.g., top 5% = 95th percentile)
        has been getting higher scores over time, indicating score inflation.</p>
        <p><strong>Example:</strong> If the 95th percentile was 8.5 in 2015 but is 9.2 in 2024,
        that's a clear sign of inflation - the "top tier" threshold has moved up.</p>
    </div>

    <div class="chart-container">
        <canvas id="percentilesChart"></canvas>
    </div>

    <div class="chart-container">
        <h2>🔍 95th Percentile Trend (1995+)</h2>
        <canvas id="inflationChart"></canvas>
    </div>

    <div class="stats-table">
        <h2>📋 Detailed Percentile Data by Year</h2>
        <table>
            <thead>
                <tr>
                    <th>Year</th>
                    <th>Count</th>
                    <th>Min</th>
                    <th>50th (Median)</th>
                    <th>75th</th>
                    <th>90th</th>
                    <th>95th</th>
                    <th>99th</th>
                    <th>Max</th>
                    <th>95th Δ from ${baselineYearRange}</th>
                </tr>
            </thead>
            <tbody>
                ${generateTableRows(data, baselineYearRange, baselineYears)}
            </tbody>
        </table>
    </div>

    <script>
        const ctx = document.getElementById('percentilesChart').getContext('2d');

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(years)},
                datasets: [
                    {
                        label: 'Max Score',
                        data: ${JSON.stringify(maxData)},
                        borderColor: 'rgb(220, 38, 38)',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        borderWidth: 3,
                        tension: 0.1
                    },
                    {
                        label: '99th Percentile',
                        data: ${JSON.stringify(p99Data)},
                        borderColor: 'rgb(234, 88, 12)',
                        backgroundColor: 'rgba(234, 88, 12, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: '95th Percentile',
                        data: ${JSON.stringify(p95Data)},
                        borderColor: 'rgb(168, 85, 247)',
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: '90th Percentile',
                        data: ${JSON.stringify(p90Data)},
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: '75th Percentile',
                        data: ${JSON.stringify(p75Data)},
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: '50th Percentile (Median)',
                        data: ${JSON.stringify(p50Data)},
                        borderColor: 'rgb(107, 114, 128)',
                        backgroundColor: 'rgba(107, 114, 128, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: 'Min Score',
                        data: ${JSON.stringify(minData)},
                        borderColor: 'rgba(139, 92, 246, 0)',
                        backgroundColor: 'rgba(139, 92, 246, 0)',
                        borderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Score Percentiles by Year (Higher = More Inflation)',
                        font: {
                            size: 18
                        }
                    },
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: ${yAxisMin},
                        max: ${yAxisMax},
                        title: {
                            display: true,
                            text: 'Score'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Year'
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        // Second chart: Focused inflation trends (2010+)
        const inflationData = {
            labels: ${JSON.stringify(years)},
            p95: ${JSON.stringify(p95Data)}
        };

        // Use all data from 1995 onwards (same as main chart)
        const startIndex = 0;
        const filteredYears = inflationData.labels.slice(startIndex);
        const filtered95 = inflationData.p95.slice(startIndex);

        const ctx2 = document.getElementById('inflationChart').getContext('2d');

        const inflationChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: filteredYears,
                datasets: [
                    {
                        label: '95th Percentile',
                        data: filtered95,
                        borderColor: 'rgb(168, 85, 247)',
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        borderWidth: 4,
                        tension: 0.1,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: '95th Percentile Trend (1995-Present)',
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Score'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Year'
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    </script>
</body>
</html>`;
}

export function generateVisualization(
  animeList: AnimeData[],
  config: CalculatorConfig,
  startYear: number = 1995,
  endYear: number = 2025
): void {
  const data = analyzePercentilesByYear(animeList, startYear, endYear);

  if (data.length === 0) {
    console.log("⚠ No percentile data collected - skipping visualization");
    return;
  }

  // Create baseline year range string and array
  const baselineYearRange = config.BASELINE_START_YEAR === config.BASELINE_END_YEAR
    ? `${config.BASELINE_START_YEAR}`
    : `${config.BASELINE_START_YEAR}-${config.BASELINE_END_YEAR}`;

  const baselineYears: number[] = [];
  for (let year = config.BASELINE_START_YEAR; year <= config.BASELINE_END_YEAR; year++) {
    baselineYears.push(year);
  }

  // Generate HTML chart with current date
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const html = generateHTMLChart(data, baselineYearRange, baselineYears, config.MIN_SCORING_USERS, currentDate);

  // Save to output directory
  const outputDir = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "percentile-visualization.html");
  fs.writeFileSync(outputPath, html, "utf-8");

  console.log("✓ Percentile visualization generated!");
  console.log(`📊 Open this file in your browser: ${outputPath}\n`);
}
