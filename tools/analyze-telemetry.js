// analyze-telemetry.js - Analyzes the collected telemetry data and generates charts
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');

// Parse command line arguments
const args = process.argv.slice(2);
let inputFile = null;
let outputDir = './performance_reports';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input' || args[i] === '-i') {
    inputFile = args[i + 1];
    i++;
  } else if (args[i] === '--output' || args[i] === '-o') {
    outputDir = args[i + 1];
    i++;
  }
}

if (!inputFile) {
  console.error('Error: No input file specified. Use --input or -i to specify a telemetry data file.');
  process.exit(1);
}

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`Created output directory: ${outputDir}`);
}

console.log(`Analyzing telemetry data from: ${inputFile}`);
console.log(`Output directory: ${outputDir}`);

// Load the telemetry data
let telemetryData;
try {
  const fileData = fs.readFileSync(inputFile, 'utf8');
  telemetryData = JSON.parse(fileData);
  console.log(`Successfully loaded telemetry data containing ${telemetryData.length} snapshots`);
} catch (error) {
  console.error(`Error loading telemetry data: ${error.message}`);
  process.exit(1);
}

// Prepare data for analysis
function prepareTimeSeriesData(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) {
    return { labels: [], values: [] };
  }
  
  const labels = [];
  const values = [];
  
  // Get relative timestamps for x-axis
  const startTime = dataPoints[0].timestamp;
  
  dataPoints.forEach(point => {
    const relativeTime = ((point.timestamp - startTime) / 1000).toFixed(1); // Convert to seconds
    labels.push(`${relativeTime}s`);
    values.push(point.value);
  });
  
  return { labels, values };
}

// Generate a chart image
async function generateChartImage(chartConfig, width = 800, height = 400) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const chart = new Chart(ctx, chartConfig);
  
  // Wait for chart to render
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return canvas.toBuffer('image/png');
}

// Calculate statistics
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, stdDev: 0 };
  }
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  
  // Calculate standard deviation
  const squareDiffs = values.map(value => {
    const diff = value - avg;
    return diff * diff;
  });
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  const stdDev = Math.sqrt(avgSquareDiff);
  
  // Calculate median
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  
  return {
    min: min,
    max: max,
    avg: avg,
    median: median,
    stdDev: stdDev
  };
}

