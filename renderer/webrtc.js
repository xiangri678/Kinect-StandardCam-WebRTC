// webrtc.js - WebRTC通信模块
class WebRTCManager {
  constructor() {
    this.socket = null;
    this.peer = null;
    this.localStream = null;
    this.remoteStream = null;
    this.roomId = null;
    this.userId = null;
    this.isConnected = false;
    this.localVideoStream = null;  // 单独存储视频流
    this.localAudioStream = null;  // 单独存储音频流
    
    // 数据通道相关属性
    this.dataChannel = null;
    this.remoteDataChannel = null; 
    this.pointCloudMode = false;
    this.onPointCloudDataCallback = null;
    
    // 回调函数
    this.onConnectedCallback = null;
    this.onDisconnectedCallback = null;
    this.onRemoteStreamCallback = null;
    this.onErrorCallback = null;
    this.onUserJoinedCallback = null;
    this.onUserLeftCallback = null;
    
    // 调试模式
    this.debug = true;
  }
  
  // 调试日志
  log(message, data) {
    if (this.debug) {
      if (data) {
        console.log(`[WebRTC] ${message}`, data);
      } else {
        console.log(`[WebRTC] ${message}`);
      }
    }
  }
  
  // 错误日志
  error(message, error) {
    console.error(`[WebRTC Error] ${message}`, error);
  }
  
  init(userId, serverUrl = 'http://localhost:3001') {
    this.userId = userId || `user-${Math.floor(Math.random() * 1000000)}`;
    console.log(`初始化WebRTC，用户ID: ${this.userId}`);
    
    // 检查并修正服务器URL
    if (typeof serverUrl !== 'string' || !serverUrl.trim()) {
      this.log('警告：服务器URL无效，使用默认值');
      serverUrl = 'http://localhost:3001';
    }
    
    this.log(`连接到信令服务器: ${serverUrl}`);
    
    // 连接到信令服务器，明确指定路径
    this.socket = io(serverUrl, {
      path: '/socket.io',
      reconnectionAttempts: 5,
      timeout: 10000,
      transports: ['websocket', 'polling']
    });
    
    // 设置Socket.io事件监听
    this.setupSocketListeners();
  }
  
  setupSocketListeners() {
    this.socket.on('connect', () => {
      this.log('已连接到信令服务器');
      this.updateStatus('已连接到信令服务器', 'success');
    });
    
    this.socket.on('connect_error', (error) => {
      this.error('连接到信令服务器失败', error);
      this.updateStatus('无法连接到信令服务器', 'error');
    });
    
    this.socket.on('connect_timeout', () => {
      this.error('连接到信令服务器超时');
      this.updateStatus('连接服务器超时', 'error');
    });
    
    this.socket.on('disconnect', () => {
      this.log('与信令服务器断开连接');
      this.updateStatus('已断开连接', 'error');
      this.handleDisconnect();
    });
    
    // 监听服务器消息
    this.socket.on('server-message', (message) => {
      this.log('收到服务器消息', message);
      if (message.type === 'welcome') {
        this.log(`服务器欢迎消息: ${message.message}, Socket ID: ${message.socketId}`);
      }
    });
    
    // 监听加入房间确认
    this.socket.on('room-joined', (data) => {
      this.log(`已成功加入房间 ${data.room}, 用户ID: ${data.id}`);
      this.updateStatus(`已加入房间: ${data.room}，等待其他用户...`, 'success');
    });
    
    // 监听其他用户加入房间
    this.socket.on('user-connected', (userId) => {
      this.log(`用户 ${userId} 已加入房间`);
      this.updateStatus(`用户 ${userId} 已加入，正在建立连接...`);
      
      // 调用用户加入回调
      if (this.onUserJoinedCallback) {
        this.onUserJoinedCallback(userId);
      }
      
      this.connectToPeer(userId, true);
    });
    
    // 监听用户断开连接
    this.socket.on('user-disconnected', (userId) => {
      this.log(`用户 ${userId} 已离开房间`);
      this.updateStatus(`用户 ${userId} 已离开房间`);
      
      // 调用用户离开回调
      if (this.onUserLeftCallback) {
        this.onUserLeftCallback(userId);
      }
      
      // 如果有必要，清理与此用户的连接
    });
    
    // 处理接收到的信令消息
    this.socket.on('offer', async (offer, fromUserId) => {
      this.log(`收到来自 ${fromUserId} 的offer信令`);
      await this.handleOffer(offer, fromUserId);
    });
    
    this.socket.on('answer', async (answer, fromUserId) => {
      this.log(`收到来自 ${fromUserId} 的answer信令`);
      await this.handleAnswer(answer);
    });
    
    this.socket.on('ice-candidate', async (candidate, fromUserId) => {
      this.log(`收到来自 ${fromUserId} 的ICE候选信令`);
      await this.handleIceCandidate(candidate);
    });
  }
  
