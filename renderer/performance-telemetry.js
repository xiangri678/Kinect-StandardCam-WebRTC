// performance-telemetry.js - Performance monitoring module for WebRTC-Kinect system

class PerformanceTelemetry {
  constructor() {
    this.metrics = {
      // End-to-end latency components
      latency: {
        capture: [],
        processing: [],
        transmission: [],
        rendering: [],
        total: []
      },
      
      // System resource usage
      resources: {
        cpu: [],
        gpu: [],
        memory: [],
        threadPool: []
      },
      
      // Kinect depth data quality
      kinectQuality: {
        depthAccuracy: [],
        rgbdAlignment: [],
        invalidPixelRate: []
      },
      
      // WebRTC connection performance
      webrtcConnection: {
        iceGatheringTime: [],
        connectionEstablishmentTime: [],
        reconnectionTime: [],
        candidateCount: []
      },
      
      // Long-term stability metrics
      stability: {
        frameRate: [],
        memoryGrowth: [],
        pointCloudQuality: [],
        exceptionCount: 0
      },
      
      // Network transfer metrics
      network: {
        uploadSpeed: [],
        downloadSpeed: [],
        totalBytesSent: [],
        totalBytesReceived: []
      }
    };
    
    this.timestamps = {
      sessionStart: 0,
      captureStart: 0,
      processingStart: 0,
      transmissionStart: 0,
      renderingStart: 0
    };
    
    this.sampleInterval = 1000; // Default: collect data every 1 second
    this.collectingEnabled = false;
    this.intervalId = null;
    this.logEnabled = false;
    
    // 添加延迟数据记录的时间控制
    this.lastLatencyRecordTime = 0;
    this.latencyRecordInterval = 2000; // 每2秒记录一次延迟数据
    
    // File storage
    this.storageEnabled = false;
    this.dataBuffer = [];
    this.maxBufferSize = 1000; // Flush to file after this many samples
    this.outputFilePath = '';
    
    // Bind methods
    this.startCaptureTiming = this.startCaptureTiming.bind(this);
    this.startProcessingTiming = this.startProcessingTiming.bind(this);
    this.startTransmissionTiming = this.startTransmissionTiming.bind(this);
    this.startRenderingTiming = this.startRenderingTiming.bind(this);
    this.endRenderingTiming = this.endRenderingTiming.bind(this);

    // 添加一些测试数据，确保图表正常工作
    // this.addSampleData();
  }
  
  // Start collecting metrics at specified interval
  startCollection(interval = 1000) {
    if (this.collectingEnabled) return;
    
    this.sampleInterval = interval;
    this.collectingEnabled = true;
    this.timestamps.sessionStart = performance.now();
    
    // Start periodic resource collection
    this.intervalId = setInterval(() => {
      this.collectResourceMetrics();
    }, this.sampleInterval);
    
    console.log(`[Telemetry] Started performance data collection (interval: ${interval}ms)`);
  }
  
  // Stop metrics collection
  stopCollection() {
    if (!this.collectingEnabled) return;
    
    clearInterval(this.intervalId);
    this.collectingEnabled = false;
    console.log('[Telemetry] Stopped performance data collection');
    
    // If storage is enabled, flush any remaining data
    if (this.storageEnabled) {
      this.flushDataToStorage();
    }
  }
  
  // Enable console logging of metrics
  enableLogging(enabled = true) {
    this.logEnabled = enabled;
  }
  
  // Enable file storage of metrics
  enableStorage(enabled = true, filePath = '') {
    this.storageEnabled = enabled;
    if (filePath) {
      this.outputFilePath = filePath;
    } else {
      // Generate default filename with timestamp
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
      this.outputFilePath = `performance_data_${timestamp}.json`;
    }
  }
  
  // ===========================================
  // Latency Measurement Methods
  // ===========================================
  
  // Start timing the capture phase
  startCaptureTiming() {
    this.timestamps.captureStart = performance.now();
  }
  
  // Start timing the processing phase (and end capture phase)
  startProcessingTiming() {
    const now = performance.now();
    const captureTime = now - this.timestamps.captureStart;
    
    if (this.collectingEnabled && this.timestamps.captureStart > 0) {
      // 检查是否达到记录间隔时间
      const shouldRecord = (now - this.lastLatencyRecordTime) >= this.latencyRecordInterval;
      
      if (shouldRecord) {
        this.metrics.latency.capture.push({
          timestamp: now,
          value: captureTime
        });
        
        if (this.logEnabled) {
          console.log(`[Telemetry] Capture latency: ${captureTime.toFixed(2)}ms`);
        }
      }
    }
    
    this.timestamps.processingStart = now;
  }
  
