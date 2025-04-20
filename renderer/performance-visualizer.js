// performance-visualizer.js - Visualizes performance data collected by the telemetry module

// Load required libraries (assumed to be installed in the Electron app)
// Chart.js is used for visualization
// If not available, please install with: npm install chart.js

class PerformanceVisualizer {
  constructor() {
    this.charts = {};
    this.initialized = false;
    this.chartInstances = {};
  }
  
  // Initialize the visualizer with appropriate DOM elements
  initialize() {
    if (this.initialized) return;
    
    // Get existing container for charts
    let chartsContainer = document.getElementById('performance-charts');
    if (!chartsContainer) {
      console.error('[Visualizer] Cannot find performance-charts container');
      return;
    }
    
    // Create chart containers for each metric category
    this.createChartContainer('latency-chart', 'End-to-End Latency (ms)', chartsContainer);
    this.createChartContainer('resources-chart', 'System Resources', chartsContainer);
    // this.createChartContainer('kinect-quality-chart', 'Kinect Depth Data Quality', chartsContainer);
    this.createChartContainer('webrtc-connection-chart', 'WebRTC Connection Performance', chartsContainer);
    this.createChartContainer('stability-chart', 'Long-term Stability', chartsContainer);
    this.createChartContainer('network-chart', 'Network Transfer Speed', chartsContainer);
    
    // Log metrics availability for debugging
    const metrics = window.telemetry.getAllMetrics();
    console.log('[Visualizer] Available metrics:', Object.keys(metrics));
    console.log('[Visualizer] Latency data points:', 
      metrics.latency.total.length, 
      metrics.latency.capture.length,
      metrics.latency.processing.length,
      metrics.latency.rendering.length
    );
    console.log('[Visualizer] WebRTC data points:', 
      metrics.webrtcConnection.connectionEstablishmentTime.length,
      metrics.webrtcConnection.iceGatheringTime.length
    );
    
    this.initialized = true;
    console.log('[Visualizer] Performance visualizer initialized');
  }
  
  // Create a container for a chart
  createChartContainer(id, title, parent) {
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.style.width = '45%'; // 改为百分比宽度，适应灵活布局
    container.style.minWidth = '500px';
    container.style.maxWidth = '800px';
    container.style.backgroundColor = 'rgba(30, 30, 30, 0.8)';
    container.style.borderRadius = '8px';
    container.style.padding = '15px';
    container.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    
    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    titleElement.style.color = '#fff';
    titleElement.style.marginBottom = '15px';
    container.appendChild(titleElement);
    
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.width = 800;
    canvas.height = 350;
    container.appendChild(canvas);
    
    // 找到内部的flex容器并附加到其中
    const flexContainer = parent.querySelector('div');
    if (flexContainer) {
      flexContainer.appendChild(container);
    } else {
      parent.appendChild(container);
    }
  }
  
  // Show the performance dashboard
  show() {
    if (!this.initialized) {
      this.initialize();
    }
    
    const container = document.getElementById('performance-charts');
    if (container) {
      container.style.display = 'block';
      console.log('[Visualizer] Showing performance dashboard');
      
      // Create or update all charts
      this.updateCharts();
      
      // 添加调试日志，检查各图表是否正常创建
      setTimeout(() => {
        if (this.chartInstances) {
          console.log('[Visualizer] Created chart instances:', Object.keys(this.chartInstances));
          for (const key in this.chartInstances) {
            console.log(`[Visualizer] Chart ${key} data points:`, 
              this.chartInstances[key].data.datasets.map(ds => ({
                label: ds.label,
                dataPoints: ds.data.length
              }))
            );
          }
        }
      }, 500);
    } else {
      console.error('[Visualizer] Cannot find performance-charts container');
    }
  }
  
  // Hide the performance dashboard
  hide() {
    const container = document.getElementById('performance-charts');
    if (container) {
      container.style.display = 'none';
    }
  }
  
  // Update all charts with current data
  updateCharts() {
    if (!this.initialized) {
      this.initialize();
    }
    
    this.updateLatencyChart();
    this.updateResourcesChart();
    this.updateKinectQualityChart();
    this.updateWebRTCConnectionChart();
    this.updateStabilityChart();
    this.updateNetworkChart();
  }
  
