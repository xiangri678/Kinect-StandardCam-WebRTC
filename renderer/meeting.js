// meeting.js - 会议室页面逻辑
document.addEventListener('DOMContentLoaded', async () => {
  console.log('会议室页面初始化中...');
  
  // 获取会话存储的数据
  const roomId = localStorage.getItem('meetingRoomId') || '1';
  const userName = localStorage.getItem('meetingUserName') || '未命名用户';
  const serverUrl = localStorage.getItem('meetingServerUrl') || 'http://localhost:3001';
  
  // DOM 元素
  const videoGrid = document.getElementById('videoGrid');
  const connectionStatusEl = document.getElementById('connectionStatus');
  const currentRoomIdEl = document.getElementById('currentRoomId');
  const participantCountEl = document.getElementById('participantCount');
  
  // 控制按钮
  const micToggleBtn = document.getElementById('micToggleBtn');
  const volumeBtn = document.getElementById('volumeBtn');
  const cameraToggleBtn = document.getElementById('cameraToggleBtn');
  const effectsBtn = document.getElementById('effectsBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  
  // 菜单和滑块
  const effectsMenu = document.getElementById('effectsMenu');
  const volumeSliderContainer = document.getElementById('volumeSliderContainer');
  const volumeSlider = document.getElementById('volumeSlider');
  
  // 状态变量
  let isMuted = false;
  let isCameraOff = false;
  let currentVideoEffect = 'color';
  let participants = [];
  
  // 设置房间信息
  currentRoomIdEl.textContent = roomId;
  
  // 初始化 WebRTC 和摄像头
  let cameraManager;
  let webRTC;
  
  // 更新连接状态
  function updateConnectionStatus(status, type = '') {
    if (connectionStatusEl) {
      connectionStatusEl.textContent = status;
      connectionStatusEl.className = 'connection-status ' + type;
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
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = `video-${userId}`;
    
    if (isLocal && isCameraOff) {
      container.classList.add('video-muted');
    }
    
    if (isLocal && isMuted) {
      container.classList.add('audio-muted');
    }
    
    // 视频元素 (本地使用 canvas，远程使用 video)
    const videoElement = isLocal 
      ? document.createElement('canvas') 
      : document.createElement('video');
    
    videoElement.id = isLocal ? 'localVideo' : `remoteVideo-${userId}`;
    
    if (!isLocal) {
      videoElement.autoplay = true;
      videoElement.playsinline = true;
    }
    
    // 参会者名称
    const nameTag = document.createElement('div');
    nameTag.className = 'participant-name';
    nameTag.textContent = isLocal ? `${userName} (我)` : userId;
    
    // 本地标记
    if (isLocal) {
      const localBadge = document.createElement('div');
      localBadge.className = 'local-badge';
      localBadge.textContent = '我';
      container.appendChild(localBadge);
    }
    
    // 视频静音图标
    const videoMutedIcon = document.createElement('div');
    videoMutedIcon.className = 'video-muted-icon';
    videoMutedIcon.innerHTML = '<i class="material-icons">📷</i>';
    
    // 音频静音图标
    const audioMutedIcon = document.createElement('div');
    audioMutedIcon.className = 'audio-muted-icon';
    audioMutedIcon.innerHTML = '<i class="material-icons">🔇</i>';
    
    // 添加到容器
    container.appendChild(videoElement);
    container.appendChild(nameTag);
    container.appendChild(videoMutedIcon);
    container.appendChild(audioMutedIcon);
    
    return container;
  }
  
  // 调整视频网格布局
  function adjustVideoGrid() {
    const totalParticipants = participants.length;
    
    // 调整网格列数
    if (totalParticipants <= 2) {
      videoGrid.style.gridTemplateColumns = '1fr';
    } else if (totalParticipants === 3 || totalParticipants === 4) {
      videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else if (totalParticipants <= 9) {
      videoGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    } else {
      videoGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
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
      micToggleBtn.classList.add('active');
      micToggleBtn.querySelector('i').textContent = '🔇';
      document.getElementById('video-local').classList.add('audio-muted');
    } else {
      micToggleBtn.classList.remove('active');
      micToggleBtn.querySelector('i').textContent = '🎤';
      document.getElementById('video-local').classList.remove('audio-muted');
    }
    
    // 通知 WebRTC
    if (webRTC) {
      webRTC.toggleAudio(isMuted);
    }
  }
  
  // 切换摄像头状态
  function toggleCamera() {
    isCameraOff = !isCameraOff;
    
    // 更新按钮样式
    if (isCameraOff) {
      cameraToggleBtn.classList.add('active');
      cameraToggleBtn.querySelector('i').textContent = '🚫';
      document.getElementById('video-local').classList.add('video-muted');
    } else {
      cameraToggleBtn.classList.remove('active');
      cameraToggleBtn.querySelector('i').textContent = '📹';
      document.getElementById('video-local').classList.remove('video-muted');
    }
    
    // 通知 WebRTC
    if (webRTC) {
      webRTC.toggleVideo(isCameraOff);
    }
  }
  
  // 切换视频效果
  function setVideoEffect(effect) {
    currentVideoEffect = effect;
    
    // 更新菜单选中状态
    const options = effectsMenu.querySelectorAll('.effect-option');
    options.forEach(option => {
      if (option.dataset.effect === effect) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });
    
    // 通知 WebRTC 和摄像头管理器
    if (webRTC && cameraManager) {
      webRTC.setVideoMode(effect);
      cameraManager.setViewMode(effect);
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
          cameraManager.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // 如果是Kinect摄像头
        if (cameraManager.kinect) {
          cameraManager.kinect.stopListening();
          cameraManager.kinect.stopCameras();
        }
      } catch (error) {
        console.error('停止摄像头时出错:', error);
      }
    }
    
    // 返回登录页
    window.location.href = 'login.html';
  }
  
  // 设置事件监听器
  micToggleBtn.addEventListener('click', toggleMicrophone);
  cameraToggleBtn.addEventListener('click', toggleCamera);
  leaveBtn.addEventListener('click', leaveMeeting);
  
  // 视频效果菜单
  effectsBtn.addEventListener('click', () => {
    effectsMenu.classList.toggle('show');
    volumeSliderContainer.classList.remove('show');
  });
  
  // 音量控制
  volumeBtn.addEventListener('click', () => {
    volumeSliderContainer.classList.toggle('show');
    effectsMenu.classList.remove('show');
  });
  
  // 视频效果选项
  const effectOptions = effectsMenu.querySelectorAll('.effect-option');
  effectOptions.forEach(option => {
    option.addEventListener('click', () => {
      setVideoEffect(option.dataset.effect);
      effectsMenu.classList.remove('show');
    });
  });
  
  // 音量滑块
  volumeSlider.addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value);
    if (webRTC) {
      webRTC.setVolume(volume);
    }
  });
  
  // 点击外部关闭菜单
  document.addEventListener('click', (e) => {
    if (!effectsBtn.contains(e.target) && !effectsMenu.contains(e.target)) {
      effectsMenu.classList.remove('show');
    }
    
    if (!volumeBtn.contains(e.target) && !volumeSliderContainer.contains(e.target)) {
      volumeSliderContainer.classList.remove('show');
    }
  });
  
  // 初始化会议
  async function initializeMeeting() {
    updateConnectionStatus('正在加载摄像头...', 'connecting');
    
    try {
      // 导入 Kinect 摄像头管理器
      const { KinectCameraManager } = require('./kinect-camera');
      
      // 初始化摄像头
      cameraManager = await KinectCameraManager.initialize();
      
      // 添加本地参会者
      addParticipant('local', true);
      
      // 获取本地视频 - 不再调用setCanvas方法
      // 初始化摄像头
      cameraManager.initialize();
      cameraManager.startStreaming(() => {
        // 空回调函数，只是为了启动视频流
        console.log('摄像头帧更新');
      });
      
      updateConnectionStatus('摄像头已准备就绪，正在连接服务器...', 'connecting');
      
      // 初始化 WebRTC
      try {
        // 直接通过模块内容实例化
        let webrtcModule = require('./webrtc.js');
        // 加载webrtc.js中定义的WebRTCManager类
        webRTC = new webrtcModule.WebRTCManager();
        
        // 初始化WebRTC连接
        webRTC.init(userName, serverUrl);
        webRTC.joinRoom(roomId);
        
        // 获取本地流
        await webRTC.getLocalStream(cameraManager);
        
        // 设置回调
        webRTC.setCallbacks({
          onConnected: () => {
            updateConnectionStatus('已连接', 'connected');
          },
          onDisconnected: () => {
            updateConnectionStatus('连接已断开', 'disconnected');
          },
          onError: (error) => {
            updateConnectionStatus(`连接错误: ${error}`, 'disconnected');
          },
          onRemoteStream: (userId, stream) => {
            console.log(`收到 ${userId} 的视频流`);
            const videoElement = document.getElementById(`remoteVideo-${userId}`);
            if (videoElement) {
              videoElement.srcObject = stream;
            }
          },
          onUserJoined: (userId) => {
            console.log(`用户 ${userId} 加入会议`);
            addParticipant(userId);
          },
          onUserLeft: (userId) => {
            console.log(`用户 ${userId} 离开会议`);
            removeParticipant(userId);
          }
        });
      } catch (error) {
        console.error('初始化WebRTC失败:', error);
        updateConnectionStatus(`初始化WebRTC失败: ${error.message}`, 'disconnected');
      }
      
      // 设置默认视频效果
      setVideoEffect('color');
    } catch (error) {
      console.error('初始化会议失败:', error);
      updateConnectionStatus(`初始化失败: ${error.message}`, 'disconnected');
    }
  }
  
  // 启动会议
  initializeMeeting();
}); 