  // Start timing the transmission phase (and end processing phase)
  startTransmissionTiming() {
    const now = performance.now();
    const processingTime = now - this.timestamps.processingStart;
    
    if (this.collectingEnabled && this.timestamps.processingStart > 0) {
      // 检查是否达到记录间隔时间
      const shouldRecord = (now - this.lastLatencyRecordTime) >= this.latencyRecordInterval;
      
      if (shouldRecord) {
        this.metrics.latency.processing.push({
          timestamp: now,
          value: processingTime
        });
        
        if (this.logEnabled) {
          console.log(`[Telemetry] Processing latency: ${processingTime.toFixed(2)}ms`);
        }
      }
    }
    
    this.timestamps.transmissionStart = now;
  }
  
  // Start timing the rendering phase (and end transmission phase)
  startRenderingTiming() {
    const now = performance.now();
    const transmissionTime = now - this.timestamps.transmissionStart;
    
    if (this.collectingEnabled && this.timestamps.transmissionStart > 0) {
      // 检查是否达到记录间隔时间
      const shouldRecord = (now - this.lastLatencyRecordTime) >= this.latencyRecordInterval;
      
      if (shouldRecord) {
        this.metrics.latency.transmission.push({
          timestamp: now,
          value: transmissionTime
        });
        
        if (this.logEnabled) {
          console.log(`[Telemetry] Transmission latency: ${transmissionTime.toFixed(2)}ms`);
        }
      }
    }
    
    this.timestamps.renderingStart = now;
  }
  
  // End timing the rendering phase and record complete end-to-end latency
  endRenderingTiming() {
    const now = performance.now();
    const renderingTime = now - this.timestamps.renderingStart;
    const totalTime = now - this.timestamps.captureStart;
    
    if (this.collectingEnabled && this.timestamps.renderingStart > 0) {
      // 检查是否达到记录间隔时间
      const shouldRecord = (now - this.lastLatencyRecordTime) >= this.latencyRecordInterval;
      
      if (shouldRecord) {
        this.metrics.latency.rendering.push({
          timestamp: now,
          value: renderingTime
        });
        
        this.metrics.latency.total.push({
          timestamp: now,
          value: totalTime
        });
        
        // 更新最后记录时间
        this.lastLatencyRecordTime = now;
        
        if (this.logEnabled) {
          console.log(`[Telemetry] Rendering latency: ${renderingTime.toFixed(2)}ms`);
          console.log(`[Telemetry] Total end-to-end latency: ${totalTime.toFixed(2)}ms`);
        }
      }
    }
    
    // If storage is enabled and buffer is getting large, flush it
    if (this.storageEnabled && this.dataBuffer.length >= this.maxBufferSize) {
      this.flushDataToStorage();
    }
  }
  
  // ===========================================
  // Resource Monitoring Methods
  // ===========================================
  
  // Collect system resource metrics (CPU, GPU, memory)
  async collectResourceMetrics() {
    if (!this.collectingEnabled) return;
    
    const now = performance.now();
    const timestamp = now;
    
    try {
      // CPU usage (using performance.now as a proxy since direct CPU % isn't available in browser)
      const cpuStartTime = performance.now();
      const work = this.doCPUWork(); // Do some synthetic work
      const cpuEndTime = performance.now();
      const cpuTime = cpuEndTime - cpuStartTime;
      
      // Memory usage
      const memoryInfo = window.performance && window.performance.memory 
        ? window.performance.memory
        : { usedJSHeapSize: 0, totalJSHeapSize: 0 };
      
      // Store metrics
      this.metrics.resources.cpu.push({
        timestamp,
        value: cpuTime // This is just a relative indicator
      });
      
      this.metrics.resources.memory.push({
        timestamp,
        value: memoryInfo.usedJSHeapSize / (1024 * 1024), // Convert to MB
        total: memoryInfo.totalJSHeapSize / (1024 * 1024)
      });
      
      // For GPU and thread pool, we would need additional instrumentation
      // that's not directly available in the browser
      
      if (this.logEnabled) {
        console.log(`[Telemetry] Memory usage: ${(memoryInfo.usedJSHeapSize / (1024 * 1024)).toFixed(2)}MB / ${(memoryInfo.totalJSHeapSize / (1024 * 1024)).toFixed(2)}MB`);
      }
    } catch (error) {
      console.error('[Telemetry] Error collecting resource metrics:', error);
    }
  }
  
  // Synthetic work to measure relative CPU performance
  doCPUWork() {
    let result = 0;
    for (let i = 0; i < 100000; i++) {
      result += Math.sin(i) * Math.cos(i);
    }
    return result;
  }
  