  updateStatus(message, type = '') {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = type;
    }
    
    console.log(`连接状态: ${message}`);
  }
  
  updateAudioStatus(message, type = '') {
    const audioStatusElement = document.getElementById('audioStatus');
    if (audioStatusElement) {
      audioStatusElement.textContent = message;
      audioStatusElement.className = type;
    }
    
    console.log(`音频状态: ${message}`);
  }
  
  joinRoom(roomId) {
    if (!this.socket) {
      console.error('未连接到信令服务器');
      return;
    }
    
    this.roomId = roomId;
    this.log(`加入房间: ${roomId}`);
    
    // 加入指定房间
    this.socket.emit('join-room', roomId, this.userId);
    this.updateStatus(`加入房间: ${roomId}`, 'success');
  }
  
  async connectToPeer(targetUserId, isInitiator = false) {
    this.log(`尝试连接到对等方: ${targetUserId}, 是否为发起方: ${isInitiator}`);
    
    // 创建RTCPeerConnection
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    // 如果已经有连接，关闭它
    if (this.peer) {
      this.log('关闭现有对等连接');
      this.peer.destroy();
    }
    
    // 创建新的连接
    this.log('创建新的对等连接');
    this.peer = new SimplePeer({
      initiator: isInitiator,
      stream: this.localStream,
      trickle: true,
      config: configuration
    });
    
    // 处理信令
    this.peer.on('signal', data => {
      this.log('生成信令数据', data.type || '(ICE候选)');
      
      if (data.type === 'offer') {
        // 标准offer格式，不做特殊处理
        this.log('发送offer到对等方', targetUserId);
        this.socket.emit('offer', data, targetUserId);
      } else if (data.type === 'answer') {
        // 标准answer格式，不做特殊处理
        this.log('发送answer到对等方', targetUserId);
        this.socket.emit('answer', data, targetUserId);
      } else if (data.candidate) {
        // 直接发送标准格式的ICE候选者
        this.log('发送ICE候选者到对等方', targetUserId);
        this.socket.emit('ice-candidate', data, targetUserId);
      }
    });
    
    // 处理连接事件
    this.peer.on('connect', () => {
      this.log('对等连接已建立');
      this.isConnected = true;
      this.updateStatus('已连接到远程用户', 'success');
      
      // 无论是否为发起方，都尝试创建数据通道
      this.createDataChannel();
      
      if (this.onConnectedCallback) {
        this.onConnectedCallback();
      }
    });
    
    // 处理数据通道事件
    this.peer.on('data', data => {
      try {
        // 记录接收到的原始数据
        this.log('接收到数据通道消息', typeof data === 'string' ? data.substring(0, 100) + '...' : '二进制数据');
        this.handleDataChannelMessage(data);
      } catch (error) {
        this.error('接收数据通道消息时出错', error);
      }
    });
    
    // 处理流事件
    this.peer.on('stream', stream => {
      this.log('收到远程媒体流');
      this.remoteStream = stream;
      
      // 使用canvas渲染远程视频，而不是直接设置srcObject
      const remoteVideo = document.getElementById('remoteVideo');
      if (remoteVideo) {
        // 创建远程视频渲染上下文
        this.remoteCanvas = remoteVideo;
        this.remoteCtx = remoteVideo.getContext('2d');
        
        // 设置canvas尺寸
        this.remoteCanvas.width = 640;
        this.remoteCanvas.height = 360;
        
        // 创建临时video元素用于接收媒体流
        this.tempRemoteVideo = document.createElement('video');
        this.tempRemoteVideo.autoplay = true;
        this.tempRemoteVideo.playsinline = true;
        this.tempRemoteVideo.srcObject = stream;
        
        // 开始渲染循环
        this.startRemoteCanvasRendering();
      }
      
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(stream);
      }
    });
    
    // 处理错误
    this.peer.on('error', err => {
      this.error('对等连接错误', err);
      this.handleError(err);
    });
    
    // 处理关闭
    this.peer.on('close', () => {
      this.log('对等连接已关闭');
      this.handleDisconnect();
    });
  }
  
  async handleOffer(offer, fromUserId) {
    this.log(`收到来自 ${fromUserId} 的offer`);
    
    if (!this.peer) {
      this.log('未建立对等连接，创建新连接');
      await this.connectToPeer(fromUserId, false);
    }
    
    try {
      // 直接处理标准格式的offer
      if (typeof offer === 'object' && offer.sdp && offer.type) {
        this.log('处理标准格式的offer');
        this.peer.signal(offer);
      } 
      // 如果缺少type属性，添加它
      else if (typeof offer === 'object' && offer.sdp) {
        const fixedOffer = {
          type: 'offer',
          sdp: offer.sdp
        };
        this.log('修复offer添加type属性');
        this.peer.signal(fixedOffer);
      }
      // 最后尝试从对象中找到sdp
      else if (typeof offer === 'object') {
        let sdp = null;
        for (const key in offer) {
          if (typeof offer[key] === 'string' && offer[key].indexOf('v=0') >= 0) {
            sdp = offer[key];
            break;
          }
        }
        
        if (sdp) {
          const fixedOffer = {
            type: 'offer',
            sdp: sdp
          };
          this.log('从对象中提取sdp创建offer');
          this.peer.signal(fixedOffer);
        } else {
          this.error('无法识别的offer格式', offer);
        }
      } else {
        this.error('无法识别的offer格式', offer);
      }
    } catch (error) {
      this.error('处理offer失败', error);
      this.handleError(error);
    }
  }
  
  async handleAnswer(answer) {
    this.log('收到answer');
    
    if (!this.peer) {
      this.error('未建立对等连接, 无法处理answer');
      return;
    }
    
    try {
      // 直接处理标准格式的answer
      if (typeof answer === 'object' && answer.sdp && answer.type) {
        this.log('处理标准格式的answer');
        this.peer.signal(answer);
      } 
      // 如果缺少type属性，添加它
      else if (typeof answer === 'object' && answer.sdp) {
        const fixedAnswer = {
          type: 'answer',
          sdp: answer.sdp
        };
        this.log('修复answer添加type属性');
        this.peer.signal(fixedAnswer);
      }
      // 最后尝试从对象中找到sdp
      else if (typeof answer === 'object') {
        let sdp = null;
        for (const key in answer) {
          if (typeof answer[key] === 'string' && answer[key].indexOf('v=0') >= 0) {
            sdp = answer[key];
            break;
          }
        }
        
        if (sdp) {
          const fixedAnswer = {
            type: 'answer',
            sdp: sdp
          };
          this.log('从对象中提取sdp创建answer');
          this.peer.signal(fixedAnswer);
        } else {
          this.error('无法识别的answer格式', answer);
        }
      } else {
        this.error('无法识别的answer格式', answer);
      }
    } catch (error) {
      this.error('处理answer失败', error);
      this.handleError(error);
    }
  }
  
  async handleIceCandidate(candidate) {
    if (!this.peer) {
      this.error('未建立对等连接, 无法处理ICE候选');
      return;
    }
    
    try {
      this.log('收到ICE候选者数据', candidate);
      
      // 只兼容最常见的两种情况：
      // 1. 标准WebRTC格式：{candidate, sdpMid, sdpMLineIndex}
      // 2. 极简格式：直接是candidate字符串

      // 如果是标准对象格式
      if (typeof candidate === 'object' && candidate.candidate) {
        // 确保sdpMid和sdpMLineIndex至少有一个有效值
        if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) {
          // 添加默认值
          candidate.sdpMid = '0';
          candidate.sdpMLineIndex = 0;
          this.log('添加默认的sdpMid和sdpMLineIndex');
        }
        this.log('使用标准ICE候选者格式');
        this.peer.signal(candidate);
      }
      // 如果是字符串格式
      else if (typeof candidate === 'string') {
        const fixedCandidate = {
          candidate: candidate,
          sdpMid: '0',
          sdpMLineIndex: 0
        };
        this.log('将字符串转换为标准ICE候选者格式');
        this.peer.signal(fixedCandidate);
      }
      // 如果是其他格式，尝试简单提取
      else if (typeof candidate === 'object') {
        let candStr = null;
        
        // 尝试从对象中找到candidate字符串
        for (const key in candidate) {
          if (typeof candidate[key] === 'string' && 
              candidate[key].indexOf('candidate:') >= 0) {
            candStr = candidate[key];
            break;
          }
        }
        
        if (candStr) {
          const fixedCandidate = {
            candidate: candStr,
            sdpMid: '0',
            sdpMLineIndex: 0
          };
          this.log('从对象中提取candidate字符串');
          this.peer.signal(fixedCandidate);
        } else {
          this.error('无法识别的ICE候选者格式', candidate);
        }
      } else {
        this.error('无法识别的ICE候选者格式', candidate);
      }
    } catch (error) {
      this.error('处理ICE候选失败', error);
      this.handleError(error);
    }
  }
  
  handleDisconnect() {
    this.isConnected = false;
    
    if (this.onDisconnectedCallback) {
      this.onDisconnectedCallback();
    }
  }
  
  handleError(error) {
    this.error('WebRTC错误', error);
    
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }
  
  async getLocalStream(cameraManager) {
    try {
      if (!cameraManager) {
        this.error('摄像头管理器未初始化');
        return null;
      }
      
      // 从camera.js中获取Canvas流
      const canvas = cameraManager.colorCanvas;
      if (!canvas) {
        this.error('摄像头Canvas不可用');
        return null;
      }
      
      // 创建Canvas媒体流
      const videoStream = canvas.captureStream(30); // 30fps
      this.log('成功获取Canvas视频流');
      this.localVideoStream = videoStream;
      
      // 获取麦克风音频流
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        this.log('成功获取音频流');
        this.localAudioStream = audioStream;
      } catch (audioError) {
        this.error('获取音频流失败，将继续无音频', audioError);
      }
      
      // 合并视频和音频流
      this.combineStreams();
      
      // 如果获取不到音频，也返回只有视频的流
      return this.localStream;
    } catch (error) {
      this.error('获取本地媒体流失败', error);
      return null;
    }
  }
  
  combineStreams() {
    const combinedStream = new MediaStream();
    
    // 添加视频轨道
    if (this.localVideoStream) {
      this.localVideoStream.getVideoTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
    }
    
    // 添加音频轨道
    if (this.localAudioStream) {
      this.localAudioStream.getAudioTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
    }
    
    this.localStream = combinedStream;
    
    // 如果已经创建了对等连接，需要重新添加轨道
    if (this.peer && this.isConnected) {
      // 先移除现有轨道
      const senders = this.peer.getSenders();
      if (senders && senders.length > 0) {
        senders.forEach(sender => {
          this.peer.removeTrack(sender);
        });
      }
      
      // 添加新的合并流轨道
      this.localStream.getTracks().forEach(track => {
        this.peer.addTrack(track, this.localStream);
      });
    }
    
    return this.localStream;
  }
  
  toggleMute() {
    if (!this.localStream) return false;
    
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;
    
    const isMuted = !audioTracks[0].enabled;
    
    audioTracks.forEach(track => {
      track.enabled = isMuted;
    });
    
    this.updateAudioStatus(isMuted ? '音频已静音' : '音频已开启', isMuted ? 'error' : 'success');
    return !isMuted; // 返回是否静音
  }
  
  toggleCamera() {
    if (!this.localStream) return false;
    
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;
    
    const isCameraOff = !videoTracks[0].enabled;
    
    videoTracks.forEach(track => {
      track.enabled = isCameraOff;
    });
    
    return !isCameraOff; // 返回摄像头是否关闭
  }
  
  setVolume(value) {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
      remoteVideo.volume = value;
    }
  }
  
  setCallbacks(callbacks) {
    if (callbacks.onConnected) this.onConnectedCallback = callbacks.onConnected;
    if (callbacks.onDisconnected) this.onDisconnectedCallback = callbacks.onDisconnected;
    if (callbacks.onRemoteStream) this.onRemoteStreamCallback = callbacks.onRemoteStream;
    if (callbacks.onError) this.onErrorCallback = callbacks.onError;
    if (callbacks.onUserJoined) this.onUserJoinedCallback = callbacks.onUserJoined;
    if (callbacks.onUserLeft) this.onUserLeftCallback = callbacks.onUserLeft;
  }
  
  close() {
    this.log('关闭WebRTC连接...');
    
    // 停止远程Canvas渲染
    this.stopRemoteCanvasRendering();
    
    // 清理远程视频相关资源
    this.remoteCanvas = null;
    this.remoteCtx = null;
    if (this.tempRemoteVideo) {
      this.tempRemoteVideo.srcObject = null;
      this.tempRemoteVideo = null;
    }
    
    // 清理远程Three.js渲染器
    if (this.remoteThreeJsRenderer) {
      this.remoteThreeJsRenderer.dispose();
      this.remoteThreeJsRenderer = null;
    }
    
    // 清理数据通道
    this.dataChannel = null;
    this.remoteDataChannel = null;
    
    // 关闭对等连接
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
    // 关闭本地流
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // 关闭视频流
    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach(track => track.stop());
      this.localVideoStream = null;
    }
    
    // 关闭音频流
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(track => track.stop());
      this.localAudioStream = null;
    }
    
    // 断开信令服务器连接
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.updateStatus('已断开连接');
  }
  
  // 创建数据通道
  createDataChannel() {
    try {
      console.log('[WebRTC] 创建点云数据通道 - 开始');
      
      // 如果使用simple-peer，数据通道已经内建，只需标记
      this.dataChannel = true; // 使用simple-peer时，只需要标记
      console.log('[WebRTC] 使用simple-peer内置数据通道');
      
      // 确保连接已建立
      if (!this.isConnected) {
        console.log('[WebRTC] WebRTC连接尚未建立，数据通道将在连接后可用');
        // 设置标志，当连接建立时会自动使用数据通道
        this.pointCloudMode = true;
        return false;
      }
      
      // 发送一个测试消息确认数据通道工作
      console.log('[WebRTC] 发送测试消息验证数据通道');
      this.sendTestMessage();
      
      // 如果是点云模式，立即发送视图模式消息
      if (this.pointCloudMode) {
        console.log('[WebRTC] 当前为点云模式，发送视图模式变更消息');
        this.sendViewModeChange('pointCloud');
      }
      
      console.log('[WebRTC] 点云数据通道已创建 - 完成');
      return true;
    } catch (error) {
      console.error('[WebRTC] 创建数据通道失败:', error);
      this.dataChannel = false;
      return false;
    }
  }
  
  // 发送测试消息
  sendTestMessage() {
    try {
      console.log('[WebRTC] 准备发送数据通道测试消息');
      const testMessage = {
        type: 'test',
        message: '数据通道测试消息',
        timestamp: Date.now()
      };
      
      this.peer.send(JSON.stringify(testMessage));
      console.log('[WebRTC] 数据通道测试消息已发送');
    } catch (error) {
      console.error('[WebRTC] 发送测试消息失败，数据通道可能不可用:', error);
      this.dataChannel = false;
    }
  }
  
  /**
   * 发送点云数据
   * @param {Float32Array|Array} positions - 位置数据
   * @param {Float32Array|Array} colors - 颜色数据
   * @param {boolean} useBinary - 是否使用二进制模式发送
   * @returns {boolean} - 是否成功发送
   */
  sendPointCloudData(positions, colors, useBinary = true) {
    if (!this.peer || !this.peer.connected || !this.dataChannel) {
      console.warn('[WebRTC] 连接未建立 / 数据通道未打开，无法发送点云数据');
      return false;
    }

    // 激进的节流：每500ms最多发送一次
    const now = Date.now();
    if (this._lastSendTime && now - this._lastSendTime < 500) {
      console.log('[WebRTC] 发送频率过高，跳过此帧');
      return true;
    }
    this._lastSendTime = now;

    // 检查数据通道缓冲区状态
    if (this.peer.bufferSize > 5000000) { // 降低缓冲区限制到5MB
      console.warn(`[WebRTC] 数据通道缓冲区已满(${this.peer.bufferSize/1000000}MB)，跳过此帧点云数据`);
      return true;
    }

    // 数据有效性检查
    if (!positions || !colors || positions.length === 0 || colors.length === 0) {
      console.warn('[WebRTC] 无效的点云数据');
      return false;
    }

    // 确保数据是Float32Array类型
    const posArray = positions instanceof Float32Array ? positions : new Float32Array(positions);
    const colArray = colors instanceof Float32Array ? colors : new Float32Array(colors);

    // 激进的降采样：只保留10%的点
    const sampleRate = 10;
    const sampledPositions = new Float32Array(Math.floor(posArray.length / sampleRate));
    const sampledColors = new Float32Array(Math.floor(colArray.length / sampleRate));

    for (let i = 0; i < sampledPositions.length; i += 3) {
      sampledPositions[i] = posArray[i * sampleRate];
      sampledPositions[i + 1] = posArray[i * sampleRate + 1];
      sampledPositions[i + 2] = posArray[i * sampleRate + 2];
    }

    for (let i = 0; i < sampledColors.length; i += 3) {
      sampledColors[i] = colArray[i * sampleRate];
      sampledColors[i + 1] = colArray[i * sampleRate + 1];
      sampledColors[i + 2] = colArray[i * sampleRate + 2];
    }

    console.log(`[WebRTC] 点云数据降采样: ${posArray.length/3} -> ${sampledPositions.length/3} 个点`);

    try {
      if (useBinary) {
        // 创建二进制数据
        const combinedBuffer = new Float32Array(sampledPositions.length + sampledColors.length);
        combinedBuffer.set(sampledPositions);
        combinedBuffer.set(sampledColors, sampledPositions.length);

        // 发送二进制数据
        this.peer.send(combinedBuffer.buffer);
        console.log('[WebRTC] 二进制点云数据已发送');
      } else {
        // 使用JSON模式 - 更简单但传输效率较低
        const data = {
          positions: Array.from(sampledPositions),
          colors: Array.from(sampledColors)
        };
        this.peer.send(JSON.stringify(data));
        console.log('[WebRTC] JSON点云数据已发送');
      }
      return true;
    } catch (error) {
      console.error('[WebRTC] 发送点云数据时出错:', error);
      
      // 如果是因为缓冲区已满导致的错误，尝试重新连接
      if (error.message && error.message.includes('send queue is full')) {
        console.warn('[WebRTC] 数据通道缓冲区已满，尝试重新连接');
        this.reconnect();
      }
      
      return false;
    }
  }
  
  /**
   * 处理数据通道消息
   * @param {MessageEvent|ArrayBuffer|String} event - 接收到的消息事件或数据
   */
  handleDataChannelMessage(event) {
    try {
      console.log('[WebRTC] 收到数据通道消息类型:', typeof event);
      
      // 确定数据内容
      let data;
      if (typeof event === 'string') {
        // 如果是字符串，直接尝试解析
        console.log('[WebRTC] 收到字符串数据');
        try {
          data = JSON.parse(event);
        } catch (parseError) {
          console.error('[WebRTC] 解析JSON字符串失败:', parseError);
          return;
        }
      } else if (event instanceof ArrayBuffer || ArrayBuffer.isView(event)) {
        // 如果是ArrayBuffer或TypedArray
        console.log('[WebRTC] 收到二进制数据, 长度:', event.byteLength || event.buffer.byteLength);
        
        // 首先尝试将二进制数据转换为字符串并解析JSON
        let isJsonData = false;
        try {
          const textDecoder = new TextDecoder();
          const dataStr = textDecoder.decode(event instanceof ArrayBuffer ? event : event.buffer);
          // 检查是否像JSON字符串
          if (dataStr.trim().startsWith('{') && dataStr.trim().endsWith('}')) {
            console.log('[WebRTC] 二进制数据可能是JSON字符串，尝试解析');
            try {
              data = JSON.parse(dataStr);
              console.log(`[WebRTC] 成功从二进制数据解析JSON, 类型: ${data.type}`);
              
              // 如果解析成功且具有类型，标记为JSON数据
              if (data && data.type) {
                isJsonData = true;
              }
            } catch (jsonError) {
              console.log('[WebRTC] 无法将二进制数据解析为JSON，尝试作为点云数据处理');
              // JSON解析失败，继续尝试作为点云数据处理
            }
          }
        } catch (strError) {
          console.log('[WebRTC] 无法将二进制数据转换为字符串，尝试作为点云数据处理');
          // 字符串转换失败，继续尝试作为点云数据处理
        }
        
        // 如果已成功解析为JSON数据，跳过点云处理
        if (isJsonData) {
          // 已经是JSON数据，继续处理
        } else {
          // 如果无法解析为JSON或不是有效的消息类型，假设它是点云数据
          console.log('[WebRTC] 尝试将二进制数据作为点云数据处理');
          data = {
            type: 'pointCloudData',
            binaryFormat: true
          };
          
          // 处理点云二进制数据
          try {
            const buffer = event instanceof ArrayBuffer ? event : event.buffer;
            const float32Array = new Float32Array(buffer);
            const totalLength = float32Array.length;
            const halfLength = totalLength / 2;
            
            // 分割为positions和colors
            const positions = float32Array.subarray(0, halfLength);
            const colors = float32Array.subarray(halfLength);
            
            console.log(`[WebRTC] 从二进制数据提取: 位置数组长度=${positions.length}, 颜色数组长度=${colors.length}`);
            
            // 调用回调函数处理点云数据
            if (this.onPointCloudDataCallback) {
              console.log('[WebRTC] 调用点云数据回调处理二进制数据');
              this.onPointCloudDataCallback(positions, colors);
              return;
            } else {
              console.warn('[WebRTC] 接收到点云数据，但未设置处理回调函数');
              return;
            }
          } catch (binaryError) {
            console.error('[WebRTC] 处理二进制点云数据失败:', binaryError);
            // 既不是JSON也不是点云数据，无法处理
            console.error('[WebRTC] 收到的二进制数据无法解析为JSON或点云数据');
            return;
          }
        }
      } else if (event && event.data) {
        // 如果是MessageEvent对象
        const rawData = event.data;
        console.log('[WebRTC] 从事件中提取数据, 类型:', typeof rawData);
        
        if (typeof rawData === 'string') {
          try {
            data = JSON.parse(rawData);
          } catch (parseError) {
            console.error('[WebRTC] 解析事件中的JSON字符串失败:', parseError);
            return;
          }
        } else {
          // 递归调用自身处理非字符串数据
          console.log('[WebRTC] 递归处理非字符串事件数据');
          return this.handleDataChannelMessage(rawData);
        }
      } else {
        console.error('[WebRTC] 无法处理的数据格式:', event);
        return;
      }
      
      // 如果已经处理了二进制点云数据，直接返回
      if (data && data.binaryFormat === true) {
        return;
      }
      
      // 如果成功解析为JSON对象，处理不同类型的消息
      console.log(`[WebRTC] [接收] 数据类型: ${data.type}`);
      
      switch (data.type) {
        case 'pointCloudData':
          // 处理点云数据
          if (!data.positions || !data.colors) {
            console.error('[WebRTC] 接收到无效的点云数据: 缺少位置或颜色数据');
            return;
          }
          
          console.log(`[WebRTC] 接收到点云数据: 位置数组长度=${data.positions.length}, 颜色数组长度=${data.colors.length}`);
          
          // 将数据转换为Float32Array以提高性能
          const positions = new Float32Array(data.positions);
          const colors = new Float32Array(data.colors);
          
          // 简化验证，只做基本长度检查
          if (positions.length !== colors.length) {
            console.error(`[WebRTC] 点云数据不匹配: 位置长度(${positions.length}) 不等于颜色长度(${colors.length})`);
            return;
          }
          
          // 调用回调函数处理点云数据
          if (this.onPointCloudDataCallback) {
            console.log('[WebRTC] 调用点云数据回调函数');
            try {
              this.onPointCloudDataCallback(positions, colors);
              console.log('[WebRTC] 点云数据回调函数执行完成');
            } catch (callbackError) {
              console.error('[WebRTC] 执行点云数据回调时出错:', callbackError);
            }
          } else {
            console.warn('[WebRTC] 接收到点云数据，但未设置处理回调函数');
          }
          break;
          
        case 'viewModeChange':
          // 处理视图模式切换请求
          console.log(`[WebRTC] 收到视图模式切换请求: ${data.mode}`);
          
          // 尝试调用全局视图模式切换函数
          if (window.handleRemoteViewModeChange) {
            console.log(`[WebRTC] 调用全局处理函数 handleRemoteViewModeChange 切换到 ${data.mode} 模式`);
            try {
              window.handleRemoteViewModeChange(data.mode);
              console.log(`[WebRTC] 视图模式切换完成: ${data.mode}`);
            } catch (e) {
              console.error('[WebRTC] 切换视图模式时出错:', e);
            }
          } else {
            console.warn('[WebRTC] 收到视图模式切换请求，但未找到 handleRemoteViewModeChange 全局函数');
          }
          break;
          
        case 'test':
          // 处理测试消息
          console.log(`[WebRTC] 收到测试消息: ${data.message}`);
          // 回复测试消息
          this.sendTestResponse(data.timestamp);
          break;
          
        case 'testResponse':
          // 处理测试响应
          if (data.originalTimestamp) {
            const rtt = Date.now() - data.originalTimestamp;
            console.log(`[WebRTC] 测试消息往返时间: ${rtt}ms`);
          }
          break;
          
        default:
          console.warn(`[WebRTC] 收到未知类型的数据: ${data.type}`);
      }
    } catch (error) {
      console.error('[WebRTC] 处理数据通道消息时出错:', error);
      try {
        console.log('[WebRTC] 原始消息内容:', typeof event === 'string' ? 
          event.substring(0, 100) + '...' : 
          '(非文本数据)');
        
        // 如果是对象，输出更多信息以便调试
        if (typeof event === 'object' && event !== null) {
          console.log('[WebRTC] 消息对象属性:', Object.keys(event));
          if (event.constructor && event.constructor.name) {
            console.log('[WebRTC] 消息对象类型:', event.constructor.name);
          }
        }
      } catch (e) {
        console.error('[WebRTC] 无法记录原始消息:', e);
      }
    }
  }
  
  /**
   * 发送测试响应消息
   * @param {number} originalTimestamp - 原始测试消息的时间戳
   */
  sendTestResponse(originalTimestamp) {
    if (!this.peer || !this.peer.connected) {
      console.warn('[WebRTC] 无法发送测试响应: 对等连接未建立');
      return false;
    }
    
    try {
      const response = {
        type: 'testResponse',
        message: '测试响应',
        originalTimestamp: originalTimestamp,
        timestamp: Date.now()
      };
      
      this.peer.send(JSON.stringify(response));
      console.log('[WebRTC] 已发送测试响应');
      return true;
    } catch (error) {
      console.error('[WebRTC] 发送测试响应时出错:', error);
      return false;
    }
  }
  
  // 发送视图模式变更通知
  sendViewModeChange(mode) {
    if (!this.isConnected || !this.dataChannel) {
      this.log('[WebRTC] 无法发送模式变更：连接未建立或数据通道未创建');
      return;
    }
    
    try {
      this.log(`[WebRTC] 发送视图模式变更: ${mode}`);
      
      const data = {
        type: 'viewModeChange',
        mode: mode
      };
      
      console.log(`[WebRTC] 正在通过数据通道发送视图模式变更: ${mode}`);
      this.peer.send(JSON.stringify(data));
      console.log(`[WebRTC] 视图模式变更已发送: ${mode}`);
    } catch (error) {
      this.error('[WebRTC] 发送视图模式变更失败', error);
    }
  }
  
  // 设置点云模式
  setPointCloudMode(enabled) {
    console.log(`[WebRTC] 设置点云模式: ${enabled ? '启用' : '禁用'}`);
    this.pointCloudMode = enabled;
    
    // 记录回调函数状态
    console.log(`[WebRTC] 当前点云回调函数状态: ${this.onPointCloudDataCallback ? '已设置' : '未设置'}`);
    
    // 如果已经连接，且启用点云模式，创建数据通道
    if (this.isConnected && enabled && !this.dataChannel) {
      console.log('[WebRTC] 点云模式已启用且已连接，创建数据通道');
      this.createDataChannel();
    }
  }
  
  // 设置点云数据回调
  setPointCloudDataCallback(callback) {
    console.log('[WebRTC] 设置点云数据回调函数', callback ? '已提供' : '未提供');
    this.onPointCloudDataCallback = callback;
  }
  
  // 添加重连方法
  reconnect() {
    console.log('[WebRTC] 开始重新连接...');
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    this.init();
  }
  
  // 开始远程canvas渲染循环
  startRemoteCanvasRendering() {
    if (!this.remoteCanvas || !this.remoteCtx || !this.tempRemoteVideo) {
      this.error('无法启动远程Canvas渲染：缺少必要组件');
      return;
    }
    
    this.log('开始远程Canvas渲染循环');
    
    // 渲染循环函数
    const renderFrame = () => {
      // 只有当远程视频准备好时才渲染
      if (this.tempRemoteVideo.readyState >= 2) {
        this.remoteCtx.drawImage(
          this.tempRemoteVideo,
          0, 0,
          this.remoteCanvas.width,
          this.remoteCanvas.height
        );
      }
      
      // 如果仍然连接中，继续渲染循环
      // if (this.isConnected) {
        this.remoteCanvasAnimationId = requestAnimationFrame(renderFrame);
        console.log('[WebRTC] 远程Canvas渲染循环已启动');
      // }
    };
    
    // 开始渲染循环
    this.remoteCanvasAnimationId = requestAnimationFrame(renderFrame);
  }
  
  // 停止远程canvas渲染
  stopRemoteCanvasRendering() {
    if (this.remoteCanvasAnimationId) {
      cancelAnimationFrame(this.remoteCanvasAnimationId);
      this.remoteCanvasAnimationId = null;
    }
  }
}

// 导出模块
module.exports = {
  WebRTCManager: WebRTCManager
}; 