  // Update the latency chart
  updateLatencyChart() {
    const canvas = document.getElementById('latency-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const metrics = window.telemetry.getAllMetrics();
    
    // Prepare data for chart
    const captureData = this.prepareTimeSeriesData(metrics.latency.capture);
    const processingData = this.prepareTimeSeriesData(metrics.latency.processing);
    const transmissionData = this.prepareTimeSeriesData(metrics.latency.transmission);
    const renderingData = this.prepareTimeSeriesData(metrics.latency.rendering);
    const totalData = this.prepareTimeSeriesData(metrics.latency.total);
    
    // If chart already exists, update it
    if (this.chartInstances.latency) {
      this.chartInstances.latency.data.labels = captureData.labels;
      this.chartInstances.latency.data.datasets[0].data = captureData.values;
      this.chartInstances.latency.data.datasets[1].data = processingData.values;
      this.chartInstances.latency.data.datasets[2].data = transmissionData.values;
      this.chartInstances.latency.data.datasets[3].data = renderingData.values;
      this.chartInstances.latency.data.datasets[4].data = totalData.values;
      this.chartInstances.latency.update();
      return;
    }
    
    // Create new chart
    this.chartInstances.latency = new Chart(ctx, {
      type: 'line',
      data: {
        labels: captureData.labels,
        datasets: [
          {
            label: 'Capture Latency',
            data: captureData.values,
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 1,
            fill: true
          },
          {
            label: 'Processing Latency',
            data: processingData.values,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 1,
            fill: true
          },
          {
            label: 'Transmission Latency',
            data: transmissionData.values,
            borderColor: 'rgba(255, 206, 86, 1)',
            backgroundColor: 'rgba(255, 206, 86, 0.2)',
            borderWidth: 1,
            fill: true
          },
          {
            label: 'Rendering Latency',
            data: renderingData.values,
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderWidth: 1,
            fill: true
          },
          {
            label: 'Total End-to-End Latency',
            data: totalData.values,
            borderColor: 'rgba(153, 102, 255, 1)',
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            borderWidth: 2,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time'
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
    });
  }
  
  // Update the resources chart
  updateResourcesChart() {
    const canvas = document.getElementById('resources-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const metrics = window.telemetry.getAllMetrics();
    
    // Prepare data for chart
    const cpuData = this.prepareTimeSeriesData(metrics.resources.cpu);
    const memoryData = this.prepareTimeSeriesData(metrics.resources.memory);
    
    // If chart already exists, update it
    if (this.chartInstances.resources) {
      this.chartInstances.resources.data.labels = cpuData.labels;
      this.chartInstances.resources.data.datasets[0].data = cpuData.values;
      this.chartInstances.resources.data.datasets[1].data = memoryData.values;
      this.chartInstances.resources.update();
      return;
    }
    
    // Create new chart
    this.chartInstances.resources = new Chart(ctx, {
      type: 'line',
      data: {
        labels: cpuData.labels,
        datasets: [
          {
            label: 'CPU Usage',
            data: cpuData.values,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 1,
            yAxisID: 'cpu'
          },
          {
            label: 'Memory Usage (MB)',
            data: memoryData.values,
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 1,
            yAxisID: 'memory'
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time'
            }
          },
          cpu: {
            position: 'left',
            title: {
              display: true,
              text: 'CPU Usage'
            }
          },
          memory: {
            position: 'right',
            title: {
              display: true,
              text: 'Memory (MB)'
            }
          }
        }
      }
    });
  }
  
  // Update Kinect quality chart
  updateKinectQualityChart() {
    const canvas = document.getElementById('kinect-quality-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const metrics = window.telemetry.getAllMetrics();
    
    // Prepare data for chart
    const depthAccuracyData = this.prepareTimeSeriesData(metrics.kinectQuality.depthAccuracy);
    const rgbdAlignmentData = this.prepareTimeSeriesData(metrics.kinectQuality.rgbdAlignment);
    const invalidPixelRateData = this.prepareTimeSeriesData(metrics.kinectQuality.invalidPixelRate);
    
    // If chart already exists, update it
    if (this.chartInstances.kinectQuality) {
      this.chartInstances.kinectQuality.data.labels = depthAccuracyData.labels;
      this.chartInstances.kinectQuality.data.datasets[0].data = depthAccuracyData.values;
      this.chartInstances.kinectQuality.data.datasets[1].data = rgbdAlignmentData.values;
      this.chartInstances.kinectQuality.data.datasets[2].data = invalidPixelRateData.values;
      this.chartInstances.kinectQuality.update();
      return;
    }
    
    // Create new chart
    this.chartInstances.kinectQuality = new Chart(ctx, {
      type: 'line',
      data: {
        labels: depthAccuracyData.labels,
        datasets: [
          {
            label: 'Depth Accuracy Error (cm)',
            data: depthAccuracyData.values,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 1,
            yAxisID: 'error'
          },
          {
            label: 'RGB-D Alignment Error (pixels)',
            data: rgbdAlignmentData.values,
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 1,
            yAxisID: 'error'
          },
          {
            label: 'Invalid Pixel Rate (%)',
            data: invalidPixelRateData.values,
            borderColor: 'rgba(255, 206, 86, 1)',
            backgroundColor: 'rgba(255, 206, 86, 0.2)',
            borderWidth: 1,
            yAxisID: 'percentage'
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time'
            }
          },
          error: {
            position: 'left',
            title: {
              display: true,
              text: 'Error Magnitude'
            }
          },
          percentage: {
            position: 'right',
            title: {
              display: true,
              text: 'Percentage (%)'
            },
            min: 0,
            max: 100
          }
        }
      }
    });
  }
  
  // Update WebRTC connection chart
  updateWebRTCConnectionChart() {
    const canvas = document.getElementById('webrtc-connection-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Get metrics
    const metrics = window.telemetry.getAllMetrics();
    const iceGatheringTime = this.getLatestValue(metrics.webrtcConnection.iceGatheringTime);
    const connectionEstablishmentTime = this.getLatestValue(metrics.webrtcConnection.connectionEstablishmentTime);
    const candidateCount = this.getLatestValue(metrics.webrtcConnection.candidateCount);
    const totalConnectionTime = iceGatheringTime + connectionEstablishmentTime;
    
    // Clear existing chart if any
    if (this.chartInstances.webrtcConnection) {
      this.chartInstances.webrtcConnection.destroy();
    }
    
    // Create timeline visualization directly on the canvas
    this.chartInstances.webrtcConnection = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Connection Timeline'],
        datasets: [
          {
            label: 'ICE Gathering',
            data: [iceGatheringTime],
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          },
          {
            label: 'Connection Establishment',
            data: [connectionEstablishmentTime],
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        indexAxis: 'y',  // Horizontal bar chart
        scales: {
          x: {
            stacked: true,
            title: {
              display: true,
              text: 'Time (ms)'
            }
          },
          y: {
            stacked: true
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              afterFooter: function(tooltipItems) {
                return `Total Connection Time: ${totalConnectionTime}ms`;
              }
            }
          },
          annotation: {
            annotations: {
              candidateCountLabel: {
                type: 'label',
                xValue: totalConnectionTime,
                yValue: 0,
                backgroundColor: 'rgba(255, 206, 86, 0.6)',
                content: [`ICE Candidates: ${candidateCount}`],
                padding: 6
              }
            }
          }
        }
      }
    });
    
    // After rendering chart, add metadata text below the chart
    const container = canvas.parentNode;
    if (container) {
      // Check if metadata container already exists
      let metadataContainer = container.querySelector('.webrtc-metadata');
      if (!metadataContainer) {
        metadataContainer = document.createElement('div');
        metadataContainer.className = 'webrtc-metadata';
        metadataContainer.style.marginTop = '10px';
        metadataContainer.style.textAlign = 'center';
        container.appendChild(metadataContainer);
      }
      
      metadataContainer.innerHTML = `
        <div style="margin-bottom:5px; color:#fff;">
          <span style="color:rgba(255, 99, 132, 1); font-weight:bold;">ICE Gathering:</span> ${iceGatheringTime}ms | 
          <span style="color:rgba(54, 162, 235, 1); font-weight:bold;">Connection:</span> ${connectionEstablishmentTime}ms | 
          <span style="color:rgba(255, 206, 86, 1); font-weight:bold;">Total:</span> ${totalConnectionTime}ms | 
          <span style="color:rgba(75, 192, 192, 1); font-weight:bold;">Candidates:</span> ${candidateCount}
        </div>`;
    }
  }
  
  // Helper method to get latest value from a metrics array
  getLatestValue(metricsArray) {
    if (!metricsArray || metricsArray.length === 0) return 0;
    return metricsArray[metricsArray.length - 1].value;
  }
  
  // Helper method to create a metric card
  createMetricCard(title, value, color) {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.style.backgroundColor = 'white';
    card.style.border = `1px solid ${color}`;
    card.style.borderRadius = '4px';
    card.style.padding = '10px';
    card.style.margin = '5px';
    card.style.minWidth = '120px';
    card.style.textAlign = 'center';
    
    const titleElem = document.createElement('div');
    titleElem.textContent = title;
    titleElem.style.fontSize = '12px';
    titleElem.style.color = '#666';
    titleElem.style.marginBottom = '5px';
    
    const valueElem = document.createElement('div');
    valueElem.textContent = value;
    valueElem.style.fontSize = '18px';
    valueElem.style.fontWeight = 'bold';
    valueElem.style.color = color;
    
    card.appendChild(titleElem);
    card.appendChild(valueElem);
    
    return card;
  }
  
  // Update stability chart
  updateStabilityChart() {
    const canvas = document.getElementById('stability-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const metrics = window.telemetry.getAllMetrics();
    
    // Prepare data for chart
    const frameRateData = this.prepareTimeSeriesData(metrics.stability.frameRate);
    // 暂时不使用内存增长数据
    // const memoryGrowthData = this.prepareTimeSeriesData(metrics.stability.memoryGrowth);
    
    // If chart already exists, update it
    if (this.chartInstances.stability) {
      this.chartInstances.stability.data.labels = frameRateData.labels;
      this.chartInstances.stability.data.datasets[0].data = frameRateData.values;
      // 暂时隐藏内存增长数据
      // this.chartInstances.stability.data.datasets[1].data = memoryGrowthData.values;
      this.chartInstances.stability.update();
      return;
    }
    
    // Create new chart
    this.chartInstances.stability = new Chart(ctx, {
      type: 'line',
      data: {
        labels: frameRateData.labels,
        datasets: [
          {
            label: 'Frame Rate (FPS)',
            data: frameRateData.values,
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 1,
            yAxisID: 'framerate'
          }
          // 暂时注释掉内存增长数据集
          /*
          {
            label: 'Memory Growth (%)',
            data: memoryGrowthData.values,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 1,
            yAxisID: 'percentage'
          }
          */
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time'
            }
          },
          framerate: {
            position: 'left',
            title: {
              display: true,
              text: 'Frame Rate (FPS)'
            },
            beginAtZero: true
          }
          // 暂时注释掉内存增长轴
          /*
          percentage: {
            position: 'right',
            title: {
              display: true,
              text: 'Memory Growth (%)'
            }
          }
          */
        }
      }
    });
  }
  
  // Helper function to prepare time series data for charts
  prepareTimeSeriesData(dataPoints) {
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
  
  // Export charts as images
  exportChartAsImage(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return null;
    
    return canvas.toDataURL('image/png');
  }
  
  // Export all charts
  exportAllCharts() {
    return {
      latency: this.exportChartAsImage('latency-chart'),
      resources: this.exportChartAsImage('resources-chart'),
      kinectQuality: this.exportChartAsImage('kinect-quality-chart'),
      webrtcConnection: this.exportChartAsImage('webrtc-connection-chart'),
      stability: this.exportChartAsImage('stability-chart'),
      network: this.exportChartAsImage('network-chart')
    };
  }
  
  // Create a standalone HTML report
  generateHTMLReport() {
    const metrics = window.telemetry.getAllMetrics();
    
    // Generate summary statistics
    const latencySummary = this.calculateSummaryStatistics(metrics.latency.total);
    const frameRateSummary = this.calculateSummaryStatistics(metrics.stability.frameRate);
    const depthAccuracySummary = this.calculateSummaryStatistics(metrics.kinectQuality.depthAccuracy);
    
    // Create HTML content
    let html = `
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
      <p>Generated: ${new Date().toLocaleString()}</p>
      
      <div class="summary">
        <h2>Performance Summary</h2>
        <table>
          <tr>
            <th>Metric</th>
            <th>Min</th>
            <th>Max</th>
            <th>Average</th>
            <th>Std Dev</th>
          </tr>
          <tr>
            <td>End-to-End Latency (ms)</td>
            <td>${latencySummary.min.toFixed(2)}</td>
            <td>${latencySummary.max.toFixed(2)}</td>
            <td>${latencySummary.mean.toFixed(2)}</td>
            <td>${latencySummary.stdDev.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Frame Rate (FPS)</td>
            <td>${frameRateSummary.min.toFixed(2)}</td>
            <td>${frameRateSummary.max.toFixed(2)}</td>
            <td>${frameRateSummary.mean.toFixed(2)}</td>
            <td>${frameRateSummary.stdDev.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Depth Accuracy Error (cm)</td>
            <td>${depthAccuracySummary.min.toFixed(2)}</td>
            <td>${depthAccuracySummary.max.toFixed(2)}</td>
            <td>${depthAccuracySummary.mean.toFixed(2)}</td>
            <td>${depthAccuracySummary.stdDev.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Exceptions Count</td>
            <td colspan="4">${metrics.stability.exceptionCount}</td>
          </tr>
        </table>
      </div>
    `;
    
    // Add charts
    const charts = this.exportAllCharts();
    
    if (charts.latency) {
      html += `
        <h2>End-to-End Latency</h2>
        <img class="chart-image" src="${charts.latency}" alt="Latency Chart">
      `;
    }
    
    if (charts.resources) {
      html += `
        <h2>System Resources</h2>
        <img class="chart-image" src="${charts.resources}" alt="Resources Chart">
      `;
    }
    
    if (charts.kinectQuality) {
      html += `
        <h2>Kinect Data Quality</h2>
        <img class="chart-image" src="${charts.kinectQuality}" alt="Kinect Quality Chart">
      `;
    }
    
    if (charts.webrtcConnection) {
      html += `
        <h2>WebRTC Connection Performance</h2>
        <img class="chart-image" src="${charts.webrtcConnection}" alt="WebRTC Connection Chart">
      `;
    }
    
    if (charts.stability) {
      html += `
        <h2>Long-term Stability</h2>
        <img class="chart-image" src="${charts.stability}" alt="Stability Chart">
      `;
    }
    
    if (charts.network) {
      html += `
        <h2>Network Transfer Speed</h2>
        <img class="chart-image" src="${charts.network}" alt="Network Chart">
      `;
    }
    
    html += `
    </body>
    </html>
    `;
    
    return html;
  }
  
  // Calculate summary statistics for a dataset
  calculateSummaryStatistics(dataPoints) {
    if (!dataPoints || dataPoints.length === 0) {
      return { min: 0, max: 0, mean: 0, stdDev: 0 };
    }
    
    const values = dataPoints.map(point => point.value);
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Calculate mean (average)
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    
    // Calculate standard deviation
    const squareDiffs = values.map(value => {
      const diff = value - mean;
      return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((acc, val) => acc + val, 0) / squareDiffs.length;
    const stdDev = Math.sqrt(avgSquareDiff);
    
    return { min, max, mean, stdDev };
  }
  
  // Save HTML report to file
  saveHTMLReport(filename = 'performance_report_' + new Date().toISOString().replace(/[:.]/g, '-') + '.html') {
    const html = this.generateHTMLReport();
    
    try {
      // 简化保存逻辑，避免使用 Electron remote API
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`[Visualizer] Report ready for download as ${filename}`);
      return filename;
    } catch (error) {
      console.error('[Visualizer] Error saving report:', error);
      return null;
    }
  }

  // Update network chart
  updateNetworkChart() {
    const canvas = document.getElementById('network-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const metrics = window.telemetry.getAllMetrics();
    
    // Prepare data for chart
    let uploadData = this.prepareTimeSeriesData(metrics.network.uploadSpeed);
    let downloadData = this.prepareTimeSeriesData(metrics.network.downloadSpeed);
    
    // 如果数据点过多，进行采样处理，只保留最新的30个点
    const MAX_DATA_POINTS = 30;
    if (uploadData.values.length > MAX_DATA_POINTS) {
      const startIndex = uploadData.values.length - MAX_DATA_POINTS;
      uploadData = {
        labels: uploadData.labels.slice(startIndex),
        values: uploadData.values.slice(startIndex)
      };
      downloadData = {
        labels: downloadData.labels.slice(startIndex),
        values: downloadData.values.slice(startIndex)
      };
    }
    
    // If chart already exists, update it
    if (this.chartInstances.network) {
      this.chartInstances.network.data.labels = uploadData.labels;
      this.chartInstances.network.data.datasets[0].data = uploadData.values;
      this.chartInstances.network.data.datasets[1].data = downloadData.values;
      this.chartInstances.network.update();
      return;
    }
    
    // Helper function to convert bytes to appropriate unit
    const formatBytesAxis = (value) => {
      if (value === 0) return '0 B/s';
      const k = 1024;
      const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
      const i = Math.floor(Math.log(value) / Math.log(k));
      return parseFloat((value / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // Create new chart
    this.chartInstances.network = new Chart(ctx, {
      type: 'line',
      data: {
        labels: uploadData.labels,
        datasets: [
          {
            label: 'Upload Speed',
            data: uploadData.values,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 1,
            fill: true
          },
          {
            label: 'Download Speed',
            data: downloadData.values,
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 1,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Transfer Speed'
            },
            ticks: {
              callback: function(value) {
                return formatBytesAxis(value);
              }
            }
          }
        },
        tooltips: {
          callbacks: {
            label: function(tooltipItem, data) {
              return formatBytesAxis(tooltipItem.value);
            }
          }
        }
      }
    });
  }
}

// Create singleton instance
const visualizer = new PerformanceVisualizer();

// Make it available globally when loaded as a script
window.visualizer = visualizer;

// For module.exports (when using require)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { visualizer };
} 