  // ===========================================
  // WebRTC Connection Performance Methods
  // ===========================================
  
  // Record ICE gathering time
  recordIceGatheringTime(timeMs) {
    if (!this.collectingEnabled) return;
    
    this.metrics.webrtcConnection.iceGatheringTime.push({
      timestamp: performance.now(),
      value: timeMs
    });
    
    if (this.logEnabled) {
      console.log(`[Telemetry] ICE gathering time: ${timeMs.toFixed(2)}ms`);
    }
  }
  
  // Record connection establishment time
  recordConnectionEstablishmentTime(timeMs) {
    if (!this.collectingEnabled) return;
    
    this.metrics.webrtcConnection.connectionEstablishmentTime.push({
      timestamp: performance.now(),
      value: timeMs
    });
    
    if (this.logEnabled) {
      console.log(`[Telemetry] Connection establishment time: ${timeMs.toFixed(2)}ms`);
    }
  }
  
  // Record ICE candidate count
  recordIceCandidateCount(count) {
    if (!this.collectingEnabled) return;
    
    this.metrics.webrtcConnection.candidateCount.push({
      timestamp: performance.now(),
      value: count
    });
  }
  
  // ===========================================
  // Kinect Quality Metrics Methods
  // ===========================================
  
  // Record depth accuracy (measured error in cm)
  recordDepthAccuracy(errorCm, distance) {
    if (!this.collectingEnabled) return;
    
    this.metrics.kinectQuality.depthAccuracy.push({
      timestamp: performance.now(),
      value: errorCm,
      distance: distance
    });
  }
  
  // Record RGB-D alignment error (in pixels)
  recordRgbdAlignment(errorPixels) {
    if (!this.collectingEnabled) return;
    
    this.metrics.kinectQuality.rgbdAlignment.push({
      timestamp: performance.now(),
      value: errorPixels
    });
  }
  
  // Record invalid pixel rate (percentage)
  recordInvalidPixelRate(percentage) {
    if (!this.collectingEnabled) return;
    
    this.metrics.kinectQuality.invalidPixelRate.push({
      timestamp: performance.now(),
      value: percentage
    });
  }
  
  // ===========================================
  // Stability Metrics Methods
  // ===========================================
  
  // Record current frame rate
  recordFrameRate(fps) {
    if (!this.collectingEnabled) return;
    
    // 确保FPS值不为负数
    const validFps = Math.max(0, fps);
    
    this.metrics.stability.frameRate.push({
      timestamp: performance.now(),
      value: validFps
    });
  }
  
  // Record memory growth rate
  recordMemoryGrowth(growthPercentage) {
    if (!this.collectingEnabled) return;
    
    this.metrics.stability.memoryGrowth.push({
      timestamp: performance.now(),
      value: growthPercentage
    });
  }
  
  // Increment exception counter
  recordException() {
    if (!this.collectingEnabled) return;
    
    this.metrics.stability.exceptionCount++;
  }
  
  // ===========================================
  // Network Transfer Metrics Methods
  // ===========================================
  
  // Record upload speed (bytes/sec)
  recordUploadSpeed(bytesPerSecond) {
    if (!this.collectingEnabled) return;
    
    this.metrics.network.uploadSpeed.push({
      timestamp: performance.now(),
      value: bytesPerSecond
    });
    
    if (this.logEnabled) {
      console.log(`[Telemetry] Upload speed: ${this.formatBytes(bytesPerSecond)}/s`);
    }
  }
  
  // Record download speed (bytes/sec)
  recordDownloadSpeed(bytesPerSecond) {
    if (!this.collectingEnabled) return;
    
    this.metrics.network.downloadSpeed.push({
      timestamp: performance.now(),
      value: bytesPerSecond
    });
    
    if (this.logEnabled) {
      console.log(`[Telemetry] Download speed: ${this.formatBytes(bytesPerSecond)}/s`);
    }
  }
  
  // Record total bytes sent
  recordTotalBytesSent(bytes) {
    if (!this.collectingEnabled) return;
    
    this.metrics.network.totalBytesSent.push({
      timestamp: performance.now(),
      value: bytes
    });
  }
  
  // Record total bytes received
  recordTotalBytesReceived(bytes) {
    if (!this.collectingEnabled) return;
    
    this.metrics.network.totalBytesReceived.push({
      timestamp: performance.now(),
      value: bytes
    });
  }
  
