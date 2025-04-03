// app.js - 主应用逻辑 (支持 Kinect 摄像头)
document.addEventListener('DOMContentLoaded', async () => {
  console.log("应用初始化中...");

  // 获取DOM元素
  const roomIdInput = document.getElementById("roomIdInput");
  const userIdInput = document.getElementById("userIdInput");
  // const connectButton = document.getElementById("connectButton");
  // const localTestButton = document.getElementById("localTestButton");
  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const connectionStatus = document.getElementById("connectionStatus");
  const serverStatus = document.getElementById("serverStatus");
  const serverUrlInput = document.getElementById("serverUrlInput");

  // 音频控制元素
  const muteButton = document.getElementById("muteButton");
  const volumeSlider = document.getElementById("volumeSlider");
  const audioStatus = document.getElementById("audioStatus");
  const cameraToggle = document.getElementById("cameraToggle");
  const showDebugButton = document.getElementById("showDebugButton");
  const debugPanel = document.getElementById("debugPanel");
  const logsContainer = document.getElementById("logs");

  // Kinect 相关控制元素
  const kinectControlsDiv = document.getElementById("kinectControls");
  const viewModeSelect = document.getElementById("viewModeSelect");

  // 默认服务器URL
  let serverUrlValue = "";
  if (serverUrlInput) {
    // 如果在登录页面
    if (!serverUrlInput.value) {
      // 尝试使用当前网址所在的服务器作为默认信令服务器
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      const host = window.location.hostname;
      const port = "3001"; // 信令服务器端口
      serverUrlInput.value = `${protocol}//${host}:${port}`;
    }
    serverUrlValue = serverUrlInput.value;
  } else {
    // 如果在会议页面，尝试从sessionStorage获取
    serverUrlValue = sessionStorage.getItem('meetingServerUrl');
    if (!serverUrlValue) {
      // 使用默认值
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      const host = window.location.hostname;
      const port = "3001"; // 信令服务器端口
      serverUrlValue = `${protocol}//${host}:${port}`;
    }
  }

  // 音频状态
  let isMuted = false;
  let isCameraOff = false;

  // 调试模式
  let debugMode = false;

  // 添加日志
  function addLog(category, message) {
    if (!logsContainer) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.innerHTML = `<span style="color:#888">[${timeStr}]</span> <strong>${category}:</strong> ${message}`;

    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // 保持日志在合理范围内
    while (logsContainer.childElementCount > 100) {
      logsContainer.removeChild(logsContainer.firstChild);
    }
  }

  // 更新状态显示
  function updateStatus(message, type = "") {
    console.log(`状态更新: ${message}`);
    if (connectionStatus) {
      connectionStatus.textContent = message;
      connectionStatus.className = type;
    }

    // 如果有全局更新状态函数（与新UI集成）
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus(message, type);
    }

    // 添加到日志
    addLog("状态", message);
  }

  // 更新服务器状态
  function updateServerStatus(message, type = "") {
    console.log(`服务器状态: ${message}`);
    if (serverStatus) {
      serverStatus.textContent = message;
      serverStatus.className = type;
    }

    // 添加到日志
    addLog("服务器", message);
  }

  // 更新音频状态
  function updateAudioStatus(message, type = "") {
    console.log(`音频状态更新: ${message}`);
    if (audioStatus) {
      audioStatus.textContent = message;
      audioStatus.className = type;
    }

    // 添加到日志
    addLog("音频", message);
  }

  updateStatus("正在初始化组件...");
  updateServerStatus("等待连接");

  const isWindows =
    typeof window !== "undefined" &&
    window.navigator &&
    window.navigator.platform &&
    window.navigator.platform.indexOf("Win") >= 0;
  
  // 根据操作系统自动填写用户名
  // if (userIdInput) {
  //   if (isWindows) {
  //     userIdInput.value = "win";
  //   } else {
  //     userIdInput.value = "mac";
  //   }
  // }

  // 导入摄像头管理器 - 优先使用 Kinect
  let cameraManager;
  try {
    addLog("系统", "开始初始化摄像头...");
    console.log("尝试初始化 Kinect 摄像头管理器...");
    updateStatus("正在检测 Kinect 设备...");

    // 导入 Kinect 摄像头管理器
    const { KinectCameraManager } = require("./renderer/kinect-camera");

    // 初始化 Kinect 摄像头
    cameraManager = await KinectCameraManager.initialize();

    // 判断是否使用了 Kinect
    if (cameraManager.isKinectMode) {
      console.log("Kinect 摄像头初始化完成");
      updateStatus("Kinect 摄像头初始化完成", "success");
      addLog("系统", "Kinect 摄像头初始化完成");

      // 显示 Kinect 控制区域，老版用的
      // if (kinectControlsDiv) {
      //   kinectControlsDiv.style.display = "flex";
      // }

      // 设置视图模式选择事件
      // if (viewModeSelect) {
      //   viewModeSelect.addEventListener("change", () => {
      //     const selectedMode = viewModeSelect.value;
      //     addLog(
      //       "Kinect",
      //       `视图模式已切换到: ${
      //         selectedMode === "color" ? "彩色视频" : "彩色点云"
      //       }`
      //     );
      //     console.log(
      //       `视图模式已切换到: ${
      //         selectedMode === "color" ? "彩色视频" : "彩色点云"
      //       }`
      //     );
      //     window.notifyRemoteModeChange(selectedMode);
      //   });
      // }
    } else {
      console.log("未检测到 Kinect 设备，使用标准摄像头");
      updateStatus("未检测到 Kinect 设备，使用标准摄像头");
      addLog("系统", "未检测到 Kinect 设备，使用标准摄像头");
    }
  } catch (error) {
    console.error("初始化摄像头管理器失败:", error);
    updateStatus("摄像头模块加载失败，可能会使用模拟模式", "error");
    addLog("错误", `摄像头初始化失败: ${error.message}`);

    // 尝试回退到标准摄像头
    try {
      console.log("尝试回退到标准摄像头...");
      const { CameraManager } = require("./renderer/camera");
      cameraManager = await CameraManager.initialize();
      console.log("标准摄像头初始化完成");
      updateStatus("标准摄像头初始化完成");
      addLog("系统", "标准摄像头初始化完成");
    } catch (fallbackError) {
      console.error("回退到标准摄像头失败:", fallbackError);
      addLog("错误", `回退到标准摄像头失败: ${fallbackError.message}`);
    }
  }

  // 确保摄像头已初始化
  if (!cameraManager) {
    addLog("错误", "无法创建摄像头管理器");
    updateStatus("无法创建摄像头管理器，程序无法继续", "error");
    return;
  }

  // 初始化摄像头设备
  cameraManager.initialize();

  // 初始化WebRTC管理器
  let webrtcManager;
  try {
    console.log("创建WebRTCManager...");
    webrtcManager = new WebRTCManager();

    // 覆盖WebRTCManager的日志方法，添加到调试面板
    const originalLog = webrtcManager.log;
    webrtcManager.log = function (message, data) {
      originalLog.call(this, message, data);
      if (data) {
        let dataStr = "";
        try {
          dataStr = typeof data === "string" ? data : JSON.stringify(data);
          if (dataStr.length > 200) {
            dataStr = dataStr.substring(0, 200) + "...";
          }
        } catch (e) {
          dataStr = "[无法序列化的数据]";
        }
        addLog("WebRTC", `${message} - ${dataStr}`);
      } else {
        addLog("WebRTC", message);
      }
    };

    const originalError = webrtcManager.error;
    webrtcManager.error = function (message, error) {
      originalError.call(this, message, error);
      addLog(
        "错误",
        `${message} - ${error && error.message ? error.message : error}`
      );
    };

    window.webrtcManager = webrtcManager;
    console.log("WebRTCManager创建完成");
    addLog("系统", "WebRTC管理器创建完成");
    
    // 初始化网络监控
    initNetworkMonitoring();
  } catch (error) {
    console.error("初始化WebRTCManager失败:", error);
    updateStatus("WebRTC模块加载失败", "error");
    addLog("错误", `WebRTC模块加载失败: ${error.message}`);
    return; // 如果WebRTC不可用，应用无法继续
  }

  updateStatus("应用已初始化，准备连接");
  addLog("系统", "应用已初始化完成，等待用户操作");

  // 向主进程发送状态更新（使用preload脚本提供的API）
  if (window.electronAPI) {
    window.electronAPI.sendStatus("应用已初始化");
  }

  // 在 WebRTC 初始化后立即设置回调函数，但不强制启用点云模式
  if (webrtcManager) {
    // 设置点云数据回调函数但不立即启用点云模式
    console.log("[App] 设置点云数据回调函数（不启用点云模式）");

    // 只设置回调，不启用点云模式
    setupPointCloudDataTransfer(false);

    // 然后设置连接回调
    const originalConnectedCallback = webrtcManager.onConnectedCallback;
    webrtcManager.onConnectedCallback = function () {
      if (originalConnectedCallback) {
        originalConnectedCallback();
      }

      // 连接后根据用户界面选择决定是否启用点云模式
      const viewModeSelect = document.getElementById("viewModeSelect");
      const currentMode = viewModeSelect ? viewModeSelect.value : "color";

      if (currentMode === "pointCloud") {
        console.log("[App] 根据用户选择启用点云模式");
        webrtcManager.setPointCloudMode(true);
        webrtcManager.createDataChannel();
      }
    };
  }

  // 设置本地测试按钮点击事件
  // if (localTestButton) {
  //   localTestButton.addEventListener("click", () => {
  //     console.log("启动本地测试模式");
  //     updateStatus("启动本地测试模式...", "warning");
  //     addLog("系统", "用户点击了本地测试按钮");

  //     // 设置默认值
  //     let roomIdValue = "测试房间";
  //     let userIdValue = "本地用户";
  //     let serverValue = "http://localhost:3001";
      
  //     if (roomIdInput) roomIdInput.value = roomIdInput.value || roomIdValue;
  //     if (userIdInput) userIdInput.value = userIdInput.value || userIdValue;
  //     if (serverUrlInput) serverUrlInput.value = serverValue;
      
  //     // 从输入框获取值或使用默认值
  //     roomIdValue = roomIdInput ? roomIdInput.value : roomIdValue;
  //     userIdValue = userIdInput ? userIdInput.value : userIdValue;
  //     serverValue = serverUrlInput ? serverUrlInput.value : serverValue;

  //     // 启动本地测试模式
  //     initializeLocalTest(roomIdValue, userIdValue, serverValue);
  //   });
  // }

  // 本地测试初始化函数
  // async function initializeLocalTest(roomId, userId, serverUrl) {
  //   try {
  //     // 确保摄像头管理器已初始化
  //     if (!cameraManager) {
  //       console.warn("摄像头管理器未初始化，尝试重新初始化");
  //       updateStatus("正在重新初始化摄像头设备...", "warning");
  //       addLog("系统", "尝试重新初始化摄像头管理器");
  //       try {
  //         // 尝试初始化 Kinect 摄像头
  //         const { KinectCameraManager } = require("./kinect-camera");
  //         cameraManager = await KinectCameraManager.initialize();

  //         // 如果使用 Kinect，显示控制区域
  //         if (cameraManager.isKinectMode && kinectControlsDiv) {
  //           kinectControlsDiv.style.display = "flex";
  //           addLog("系统", "Kinect 设备已连接");
  //         }
  //       } catch (error) {
  //         console.error("重新初始化摄像头管理器失败:", error);
  //         updateStatus("摄像头初始化失败，无法继续", "error");
  //         addLog("错误", `摄像头重新初始化失败: ${error.message}`);
  //         return;
  //       }
  //     }

  //     // 启动摄像头流
  //     updateStatus("正在启动摄像头流...", "warning");
  //     cameraManager.startStreaming((frameData) => {
  //       // 这里可以处理每一帧数据，例如显示帧率等
  //       if (debugMode) {
  //         // 只在调试模式显示帧数据，避免刷屏
  //         // addLog('摄像头', `接收到帧数据: ${frameData.width}x${frameData.height}`);
  //       }
  //     });

  //     // 更新状态
  //     updateStatus("摄像头流已启动，等待用户操作", "success");
  //     addLog(
  //       "系统",
  //       `摄像头流已启动 (${
  //         cameraManager.isKinectMode ? "Kinect" : "标准摄像头"
  //       })`
  //     );

  //     // 启用控制按钮
  //     if (muteButton) muteButton.disabled = false;
  //     if (volumeSlider) volumeSlider.disabled = false;
  //     if (cameraToggle) cameraToggle.disabled = false;

  //     // 连接到本地服务器
  //     await initializeSession(roomId, userId, serverUrl);
  //   } catch (error) {
  //     console.error("本地测试模式初始化失败:", error);
  //     updateStatus("本地测试模式初始化失败", "error");
  //     addLog("错误", `本地测试初始化失败: ${error.message}`);
  //   }
  // }

  // 检查是否在会议页面，并自动从sessionStorage获取登录信息
  const isInMeetingPage = !roomIdInput && !userIdInput && window.location.pathname.includes('index.html');
  if (isInMeetingPage) {
    console.log("检测到会议页面，尝试从sessionStorage获取会议信息");
    const roomId = sessionStorage.getItem('meetingRoomId');
    const userId = sessionStorage.getItem('meetingUserId');
    const serverUrl = sessionStorage.getItem('meetingServerUrl');
    
    if (roomId && userId) {
      console.log(`从sessionStorage获取到会议信息: 房间=${roomId}, 用户=${userId}`);
      addLog("系统", `从会话存储获取到会议信息`);
      
      // 自动连接到会议
      setTimeout(() => {
        initializeSession(roomId, userId, serverUrl || serverUrlValue);
      }, 1000); // 稍微延迟，确保页面已完全加载
    }
  } else {
    console.log("未检测到会议页面，不自动连接到会议");
  }

  // 设置连接按钮点击事件
  // if (connectButton) {
  //   connectButton.addEventListener("click", async () => {
  //     const roomId = roomIdInput.value.trim();
  //     const userId = userIdInput.value.trim();
  //     const serverUrl = serverUrlInput.value.trim();

  //     if (!roomId || !userId) {
  //       updateStatus("请输入房间ID和用户名", "error");
  //       addLog("错误", "房间ID或用户名为空");
  //       return;
  //     }

  //     if (!serverUrl) {
  //       updateServerStatus("请输入有效的服务器地址", "error");
  //       addLog("错误", "服务器地址为空");
  //       return;
  //     }

  //     // 验证服务器URL格式
  //     try {
  //       new URL(serverUrl);
  //     } catch (e) {
  //       updateServerStatus("服务器地址格式无效", "error");
  //       addLog("错误", `服务器地址格式无效: ${e.message}`);
  //       return;
  //     }

  //     // 确保摄像头流已启动
  //     if (!cameraManager.isRunning) {
  //       updateStatus("正在启动摄像头流...", "warning");
  //       cameraManager.startStreaming((frameData) => {
  //         // 帧处理回调
  //         if (debugMode) {
  //           // 调试模式下可以显示帧信息
  //         }
  //       });
  //     }

  //     await initializeSession(roomId, userId, serverUrl);
  //   });
  // }

  // 设置静音按钮点击事件
  if (muteButton) {
    muteButton.addEventListener("click", () => {
      if (!webrtcManager.localStream) {
        addLog("错误", "无法控制音频：本地媒体流不可用");
        return;
      }

      isMuted = webrtcManager.toggleMute();
      // muteButton.textContent = isMuted ? "取消静音" : "静音";
      addLog("音频", isMuted ? "已静音" : "已取消静音");
      
      // 新界面支持类名切换
      if (muteButton.classList) {
        muteButton.classList.toggle('active', isMuted);
        const tooltipElement = muteButton.querySelector('.tooltip-text');
        if (tooltipElement) {
          tooltipElement.textContent = isMuted ? '取消静音' : '静音';
        }
      }
    });
  }

  // 设置摄像头开关按钮点击事件
  if (cameraToggle) {
    cameraToggle.addEventListener("click", () => {
      if (!webrtcManager.localStream) {
        addLog("错误", "无法控制视频：本地媒体流不可用");
        return;
      }

      isCameraOff = webrtcManager.toggleCamera();
      // cameraToggle.textContent = isCameraOff ? "开启摄像头" : "关闭摄像头";
      addLog("视频", isCameraOff ? "摄像头已关闭" : "摄像头已开启");
      
      // 新界面支持类名切换
      if (cameraToggle.classList) {
        cameraToggle.classList.toggle('active', isCameraOff);
        const tooltipElement = cameraToggle.querySelector('.tooltip-text');
        if (tooltipElement) {
          tooltipElement.textContent = isCameraOff ? '开启视频' : '关闭视频';
        }
      }
    });
  }

  // 设置音量滑块变化事件
  if (volumeSlider) {
    volumeSlider.addEventListener("input", () => {
      const volume = parseFloat(volumeSlider.value);
      webrtcManager.setVolume(volume);
      addLog("音频", `音量已设置为 ${Math.round(volume * 100)}%`);
    });
  }

  // 初始化会议会话
  async function initializeSession(roomId, userId, serverUrl) {
    console.log(
      `初始化会议会话: 房间=${roomId}, 用户=${userId}, 服务器=${serverUrl}`
    );
    updateStatus("正在初始化会议...", "warning");

    if (!cameraManager) {
      updateStatus("摄像头管理器未初始化", "error");
      return;
    }

    if (!webrtcManager) {
      updateStatus("WebRTC管理器未初始化", "error");
      return;
    }

    // 初始化WebRTC连接
    webrtcManager.init(userId, serverUrl);

    // 确保摄像头流已启动
    if (!cameraManager.isRunning) {
      updateStatus("initializeSession-正在启动摄像头流...", "warning");
      cameraManager.startStreaming((frameData) => {
        // 帧处理回调
        if (frameData && webrtcManager) {
          const { colorImageData, pointCloudData } = frameData;

          // 替换错误的sendFrame调用
          // 发送颜色帧到远程Peer - 不需要手动处理，WebRTC会自动传输媒体流
          // 确保Canvas流已经被更新到WebRTC
          if (colorImageData && window.localStream && !webrtcManager.pointCloudMode) {
            // 更新媒体流由cameraManager.updateMediaStream负责
            // 此处不需要手动处理
          }

          // 如果启用了点云模式并且有点云数据，则发送点云数据
          if (webrtcManager.pointCloudMode && pointCloudData) {
            const { positions, colors } = pointCloudData;
            webrtcManager.sendPointCloudData(positions, colors);
          }
        }
      });
    }

    // 注册回调函数
    webrtcManager.setCallbacks({
      onConnected: () => {
        console.log("WebRTC连接已建立");
        updateStatus("已连接到会议", "success");
      },
      onDisconnected: () => {
        console.log("WebRTC连接已断开");
        updateStatus("与会议的连接已断开", "error");
      },
      onRemoteStream: (remoteUserId, stream) => {
        console.log(`[App] WGD:onRemoteStream, 收到来自 ${remoteUserId} 的流:`, {
          streamId: stream.id,
          tracks: stream.getTracks().map((track) => ({
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          })),
        });

        // 创建或获取远程用户的canvas元素
        const remoteCanvas = window.createRemoteVideoElement(remoteUserId);

        if (!remoteCanvas) {
          console.error(`[App] 为用户 ${remoteUserId} 创建Canvas元素失败`);
          return;
        }

        console.log(`[App] 成功创建/获取Canvas元素:`, {
          canvasId: remoteCanvas.id,
          width: remoteCanvas.width,
          height: remoteCanvas.height,
          display: remoteCanvas.style.display,
          parentElement: remoteCanvas.parentElement?.id,
        });

        // 创建一个离屏视频元素来播放流
        const videoElement = document.createElement("video");
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        videoElement.muted = true; // 视频元素静音，避免重复播放音频
        videoElement.id = `video_${remoteUserId}`;
        videoElement.style.display = "block"; // 隐藏视频元素
        remoteCanvas.appendChild(videoElement);

        // 添加视频流状态监听
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            console.log(`[App] 视频轨道结束 (${remoteUserId}):`, {
              kind: track.kind,
              label: track.label,
            });
          };

          track.onmute = () => {
            console.log(`[App] 视频轨道被静音 (${remoteUserId}):`, {
              kind: track.kind,
              label: track.label,
            });
          };

          track.onunmute = () => {
            console.log(`[App] 视频轨道取消静音 (${remoteUserId}):`, {
              kind: track.kind,
              label: track.label,
            });
          };
        });

        console.log(`[App] 创建视频元素:`, {
          videoId: videoElement.id,
          readyState: videoElement.readyState,
          srcObject: !!videoElement.srcObject,
          currentTime: videoElement.currentTime,
          duration: videoElement.duration,
          paused: videoElement.paused,
          ended: videoElement.ended,
        });

        // 获取Canvas的上下文
        const ctx = remoteCanvas.getContext("2d");

        // 当视频开始播放时，开始绘制到Canvas
        videoElement.addEventListener("playing", () => {
          console.log(`[App] 视频开始播放 (${remoteUserId}):`, {
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight,
            readyState: videoElement.readyState,
            currentTime: videoElement.currentTime,
            duration: videoElement.duration,
            paused: videoElement.paused,
            ended: videoElement.ended,
          });

          // 设置Canvas尺寸以匹配视频
          remoteCanvas.width = videoElement.videoWidth;
          remoteCanvas.height = videoElement.videoHeight;

          console.log(`[App] 更新Canvas尺寸:`, {
            canvasId: remoteCanvas.id,
            newWidth: remoteCanvas.width,
            newHeight: remoteCanvas.height,
          });

          // 确保Canvas在DOM中可见
          const videoWrapper = document.getElementById(
            `remoteVideo_${remoteUserId}_wrapper`
          );
          if (videoWrapper) {
            videoWrapper.style.display = "block";
            remoteCanvas.style.display = "block";
            console.log(`[App] 设置视频包装器可见:`, {
              wrapperId: videoWrapper.id,
              wrapperDisplay: videoWrapper.style.display,
              canvasDisplay: remoteCanvas.style.display,
            });
          }

          // 定期将视频帧绘制到Canvas
          function drawFrame() {
            if (videoElement.paused || videoElement.ended) {
              console.log(`[App] 视频已暂停或结束 (${remoteUserId}):`, {
                paused: videoElement.paused,
                ended: videoElement.ended,
                currentTime: videoElement.currentTime,
                duration: videoElement.duration,
                readyState: videoElement.readyState,
              });
              return;
            }

            // 将视频帧绘制到Canvas
            ctx.drawImage(
              videoElement,
              0,
              0,
              remoteCanvas.width,
              remoteCanvas.height
            );

            // 每30帧输出一次状态
            if (window._frameCount === undefined) window._frameCount = 0;
            if (window._frameCount++ % 30 === 0) {
              // console.log(`[App] 绘制视频帧到Canvas (${remoteUserId}):`, {
              //   frameCount: window._frameCount,
              //   currentTime: videoElement.currentTime,
              //   duration: videoElement.duration,
              //   readyState: videoElement.readyState,
              //   canvasWidth: remoteCanvas.width,
              //   canvasHeight: remoteCanvas.height,
              // });
            }

            // 继续绘制下一帧
            requestAnimationFrame(drawFrame);
          }

          // 开始绘制
          console.log(`[App] 开始渲染循环 (${remoteUserId})`);
          drawFrame();
        });

        // 保存videoElement的引用，以便后续清理
        window.videoElements = window.videoElements || {};
        window.videoElements[remoteUserId] = videoElement;

        // 添加错误处理
        videoElement.onerror = (error) => {
          console.error(`[App] 视频元素错误 (${remoteUserId}):`, {
            error: error,
            readyState: videoElement.readyState,
            currentTime: videoElement.currentTime,
            duration: videoElement.duration,
            paused: videoElement.paused,
            ended: videoElement.ended,
          });
        };

        // 添加加载状态日志
        videoElement.onloadedmetadata = () => {
          console.log(`[App] 视频元数据已加载 (${remoteUserId}):`, {
            width: videoElement.videoWidth,
            height: videoElement.videoHeight,
            duration: videoElement.duration,
            readyState: videoElement.readyState,
            currentTime: videoElement.currentTime,
            paused: videoElement.paused,
            ended: videoElement.ended,
          });
        };

        // 添加播放状态变化监听
        videoElement.addEventListener("play", () => {
          console.log(`[App] 视频开始播放 (${remoteUserId})`);
        });

        videoElement.addEventListener("pause", () => {
          console.log(`[App] 视频暂停 (${remoteUserId})`);
        });

        videoElement.addEventListener("ended", () => {
          console.log(`[App] 视频结束 (${remoteUserId})`);
        });
      },
      onError: (error, userId) => {
        console.error(`WebRTC错误 (${userId || "未知"}):`, error);
        updateStatus(`连接错误: ${error}`, "error");
      },
      onUserJoined: (userId) => { // TODO: 这里多调用了一遍，重复了
        console.log(`用户 ${userId} 加入了会议`);
        // 更新参与者计数
        if (window.updateParticipantCount) {
          window.updateParticipantCount();
        }
      },
      onUserLeft: (userId) => {
        console.log(`用户 ${userId} 离开了会议`);

        // 清理视频元素
        if (window.videoElements && window.videoElements[userId]) {
          const videoElement = window.videoElements[userId];
          if (videoElement && videoElement.parentNode) {
            videoElement.pause();
            videoElement.srcObject = null;
            videoElement.parentNode.removeChild(videoElement);
          }
          delete window.videoElements[userId];
        }

        // 移除远程视频元素
        window.removeRemoteVideoElement(userId);

        // 更新参与者计数
        if (window.updateParticipantCount) {
          window.updateParticipantCount();
        }
      },
    });

    // 加入房间
    webrtcManager.joinRoom(roomId);

    try {
      // 注册摄像头的帧更新回调，将数据传给WebRTC 已经打开过了
      // cameraManager.startStreaming((frameData) => {
      //   if (frameData && webrtcManager) {
      //     const { colorImageData, pointCloudData } = frameData;

      //     // 发送颜色帧到远程Peer
      //     if (colorImageData) {
      //       webrtcManager.sendFrame(colorImageData);
      //     }

      //     // 如果启用了点云模式并且有点云数据，则发送点云数据
      //     if (webrtcManager.pointCloudMode && pointCloudData) {
      //       const { positions, colors } = pointCloudData;
      //       webrtcManager.sendPointCloudData(positions, colors);
      //     }
      //   }
      // });

      // 获取本地媒体流以用于WebRTC
      await webrtcManager.getLocalStream(cameraManager);

      // 设置Kinect视图模式处理(如果支持)
      // setupViewModeHandler();

      // 设置点云数据传输(如果需要)
      setupPointCloudDataTransfer();

      // 设置全局通知函数，用于通知远程Peer模式变更 代码重复了，删除这段
      // window.notifyRemoteModeChange = (mode) => {
      //   if (webrtcManager) {
      //     webrtcManager.sendViewModeChange(mode);
      //   }
      // };

      // 设置全局回调函数，用于接收远程点云数据
      // TODO: 这里确实有 userid 信息，但是处理的不对吧，没这样的函数
      window.handleRemotePointCloudData = (data, fromUserId) => {
        console.log(
          `收到来自 ${fromUserId} 的点云数据: ${data.pointCount} 个点`
        );

        // 找到对应用户的Canvas
        const remoteCanvas = document.getElementById(
          `remoteCanvas_${fromUserId}`
        );
        if (remoteCanvas && cameraManager) {
          // 使用Camera Manager渲染点云
          cameraManager.renderPointCloudData(data, remoteCanvas);
        }
      };

      // 全局导出WebRTC管理器，供其他脚本使用
      window.webrtcManager = webrtcManager;
    } catch (error) {
      console.error("初始化会话时出错:", error);
      updateStatus(`初始化失败: ${error.message}`, "error");
    }
  }

  // 将initializeSession函数暴露为全局函数，以便新的UI可以调用
  window.initializeSession = initializeSession;

  // =========================================
  // 点云模式相关全局函数
  // =========================================

  // 全局函数：通知远程用户模式已切换
  window.notifyRemoteModeChange = function (mode) {
    if (webrtcManager && webrtcManager.isConnected) {
      addLog("系统", `通知远程用户切换到${mode}模式`);
      webrtcManager.sendViewModeChange(mode);
    }
  };

  // 全局函数：当媒体流更新时通知WebRTC
  window.notifyStreamUpdated = function() {
    if (webrtcManager && window.localStream) {
      addLog("系统", "本地媒体流已更新，正在刷新WebRTC连接");
      console.log("[App] 本地媒体流已更新，调用combineStreams更新WebRTC连接");
      // 使用WebRTC Manager的combineStreams方法更新所有连接的媒体流
      webrtcManager.combineStreams();
    } else {
      console.error("[App] 无法更新媒体流: webrtcManager或localStream不可用");
    }
  };

  // 全局函数：处理远程模式变更（给 Mac 端用的;不出错 Kinect 不会收到 Mac 的请求）
  // TODO: 这没有对 userid 做处理，渲染到哪去了
  window.handleRemoteViewModeChange = function (mode, fromUserId) {
    addLog("系统", `远程用户请求切换到${mode}模式`);
    console.log(`用户 ${fromUserId} 切换到 ${mode} 模式`);

    // 检查摄像头管理器是否可用
    if (!cameraManager) {
      console.error("[App] 摄像头管理器不可用，无法切换模式");
      addLog("错误", "摄像头管理器不可用，无法切换模式");
      return;
    }

    // 检查模式是否有效
    if (mode !== "color" && mode !== "pointCloud" && mode !== "depth" && mode !== "infrared") {
      console.error(`[App] 无效的视图模式: ${mode}`);
      addLog("错误", `无效的视图模式: ${mode}`);
      return;
    }

    // 更新视图模式选择器
    const viewModeSelect = document.getElementById("viewModeSelect");
    if (viewModeSelect) {
      console.log(`[App] 更新视图模式选择器为: ${mode}`);
      viewModeSelect.value = mode;
    }

    try {
      // 如果是点云模式，需要隐藏远程视频层，显示点云层
      if (mode === "pointCloud") {
        if (webrtcManager && webrtcManager.remoteCanvas) {
          console.log("[App] 切换到点云模式，准备隐藏远程视频层");

          // 在处理点云数据时，停止远程视频渲染循环以节省资源
          webrtcManager.stopRemoteCanvasRendering();

          // 在远程canvas上显示等待点云数据的提示
          const remoteCtx = webrtcManager.remoteCtx;
          if (remoteCtx) {
            remoteCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
            remoteCtx.fillRect(
              0,
              0,
              webrtcManager.remoteCanvas.width,
              webrtcManager.remoteCanvas.height
            );
            remoteCtx.font = "24px Arial";
            remoteCtx.fillStyle = "#ffffff";
            remoteCtx.textAlign = "center";
            remoteCtx.fillText(
              "正在等待点云数据...",
              webrtcManager.remoteCanvas.width / 2,
              webrtcManager.remoteCanvas.height / 2
            );
          }
        }
      } else if (mode === "color" || mode === "depth" || mode === "infrared") {
        // 如果是彩色视频模式，需要恢复远程视频渲染
        if (webrtcManager && webrtcManager.remoteCanvas) {
          console.log("[App] 切换到彩色视频模式，重启远程视频渲染");
          webrtcManager.startRemoteCanvasRendering();
        }
      }

      // 直接调用摄像头管理器的setViewMode方法
      console.log(`[App] 调用摄像头管理器的setViewMode方法: ${mode}`);
      cameraManager.standardCamera.setViewMode(mode, fromUserId);

      console.log(`[App] 模式已成功切换到: ${mode}`);
      addLog(
        "系统",
        `模式已切换到: ${mode === "color" ? "彩色视频" : "彩色点云"}`
      );
    } catch (error) {
      console.error(`[App] 切换视图模式失败:`, error);
      addLog("错误", `切换视图模式失败: ${error.message}`);
    }
  };

  // 连接Kinect和WebRTC模块
  function setupPointCloudDataTransfer(enablePointCloudMode = false) {
    if (!webrtcManager || !cameraManager) {
      console.error("[App] WebRTC或摄像头管理器未初始化，无法设置点云数据传输");
      return;
    }

    console.log("[App] 开始设置点云数据传输...");
    addLog("系统", "设置点云数据传输...");

    // 根据参数决定是否启用点云模式
    if (enablePointCloudMode) {
      console.log("[App] 启用WebRTC点云模式");
      webrtcManager.setPointCloudMode(true);
    }

    // 记录重要对象
    window._debugCameraManager = cameraManager;
    window._debugWebRTCManager = webrtcManager;

    // 设置WebRTC的点云数据回调
    console.log("[App] 设置WebRTC点云数据回调函数");
    webrtcManager.setPointCloudDataCallback((positions, colors) => {
      console.log(
        `[App] 收到点云数据回调: 位置数组(${positions.length}), 颜色数组(${colors.length})`
      );
      addLog(
        "点云",
        `接收到远程点云数据: 位置数组(${positions.length}), 颜色数组(${colors.length})`
      );

      // 记录时间戳
      const receiveTime = Date.now();
      window._lastPointCloudReceiveTime = receiveTime;

      // 记录一些样本数据用于调试
      if (!window._pointCloudSampleData) {
        window._pointCloudSampleData = {
          positionsSample: positions.slice(0, 30),
          colorsSample: colors.slice(0, 30),
          timestamp: receiveTime,
        };
        console.log("[App] 存储点云样本数据:", window._pointCloudSampleData);
      }

      // 传递给摄像头管理器显示
      try {
        // 检查点云数据有效性
        if (
          positions.length > 0 &&
          colors.length > 0 &&
          positions.length === colors.length &&
          !isNaN(positions[0])
        ) {
          // 首先确认我们当前是否处于点云模式
          if (cameraManager.standardCamera.viewMode !== "pointCloud") {
            console.log(
              "[App] 收到点云数据但当前不是点云模式，自动切换到点云模式"
            );
            // 通过全局函数切换模式，确保界面也会更新
            window.handleRemoteViewModeChange("pointCloud", userIdInput);
          }

          console.log("[App] 开始处理点云数据");
          const startTime = performance.now();

          // 使用摄像头管理器处理点云数据
          cameraManager.standardCamera.receivePointCloudData(positions, colors);

          // 直接在远程canvas上显示点云数据
          if (
            webrtcManager &&
            webrtcManager.remoteCanvas &&
            webrtcManager.remoteCtx
          ) {
            // 停止远程视频渲染，避免冲突
            if (!isWindows) {
              webrtcManager.stopRemoteCanvasRendering();
              console.log("[App] 不是 Windows，停止**远程**视频渲染");
            }

            // 我们可以访问到cameraManager中已处理的点云场景
            if (
              cameraManager.standardCamera.threeJsScene &&
              cameraManager.standardCamera.threeJsCamera &&
              cameraManager.standardCamera.pointCloud
            ) {
              // 将点云场景渲染到远程canvas上
              const remoteCanvas = webrtcManager.remoteCanvas;
              const remoteCtx = webrtcManager.remoteCtx;

              // 如果Remote Canvas尚未建立Three.js渲染器，创建一个
              if (!cameraManager.standardCamera.threeJsRenderer) {
                cameraManager.standardCamera.threeJsRenderer =
                  new THREE.WebGLRenderer({
                    canvas: remoteCanvas,
                    alpha: true,
                    antialias: true,
                  });
                cameraManager.standardCamera.threeJsRenderer.setSize(
                  remoteCanvas.width,
                  remoteCanvas.height
                );
                cameraManager.standardCamera.threeJsRenderer.setClearColor(
                  0x000000,
                  0
                );

                console.log(
                  "[App] 为**远程Canvas**创建了Three.js渲染器，注意 Windows 不应该走到这里，check"
                );
              }

              // 渲染点云
              cameraManager.standardCamera.threeJsRenderer.render(
                cameraManager.standardCamera.threeJsScene,
                cameraManager.standardCamera.threeJsCamera
              );
              console.log(
                "[App] 在远程Canvas上渲染了点云,我改了这里，加了 standardCamera"
              );
            } else {
              console.log(
                "[App] 远程Canvas上没有渲染器，无法渲染点云(我改了这里，加了 standardCamera)"
              );
            }
          }

          const endTime = performance.now();
          console.log(
            `[App] 点云数据处理完成，耗时: ${(endTime - startTime).toFixed(
              2
            )}ms`
          );

          // 记录处理时间
          if (!window._pointCloudProcessTimes) {
            window._pointCloudProcessTimes = [];
          }
          window._pointCloudProcessTimes.push(endTime - startTime);

          // 每10帧输出一次统计信息
          if (window._pointCloudProcessTimes.length % 10 === 0) {
            const avgTime =
              window._pointCloudProcessTimes.reduce((a, b) => a + b, 0) /
              window._pointCloudProcessTimes.length;
            console.log(
              `[App] 点云处理性能统计: 平均时间=${avgTime.toFixed(2)}ms (${
                window._pointCloudProcessTimes.length
              }帧)`
            );
            addLog(
              "点云",
              `处理性能: 平均处理时间 ${avgTime.toFixed(2)}ms (${
                window._pointCloudProcessTimes.length
              }帧)`
            );
          }
        } else {
          console.error(
            `[App] 接收到无效的点云数据: positions=${positions.length}, colors=${colors.length}`
          );
          addLog(
            "错误",
            `接收到无效的点云数据: positions=${positions.length}, colors=${colors.length}`
          );
        }
      } catch (error) {
        console.error("[App] 处理接收到的点云数据失败:", error);
        addLog("错误", `处理接收到的点云数据失败: ${error.message}`);
      }
    });

    // 如果当前是点云模式，确保启用数据通道
    if (isWindows && cameraManager.viewMode === "pointCloud") {
      console.log("[App] 当前已处于点云模式，确保启用数据通道");
      webrtcManager.setPointCloudMode(true);
      if (webrtcManager.isConnected) {
        console.log("[App] WebRTC已连接，创建数据通道");
        webrtcManager.createDataChannel();
        addLog("系统", "已为现有连接创建点云数据通道");
      }
    } else if (
      cameraManager.standardCamera &&
      cameraManager.standardCamera.viewMode === "pointCloud"
    ) {
      console.log("[App] 当前已处于点云模式，确保启用数据通道");
      webrtcManager.setPointCloudMode(true);
      if (webrtcManager.isConnected) {
        console.log("[App] WebRTC已连接，创建数据通道");
        webrtcManager.createDataChannel();
        addLog("系统", "已为现有连接创建点云数据通道");
      }
    }

    console.log("[App] 点云数据传输已配置完成");
    addLog("系统", "点云数据传输已配置");
  }

  // 初始化网络监控功能
  function initNetworkMonitoring() {
    console.log("初始化网络监控...");
    
    // 创建网络统计对象
    window.statsNetwork = new Stats();
    window.statsNetwork.dom.style.cssText = '';
    const statsNetworkContainer = document.createElement('div');
    statsNetworkContainer.id = 'statsNetwork';
    document.getElementById('debugPanel')?.appendChild(statsNetworkContainer);
    statsNetworkContainer?.appendChild(window.statsNetwork.dom);
    
    // 设置定时器每秒更新一次网络统计
    setInterval(async () => {
      if (window.updateNetworkStats) {
        await window.updateNetworkStats();
        if (window.statsNetwork) {
          window.statsNetwork.update();
        }
      }
    }, 1000);
    
    console.log("网络监控已初始化");
    addLog("系统", "网络监控已初始化");
  }

  // 处理页面卸载事件，关闭连接
  window.addEventListener("beforeunload", () => {
    console.log("页面即将卸载，关闭所有资源...");
    addLog("系统", "正在关闭应用...");

    if (webrtcManager) {
      webrtcManager.close();
    }

    if (cameraManager) {
      // 关闭摄像头资源
      cameraManager.close();

      // 如果是 Kinect 模式，确保 Kinect 设备被正确关闭
      if (cameraManager.isKinectMode && cameraManager.kinect) {
        try {
          console.log("关闭 Kinect 设备...");
          if (cameraManager.kinect.isListening) {
            cameraManager.kinect.stopListening();
          }
          cameraManager.kinect.close();
        } catch (error) {
          console.error("关闭 Kinect 设备时出错:", error);
        }
      }
    }

    console.log("所有资源已关闭");
  });
}); 