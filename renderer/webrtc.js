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
    
    // 回调函数
    this.onConnectedCallback = null;
    this.onDisconnectedCallback = null;
    this.onRemoteStreamCallback = null;
    this.onErrorCallback = null;
    
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
      this.connectToPeer(userId, true);
    });
    
    // 监听用户断开连接
    this.socket.on('user-disconnected', (userId) => {
      this.log(`用户 ${userId} 已离开房间`);
      this.updateStatus(`用户 ${userId} 已离开房间`);
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
      
      if (this.onConnectedCallback) {
        this.onConnectedCallback();
      }
    });
    
    // 处理流事件
    this.peer.on('stream', stream => {
      this.log('收到远程媒体流');
      this.remoteStream = stream;
      
      // 播放远程视频
      const remoteVideo = document.getElementById('remoteVideo');
      if (remoteVideo) {
        remoteVideo.srcObject = stream;
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
  }
  
  close() {
    this.log('关闭WebRTC连接...');
    
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
} 