  // Format bytes to human readable format
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  }
  
  // ===========================================
  // Data Storage Methods
  // ===========================================
  
  // Store current metrics to buffer
  addCurrentMetricsToBuffer() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      metrics: JSON.parse(JSON.stringify(this.metrics))
    };
    
    this.dataBuffer.push(snapshot);
  }
  
  // Write data buffer to file
  flushDataToStorage() {
    if (!this.storageEnabled || this.dataBuffer.length === 0) return;
    
    try {
      // For Electron apps, we need to use Node.js fs module
      // This requires electron remote module or IPC to be properly set up
      // For this implementation, we'll use localStorage as a fallback
      
      // Try to use electron fs if available
      if (window.require && window.require('fs')) {
        const fs = window.require('fs');
        const path = window.require('path');
        const userDataPath = window.require('electron').remote.app.getPath('userData');
        const filePath = path.join(userDataPath, this.outputFilePath);
        
        // Read existing data if file exists
        let existingData = [];
        try {
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            existingData = JSON.parse(fileContent);
          }
        } catch (readError) {
          console.error('[Telemetry] Error reading existing data file:', readError);
          existingData = [];
        }
        
        // Combine existing data with new data
        const combinedData = existingData.concat(this.dataBuffer);
        
        // Write to file
        fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2), 'utf8');
        console.log(`[Telemetry] Flushed ${this.dataBuffer.length} data points to ${filePath}`);
      } else {
        // Fallback to localStorage
        const storageKey = `perf_telemetry_${this.outputFilePath}`;
        let existingData = [];
        
        try {
          const storedData = localStorage.getItem(storageKey);
          if (storedData) {
            existingData = JSON.parse(storedData);
          }
        } catch (storageError) {
          console.error('[Telemetry] Error reading from localStorage:', storageError);
          existingData = [];
        }
        
        // Combine and store
        const combinedData = existingData.concat(this.dataBuffer);
        localStorage.setItem(storageKey, JSON.stringify(combinedData));
        console.log(`[Telemetry] Flushed ${this.dataBuffer.length} data points to localStorage (${storageKey})`);
      }
      
      // Clear buffer after successful write
      this.dataBuffer = [];
    } catch (error) {
      console.error('[Telemetry] Error flushing data to storage:', error);
    }
  }
  
  // Export all collected metrics to JSON
  exportMetricsToJson() {
    return JSON.stringify(this.metrics, null, 2);
  }
  
  // Get all metrics data
  getAllMetrics() {
    return this.metrics;
  }

  // 添加示例数据的方法
  addSampleData() {
    const now = performance.now();
    
    // 添加延迟数据示例
    for (let i = 0; i < 10; i++) {
      const timestamp = now - (10-i) * 1000; // 每秒一个数据点
      
      this.metrics.latency.capture.push({
        timestamp,
        value: 20 + Math.random() * 10
      });
      
      this.metrics.latency.processing.push({
        timestamp,
        value: 30 + Math.random() * 15
      });
      
      this.metrics.latency.transmission.push({
        timestamp,
        value: 50 + Math.random() * 20
      });
      
      this.metrics.latency.rendering.push({
        timestamp,
        value: 25 + Math.random() * 10
      });
      
      this.metrics.latency.total.push({
        timestamp,
        value: 120 + Math.random() * 30
      });
    }
    
    // WebRTC连接性能示例
    for (let i = 0; i < 5; i++) {
      const timestamp = now - i * 2000;
      
      this.metrics.webrtcConnection.iceGatheringTime.push({
        timestamp,
        value: 200 + Math.random() * 100
      });
      
      this.metrics.webrtcConnection.connectionEstablishmentTime.push({
        timestamp,
        value: 500 + Math.random() * 200
      });
      
      this.metrics.webrtcConnection.candidateCount.push({
        timestamp,
        value: 5 + Math.floor(Math.random() * 3)
      });
    }
    
    // 系统资源示例
    for (let i = 0; i < 15; i++) {
      const timestamp = now - i * 1000;
      
      this.metrics.resources.cpu.push({
        timestamp,
        value: 20 + Math.random() * 30
      });
      
      this.metrics.resources.memory.push({
        timestamp,
        value: 200 + Math.random() * 50,
        total: 1024
      });
    }
    
    // 稳定性示例数据
    for (let i = 0; i < 8; i++) {
      const timestamp = now - i * 1500;
      
      this.metrics.stability.frameRate.push({
        timestamp,
        value: 25 + Math.random() * 5
      });
      
      this.metrics.stability.memoryGrowth.push({
        timestamp,
        value: 1 + Math.random() * 2
      });
    }
    
    console.log('[Telemetry] Added sample data points');
  }
}

// Create singleton instance
const telemetry = new PerformanceTelemetry();

// Make it available globally when loaded as a script
window.telemetry = telemetry;

// For module.exports (when using require)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { telemetry };
} 