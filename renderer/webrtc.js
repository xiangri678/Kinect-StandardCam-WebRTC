// webrtc.js - WebRTC通信模块
class WebRTCManager {
  constructor() {
    this.socket = null;
    // 改为多对等连接模式
    this.peers = {};         // userId -> peer映射
    this.remoteStreams = {}; // userId -> stream映射
    this.localStream = null;
    this.roomId = null;
    this.userId = null;
    this.isConnected = false;
    this.localVideoStream = null;  // 单独存储视频流
    this.localAudioStream = null;  // 单独存储音频流
    
    // 数据通道相关属性
    this.dataChannels = {};  // userId -> dataChannel映射
    this.pointCloudMode = false;
    this.onPointCloudDataCallback = null;
    
    // 回调函数
    this.onConnectedCallback = null;
    this.onDisconnectedCallback = null;
    this.onRemoteStreamCallback = null;
    this.onErrorCallback = null;
    this.onUserJoinedCallback = null;
    this.onUserLeftCallback = null;
    
    // 存储房间中的用户
    this.roomUsers = new Set();
    
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
      
      // 保存房间ID
      this.roomId = data.room;
      
      // 如果服务器一并返回了房间内的现有用户列表
      if (data.users && Array.isArray(data.users)) {
        this.log(`房间内现有 ${data.users.length} 个用户`);
        
        // 更新用户列表并连接到每个用户
        data.users.forEach(existingUserId => {
          if (existingUserId !== this.userId) {
            this.roomUsers.add(existingUserId);
            this.log(`尝试连接到现有用户: ${existingUserId}`);
            // 作为新加入的用户，我们主动发起连接
            this.connectToPeer(existingUserId, true);
            
            // 通知上层有新用户
            if (this.onUserJoinedCallback) {
              this.onUserJoinedCallback(existingUserId);
            }
          }
        });
      }
    });
    
    // 监听其他用户加入房间
    this.socket.on('user-connected', (userId) => {
      this.log(`用户 ${userId} 已加入房间`);
      this.updateStatus(`用户 ${userId} 已加入，等待连接...`);
      
      // 添加到用户列表
      this.roomUsers.add(userId);
      
      // 调用用户加入回调
      if (this.onUserJoinedCallback) {
        this.onUserJoinedCallback(userId);
      }
      
      // 作为已在房间的用户，我们等待对方发起连接
      // 不主动发起连接，等待对方的offer
    });
    
    // 监听用户断开连接
    this.socket.on('user-disconnected', (userId) => {
      this.log(`用户 ${userId} 已离开房间`);
      this.updateStatus(`用户 ${userId} 已离开房间`);
      
      // 从用户列表中移除
      this.roomUsers.delete(userId);
      
      // 清理与此用户的连接
      this.cleanupPeerConnection(userId);
      
      // 调用用户离开回调
      if (this.onUserLeftCallback) {
        this.onUserLeftCallback(userId);
      }
    });
    
    // 处理接收到的信令消息
    this.socket.on('offer', async (offer, fromUserId) => {
      this.log(`收到来自 ${fromUserId} 的offer信令`);
      await this.handleOffer(offer, fromUserId);
    });
    
    this.socket.on('answer', async (answer, fromUserId) => {
      this.log(`收到来自 ${fromUserId} 的answer信令`);
      await this.handleAnswer(answer, fromUserId);
    });
    
    this.socket.on('ice-candidate', async (candidate, fromUserId) => {
      this.log(`收到来自 ${fromUserId} 的ICE候选信令`);
      await this.handleIceCandidate(candidate, fromUserId);
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
    
    // 如果已经有到此用户的连接，先清理
    if (this.peers[targetUserId]) {
      this.log(`关闭与用户 ${targetUserId} 的现有连接`);
      this.peers[targetUserId].destroy();
      delete this.peers[targetUserId];
    }
    
    // 确保本地流可用
    if (!this.localStream) {
      this.log('本地媒体流不可用，尝试获取');
      try {
        await this.getLocalStream();
      } catch (error) {
        this.error('获取本地媒体流失败', error);
        return;
      }
    }
    
    // 创建RTCPeerConnection
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };
    
    // 创建新的连接
    this.log(`创建与用户 ${targetUserId} 的新对等连接`);
    this.peers[targetUserId] = new SimplePeer({
      initiator: isInitiator,
      stream: this.localStream,
      trickle: true,
      config: configuration
    });
    
    // 获取当前对等连接的引用
    const peer = this.peers[targetUserId];
    
    // 处理信令
    peer.on('signal', data => {
      this.log(`生成与用户 ${targetUserId} 的信令数据`, data.type || '(ICE候选)');
      
      // 只在作为发起方时发送offer
      if (data.type === 'offer' && isInitiator) {
        this.log(`发送offer到对等方 ${targetUserId}`);
        this.socket.emit('offer', data, targetUserId);
      } 
      // 只在作为接收方时发送answer
      else if (data.type === 'answer' && !isInitiator) {
        this.log(`发送answer到对等方 ${targetUserId}`);
        this.socket.emit('answer', data, targetUserId);
      }
      // 发送ICE候选
      else if (data.candidate) {
        this.log(`发送ICE候选者到对等方 ${targetUserId}`);
        this.socket.emit('ice-candidate', data, targetUserId);
      }
    });
    
    // 处理连接事件
    peer.on('connect', () => {
      this.log(`与用户 ${targetUserId} 的对等连接已建立`);
      this.updateStatus(`已连接到用户 ${targetUserId}`, 'success');
      
      // 创建数据通道
      this.createDataChannel(targetUserId);
      
      // 如果这是第一个连接，调用连接回调
      if (!this.isConnected) {
        this.isConnected = true;
        if (this.onConnectedCallback) {
          this.onConnectedCallback();
        }
      }
    });
    
    // 处理数据通道事件
    peer.on('data', data => {
      try {
        this.log(`接收到来自 ${targetUserId} 的数据通道消息`, 
          typeof data === 'string' ? data.substring(0, 100) + '...' : '二进制数据');
        this.handleDataChannelMessage(data, targetUserId);
      } catch (error) {
        this.error(`接收来自 ${targetUserId} 的数据通道消息时出错`, error);
      }
    });
    
    // 处理流事件
    peer.on('stream', stream => {
      this.log(`wgd:收到来自 ${targetUserId} 的远程媒体流`);
      this.remoteStreams[targetUserId] = stream;
      
      // 如果提供了回调，通知上层处理此流
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(targetUserId, stream);
      }
    });
    
    // 处理错误
    peer.on('error', err => {
      this.error(`与用户 ${targetUserId} 的对等连接错误`, err);
      this.handleError(err, targetUserId);
    });
    
    // 处理关闭
    peer.on('close', () => {
      this.log(`与用户 ${targetUserId} 的对等连接已关闭`);
      this.cleanupPeerConnection(targetUserId);
    });
  }
  
  async handleOffer(offer, fromUserId) {
    this.log(`收到来自 ${fromUserId} 的offer`);
    
    try {
      // 检查是否已经有连接
      if (this.peers[fromUserId]) {
        this.log(`已存在与用户 ${fromUserId} 的连接，销毁旧连接`);
        this.peers[fromUserId].destroy();
        delete this.peers[fromUserId];
      }
      
      // 确保本地流可用
      if (!this.localStream) {
        this.log('本地媒体流不可用，尝试获取');
        try {
          await this.getLocalStream();
        } catch (error) {
          this.error('获取本地媒体流失败', error);
          return;
        }
      }
      
      // 创建新的连接，明确设置为非发起方
      this.log(`与用户 ${fromUserId} 未建立对等连接，创建新连接(非发起方)`);
      
      // 创建RTCPeerConnection
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      };
      
      // 显式创建非发起方的Peer对象
      this.peers[fromUserId] = new SimplePeer({
        initiator: false,
        stream: this.localStream,
        trickle: true,
        config: configuration
      });
      
      // 设置事件监听器
      const peer = this.peers[fromUserId];
      
      // 处理信令
      peer.on('signal', data => {
        this.log(`生成与用户 ${fromUserId} 的信令数据`, data.type || '(ICE候选)');
        
        // 只处理answer和ICE候选
        if (data.type === 'answer') {
          this.log(`发送answer到对等方 ${fromUserId}`);
          this.socket.emit('answer', data, fromUserId);
        } else if (data.candidate) {
          this.log(`发送ICE候选者到对等方 ${fromUserId}`);
          this.socket.emit('ice-candidate', data, fromUserId);
        }
      });
      
      // 处理连接事件
      peer.on('connect', () => {
        this.log(`与用户 ${fromUserId} 的对等连接已建立`);
        this.updateStatus(`已连接到用户 ${fromUserId}`, 'success');
        
        // 创建数据通道
        this.createDataChannel(fromUserId);
        
        // 如果这是第一个连接，调用连接回调
        if (!this.isConnected) {
          this.isConnected = true;
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        }
      });
      
      // 处理数据通道事件
      peer.on('data', data => {
        try {
          this.log(`接收到来自 ${fromUserId} 的数据通道消息`, 
            typeof data === 'string' ? data.substring(0, 100) + '...' : '二进制数据');
          this.handleDataChannelMessage(data, fromUserId);
        } catch (error) {
          this.error(`接收来自 ${fromUserId} 的数据通道消息时出错`, error);
        }
      });
      
      // 处理流事件
      peer.on('stream', stream => {
        this.log(`wgd333收到来自 ${fromUserId} 的远程媒体流`);
        this.remoteStreams[fromUserId] = stream;
        
        // 如果提供了回调，通知上层处理此流
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(fromUserId, stream);
        }
      });
      
      // 处理错误
      peer.on('error', err => {
        this.error(`与用户 ${fromUserId} 的对等连接错误`, err);
        this.handleError(err, fromUserId);
      });
      
      // 处理关闭
      peer.on('close', () => {
        this.log(`与用户 ${fromUserId} 的对等连接已关闭`);
        this.cleanupPeerConnection(fromUserId);
      });
      
      // 创建完所有事件监听器后，安全地处理offer
      this.log(`处理来自 ${fromUserId} 的offer`);
      
      // 直接处理标准格式的offer
      if (typeof offer === 'object' && offer.sdp && offer.type) {
        this.log('处理标准格式的offer');
        peer.signal(offer);
      } 
      // 如果缺少type属性，添加它
      else if (typeof offer === 'object' && offer.sdp) {
        const fixedOffer = {
          type: 'offer',
          sdp: offer.sdp
        };
        this.log('修复offer添加type属性');
        peer.signal(fixedOffer);
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
          peer.signal(fixedOffer);
        } else {
          this.error('无法识别的offer格式', offer);
        }
      } else {
        this.error('无法识别的offer格式', offer);
      }
    } catch (error) {
      this.error(`处理来自 ${fromUserId} 的offer失败`, error);
      this.handleError(error, fromUserId);
    }
  }
  
  async handleAnswer(answer, fromUserId) {
    this.log(`收到来自 ${fromUserId} 的answer`);
    
    // 检查是否有到此用户的连接
    if (!this.peers[fromUserId]) {
      this.error(`未建立与用户 ${fromUserId} 的对等连接, 无法处理answer`);
      return;
    }
    
    try {
      const peer = this.peers[fromUserId];
      
      // 直接处理标准格式的answer
      if (typeof answer === 'object' && answer.sdp && answer.type) {
        this.log('处理标准格式的answer');
        peer.signal(answer);
      } 
      // 如果缺少type属性，添加它
      else if (typeof answer === 'object' && answer.sdp) {
        const fixedAnswer = {
          type: 'answer',
          sdp: answer.sdp
        };
        this.log('修复answer添加type属性');
        peer.signal(fixedAnswer);
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
          peer.signal(fixedAnswer);
        } else {
          this.error('无法识别的answer格式', answer);
        }
      } else {
        this.error('无法识别的answer格式', answer);
      }
    } catch (error) {
      this.error(`处理来自 ${fromUserId} 的answer失败`, error);
      this.handleError(error, fromUserId);
    }
  }
  
  async handleIceCandidate(candidate, fromUserId) {
    if (!this.peers[fromUserId]) {
      this.error(`未建立与用户 ${fromUserId} 的对等连接, 无法处理ICE候选`);
      return;
    }
    
    try {
      this.log(`收到来自 ${fromUserId} 的ICE候选者数据`, candidate);
      const peer = this.peers[fromUserId];
      
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
        peer.signal(candidate);
      }
      // 如果是字符串格式
      else if (typeof candidate === 'string') {
        const fixedCandidate = {
          candidate: candidate,
          sdpMid: '0',
          sdpMLineIndex: 0
        };
        this.log('将字符串转换为标准ICE候选者格式');
        peer.signal(fixedCandidate);
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
          peer.signal(fixedCandidate);
        } else {
          this.error('无法识别的ICE候选者格式', candidate);
        }
      } else {
        this.error('无法识别的ICE候选者格式', candidate);
      }
    } catch (error) {
      this.error(`处理来自 ${fromUserId} 的ICE候选失败`, error);
      this.handleError(error, fromUserId);
    }
  }
  
  handleDisconnect() {
    // 全局断开连接处理
    this.isConnected = Object.keys(this.peers).length > 0;
    
    if (!this.isConnected && this.onDisconnectedCallback) {
      this.onDisconnectedCallback();
    }
  }
  
  handleError(error, userId = null) {
    if (userId) {
      this.error(`与用户 ${userId} 的WebRTC错误`, error);
    } else {
      this.error('WebRTC错误', error);
    }
    
    if (this.onErrorCallback) {
      this.onErrorCallback(error, userId);
    }
  }
  
  async getLocalStream(cameraManager) {
    try {
      this.log('获取本地媒体流');
      
      // 检查本地流是否已存在
      if (this.localStream) {
        this.log('已有本地媒体流，无需重新获取', {
          tracks: this.localStream.getTracks().map(t => ({
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState
          }))
        });
        return this.localStream;
      }
      
      // 首先尝试获取音频流
      this.log('尝试获取音频流');
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        
        this.log('成功获取音频流', {
          tracks: audioStream.getTracks().map(t => ({
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState
          }))
        });
        this.localAudioStream = audioStream;
      } catch (audioError) {
        this.error('获取音频流失败，将继续获取视频流', audioError);
      }
      
      // 确保摄像头管理器可用，否则尝试使用浏览器API获取视频流
      if (!cameraManager) {
        this.log('摄像头管理器不可用，尝试使用浏览器API获取视频流');
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
          
          this.log('成功获取视频流（浏览器API）', {
            tracks: videoStream.getTracks().map(t => ({
              kind: t.kind,
              label: t.label,
              enabled: t.enabled,
              readyState: t.readyState
            }))
          });
          this.localVideoStream = videoStream;
        } catch (videoError) {
          this.error('获取视频流失败', videoError);
          
          // 如果有音频流，仍然可以继续
          if (!this.localAudioStream) {
            throw new Error('无法获取任何媒体流');
          }
        }
      } else {
        // 使用摄像头管理器获取视频流
        this.log('使用摄像头管理器获取视频流');
        
        // 尝试从摄像头管理器获取当前的视频数据
        if (cameraManager.getVideoStream) {
          const videoStream = await cameraManager.getVideoStream();
          if (videoStream) {
            this.log('成功从摄像头管理器获取视频流', {
              tracks: videoStream.getTracks().map(t => ({
                kind: t.kind,
                label: t.label,
                enabled: t.enabled,
                readyState: t.readyState
              }))
            });
            this.localVideoStream = videoStream;
          } else {
            this.log('摄像头管理器未能提供视频流，将尝试创建一个视频轨道');
            // 检查是否有Canvas元素可以获取流
            if (cameraManager.canvas) {
              try {
                const canvasStream = cameraManager.canvas.captureStream(30);
                this.log('成功从Canvas获取视频流', {
                  tracks: canvasStream.getTracks().map(t => ({
                    kind: t.kind,
                    label: t.label,
                    enabled: t.enabled,
                    readyState: t.readyState
                  }))
                });
                this.localVideoStream = canvasStream;
              } catch (canvasError) {
                this.error('从Canvas获取视频流失败', canvasError);
              }
            }
          }
        }
      }
      
      // 合并音频流和视频流（如果有）
      const tracks = [];
      
      // 添加音频轨道
      if (this.localAudioStream) {
        const audioTracks = this.localAudioStream.getAudioTracks();
        if (audioTracks.length > 0) {
          this.log(`添加 ${audioTracks.length} 个音频轨道到合并流`);
          tracks.push(...audioTracks);
        }
      }
      
      // 添加视频轨道
      if (this.localVideoStream) {
        const videoTracks = this.localVideoStream.getVideoTracks();
        if (videoTracks.length > 0) {
          this.log(`添加 ${videoTracks.length} 个视频轨道到合并流`, {
            tracks: videoTracks.map(t => ({
              kind: t.kind,
              label: t.label,
              enabled: t.enabled,
              readyState: t.readyState
            }))
          });
          tracks.push(...videoTracks);
        } else {
          this.log('警告：视频流中没有视频轨道');
        }
      } else {
        this.log('警告：没有可用的视频流');
      }
      
      // 创建合并流
      if (tracks.length > 0) {
        this.localStream = new MediaStream(tracks);
        this.log(`成功创建合并媒体流，包含 ${tracks.length} 个轨道`, {
          audioTracks: this.localStream.getAudioTracks().length,
          videoTracks: this.localStream.getVideoTracks().length,
          tracks: this.localStream.getTracks().map(t => ({
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState
          }))
        });
      } else if (this.localAudioStream) {
        // 如果只有音频流，直接使用
        this.localStream = this.localAudioStream;
        this.log('没有视频轨道可用，只使用音频流');
      } else {
        // 创建一个空流，以便连接可以继续
        this.localStream = new MediaStream();
        this.log('警告：创建了空媒体流，没有音频或视频轨道');
      }
      
      return this.localStream;
    } catch (error) {
      this.error('获取本地媒体流时出错', error);
      throw error;
    }
  }
  
  combineStreams() {
    const combinedStream = new MediaStream();
    
    // 添加视频轨道
    if (this.localVideoStream) {
      const videoTracks = this.localVideoStream.getVideoTracks();
      if (videoTracks.length > 0) {
        this.log(`从localVideoStream添加 ${videoTracks.length} 个视频轨道到combinedStream`, {
          tracks: videoTracks.map(t => ({
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState
          }))
        });
        videoTracks.forEach(track => {
          combinedStream.addTrack(track);
        });
      } else {
        this.log('警告：localVideoStream中没有视频轨道');
      }
    } else {
      this.log('警告：localVideoStream不可用');
    }
    
    // 添加音频轨道
    if (this.localAudioStream) {
      const audioTracks = this.localAudioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.log(`从localAudioStream添加 ${audioTracks.length} 个音频轨道到combinedStream`);
        audioTracks.forEach(track => {
          combinedStream.addTrack(track);
        });
      }
    }
    
    // 检查合并后的流
    this.log('合并流结果', {
      audioTracks: combinedStream.getAudioTracks().length,
      videoTracks: combinedStream.getVideoTracks().length,
      allTracks: combinedStream.getTracks().map(t => ({
        kind: t.kind,
        label: t.label,
        enabled: t.enabled,
        readyState: t.readyState
      }))
    });
    
    this.localStream = combinedStream;
    
    // 如果已经创建了对等连接，需要重新添加轨道
    Object.keys(this.peers).forEach(userId => {
      if (this.peers[userId]) {
        try {
          // 先移除现有轨道
          const senders = this.peers[userId].getSenders?.();
          if (senders && senders.length > 0) {
            this.log(`正在从对等连接 ${userId} 中移除 ${senders.length} 个轨道`);
            senders.forEach(sender => {
              this.peers[userId].removeTrack(sender);
            });
          }
          
          // 添加新的合并流轨道
          const tracks = this.localStream.getTracks();
          this.log(`正在向对等连接 ${userId} 添加 ${tracks.length} 个轨道`);
          tracks.forEach(track => {
            this.peers[userId].addTrack(track, this.localStream);
          });
        } catch (error) {
          this.error(`向对等连接 ${userId} 更新轨道时出错`, error);
        }
      }
    });
    
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
    const remoteVideo = document.getElementById('remoteCanvas');
    if (remoteVideo) {
      remoteVideo.volume = value;
    }
  }
  
  setCallbacks(callbacks) { // 在 app.js initializeSession() 提供所有具体内容
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
    
    // 关闭所有对等连接
    for (const userId in this.peers) {
      try {
        if (this.peers[userId]) {
          this.peers[userId].destroy();
        }
      } catch (error) {
        this.error(`关闭与用户 ${userId} 的连接时出错`, error);
      }
    }
    
    // 清空连接和流对象
    this.peers = {};
    this.remoteStreams = {};
    this.dataChannels = {};
    
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
    
    // 清空远程视频资源
    this.remoteCanvas = null;
    this.remoteCtx = null;
    if (this.tempRemoteVideo) {
      this.tempRemoteVideo.srcObject = null;
      this.tempRemoteVideo = null;
    }
    
    // 清空房间用户列表
    this.roomUsers.clear();
    
    // 断开信令服务器连接
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.updateStatus('已断开连接');
  }
  
  // 清理与特定用户的连接
  cleanupPeerConnection(userId) {
    // 清理对等连接
    if (this.peers[userId]) {
      this.peers[userId].destroy();
      delete this.peers[userId];
    }
    
    // 清理远程流
    if (this.remoteStreams[userId]) {
      delete this.remoteStreams[userId];
    }
    
    // 清理数据通道
    if (this.dataChannels[userId]) {
      delete this.dataChannels[userId];
    }
    
    // 从用户列表中移除
    this.roomUsers.delete(userId);
    
    // 检查是否还有任何连接
    const remainingConnections = Object.keys(this.peers).length;
    if (remainingConnections === 0 && this.isConnected) {
      this.isConnected = false;
      
      // 通知断开连接
      if (this.onDisconnectedCallback) {
        this.onDisconnectedCallback();
      }
    }
  }
  
  // 创建数据通道
  createDataChannel(targetUserId) {
    try {
      this.log(`为用户 ${targetUserId} 创建数据通道`);
      
      // 标记此用户有数据通道
      this.dataChannels[targetUserId] = true;
      
      // 发送测试消息
      this.sendTestMessage(targetUserId);
      
      // 如果是点云模式，发送视图模式
      if (this.pointCloudMode) {
        this.sendViewModeChange('pointCloud', targetUserId);
      }
      
      return true;
    } catch (error) {
      this.error(`为用户 ${targetUserId} 创建数据通道失败`, error);
      delete this.dataChannels[targetUserId];
      return false;
    }
  }
  
  // 发送测试消息
  sendTestMessage(targetUserId = null) {
    try {
      const testMessage = {
        type: 'test',
        message: '数据通道测试消息',
        timestamp: Date.now()
      };
      
      // 如果指定了目标用户
      if (targetUserId && this.peers[targetUserId] && this.peers[targetUserId].connected) {
        this.log(`向用户 ${targetUserId} 发送测试消息`);
        this.peers[targetUserId].send(JSON.stringify(testMessage));
        return true;
      }
      
      // 否则向所有已连接的对等方发送
      let success = false;
      for (const userId in this.peers) {
        const peer = this.peers[userId];
        if (peer && peer.connected) {
          this.log(`向用户 ${userId} 发送测试消息`);
          peer.send(JSON.stringify(testMessage));
          success = true;
        }
      }
      
      return success;
    } catch (error) {
      this.error('发送测试消息失败', error);
      return false;
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
    if (!this.peers[this.userId] || !this.peers[this.userId].connected || !this.dataChannels[this.userId]) {
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
    if (this.peers[this.userId].bufferSize > 5000000) { // 降低缓冲区限制到5MB
      console.warn(`[WebRTC] 数据通道缓冲区已满(${this.peers[this.userId].bufferSize/1000000}MB)，跳过此帧点云数据`);
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

    try {
      if (useBinary) {
        // 创建二进制数据
        const combinedBuffer = new Float32Array(posArray.length + colArray.length);
        combinedBuffer.set(posArray);
        combinedBuffer.set(colArray, posArray.length);

        // 发送二进制数据
        this.peers[this.userId].send(combinedBuffer.buffer);
        console.log('[WebRTC] 二进制点云数据已发送');
      } else {
        // 使用JSON模式 - 更简单但传输效率较低
        const data = {
          positions: Array.from(sampledPositions),
          colors: Array.from(sampledColors)
        };
        this.peers[this.userId].send(JSON.stringify(data));
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
   * @param {String} fromUserId - 发送消息的用户ID
   */
  handleDataChannelMessage(event, fromUserId) {
    try {
      this.log(`收到来自 ${fromUserId} 的数据通道消息类型:`, typeof event);
      
      // 确定数据内容
      let data;
      if (typeof event === 'string') {
        // 如果是字符串，直接尝试解析
        this.log('收到字符串数据');
        try {
          data = JSON.parse(event);
        } catch (parseError) {
          this.error('解析JSON字符串失败:', parseError);
          return;
        }
      } else if (event instanceof ArrayBuffer || ArrayBuffer.isView(event)) {
        // 如果是ArrayBuffer或TypedArray，处理二进制数据
        this.log('收到二进制数据');
        
        // 首先尝试将二进制数据转换为字符串并解析JSON
        let isJsonData = false;
        try {
          const textDecoder = new TextDecoder();
          const dataStr = textDecoder.decode(event instanceof ArrayBuffer ? event : event.buffer);
          // 检查是否像JSON字符串
          if (dataStr.trim().startsWith('{') && dataStr.trim().endsWith('}')) {
            try {
              data = JSON.parse(dataStr);
              
              // 如果解析成功且具有类型，标记为JSON数据
              if (data && data.type) {
                isJsonData = true;
              }
            } catch (jsonError) {
              // JSON解析失败，继续尝试作为点云数据处理
            }
          }
        } catch (strError) {
          // 字符串转换失败，继续尝试作为点云数据处理
        }
        
        // 如果已成功解析为JSON数据，跳过点云处理
        if (isJsonData) {
          // 已经是JSON数据，继续处理
        } else {
          // 如果无法解析为JSON或不是有效的消息类型，假设它是点云数据
          data = {
            type: 'pointCloudData',
            binaryFormat: true,
            fromUserId: fromUserId
          };
          
          // 处理点云二进制数据
          try {
            const buffer = event instanceof ArrayBuffer ? event : event.buffer;
            const float32Array = new Float32Array(buffer);
            const totalLength = float32Array.length;
            const halfLength = Math.floor(totalLength / 2);
            
            // 分割为positions和colors
            const positions = float32Array.subarray(0, halfLength);
            const colors = float32Array.subarray(halfLength);
            
            // 调用回调函数处理点云数据
            if (this.onPointCloudDataCallback) {
              this.onPointCloudDataCallback(positions, colors, fromUserId);
              return;
            } else {
              this.log('接收到点云数据，但未设置处理回调函数');
              return;
            }
          } catch (binaryError) {
            this.error('处理二进制点云数据失败:', binaryError);
            return;
          }
        }
      } else if (event && event.data) {
        // 如果是MessageEvent对象，递归处理
        return this.handleDataChannelMessage(event.data, fromUserId);
      } else {
        this.error('无法处理的数据格式:', event);
        return;
      }
      
      // 如果已经处理了二进制点云数据，直接返回
      if (data && data.binaryFormat === true) {
        return;
      }
      
      // 处理不同类型的消息
      switch (data.type) {
        case 'pointCloudData':
          // 处理点云数据
          if (!data.positions || !data.colors) {
            this.error('接收到无效的点云数据');
            return;
          }
          
          // 将数据转换为Float32Array
          const positions = new Float32Array(data.positions);
          const colors = new Float32Array(data.colors);
          
          // 调用回调函数处理点云数据
          if (this.onPointCloudDataCallback) {
            this.onPointCloudDataCallback(positions, colors, fromUserId);
          }
          break;
          
        case 'viewModeChange':
          // 处理视图模式切换请求
          this.log(`收到视图模式切换请求: ${data.mode}`);
          
          // 尝试调用全局视图模式切换函数
          if (window.handleRemoteViewModeChange) {
            window.handleRemoteViewModeChange(data.mode, fromUserId);
          }
          break;
          
        case 'test':
          // 处理测试消息
          this.log(`收到来自 ${fromUserId} 的测试消息: ${data.message}`);
          // 回复测试消息
          this.sendTestResponse(data.timestamp, fromUserId);
          break;
          
        case 'testResponse':
          // 处理测试响应
          if (data.originalTimestamp) {
            const rtt = Date.now() - data.originalTimestamp;
            this.log(`与用户 ${fromUserId} 的测试消息往返时间: ${rtt}ms`);
          }
          break;
          
        default:
          this.log(`收到未知类型的数据: ${data.type}`);
      }
    } catch (error) {
      this.error('处理数据通道消息时出错:', error);
    }
  }
  
  /**
   * 发送测试响应消息
   * @param {number} originalTimestamp - 原始测试消息的时间戳
   * @param {string} targetUserId - 目标用户ID
   */
  sendTestResponse(originalTimestamp, targetUserId) {
    if (!targetUserId || !this.peers[targetUserId] || !this.peers[targetUserId].connected) {
      this.log('无法发送测试响应: 对等连接未建立');
      return false;
    }
    
    try {
      const response = {
        type: 'testResponse',
        message: '测试响应',
        originalTimestamp: originalTimestamp,
        timestamp: Date.now()
      };
      
      this.peers[targetUserId].send(JSON.stringify(response));
      this.log(`已向用户 ${targetUserId} 发送测试响应`);
      return true;
    } catch (error) {
      this.error('发送测试响应时出错:', error);
      return false;
    }
  }
  
  // 发送视图模式变更通知
  sendViewModeChange(mode, targetUserId = null) {
    const data = {
      type: 'viewModeChange',
      mode: mode
    };
    
    try {
      // 如果指定了目标用户
      if (targetUserId && this.peers[targetUserId] && this.peers[targetUserId].connected) {
        this.log(`向用户 ${targetUserId} 发送视图模式变更: ${mode}`);
        this.peers[targetUserId].send(JSON.stringify(data));
        return true;
      }
      
      // 否则向所有已连接的对等方发送
      let success = false;
      for (const userId in this.peers) {
        const peer = this.peers[userId];
        if (peer && peer.connected) {
          this.log(`向用户 ${userId} 发送视图模式变更: ${mode}`);
          peer.send(JSON.stringify(data));
          success = true;
        }
      }
      
      return success;
    } catch (error) {
      this.error('发送视图模式变更失败', error);
      return false;
    }
  }
  
  // 设置点云模式
  setPointCloudMode(enabled) {
    console.log(`[WebRTC] 设置点云模式: ${enabled ? '启用' : '禁用'}`);
    this.pointCloudMode = enabled;
    
    // 记录回调函数状态
    console.log(`[WebRTC] 当前点云回调函数状态: ${this.onPointCloudDataCallback ? '已设置' : '未设置'}`);
    
    // 如果已经连接，且启用点云模式，创建数据通道
    if (this.isConnected && enabled && !this.dataChannels[this.userId]) {
      console.log('[WebRTC] 点云模式已启用且已连接，创建数据通道');
      this.createDataChannel(this.userId);
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
    if (this.peers[this.userId]) {
      this.peers[this.userId].destroy();
      this.peers[this.userId] = null;
    }
    if (this.dataChannels[this.userId]) {
      this.dataChannels[this.userId].close();
      this.dataChannels[this.userId] = null;
    }
    this.init();
  }
  
  // 开始远程canvas渲染循环
  startRemoteCanvasRendering(userId) {
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
        // console.log('[WebRTC] 远程Canvas渲染循环已启动');
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
  
  // 获取房间中的用户列表
  getRoomUsers() {
    return Array.from(this.roomUsers);
  }
  
  // 获取连接中的用户列表
  getConnectedUsers() {
    return Object.keys(this.peers).filter(userId => 
      this.peers[userId] && this.peers[userId].connected);
  }
}

// 导出模块
module.exports = {
  WebRTCManager: WebRTCManager
}; 