// meeting.js - 会议室页面逻辑
document.addEventListener("DOMContentLoaded", async () => {
  console.log("会议室页面初始化中...");

  // 获取会话存储的数据
  const roomId = localStorage.getItem("meetingRoomId") || "1";
  const userName = localStorage.getItem("meetingUserName") || "未命名用户";
  const serverUrl =
    localStorage.getItem("meetingServerUrl") || "http://localhost:3001";

  // DOM 元素
  const videoGrid = document.getElementById("videoGrid");
  const connectionStatusEl = document.getElementById("connectionStatus");
  const currentRoomIdEl = document.getElementById("currentRoomId");
  const participantCountEl = document.getElementById("participantCount");

  // 控制按钮
  const micToggleBtn = document.getElementById("micToggleBtn");
  const volumeBtn = document.getElementById("volumeBtn");
  const cameraToggleBtn = document.getElementById("cameraToggleBtn");
  const effectsBtn = document.getElementById("effectsBtn");
  const leaveBtn = document.getElementById("leaveBtn");

  // 菜单和滑块
  const effectsMenu = document.getElementById("effectsMenu");
  const volumeSliderContainer = document.getElementById(
    "volumeSliderContainer"
  );
  const volumeSlider = document.getElementById("volumeSlider");

  // 状态变量
  let isMuted = false;
  let isCameraOff = false;
  let currentVideoEffect = "color";
  let participants = [];

  // 设置房间信息
  currentRoomIdEl.textContent = roomId;

  // 初始化 WebRTC 和摄像头
  let cameraManager;
  let webRTC;

  // 更新连接状态
  function updateConnectionStatus(status, type = "") {
    if (connectionStatusEl) {
      connectionStatusEl.textContent = status;
      connectionStatusEl.className = "connection-status " + type;
    }
  }

  // 更新参会人数
  function updateParticipantCount() {
    if (participantCountEl) {
      const count = participants.length;
      participantCountEl.textContent = `${count} 位参会者`;
    }
  }

  // 创建视频容器
  function createVideoContainer(userId, isLocal = false) {
    const container = document.createElement("div");
    container.className = "video-container";
    container.id = `video-${userId}`;

    if (isLocal && isCameraOff) {
      container.classList.add("video-muted");
    }

    if (isLocal && isMuted) {
      container.classList.add("audio-muted");
    }

    // 创建媒体容器（使用分层设计）
    const mediaContainer = document.createElement("div");
    mediaContainer.className = "media-container";

    // 创建颜色层（统一使用canvas）
    const colorLayer = document.createElement("canvas");
    colorLayer.className = "layer color-layer";
    colorLayer.id = isLocal
      ? "localVideoCanvas"
      : `remoteVideoCanvas-${userId}`;

    // 创建点云层
    const pointCloudLayer = document.createElement("canvas");
    pointCloudLayer.className = "layer point-cloud-layer";
    pointCloudLayer.id = isLocal
      ? "localPointCloudCanvas"
      : `remotePointCloudCanvas-${userId}`;

    // 添加层到媒体容器
    mediaContainer.appendChild(colorLayer);
    mediaContainer.appendChild(pointCloudLayer);

    // 参会者名称
    const nameTag = document.createElement("div");
    nameTag.className = "participant-name";
    nameTag.textContent = isLocal ? `${userName} (我)` : userId;

    // 本地标记
    if (isLocal) {
      const localBadge = document.createElement("div");
      localBadge.className = "local-badge";
      localBadge.textContent = "我";
      container.appendChild(localBadge);
    }

    // 视频静音图标
    const videoMutedIcon = document.createElement("div");
    videoMutedIcon.className = "video-muted-icon";
    videoMutedIcon.innerHTML = '<i class="material-icons">📷</i>';

    // 音频静音图标
    const audioMutedIcon = document.createElement("div");
    audioMutedIcon.className = "audio-muted-icon";
    audioMutedIcon.innerHTML = '<i class="material-icons">🔇</i>';

    // 添加到容器
    container.appendChild(mediaContainer);
    container.appendChild(nameTag);
    container.appendChild(videoMutedIcon);
    container.appendChild(audioMutedIcon);

    return container;
  }

  // 调整视频网格布局
  function adjustVideoGrid() {
    const totalParticipants = participants.length;

    // 调整网格列数
    if (totalParticipants <= 4) {
      videoGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
    } else if (totalParticipants <= 9) {
      videoGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
    } else {
      videoGrid.style.gridTemplateColumns = "repeat(4, 1fr)";
    }
  }

  // 添加参会者
  function addParticipant(userId, isLocal = false) {
    // 检查是否已存在
    if (participants.includes(userId)) {
      return;
    }

    // 添加到参会者列表
    participants.push(userId);

    // 创建视频容器
    const videoContainer = createVideoContainer(userId, isLocal);
    videoGrid.appendChild(videoContainer);

    // 调整布局
    adjustVideoGrid();
    updateParticipantCount();
  }

  // 移除参会者
  function removeParticipant(userId) {
    // 从列表中移除
    const index = participants.indexOf(userId);
    if (index > -1) {
      participants.splice(index, 1);
    }

    // 移除 DOM 元素
    const container = document.getElementById(`video-${userId}`);
    if (container) {
      videoGrid.removeChild(container);
    }

    // 调整布局
    adjustVideoGrid();
    updateParticipantCount();
  }

  // 切换麦克风状态
  function toggleMicrophone() {
    isMuted = !isMuted;

    // 更新按钮样式
    if (isMuted) {
      micToggleBtn.classList.add("active");
      micToggleBtn.querySelector("i").textContent = "🔇";
      document.getElementById("video-local").classList.add("audio-muted");
    } else {
      micToggleBtn.classList.remove("active");
      micToggleBtn.querySelector("i").textContent = "🎤";
      document.getElementById("video-local").classList.remove("audio-muted");
    }

    // 通知 WebRTC
    if (webRTC) {
      webRTC.toggleMute(isMuted);
    }
  }

  // 切换摄像头状态
  function toggleCamera() {
    isCameraOff = !isCameraOff;

    // 更新按钮样式
    if (isCameraOff) {
      cameraToggleBtn.classList.add("active");
      cameraToggleBtn.querySelector("i").textContent = "🚫";
      document.getElementById("video-local").classList.add("video-muted");
    } else {
      cameraToggleBtn.classList.remove("active");
      cameraToggleBtn.querySelector("i").textContent = "📹";
      document.getElementById("video-local").classList.remove("video-muted");
    }

    // 通知 WebRTC
    if (webRTC) {
      webRTC.toggleCamera(isCameraOff);
    }
  }

  // 切换视频效果
  function setVideoEffect(effect) {
    console.log(`切换视频效果到: ${effect}`);
    currentVideoEffect = effect;

    // 更新菜单选中状态
    const options = effectsMenu.querySelectorAll(".effect-option");
    options.forEach((option) => {
      if (option.dataset.effect === effect) {
        option.classList.add("active");
      } else {
        option.classList.remove("active");
      }
    });

    // 根据效果切换显示的层
    participants.forEach((userId) => {
      console.log(`处理用户 ${userId} 的视频效果切换`);
      const container = document.getElementById(`video-${userId}`);
      if (container) {
        const isLocal = userId === "local";
        const mediaContainer = container.querySelector(".media-container");
        if (mediaContainer) {
          const colorLayer = mediaContainer.querySelector(".color-layer");
          const pointCloudLayer =
            mediaContainer.querySelector(".point-cloud-layer");

          console.log(`用户 ${userId} 的层状态:`, {
            colorLayer: !!colorLayer,
            pointCloudLayer: !!pointCloudLayer,
            isLocal,
          });

          if (effect === "pointCloud") {
            // 显示点云层，隐藏颜色层
            if (colorLayer) {
              colorLayer.style.display = "none";
              console.log(`隐藏 ${userId} 的颜色层`);
            }
            if (pointCloudLayer) {
              pointCloudLayer.style.display = "block";
              console.log(`显示 ${userId} 的点云层`);
            } else {
              console.error(`未找到 ${userId} 的点云层`);
            }
          } else {
            // 显示颜色层，隐藏点云层
            if (colorLayer) {
              colorLayer.style.display = "block";
              console.log(`显示 ${userId} 的颜色层`);
            }
            if (pointCloudLayer) {
              pointCloudLayer.style.display = "none";
              console.log(`隐藏 ${userId} 的点云层`);
            }
          }
        } else {
          console.error(`未找到 ${userId} 的media-container`);
        }
      } else {
        console.error(`未找到 ${userId} 的视频容器`);
      }
    });

    // 通知 WebRTC 和摄像头管理器
    if (webRTC && cameraManager) {
      console.log("通知WebRTC和摄像头管理器切换视频模式");
      webRTC.setVideoMode(effect);
      cameraManager.setViewMode(effect);
    } else {
      console.error("WebRTC或摄像头管理器未初始化");
    }
  }

  // 离开会议
  function leaveMeeting() {
    // 断开连接
    if (webRTC) {
      webRTC.close();
    }

    // 关闭摄像头
    if (cameraManager) {
      // 根据实际情况停止视频流
      try {
        // 如果是标准摄像头
        if (cameraManager.mediaStream) {
          cameraManager.mediaStream
            .getTracks()
            .forEach((track) => track.stop());
        }

        // 如果是Kinect摄像头
        if (cameraManager.kinect) {
          cameraManager.kinect.stopListening();
          cameraManager.kinect.stopCameras();
        }
      } catch (error) {
        console.error("停止摄像头时出错:", error);
      }
    }

    // 返回登录页
    window.location.href = "login.html";
  }

  // 设置事件监听器
  micToggleBtn.addEventListener("click", toggleMicrophone);
  cameraToggleBtn.addEventListener("click", toggleCamera);
  leaveBtn.addEventListener("click", leaveMeeting);

  // 视频效果菜单
  effectsBtn.addEventListener("click", () => {
    effectsMenu.classList.toggle("show");
    volumeSliderContainer.classList.remove("show");
  });

  // 音量控制
  volumeBtn.addEventListener("click", () => {
    volumeSliderContainer.classList.toggle("show");
    effectsMenu.classList.remove("show");
  });

  // 视频效果选项
  const effectOptions = effectsMenu.querySelectorAll(".effect-option");
  effectOptions.forEach((option) => {
    option.addEventListener("click", () => {
      setVideoEffect(option.dataset.effect);
      effectsMenu.classList.remove("show");
    });
  });

  // 音量滑块
  volumeSlider.addEventListener("input", (e) => {
    const volume = parseFloat(e.target.value);
    if (webRTC) {
      webRTC.setVolume(volume);
    }
  });

  // 点击外部关闭菜单
  document.addEventListener("click", (e) => {
    if (!effectsBtn.contains(e.target) && !effectsMenu.contains(e.target)) {
      effectsMenu.classList.remove("show");
    }

    if (
      !volumeBtn.contains(e.target) &&
      !volumeSliderContainer.contains(e.target)
    ) {
      volumeSliderContainer.classList.remove("show");
    }
  });

  // 全局函数：通知远程用户模式已切换
  window.notifyRemoteModeChange = function (mode) {
    if (webrtcManager && webrtcManager.isConnected) {
      addLog("系统", `通知远程用户切换到${mode}模式`);
      webrtcManager.sendViewModeChange(mode);
    }
  };

  // 全局函数：处理远程模式变更
  window.handleRemoteViewModeChange = function (mode) {
    addLog("系统", `远程用户请求切换到${mode}模式`);
    console.log(`[App] 远程用户请求切换到${mode}模式`);

    // 检查摄像头管理器是否可用
    if (!cameraManager) {
      console.error("[App] 摄像头管理器不可用，无法切换模式");
      addLog("错误", "摄像头管理器不可用，无法切换模式");
      return;
    }

    // 检查模式是否有效
    if (mode !== "color" && mode !== "pointCloud") {
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
      // 直接调用摄像头管理器的setViewMode方法
      console.log(`[App] 调用摄像头管理器的setViewMode方法: ${mode}`);
      cameraManager.setViewMode(mode);

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
          // 检查当前模式，如果不是点云模式则切换
          if (cameraManager.viewMode !== "pointCloud") {
            console.log(
              "[App] 收到点云数据但当前不是点云模式，自动切换到点云模式"
            );
            cameraManager.setViewMode("pointCloud");

            // 更新界面选择器
            const viewModeSelect = document.getElementById("viewModeSelect");
            if (viewModeSelect) {
              viewModeSelect.value = "pointCloud";
            }
          }

          console.log("[App] 开始处理点云数据");
          const startTime = performance.now();
          cameraManager.receivePointCloudData(positions, colors);
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
    if (cameraManager.viewMode === "pointCloud") {
      console.log("[App] 当前已处于点云模式，确保启用数据通道");
      webrtcManager.setPointCloudMode(true);
      if (webrtcManager.isConnected) {
        console.log("[App] WebRTC已连接，创建数据通道");
        webrtcManager.createDataChannel();
        addLog("系统", "已为现有连接创建点云数据通道");
      }
    }

    // 添加全局测试函数来分析点云状态
    window.debugPointCloud = function () {
      console.log("[App] 执行点云调试函数");
      const status = {
        cameraManager: {
          viewMode: cameraManager.viewMode,
          pointCloudActive: cameraManager.pointCloudEnabled,
          hasPointCloudObject: !!cameraManager.pointCloud,
          animationRunning: !!cameraManager.animationFrameId,
          receivedFramesCount: cameraManager.receivedFramesCount || 0,
          lastReceiveTime: cameraManager.lastReceivedDataTime || 0,
        },
        webrtc: {
          connected: webrtcManager.isConnected,
          dataChannelActive: !!webrtcManager.dataChannel,
          pointCloudMode: webrtcManager.pointCloudMode,
        },
        lastSampleData: window._pointCloudSampleData || null,
        lastReceiveTime: window._lastPointCloudReceiveTime || 0,
        timeSinceLastFrame: window._lastPointCloudReceiveTime
          ? Date.now() - window._lastPointCloudReceiveTime + "ms"
          : "N/A",
      };

      console.log("[App] 点云调试信息:", status);

      // 尝试手动重启点云动画
      if (
        cameraManager.pointCloudEnabled &&
        !cameraManager.animationFrameId &&
        cameraManager.pointCloud
      ) {
        console.log("[App] 尝试重启点云动画循环");
        cameraManager.animatePointCloud();
        return "已尝试重启点云动画循环";
      }

      return status;
    };

    // 添加全局测试点云函数，可从控制台调用
    window.testPointCloud = function () {
      console.log("[App] 运行点云测试");
      try {
        if (cameraManager.viewMode !== "pointCloud") {
          console.log("[App] 当前不是点云模式，切换到点云模式");
          cameraManager.setViewMode("pointCloud");
        } else {
          console.log("[App] 已处于点云模式，尝试重新初始化渲染");
          if (cameraManager.animatePointCloud) {
            cameraManager.animatePointCloud();
          }
        }
        return "点云测试已执行";
      } catch (error) {
        console.error("[App] 点云测试失败:", error);
        return `点云测试失败: ${error.message}`;
      }
    };

    console.log("[App] 点云数据传输已配置完成");
    addLog("系统", "点云数据传输已配置");
  }

  // 初始化会议
  async function initializeMeeting() {
    updateConnectionStatus("正在加载摄像头...", "connecting");

    try {
      // 导入 Kinect 摄像头管理器
      const { KinectCameraManager } = require("./kinect-camera");

      // 添加本地参会者
      addParticipant("local", true);

      // 初始化摄像头
      cameraManager = await KinectCameraManager.initialize();

      // 获取本地视频
      // 初始化摄像头
      cameraManager.initialize();
      cameraManager.startStreaming(() => {
        // 空回调函数，只是为了启动视频流
        console.log("摄像头帧更新");
      });

      updateConnectionStatus(
        "摄像头已准备就绪，正在连接服务器...",
        "connecting"
      );

      // 初始化 WebRTC
      try {
        // 直接通过模块内容实例化
        let webrtcModule = require("./webrtc.js");
        // 加载webrtc.js中定义的WebRTCManager类
        webRTC = new webrtcModule.WebRTCManager();
        console.log("成功创建WebRTC实例:", webRTC);

        // 设置回调
        webRTC.setCallbacks({
          onConnected: () => {
            updateConnectionStatus("已连接", "connected");
          },
          onDisconnected: () => {
            updateConnectionStatus("连接已断开", "disconnected");
          },
          onError: (error) => {
            updateConnectionStatus(`连接错误: ${error}`, "disconnected");
          },
          onRemoteStream: (userId, stream) => {
            console.log(`收到 ${userId} 的视频流`);
            
            // 确保用户已经在participants列表中
            if (!participants.includes(userId)) {
              console.log(`用户 ${userId} 不在参会者列表中，添加该用户`);
              addParticipant(userId);
            }

            // 使用新的分层结构处理远程流
            const container = document.getElementById(`video-${userId}`);
            if (container) {
              const mediaContainer = container.querySelector(".media-container");
              if (mediaContainer) {
                // 将远程流转换为Canvas绘制
                const colorLayer = mediaContainer.querySelector(".color-layer");
                if (colorLayer) {
                  console.log(`找到 ${userId} 的颜色层canvas`);
                  // 创建隐藏的video元素处理流
                  let videoEl = document.getElementById(`hidden-video-${userId}`);
                  if (!videoEl) {
                    videoEl = document.createElement("video");
                    videoEl.id = `hidden-video-${userId}`;
                    videoEl.style.display = "none";
                    videoEl.autoplay = true;
                    videoEl.playsinline = true;
                    document.body.appendChild(videoEl);
                    console.log(`创建隐藏的video元素: hidden-video-${userId}`);
                  }

                  // 设置流到隐藏的video元素
                  videoEl.srcObject = stream;
                  console.log(`设置视频流到隐藏的video元素: hidden-video-${userId}`);

                  // 开始绘制到canvas
                  const ctx = colorLayer.getContext("2d");
                  const drawRemoteVideo = () => {
                    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
                      // 调整canvas尺寸以匹配视频
                      if (
                        colorLayer.width !== videoEl.videoWidth ||
                        colorLayer.height !== videoEl.videoHeight
                      ) {
                        colorLayer.width = videoEl.videoWidth;
                        colorLayer.height = videoEl.videoHeight;
                        console.log(`调整 ${userId} 的canvas尺寸: ${videoEl.videoWidth}x${videoEl.videoHeight}`);
                      }

                      // 绘制视频帧到canvas
                      ctx.drawImage(
                        videoEl,
                        0,
                        0,
                        colorLayer.width,
                        colorLayer.height
                      );
                    }

                    // 如果视频元素仍然存在，继续绘制循环
                    if (document.getElementById(`hidden-video-${userId}`)) {
                      requestAnimationFrame(drawRemoteVideo);
                    }
                  };

                  // 开始绘制循环
                  videoEl.onloadedmetadata = () => {
                    console.log(`视频元数据已加载: hidden-video-${userId}`);
                    drawRemoteVideo();
                  };
                } else {
                  console.error(`未找到 ${userId} 的颜色层canvas`);
                }
              } else {
                console.error(`未找到 ${userId} 的media-container`);
              }
            } else {
              console.error(`未找到 ${userId} 的视频容器，尝试重新创建`);
              // 如果找不到容器，重新添加用户
              addParticipant(userId);
            }
          },
          onUserJoined: (userId) => {
            console.log(`用户 ${userId} 加入会议`);
            addParticipant(userId);
          },
          onUserLeft: (userId) => {
            console.log(`用户 ${userId} 离开会议`);
            removeParticipant(userId);
          },
          onParticipantsList: (userIds) => {
            console.log(`收到当前房间参会者列表:`, userIds);
            // 添加房间中已有的所有参会者
            userIds.forEach((userId) => {
              if (!participants.includes(userId)) {
                console.log(`添加现有参会者: ${userId}`);
                addParticipant(userId);
              }
            });
          },
        });

        // 初始化WebRTC连接
        webRTC.init(userName, serverUrl);
        webRTC.joinRoom(roomId);

        // 获取本地流
        await webRTC.getLocalStream(cameraManager);

        // 设置默认视频效果
        setVideoEffect("color");
      } catch (error) {
        console.error("初始化WebRTC失败:", error);
        updateConnectionStatus(
          `初始化WebRTC失败: ${error.message}`,
          "disconnected"
        );
      }
    } catch (error) {
      console.error("初始化会议失败:", error);
      updateConnectionStatus(`初始化失败: ${error.message}`, "disconnected");
    }
  }

  // 启动会议
  initializeMeeting();
});