// Process telemetry data
async function processData() {
  // Extract the latest snapshot for simplicity
  const latestSnapshot = telemetryData[telemetryData.length - 1];
  const metrics = latestSnapshot.metrics;
  
  // 1. Process latency data
  const captureLatency = metrics.latency.capture.map(item => item.value);
  const processingLatency = metrics.latency.processing.map(item => item.value);
  const transmissionLatency = metrics.latency.transmission.map(item => item.value);
  const renderingLatency = metrics.latency.rendering.map(item => item.value);
  const totalLatency = metrics.latency.total.map(item => item.value);
  
  const latencyStats = {
    capture: calculateStats(captureLatency),
    processing: calculateStats(processingLatency),
    transmission: calculateStats(transmissionLatency),
    rendering: calculateStats(renderingLatency),
    total: calculateStats(totalLatency)
  };
  
  console.log('\n--- Latency Statistics (ms) ---');
  console.log(`Capture:      Min: ${latencyStats.capture.min.toFixed(2)}, Max: ${latencyStats.capture.max.toFixed(2)}, Avg: ${latencyStats.capture.avg.toFixed(2)}, Median: ${latencyStats.capture.median.toFixed(2)}`);
  console.log(`Processing:   Min: ${latencyStats.processing.min.toFixed(2)}, Max: ${latencyStats.processing.max.toFixed(2)}, Avg: ${latencyStats.processing.avg.toFixed(2)}, Median: ${latencyStats.processing.median.toFixed(2)}`);
  console.log(`Transmission: Min: ${latencyStats.transmission.min.toFixed(2)}, Max: ${latencyStats.transmission.max.toFixed(2)}, Avg: ${latencyStats.transmission.avg.toFixed(2)}, Median: ${latencyStats.transmission.median.toFixed(2)}`);
  console.log(`Rendering:    Min: ${latencyStats.rendering.min.toFixed(2)}, Max: ${latencyStats.rendering.max.toFixed(2)}, Avg: ${latencyStats.rendering.avg.toFixed(2)}, Median: ${latencyStats.rendering.median.toFixed(2)}`);
  console.log(`Total E2E:    Min: ${latencyStats.total.min.toFixed(2)}, Max: ${latencyStats.total.max.toFixed(2)}, Avg: ${latencyStats.total.avg.toFixed(2)}, Median: ${latencyStats.total.median.toFixed(2)}`);
  
  // 2. Generate latency chart
  const latencyData = prepareTimeSeriesData(metrics.latency.total);
  const captureData = prepareTimeSeriesData(metrics.latency.capture);
  const processingData = prepareTimeSeriesData(metrics.latency.processing);
  const transmissionData = prepareTimeSeriesData(metrics.latency.transmission);
  const renderingData = prepareTimeSeriesData(metrics.latency.rendering);
  
  const latencyChartConfig = {
    type: 'line',
    data: {
      labels: latencyData.labels,
      datasets: [
        {
          label: 'Capture',
          data: captureData.values,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          fill: true
        },
        {
          label: 'Processing',
          data: processingData.values,
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: true
        },
        {
          label: 'Transmission',
          data: transmissionData.values,
          borderColor: 'rgba(255, 206, 86, 1)',
          backgroundColor: 'rgba(255, 206, 86, 0.2)',
          fill: true
        },
        {
          label: 'Rendering',
          data: renderingData.values,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          fill: true
        },
        {
          label: 'Total End-to-End',
          data: latencyData.values,
          borderColor: 'rgba(153, 102, 255, 1)',
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          borderWidth: 2,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'End-to-End Latency Components'
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Time (seconds)'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Latency (ms)'
          }
        }
      }
    }
  };
  
  // 3. Process system resource data
  const cpuData = metrics.resources.cpu.map(item => item.value);
  const memoryData = metrics.resources.memory.map(item => item.value);
  
  const resourceStats = {
    cpu: calculateStats(cpuData),
    memory: calculateStats(memoryData)
  };
  
  console.log('\n--- System Resource Statistics ---');
  console.log(`CPU Usage:    Min: ${resourceStats.cpu.min.toFixed(2)}, Max: ${resourceStats.cpu.max.toFixed(2)}, Avg: ${resourceStats.cpu.avg.toFixed(2)}`);
  console.log(`Memory (MB):  Min: ${resourceStats.memory.min.toFixed(2)}, Max: ${resourceStats.memory.max.toFixed(2)}, Avg: ${resourceStats.memory.avg.toFixed(2)}`);
  
  // 4. Process Kinect quality data
  const depthAccuracyData = metrics.kinectQuality.depthAccuracy.map(item => item.value);
  const rgbdAlignmentData = metrics.kinectQuality.rgbdAlignment.map(item => item.value);
  const invalidPixelRateData = metrics.kinectQuality.invalidPixelRate.map(item => item.value);
  
  const kinectStats = {
    depthAccuracy: calculateStats(depthAccuracyData),
    rgbdAlignment: calculateStats(rgbdAlignmentData),
    invalidPixelRate: calculateStats(invalidPixelRateData)
  };
  
  console.log('\n--- Kinect Quality Statistics ---');
  console.log(`Depth Accuracy (cm): Min: ${kinectStats.depthAccuracy.min.toFixed(2)}, Max: ${kinectStats.depthAccuracy.max.toFixed(2)}, Avg: ${kinectStats.depthAccuracy.avg.toFixed(2)}`);
  console.log(`RGBD Alignment (px): Min: ${kinectStats.rgbdAlignment.min.toFixed(2)}, Max: ${kinectStats.rgbdAlignment.max.toFixed(2)}, Avg: ${kinectStats.rgbdAlignment.avg.toFixed(2)}`);
  console.log(`Invalid Pixel Rate (%): Min: ${kinectStats.invalidPixelRate.min.toFixed(2)}, Max: ${kinectStats.invalidPixelRate.max.toFixed(2)}, Avg: ${kinectStats.invalidPixelRate.avg.toFixed(2)}`);
  
  // 5. Process WebRTC connection data
  const iceGatheringTimeData = metrics.webrtcConnection.iceGatheringTime.map(item => item.value);
  const connectionEstablishmentTimeData = metrics.webrtcConnection.connectionEstablishmentTime.map(item => item.value);
  
  const webrtcStats = {
    iceGatheringTime: calculateStats(iceGatheringTimeData),
    connectionEstablishmentTime: calculateStats(connectionEstablishmentTimeData)
  };
  
  console.log('\n--- WebRTC Connection Statistics ---');
  console.log(`ICE Gathering Time (ms): Min: ${webrtcStats.iceGatheringTime.min.toFixed(2)}, Max: ${webrtcStats.iceGatheringTime.max.toFixed(2)}, Avg: ${webrtcStats.iceGatheringTime.avg.toFixed(2)}`);
  console.log(`Connection Time (ms): Min: ${webrtcStats.connectionEstablishmentTime.min.toFixed(2)}, Max: ${webrtcStats.connectionEstablishmentTime.max.toFixed(2)}, Avg: ${webrtcStats.connectionEstablishmentTime.avg.toFixed(2)}`);
  
  // 6. Process stability data
  const frameRateData = metrics.stability.frameRate.map(item => item.value);
  
  const stabilityStats = {
    frameRate: calculateStats(frameRateData),
    exceptionCount: metrics.stability.exceptionCount
  };
  
  console.log('\n--- Stability Statistics ---');
  console.log(`Frame Rate (FPS): Min: ${stabilityStats.frameRate.min.toFixed(2)}, Max: ${stabilityStats.frameRate.max.toFixed(2)}, Avg: ${stabilityStats.frameRate.avg.toFixed(2)}`);
  console.log(`Exception Count: ${stabilityStats.exceptionCount}`);
  
  // Generate and save charts
  console.log('\nGenerating charts...');
  
  // 1. Latency Chart
  const latencyChartBuffer = await generateChartImage(latencyChartConfig);
  fs.writeFileSync(path.join(outputDir, 'latency_chart.png'), latencyChartBuffer);
  console.log(`Saved latency chart to: ${path.join(outputDir, 'latency_chart.png')}`);
  
  // 2. Generate HTML report
  const htmlReport = generateHTMLReport({
    latencyStats,
    resourceStats,
    kinectStats,
    webrtcStats,
    stabilityStats,
    timestamp: new Date().toISOString()
  });
  
  fs.writeFileSync(path.join(outputDir, 'performance_report.html'), htmlReport);
  console.log(`Saved HTML report to: ${path.join(outputDir, 'performance_report.html')}`);
  
  console.log('\nAnalysis complete!');
}

