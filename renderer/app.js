// app.js - 主应用逻辑 (支持 Kinect 摄像头)
document.addEventListener('DOMContentLoaded', async () => {
  console.log('应用初始化中...');
  
  // 获取DOM元素
  const roomIdInput = document.getElementById('roomIdInput');
  const userIdInput = document.getElementById('userIdInput');
  const connectButton = document.getElementById('connectButton');
  const localTestButton = document.getElementById('localTestButton');
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const connectionStatus = document.getElementById('connectionStatus');
  const serverStatus = document.getElementById('serverStatus');
  const serverUrlInput = document.getElementById('serverUrlInput');
  
  // 音频控制元素
  const muteButton = document.getElementById('muteButton');
  const volumeSlider = document.getElementById('volumeSlider');
  const audioStatus = document.getElementById('audioStatus');
  const cameraToggle = document.getElementById('cameraToggle');
  const showDebugButton = document.getElementById('showDebugButton');
  const debugPanel = document.getElementById('debugPanel');
  const logsContainer = document.getElementById('logs');
  
  // Kinect 相关控制元素
  const kinectControlsDiv = document.getElementById('kinectControls');
  const viewModeSelect = document.getElementById('viewModeSelect');
  
  // 默认服务器URL
  if (!serverUrlInput.value) {
    // 尝试使用当前网址所在的服务器作为默认信令服务器
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.hostname;
    const port = '3001';  // 信令服务器端口
    serverUrlInput.value = `${protocol}//${host}:${port}`;
  }
  
  // 音频状态
  let isMuted = false;
  let isCameraOff = false;
  
  // 调试模式
  let debugMode = false;
  
  // 显示/隐藏调试面板
  if (showDebugButton && debugPanel) {
    showDebugButton.addEventListener('click', () => {
      debugMode = !debugMode;
      debugPanel.classList.toggle('show');
      showDebugButton.textContent = debugMode ? '隐藏调试信息' : '显示调试信息';
    });
  }
  
  // 添加日志
  function addLog(category, message) {
    if (!logsContainer) return;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.innerHTML = `<span style="color:#888">[${timeStr}]</span> <strong>${category}:</strong> ${message}`;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
    
    // 保持日志在合理范围内
    while (logsContainer.childElementCount > 100) {
      logsContainer.removeChild(logsContainer.firstChild);
    }
  }
  
  // 更新状态显示
  function updateStatus(message, type = '') {
    console.log(`状态更新: ${message}`);
    if (connectionStatus) {
      connectionStatus.textContent = message;
      connectionStatus.className = type;
    }
    
    // 添加到日志
    addLog('状态', message);
  }
  
  // 更新服务器状态
  function updateServerStatus(message, type = '') {
    console.log(`服务器状态: ${message}`);
    if (serverStatus) {
      serverStatus.textContent = message;
      serverStatus.className = type;
    }
    
    // 添加到日志
    addLog('服务器', message);
  }
  
  // 更新音频状态
  function updateAudioStatus(message, type = '') {
    console.log(`音频状态更新: ${message}`);
    if (audioStatus) {
      audioStatus.textContent = message;
      audioStatus.className = type;
    }
    
    // 添加到日志
    addLog('音频', message);
  }
  
  updateStatus('正在初始化组件...');
  updateServerStatus('等待连接');
  
  // 根据操作系统自动填写用户名
  if (userIdInput) {
    const os = navigator.platform.toLowerCase();
    if (os.includes('win')) {
      userIdInput.value = 'win';
    } else if (os.includes('mac')) {
      userIdInput.value = 'mac';
    }
  }
  
  // 导入摄像头管理器 - 优先使用 Kinect
  let cameraManager;
  try {
    addLog('系统', '开始初始化摄像头...');
    console.log('尝试初始化 Kinect 摄像头管理器...');
    updateStatus('正在检测 Kinect 设备...');
    
    // 导入 Kinect 摄像头管理器
    const { KinectCameraManager } = require('./kinect-camera');
    
    // 初始化 Kinect 摄像头
    cameraManager = await KinectCameraManager.initialize();
    
    // 判断是否使用了 Kinect
    if (cameraManager.isKinectMode) {
      console.log('Kinect 摄像头初始化完成');
      updateStatus('Kinect 摄像头初始化完成', 'success');
      addLog('系统', 'Kinect 摄像头初始化完成');
      
      // 显示 Kinect 控制区域
      if (kinectControlsDiv) {
        kinectControlsDiv.style.display = 'flex';
      }
      
      // 设置视图模式选择事件
      if (viewModeSelect) {
        viewModeSelect.addEventListener('change', () => {
          const selectedMode = viewModeSelect.value;
          addLog('Kinect', `视图模式已切换到: ${selectedMode === 'color' ? '彩色视频' : '彩色点云'}`);
          console.log(`视图模式已切换到: ${selectedMode === 'color' ? '彩色视频' : '彩色点云'}`);
          window.notifyRemoteModeChange(selectedMode);
        });
      }
    } else {
      console.log('未检测到 Kinect 设备，使用标准摄像头');
      updateStatus('未检测到 Kinect 设备，使用标准摄像头');
      addLog('系统', '未检测到 Kinect 设备，使用标准摄像头');
    }
  } catch (error) {
    console.error('初始化摄像头管理器失败:', error);
    updateStatus('摄像头模块加载失败，可能会使用模拟模式', 'error');
    addLog('错误', `摄像头初始化失败: ${error.message}`);
    
    // 尝试回退到标准摄像头
    try {
      console.log('尝试回退到标准摄像头...');
      const { CameraManager } = require('./camera');
      cameraManager = await CameraManager.initialize();
      console.log('标准摄像头初始化完成');
      updateStatus('标准摄像头初始化完成');
      addLog('系统', '标准摄像头初始化完成');
    } catch (fallbackError) {
      console.error('回退到标准摄像头失败:', fallbackError);
      addLog('错误', `回退到标准摄像头失败: ${fallbackError.message}`);
    }
  }
  
  // 确保摄像头已初始化
  if (!cameraManager) {
    addLog('错误', '无法创建摄像头管理器');
    updateStatus('无法创建摄像头管理器，程序无法继续', 'error');
    return;
  }
  
  // 初始化摄像头设备
  cameraManager.initialize();
  
  // 初始化WebRTC管理器
  let webrtcManager;
  try {
    console.log('创建WebRTCManager...');
    webrtcManager = new WebRTCManager();
    
    // 覆盖WebRTCManager的日志方法，添加到调试面板
    const originalLog = webrtcManager.log;
    webrtcManager.log = function(message, data) {
      originalLog.call(this, message, data);
      if (data) {
        let dataStr = '';
        try {
          dataStr = typeof data === 'string' ? data : JSON.stringify(data);
          if (dataStr.length > 200) {
            dataStr = dataStr.substring(0, 200) + '...';
          }
        } catch (e) {
          dataStr = '[无法序列化的数据]';
        }
        addLog('WebRTC', `${message} - ${dataStr}`);
      } else {
        addLog('WebRTC', message);
      }
    };
    
    const originalError = webrtcManager.error;
    webrtcManager.error = function(message, error) {
      originalError.call(this, message, error);
      addLog('错误', `${message} - ${error && error.message ? error.message : error}`);
    };
    
    console.log('WebRTCManager创建完成');
    addLog('系统', 'WebRTC管理器创建完成');
  } catch (error) {
    console.error('初始化WebRTCManager失败:', error);
    updateStatus('WebRTC模块加载失败', 'error');
    addLog('错误', `WebRTC模块加载失败: ${error.message}`);
    return; // 如果WebRTC不可用，应用无法继续
  }
  
  updateStatus('应用已初始化，准备连接');
  addLog('系统', '应用已初始化完成，等待用户操作');
  
  // 向主进程发送状态更新（使用preload脚本提供的API）
  if (window.electronAPI) {
    window.electronAPI.sendStatus('应用已初始化');
  }
  
  // =========================================
  // 点云模式相关全局函数
  // =========================================
  
  // 全局函数：通知远程用户模式已切换
  window.notifyRemoteModeChange = function(mode) {
    if (webrtcManager && webrtcManager.isConnected) {
      addLog('系统', `通知远程用户切换到${mode}模式`);
      webrtcManager.sendViewModeChange(mode);
    }
  };
  
  // 全局函数：处理远程模式变更
  window.handleRemoteViewModeChange = function(mode) {
    addLog('系统', `远程用户请求切换到${mode}模式`);
    console.log(`[App] 远程用户请求切换到${mode}模式`);
        
    // 检查摄像头管理器是否可用
    if (!cameraManager) {
      console.error('[App] 摄像头管理器不可用，无法切换模式');
      addLog('错误', '摄像头管理器不可用，无法切换模式');
      return;
    }
    
    // 检查模式是否有效
    if (mode !== 'color' && mode !== 'pointCloud') {
      console.error(`[App] 无效的视图模式: ${mode}`);
      addLog('错误', `无效的视图模式: ${mode}`);
      return;
    }
    
    // 更新视图模式选择器
    const viewModeSelect = document.getElementById('viewModeSelect');
    if (viewModeSelect) {
      console.log(`[App] 更新视图模式选择器为: ${mode}`);
      viewModeSelect.value = mode;
    }
    
    try {
      // 直接调用摄像头管理器的setViewMode方法
      console.log(`[App] 调用摄像头管理器的setViewMode方法: ${mode}`);
      cameraManager.setViewMode(mode);
      
      console.log(`[App] 模式已成功切换到: ${mode}`);
      addLog('系统', `模式已切换到: ${mode === 'color' ? '彩色视频' : '彩色点云'}`);
    } catch (error) {
      console.error(`[App] 切换视图模式失败:`, error);
      addLog('错误', `切换视图模式失败: ${error.message}`);
    }
  };
  
  // 连接Kinect和WebRTC模块
  function setupPointCloudDataTransfer() {
    if (!webrtcManager || !cameraManager) {
      console.error('[App] WebRTC或摄像头管理器未初始化，无法设置点云数据传输');
      return;
    }
    
    console.log('[App] 开始设置点云数据传输...');
    addLog('系统', '设置点云数据传输...');
    
    // 首先确保WebRTC启用了点云模式
    console.log('[App] 启用WebRTC点云模式');
    webrtcManager.setPointCloudMode(true);
    
    // 记录重要对象
    window._debugCameraManager = cameraManager;
    window._debugWebRTCManager = webrtcManager;
    
    // 设置WebRTC的点云数据回调
    console.log('[App] 设置WebRTC点云数据回调函数');
    webrtcManager.setPointCloudDataCallback((positions, colors) => {
      console.log(`[App] 收到点云数据回调: 位置数组(${positions.length}), 颜色数组(${colors.length})`);
      addLog('点云', `接收到远程点云数据: 位置数组(${positions.length}), 颜色数组(${colors.length})`);
      
      // 记录时间戳
      const receiveTime = Date.now();
      window._lastPointCloudReceiveTime = receiveTime;
      
      // 记录一些样本数据用于调试
      if (!window._pointCloudSampleData) {
        window._pointCloudSampleData = {
          positionsSample: positions.slice(0, 30),
          colorsSample: colors.slice(0, 30),
          timestamp: receiveTime
        };
        console.log('[App] 存储点云样本数据:', window._pointCloudSampleData);
      }
      
      // 传递给摄像头管理器显示
      try {
        // 检查点云数据有效性
        if (positions.length > 0 && colors.length > 0 && 
            positions.length === colors.length && 
            !isNaN(positions[0])) {
          
          // 检查当前模式，如果不是点云模式则切换
          if (cameraManager.viewMode !== 'pointCloud') {
            console.log('[App] 收到点云数据但当前不是点云模式，自动切换到点云模式');
            cameraManager.setViewMode('pointCloud');
            
            // 更新界面选择器
            const viewModeSelect = document.getElementById('viewModeSelect');
            if (viewModeSelect) {
              viewModeSelect.value = 'pointCloud';
            }
          }
          
          console.log('[App] 开始处理点云数据');
          const startTime = performance.now();
          cameraManager.receivePointCloudData(positions, colors);
          const endTime = performance.now();
          console.log(`[App] 点云数据处理完成，耗时: ${(endTime-startTime).toFixed(2)}ms`);
          
          // 记录处理时间
          if (!window._pointCloudProcessTimes) {
            window._pointCloudProcessTimes = [];
          }
          window._pointCloudProcessTimes.push(endTime - startTime);
          
          // 每10帧输出一次统计信息
          if (window._pointCloudProcessTimes.length % 10 === 0) {
            const avgTime = window._pointCloudProcessTimes.reduce((a, b) => a + b, 0) / 
                           window._pointCloudProcessTimes.length;
            console.log(`[App] 点云处理性能统计: 平均时间=${avgTime.toFixed(2)}ms (${window._pointCloudProcessTimes.length}帧)`);
            addLog('点云', `处理性能: 平均处理时间 ${avgTime.toFixed(2)}ms (${window._pointCloudProcessTimes.length}帧)`);
          }
        } else {
          console.error(`[App] 接收到无效的点云数据: positions=${positions.length}, colors=${colors.length}`);
          addLog('错误', `接收到无效的点云数据: positions=${positions.length}, colors=${colors.length}`);
        }
      } catch (error) {
        console.error('[App] 处理接收到的点云数据失败:', error);
        addLog('错误', `处理接收到的点云数据失败: ${error.message}`);
      }
    });
    
    // 如果当前是点云模式，确保启用数据通道
    if (cameraManager.viewMode === 'pointCloud') {
      console.log('[App] 当前已处于点云模式，确保启用数据通道');
      webrtcManager.setPointCloudMode(true);
      if (webrtcManager.isConnected) {
        console.log('[App] WebRTC已连接，创建数据通道');
        webrtcManager.createDataChannel();
        addLog('系统', '已为现有连接创建点云数据通道');
      }
    }
    
    // 添加全局测试函数来分析点云状态
    window.debugPointCloud = function() {
      console.log('[App] 执行点云调试函数');
      const status = {
        cameraManager: {
          viewMode: cameraManager.viewMode,
          pointCloudActive: cameraManager.pointCloudEnabled,
          hasPointCloudObject: !!cameraManager.pointCloud,
          animationRunning: !!cameraManager.animationFrameId,
          receivedFramesCount: cameraManager.receivedFramesCount || 0,
          lastReceiveTime: cameraManager.lastReceivedDataTime || 0
        },
        webrtc: {
          connected: webrtcManager.isConnected,
          dataChannelActive: !!webrtcManager.dataChannel,
          pointCloudMode: webrtcManager.pointCloudMode
        },
        lastSampleData: window._pointCloudSampleData || null,
        lastReceiveTime: window._lastPointCloudReceiveTime || 0,
        timeSinceLastFrame: window._lastPointCloudReceiveTime ? 
                           (Date.now() - window._lastPointCloudReceiveTime) + 'ms' : 'N/A'
      };
      
      console.log('[App] 点云调试信息:', status);
      
      // 尝试手动重启点云动画
      if (cameraManager.pointCloudEnabled && 
          !cameraManager.animationFrameId && 
          cameraManager.pointCloud) {
        console.log('[App] 尝试重启点云动画循环');
        cameraManager.animatePointCloud();
        return '已尝试重启点云动画循环';
      }
      
      return status;
    };
    
    // 添加全局测试点云函数，可从控制台调用
    window.testPointCloud = function() {
      console.log('[App] 运行点云测试');
      try {
        if (cameraManager.viewMode !== 'pointCloud') {
          console.log('[App] 当前不是点云模式，切换到点云模式');
          cameraManager.setViewMode('pointCloud');
        } else {
          console.log('[App] 已处于点云模式，尝试重新初始化渲染');
          if (cameraManager.animatePointCloud) {
            cameraManager.animatePointCloud();
          }
        }
        return '点云测试已执行';
      } catch (error) {
        console.error('[App] 点云测试失败:', error);
        return `点云测试失败: ${error.message}`;
      }
    };
    
    console.log('[App] 点云数据传输已配置完成');
    addLog('系统', '点云数据传输已配置');
  }
  
  // 在WebRTC连接建立后设置点云数据传输
  if (webrtcManager) {
    const originalConnectedCallback = webrtcManager.onConnectedCallback;
    webrtcManager.onConnectedCallback = function() {
      if (originalConnectedCallback) {
        originalConnectedCallback();
      }
      
      setupPointCloudDataTransfer();
    };
  }
  
  // 设置本地测试按钮点击事件
  if (localTestButton) {
    localTestButton.addEventListener('click', () => {
      console.log('启动本地测试模式');
      updateStatus('启动本地测试模式...', 'warning');
      addLog('系统', '用户点击了本地测试按钮');
      
      // 设置默认值
      roomIdInput.value = roomIdInput.value || '测试房间';
      userIdInput.value = userIdInput.value || '本地用户';
      serverUrlInput.value = 'http://localhost:3001';
      
      // 启动本地测试模式
      initializeLocalTest();
    });
  }
  
  // 本地测试初始化函数
  async function initializeLocalTest() {
    try {
      // 确保摄像头管理器已初始化
      if (!cameraManager) {
        console.warn('摄像头管理器未初始化，尝试重新初始化');
        updateStatus('正在重新初始化摄像头设备...', 'warning');
        addLog('系统', '尝试重新初始化摄像头管理器');
        try {
          // 尝试初始化 Kinect 摄像头
          const { KinectCameraManager } = require('./kinect-camera');
          cameraManager = await KinectCameraManager.initialize();
          
          // 如果使用 Kinect，显示控制区域
          if (cameraManager.isKinectMode && kinectControlsDiv) {
            kinectControlsDiv.style.display = 'flex';
            addLog('系统', 'Kinect 设备已连接');
          }
        } catch (error) {
          console.error('重新初始化摄像头管理器失败:', error);
          updateStatus('摄像头初始化失败，无法继续', 'error');
          addLog('错误', `摄像头重新初始化失败: ${error.message}`);
          return;
        }
      }
      
      // 启动摄像头流
      updateStatus('正在启动摄像头流...', 'warning');
      cameraManager.startStreaming((frameData) => {
        // 这里可以处理每一帧数据，例如显示帧率等
        if (debugMode) {
          // 只在调试模式显示帧数据，避免刷屏
          // addLog('摄像头', `接收到帧数据: ${frameData.width}x${frameData.height}`);
        }
      });
      
      // 更新状态
      updateStatus('摄像头流已启动，等待用户操作', 'success');
      addLog('系统', `摄像头流已启动 (${cameraManager.isKinectMode ? 'Kinect' : '标准摄像头'})`);
      
      // 启用控制按钮
      if (muteButton) muteButton.disabled = false;
      if (volumeSlider) volumeSlider.disabled = false;
      if (cameraToggle) cameraToggle.disabled = false;
      
      // 连接到本地服务器
      await initializeSession(roomIdInput.value, userIdInput.value, serverUrlInput.value);
    } catch (error) {
      console.error('本地测试模式初始化失败:', error);
      updateStatus('本地测试模式初始化失败', 'error');
      addLog('错误', `本地测试初始化失败: ${error.message}`);
    }
  }
  
  // 设置连接按钮点击事件
  if (connectButton) {
    connectButton.addEventListener('click', async () => {
      const roomId = roomIdInput.value.trim();
      const userId = userIdInput.value.trim();
      const serverUrl = serverUrlInput.value.trim();
      
      if (!roomId || !userId) {
        updateStatus('请输入房间ID和用户名', 'error');
        addLog('错误', '房间ID或用户名为空');
        return;
      }
      
      if (!serverUrl) {
        updateServerStatus('请输入有效的服务器地址', 'error');
        addLog('错误', '服务器地址为空');
        return;
      }
      
      // 验证服务器URL格式
      try {
        new URL(serverUrl);
      } catch (e) {
        updateServerStatus('服务器地址格式无效', 'error');
        addLog('错误', `服务器地址格式无效: ${e.message}`);
        return;
      }
      
      // 确保摄像头流已启动
      if (!cameraManager.isRunning) {
        updateStatus('正在启动摄像头流...', 'warning');
        cameraManager.startStreaming((frameData) => {
          // 帧处理回调
          if (debugMode) {
            // 调试模式下可以显示帧信息
          }
        });
      }
      
      await initializeSession(roomId, userId, serverUrl);
    });
  }
  
  // 设置静音按钮点击事件
  if (muteButton) {
    muteButton.addEventListener('click', () => {
      if (!webrtcManager.localStream) {
        addLog('错误', '无法控制音频：本地媒体流不可用');
        return;
      }
      
      isMuted = webrtcManager.toggleMute();
      muteButton.textContent = isMuted ? '取消静音' : '静音';
      addLog('音频', isMuted ? '已静音' : '已取消静音');
    });
  }
  
  // 设置摄像头开关按钮点击事件
  if (cameraToggle) {
    cameraToggle.addEventListener('click', () => {
      if (!webrtcManager.localStream) {
        addLog('错误', '无法控制视频：本地媒体流不可用');
        return;
      }
      
      isCameraOff = webrtcManager.toggleCamera();
      cameraToggle.textContent = isCameraOff ? '开启摄像头' : '关闭摄像头';
      addLog('视频', isCameraOff ? '摄像头已关闭' : '摄像头已开启');
    });
  }
  
  // 设置音量滑块变化事件
  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      const volume = parseFloat(volumeSlider.value);
      webrtcManager.setVolume(volume);
      addLog('音频', `音量已设置为 ${Math.round(volume * 100)}%`);
    });
  }
  
  // 初始化WebRTC会话
  async function initializeSession(roomId, userId, serverUrl) {
    try {
      updateStatus('正在初始化会话...', 'warning');
      updateServerStatus(`正在连接到 ${serverUrl}`, 'warning');
      addLog('系统', `正在初始化WebRTC会话，房间ID: ${roomId}, 用户ID: ${userId}`);
      
      // 禁用连接按钮，避免重复点击
      if (connectButton) {
        connectButton.disabled = true;
      }
      
      // 初始化WebRTC管理器
      webrtcManager.init(userId, serverUrl);
      
      // 获取本地媒体流
      updateStatus('正在获取媒体流...', 'warning');
      addLog('系统', '获取本地媒体流中...');
      const localStream = await webrtcManager.getLocalStream(cameraManager);
      
      if (!localStream) {
        updateStatus('无法获取媒体流，请检查摄像头和麦克风权限', 'error');
        addLog('错误', '无法获取本地媒体流');
        if (connectButton) {
          connectButton.disabled = false;
        }
        return;
      }
      
      addLog('系统', '成功获取本地媒体流');
      
      // 启用音频控制按钮
      if (muteButton) {
        muteButton.disabled = false;
      }
      
      if (volumeSlider) {
        volumeSlider.disabled = false;
      }
      
      if (cameraToggle) {
        cameraToggle.disabled = false;
      }
      
      // 设置回调函数
      webrtcManager.setCallbacks({
        onConnected: () => {
          updateStatus('已连接到远程用户', 'success');
          addLog('连接', '已成功连接到远程用户');
        },
        onDisconnected: () => {
          updateStatus('与远程用户断开连接');
          addLog('连接', '与远程用户断开连接');
          
          // 重新启用连接按钮
          if (connectButton) {
            connectButton.disabled = false;
          }
        },
        onRemoteStream: (stream) => {
          console.log('收到远程媒体流');
          addLog('媒体', '收到远程媒体流');
          
          // 远程视频元素在WebRTCManager中处理
        },
        onError: (error) => {
          console.error('WebRTC错误:', error);
          updateStatus(`连接错误: ${error.message}`, 'error');
          addLog('错误', `WebRTC错误: ${error.message}`);
          
          // 重新启用连接按钮
          if (connectButton) {
            connectButton.disabled = false;
          }
        }
      });
      
      // 加入房间
      webrtcManager.joinRoom(roomId);
      
      updateStatus(`正在连接到房间 ${roomId}...`, 'warning');
      addLog('系统', `已发送加入房间请求: ${roomId}`);
    } catch (error) {
      console.error('初始化会话失败:', error);
      updateStatus(`初始化会话失败: ${error.message}`, 'error');
      addLog('错误', `初始化会话失败: ${error.message}`);
      
      if (connectButton) {
        connectButton.disabled = false;
      }
    }
  }
  
  // 处理页面卸载事件，关闭连接
  window.addEventListener('beforeunload', () => {
    console.log('页面即将卸载，关闭所有资源...');
    addLog('系统', '正在关闭应用...');
    
    if (webrtcManager) {
      webrtcManager.close();
    }
    
    if (cameraManager) {
      // 关闭摄像头资源
      cameraManager.close();
      
      // 如果是 Kinect 模式，确保 Kinect 设备被正确关闭
      if (cameraManager.isKinectMode && cameraManager.kinect) {
        try {
          console.log('关闭 Kinect 设备...');
          if (cameraManager.kinect.isListening) {
            cameraManager.kinect.stopListening();
          }
          cameraManager.kinect.close();
        } catch (error) {
          console.error('关闭 Kinect 设备时出错:', error);
        }
      }
    }
    
    console.log('所有资源已关闭');
  });
}); 