// Generate HTML report
function generateHTMLReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>WebRTC-Kinect Performance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1, h2 { color: #333; }
    .summary { margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
    .chart-image { margin: 20px 0; max-width: 100%; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    tr:nth-child(even) { background-color: #f9f9f9; }
  </style>
</head>
<body>
  <h1>WebRTC-Kinect Performance Report</h1>
  <p>Generated: ${new Date(data.timestamp).toLocaleString()}</p>
  
  <div class="summary">
    <h2>Performance Summary</h2>
    <table>
      <tr>
        <th>Metric</th>
        <th>Min</th>
        <th>Max</th>
        <th>Average</th>
        <th>Median</th>
        <th>Std Dev</th>
      </tr>
      <tr>
        <td>End-to-End Latency (ms)</td>
        <td>${data.latencyStats.total.min.toFixed(2)}</td>
        <td>${data.latencyStats.total.max.toFixed(2)}</td>
        <td>${data.latencyStats.total.avg.toFixed(2)}</td>
        <td>${data.latencyStats.total.median.toFixed(2)}</td>
        <td>${data.latencyStats.total.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Capture Latency (ms)</td>
        <td>${data.latencyStats.capture.min.toFixed(2)}</td>
        <td>${data.latencyStats.capture.max.toFixed(2)}</td>
        <td>${data.latencyStats.capture.avg.toFixed(2)}</td>
        <td>${data.latencyStats.capture.median.toFixed(2)}</td>
        <td>${data.latencyStats.capture.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Processing Latency (ms)</td>
        <td>${data.latencyStats.processing.min.toFixed(2)}</td>
        <td>${data.latencyStats.processing.max.toFixed(2)}</td>
        <td>${data.latencyStats.processing.avg.toFixed(2)}</td>
        <td>${data.latencyStats.processing.median.toFixed(2)}</td>
        <td>${data.latencyStats.processing.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Transmission Latency (ms)</td>
        <td>${data.latencyStats.transmission.min.toFixed(2)}</td>
        <td>${data.latencyStats.transmission.max.toFixed(2)}</td>
        <td>${data.latencyStats.transmission.avg.toFixed(2)}</td>
        <td>${data.latencyStats.transmission.median.toFixed(2)}</td>
        <td>${data.latencyStats.transmission.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Rendering Latency (ms)</td>
        <td>${data.latencyStats.rendering.min.toFixed(2)}</td>
        <td>${data.latencyStats.rendering.max.toFixed(2)}</td>
        <td>${data.latencyStats.rendering.avg.toFixed(2)}</td>
        <td>${data.latencyStats.rendering.median.toFixed(2)}</td>
        <td>${data.latencyStats.rendering.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Frame Rate (FPS)</td>
        <td>${data.stabilityStats.frameRate.min.toFixed(2)}</td>
        <td>${data.stabilityStats.frameRate.max.toFixed(2)}</td>
        <td>${data.stabilityStats.frameRate.avg.toFixed(2)}</td>
        <td>${data.stabilityStats.frameRate.median.toFixed(2)}</td>
        <td>${data.stabilityStats.frameRate.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Depth Accuracy Error (cm)</td>
        <td>${data.kinectStats.depthAccuracy.min.toFixed(2)}</td>
        <td>${data.kinectStats.depthAccuracy.max.toFixed(2)}</td>
        <td>${data.kinectStats.depthAccuracy.avg.toFixed(2)}</td>
        <td>${data.kinectStats.depthAccuracy.median.toFixed(2)}</td>
        <td>${data.kinectStats.depthAccuracy.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>WebRTC Connection Time (ms)</td>
        <td>${data.webrtcStats.connectionEstablishmentTime.min.toFixed(2)}</td>
        <td>${data.webrtcStats.connectionEstablishmentTime.max.toFixed(2)}</td>
        <td>${data.webrtcStats.connectionEstablishmentTime.avg.toFixed(2)}</td>
        <td>${data.webrtcStats.connectionEstablishmentTime.median.toFixed(2)}</td>
        <td>${data.webrtcStats.connectionEstablishmentTime.stdDev.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Exceptions Count</td>
        <td colspan="5">${data.stabilityStats.exceptionCount}</td>
      </tr>
    </table>
  </div>
  
  <h2>End-to-End Latency</h2>
  <img class="chart-image" src="latency_chart.png" alt="Latency Chart">
  
</body>
</html>
  `;
}

// Run the analysis
processData().catch(error => {
  console.error(`Error during analysis: ${error.message}`);
  process.exit(1);
}); 