// camera.js - 标准摄像头模块，替代Kinect功能
console.log('加载标准摄像头模块...');

// CameraManager类 - 负责处理普通摄像头
class CameraManager {
  // 静态初始化方法，返回Promise
  static async initialize() {
    console.log('初始化标准摄像头模块...');
    return new CameraManager();
  }
  
  constructor() {
    console.log("创建CameraManager实例");

    // 基本属性初始化
    this.isRunning = false;
    this.localCanvas = document.getElementById("localCanvas");
    this.localCtx = this.localCanvas ? this.localCanvas.getContext("2d") : null;
    this.remoteCanvas = document.getElementById("remoteCanvas");
    this.remoteCtx = this.remoteCanvas
      ? this.remoteCanvas.getContext("2d")
      : null;
    this.videoElement = null; // 用于显示摄像头视频的元素
    this.mediaStream = null; // 媒体流
    this.onFrameCallback = null; // 帧回调函数
    this.localVideoFrameId = null; // 本地视频渲染循环ID
    // this.remoteVideoFrameId = null; // 远程视频渲染循环ID
    // this.pointCloudFrameId = null; // 点云渲染循环ID
    this.animationFrameId = null; // 远程渲染公用的循环ID
    this.isSimulated = false; // 是否使用模拟模式
    this.simulationInterval = null; // 模拟模式的定时器

    // 点云相关属性
    this.viewMode = "color"; // 'color' 或 'pointCloud'
    this.pointCloudCanvas = null;
    this.pointCloudEnabled = false;
    this.threeJsRenderer = null;
    this.threeJsScene = null;
    this.threeJsCamera = null;
    this.threeJsControls = null;
    this.pointCloud = null;
    this.remotePointCloudActive = false;
    this.lastReceivedDataTime = 0;
    this.receivedFramesCount = 0;

    // 绑定模式切换事件
    const viewModeSelect = document.getElementById("viewModeSelect");
    if (viewModeSelect) {
      viewModeSelect.addEventListener("change", (event) => {
        this.setViewMode(event.target.value);
      });
    }

    // 创建一个隐藏的视频元素用于获取摄像头流
    this.createVideoElement();
  }
  
  // 创建视频元素
  createVideoElement() {
    this.videoElement = document.createElement('video');
    this.videoElement.setAttribute('autoplay', '');
    this.videoElement.setAttribute('playsinline', '');
    this.videoElement.setAttribute('muted', '');
    this.videoElement.style.display = 'none';
    
    // 添加到文档中但隐藏
    document.body.appendChild(this.videoElement);
  }
  
  // 初始化摄像头
  initialize() {
    console.log('初始化标准摄像头 - 开始');
    
    // 尝试绘制测试图案
    this.drawTestPattern();
    
    console.log('初始化标准摄像头 - 完成');
    return true;
  }
  
  // 启动摄像头流
  async startStreaming(onFrameCallback) {
    console.log('启动摄像头流 - 开始');
    this.onFrameCallback = onFrameCallback;
    
    // 检查是否已经运行
    if (this.isRunning) {
      console.log('摄像头流已在运行中');
      return true;
    }
    
    // 定义不同的视频约束选项，从高到低质量
    const videoConstraints = [
      { // 高质量
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      { // 中等质量
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 }
      },
      { // 低质量
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 15 }
      },
      { // 最低质量，无特定约束
        facingMode: "user"
      }
    ];
    
    // 尝试获取摄像头流
    let lastError = null;
    
    // 依次尝试不同的视频约束
    for (let i = 0; i < videoConstraints.length; i++) {
      try {
        console.log(`尝试获取摄像头，配置方案 ${i+1}/${videoConstraints.length}:`, videoConstraints[i]);
        
        // 检查摄像头可用性
        if (i === 0) { // 只在第一次尝试时检查设备
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          console.log(`发现${videoDevices.length}个视频输入设备:`, videoDevices.map(d => d.label || '未命名设备'));
          
          if (videoDevices.length === 0) {
            console.error('未检测到摄像头设备');
            throw new Error('未检测到摄像头设备');
          }
        }
        
        // 请求获取摄像头权限
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints[i],
          audio: false
        });
        
        console.log(`成功获取摄像头流，使用配置方案 ${i+1}`);
        this.mediaStream = stream;
        
        // 将摄像头流绑定到视频元素
        this.videoElement.srcObject = stream;
        
        // 当视频可以播放时开始处理帧
        this.videoElement.onloadedmetadata = () => {
          console.log('视频元数据已加载，开始播放');
          this.videoElement.play();
          
          // 开始帧循环
          this.startFrameLoop();
        };
        
        this.isRunning = true;
        return true;
      } catch (error) {
        console.error(`尝试配置方案 ${i+1} 失败:`, error);
        lastError = error;
        
        // 如果错误是权限被拒绝或设备不可用，不再尝试其他配置
        if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
          console.error('摄像头访问被拒绝或设备不可用，停止尝试');
          break;
        }
        
        // 继续尝试下一个配置
      }
    }
    
    // 所有尝试都失败了，显示错误并切换到模拟模式
    console.error('所有摄像头获取尝试均失败:', lastError);
    
    // 添加详细错误诊断
    if (lastError && lastError.name) {
      switch(lastError.name) {
        case 'NotFoundError':
          console.error('未找到摄像头设备。请确保摄像头已正确连接。');
          break;
        case 'NotAllowedError':
          console.error('摄像头权限被拒绝。请在浏览器设置中允许摄像头访问。');
          break;
        case 'NotReadableError':
          console.error('摄像头可能被其他应用程序占用。请关闭可能使用摄像头的其他应用。');
          break;
        case 'OverconstrainedError':
          console.error('摄像头不满足请求的约束条件。尝试降低分辨率或帧率。');
          break;
        case 'AbortError':
          console.error('获取摄像头的操作被中止。');
          break;
        case 'SecurityError':
          console.error('使用摄像头被安全策略阻止。');
          break;
        case 'TypeError':
          console.error('摄像头参数类型错误。');
          break;
        default:
          console.error(`未知错误类型: ${lastError.name}`);
      }
    }
    
    // 显示用户友好的错误提示
    const errorMessage = document.createElement('div');
    errorMessage.style.position = 'absolute';
    errorMessage.style.top = '10px';
    errorMessage.style.left = '10px';
    errorMessage.style.padding = '10px';
    errorMessage.style.backgroundColor = 'rgba(255,0,0,0.7)';
    errorMessage.style.color = 'white';
    errorMessage.style.borderRadius = '5px';
    errorMessage.style.zIndex = '1000';
    errorMessage.textContent = `摄像头访问失败: ${lastError.message || '未知错误'}。正在切换到模拟模式。`;
    document.body.appendChild(errorMessage);
    
    // 3秒后移除错误提示
    setTimeout(() => {
      if (errorMessage.parentNode) {
        errorMessage.parentNode.removeChild(errorMessage);
      }
    }, 5000);
    
    console.log('切换到模拟模式');
    
    // 失败时切换到模拟模式
    this.isSimulated = true;
    this.startSimulatedStream();
    
    return true;
  }
  
  // 开始帧循环
  startFrameLoop() {
    console.log('开始本地彩色视频流帧循环');
    
    const processFrame = () => {
      // console.log('[Camera] 处理视频帧开始');
      
      // 检查视频是否已准备好以及Canvas是否存在
      if (this.videoElement && this.videoElement.readyState === 4 && this.localCanvas && this.localCtx) {
        // console.log(`[Camera] 视频元素就绪状态: ${this.videoElement.readyState}, 尺寸: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`);
        
        // 调整Canvas尺寸以匹配视频
        if (this.localCanvas.width !== this.videoElement.videoWidth || 
            this.localCanvas.height !== this.videoElement.videoHeight) {
          // console.log(`[Camera] 调整Canvas尺寸: ${this.localCanvas.width}x${this.localCanvas.height} -> ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`);
          this.localCanvas.width = this.videoElement.videoWidth;
          this.localCanvas.height = this.videoElement.videoHeight;
        }
        
        // 将视频帧绘制到Canvas
        // console.log('[Camera] 将视频帧绘制到Canvas');
        this.localCtx.drawImage(this.videoElement, 0, 0);
        
        // 调用帧回调
        if (this.onFrameCallback) {
          // console.log('[Camera] 调用帧回调函数');
          const frameData = {
            localCanvas: this.localCanvas,
            timestamp: Date.now(),
            width: this.localCanvas.width,
            height: this.localCanvas.height
          };
          
          // console.log(`[Camera] 帧数据: 时间戳=${frameData.timestamp}, 尺寸=${frameData.width}x${frameData.height}`);
          this.onFrameCallback(frameData);
        } else {
          console.log('[Camera] 没有设置帧回调函数');
        }
      } else {
        console.warn('[Camera] 视频帧处理条件不满足');
        if (!this.localCanvas) {
          console.warn('[Camera] Canvas元素未找到，帧处理暂停');
        } else if (!this.videoElement) {
          console.warn('[Camera] 视频元素未找到，帧处理暂停');
        } else if (this.videoElement.readyState !== 4) {
          console.warn(`[Camera] 视频元素未就绪，当前状态: ${this.videoElement.readyState}`);
        } else if (!this.localCtx) {
          console.warn('[Camera] Canvas上下文未找到，帧处理暂停');
        }
      }
      
      // 继续下一帧
      if (this.isRunning) {
        // console.log('[Camera] 请求下一帧动画');
        this.localVideoFrameId = requestAnimationFrame(processFrame);
      } else {
        console.log('[Camera] 摄像头已停止运行，不再请求下一帧');
      }
    };
    
    // 启动帧循环
    console.log('[Camera] 启动本地视频帧循环');
    this.localVideoFrameId = requestAnimationFrame(processFrame);
  }
  
  // 绘制测试图案（当摄像头不可用时使用）
  drawTestPattern() {
    if (!this.localCanvas || !this.localCtx) {
      console.warn('Canvas上下文不可用，无法绘制测试图案');
      return;
    }
    
    console.log('绘制测试图案...');
    
    // 设置画布大小
    this.localCanvas.width = 640;
    this.localCanvas.height = 480;
    
    // 绘制渐变背景
    const gradient = this.localCtx.createLinearGradient(0, 0, this.localCanvas.width, this.localCanvas.height);
    gradient.addColorStop(0, 'blue');
    gradient.addColorStop(1, 'purple');
    this.localCtx.fillStyle = gradient;
    this.localCtx.fillRect(0, 0, this.localCanvas.width, this.localCanvas.height);
    
    // 添加网格
    this.localCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.localCtx.lineWidth = 1;
    
    // 水平线
    for (let y = 0; y < this.localCanvas.height; y += 40) {
      this.localCtx.beginPath();
      this.localCtx.moveTo(0, y);
      this.localCtx.lineTo(this.localCanvas.width, y);
      this.localCtx.stroke();
    }
    
    // 垂直线
    for (let x = 0; x < this.localCanvas.width; x += 40) {
      this.localCtx.beginPath();
      this.localCtx.moveTo(x, 0);
      this.localCtx.lineTo(x, this.localCanvas.height);
      this.localCtx.stroke();
    }
    
    // 添加标准摄像头WebRTC的标题
    this.localCtx.font = '24px Arial';
    this.localCtx.fillStyle = 'white';
    this.localCtx.textAlign = 'center';
    this.localCtx.fillText('标准摄像头 WebRTC', this.localCanvas.width / 2, 50);
    this.localCtx.font = '16px Arial';
    this.localCtx.fillText('请允许摄像头权限或等待摄像头初始化', this.localCanvas.width / 2, 80);
  }
  
  // 启动模拟数据流（当摄像头不可用时使用）
  startSimulatedStream() {
    console.log('启动模拟数据流...');
    
    // 动画参数
    let animationPhase = 0;
    
    // 每秒更新30次图像（30fps）模拟真实摄像头
    this.simulationInterval = setInterval(() => {
      // 绘制基本测试图案
      this.drawTestPattern();
      
      // 添加简单动画
      this.addAnimationEffects(animationPhase);
      animationPhase += 0.1;
      
      // 调用回调函数，提供模拟的帧数据
      if (this.onFrameCallback) {
        const frameData = {
          localCanvas: this.localCanvas,
          timestamp: Date.now(),
          isSimulated: true,
          width: this.localCanvas.width,
          height: this.localCanvas.height
        };
        
        this.onFrameCallback(frameData);
      }
    }, 33); // 约30fps
    
    console.log('模拟数据流已启动');
  }
  
  // 添加动画效果
  addAnimationEffects(phase) {
    if (!this.localCtx) return;
    
    const ctx = this.localCtx;
    const width = this.localCanvas.width;
    const height = this.localCanvas.height;
    
    // 添加一些随时间变化的动态元素
    
    // 浮动粒子
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < 20; i++) {
      const x = width * 0.2 + Math.sin(phase + i * 0.5) * width * 0.1 + Math.random() * width * 0.6;
      const y = height * 0.1 + Math.cos(phase * 0.7 + i * 0.3) * height * 0.2 + Math.random() * height * 0.6;
      const size = 2 + Math.sin(phase + i) * 1.5;
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 添加模拟用户轮廓
    this.drawHumanOutline(phase);
    
    // 添加时间戳
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'right';
    const timeStr = new Date().toLocaleTimeString();
    ctx.fillText(`模拟时间: ${timeStr}`, width - 10, height - 10);
  }
  
  // 绘制人形轮廓
  drawHumanOutline(phase) {
    if (!this.localCtx) return;
    
    const ctx = this.localCtx;
    const width = this.localCanvas.width;
    const height = this.localCanvas.height;
    
    // 中心位置
    const centerX = width / 2 + Math.sin(phase * 0.5) * 20;
    const centerY = height / 2;
    
    // 头部
    const headRadius = 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 80, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.stroke();
    
    // 身体
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 40);
    ctx.lineTo(centerX, centerY + 80);
    ctx.stroke();
    
    // 手臂
    const armAngle = Math.sin(phase) * 0.2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 20);
    ctx.lineTo(centerX - 70 * Math.cos(armAngle), centerY + 20 * Math.sin(armAngle));
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 20);
    ctx.lineTo(centerX + 70 * Math.cos(armAngle), centerY + 20 * Math.sin(armAngle));
    ctx.stroke();
    
    // 腿
    const legAngle = Math.sin(phase) * 0.1;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 80);
    ctx.lineTo(centerX - 50 * Math.sin(legAngle), centerY + 180);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 80);
    ctx.lineTo(centerX + 50 * Math.sin(legAngle), centerY + 180);
    ctx.stroke();
  }
  
  // 设置 mac 视图模式
  setViewMode(mode) {
    if (mode !== 'color' && mode !== 'pointCloud') {
      console.error('无效的视图模式:', mode);
      return;
    }
    
    console.log(`[Camera] 设置视图模式: ${mode}, 当前模式: ${this.viewMode}`);
    
    // 检查THREE.js是否可用
    const THREE = window.THREE;
    if (mode === 'pointCloud' && (!THREE || !this.checkWebGLSupport())) {
      console.error('[Camera] 点云模式不可用: THREE.js库未加载或WebGL不受支持');
      console.log('[Camera] THREE状态:', THREE ? 'THREE.js已加载' : 'THREE.js未加载');
      console.log('[Camera] WebGL支持状态:', this.checkWebGLSupport() ? '支持' : '不支持');
      alert('点云模式不可用: 您的浏览器可能不支持WebGL或THREE.js库未正确加载');
      
      // 更新视图模式选择器
      const viewModeSelect = document.getElementById('viewModeSelect');
      if (viewModeSelect) {
        viewModeSelect.value = 'color';
      }
      return;
    }
    
    // 如果已经处于该模式，则不做任何事情
    if (this.viewMode === mode) {
      console.log(`[Camera] 已经处于${mode}模式，无需切换`);
      return;
    }
    
    console.log(`[Camera] 开始从${this.viewMode}模式切换到${mode}模式`);
    
    // 停止渲染循环但不关闭设备
    if (this.animationFrameId) {
      console.log(`[Camera] 取消现有的动画帧ID: ${this.animationFrameId}`);
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // 记住旧的回调函数，用于后续重新应用
    const previousCallback = this.onFrameCallback;
    console.log(`[Camera] 保存现有回调函数: `, previousCallback ? '有效' : '无效');
    
    // 更新视图模式
    this.viewMode = mode;
    this.pointCloudEnabled = (mode === 'pointCloud');
    console.log(`[Camera] 视图模式已更新: ${this.viewMode}, 点云启用: ${this.pointCloudEnabled}`);
    
    // 模式切换 - 显示/隐藏相应的Canvas
    if (mode === 'pointCloud') {
      // 设置点云
      try {
        console.log("[Camera] 开始设置点云环境");
        this.setupPointCloud();

        // 如果有彩色Canvas，隐藏它
        if (this.remoteCanvas) {
          console.log("[Camera] 隐藏彩色Canvas");
          this.remoteCanvas.style.display = "none";
        }

        // 如果之前有回调，确保点云Canvas也应用相同的回调
        if (previousCallback && this.pointCloudCanvas) {
          console.log("将回调函数应用到点云Canvas");
          this.onFrameCallback = previousCallback;
        }

        // 显示点云Canvas
        if (this.pointCloudCanvas) {
          console.log("[Camera] 显示点云Canvas");
          this.pointCloudCanvas.style.display = "block";
        }

        console.log("[Camera] 点云环境设置完成");
      } catch (error) {
        console.error('[Camera] 设置点云失败:', error);
        this.viewMode = 'color';
        this.pointCloudEnabled = false;
        
        // 更新视图模式选择器
        const viewModeSelect = document.getElementById('viewModeSelect');
        if (viewModeSelect) {
          viewModeSelect.value = 'color';
        }
      }
    } else {
      // 切换回彩色模式
      console.log('[Camera] 切换回彩色模式');
      // 隐藏点云Canvas
      if (this.pointCloudCanvas) {
        console.log('[Camera] 隐藏点云Canvas');
        this.pointCloudCanvas.style.display = 'none';
      }
      
      // 显示彩色Canvas
      if (this.remoteCanvas) {
        console.log('[Camera] 显示彩色Canvas');
        this.remoteCanvas.style.display = 'block';
      }
      
      // 清理点云资源
      console.log('[Camera] 清理点云资源');
      this.cleanupPointCloud();
    }
    
    // 重新启动帧循环
    if (this.isRunning && previousCallback) {
      console.log('[Camera] 重新启动帧循环，使用之前保存的回调');
      this.startStreaming(previousCallback);
    }
    
    console.log(`[Camera] 视图模式切换完成: ${this.viewMode}`);
  }
  
  // 检查WebGL支持
  checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }
  
  // 设置点云
  setupPointCloud() {
    const THREE = window.THREE;
    if (!THREE) {
      console.error('THREE.js库未加载，无法设置点云');
      throw new Error('THREE.js库未加载');
    }

    if (!this.checkWebGLSupport()) {
      console.error('WebGL不被此浏览器支持，无法使用点云功能');
      throw new Error('WebGL不支持');
    }
    
    try {
      console.log('开始初始化点云环境...');
      
      // 清理任何已存在的点云Canvas
      this.cleanupPointCloud();
      
      // 创建新的Canvas元素用于点云
      this.pointCloudCanvas = document.createElement('canvas');
      this.pointCloudCanvas.width = 640;
      this.pointCloudCanvas.height = 480;
      this.pointCloudCanvas.style.display = 'block';
      this.pointCloudCanvas.id = 'pointCloudCanvas'; // 添加ID便于调试
      
      // 将点云Canvas添加到DOM中，替换彩色Canvas的位置
      if (this.remoteCanvas && this.remoteCanvas.parentNode) {
        this.remoteCanvas.parentNode.insertBefore(this.pointCloudCanvas, this.remoteCanvas.nextSibling);
        console.log('点云Canvas已添加到DOM');
      } else {
        document.body.appendChild(this.pointCloudCanvas);
        console.log('点云Canvas已添加到body');
      }
      
      // 创建Three.js场景
      this.threeJsScene = new THREE.Scene();
      console.log('THREE.js场景已创建');
      
      // 摄像机
      const width = this.pointCloudCanvas.width;
      const height = this.pointCloudCanvas.height;
      this.threeJsCamera = new THREE.PerspectiveCamera(30, width / height, 1, 10000);
      this.threeJsCamera.position.set(0, 0, 2000);
      this.threeJsCamera.lookAt(0, 0, 0);
      console.log('THREE.js相机已设置', this.threeJsCamera.position);
      
      // 渲染器 - 使用新创建的Canvas
      this.threeJsRenderer = new THREE.WebGLRenderer({
        canvas: this.pointCloudCanvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true // 确保可以从Canvas中读取数据
      });
      this.threeJsRenderer.setSize(width, height);
      this.threeJsRenderer.setClearColor(0x222222, 1); // 改为暗灰色背景
      // this.threeJsRenderer.setClearColor(0x000000, 0); // 原版黑色背景
      console.log('THREE.js渲染器已创建');
      
      // 添加轨道控制器
      try {
        // 尝试不同的可能位置来获取OrbitControls
        const OrbitControls = 
          (window.THREE && window.THREE.OrbitControls) || 
          (THREE.OrbitControls) || 
          (window.OrbitControls);
        
        if (OrbitControls) {
          this.threeJsControls = new OrbitControls(this.threeJsCamera, this.pointCloudCanvas);
          this.threeJsControls.enableDamping = true;
          this.threeJsControls.dampingFactor = 0.25;
          console.log('THREE.js轨道控制器已创建');
        } else {
          console.warn('未找到OrbitControls，3D视图将不可旋转');
        }
      } catch (error) {
        console.warn('初始化OrbitControls失败:', error);
      }
      
      // 深度图尺寸
      const DEPTH_WIDTH = 640;
      const DEPTH_HEIGHT = 576;
      let numPoints = DEPTH_WIDTH * DEPTH_HEIGHT;
      console.log(`准备创建点云，点数: ${numPoints}`);
      // TODO: 计算降采样后应该有多少点
      const sampleRate = 36;
      numPoints = Math.floor(numPoints / sampleRate);
      
      // 创建几何体 - 使用BufferGeometry
      const geometry = new THREE.BufferGeometry();
      
      // 创建位置和颜色缓冲区
      const positions = new Float32Array(numPoints * 3);
      const colors = new Float32Array(numPoints * 3);
      
      // 初始化点位置
      for (let i = 0; i < numPoints; i++) {
        const x = (i % DEPTH_WIDTH) - DEPTH_WIDTH * 0.5;
        const y = DEPTH_HEIGHT / 2 - Math.floor(i / DEPTH_WIDTH);
        
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = 0;
        // RGB(255,255,0)，黄色
        colors[i * 3] = 255;
        colors[i * 3 + 1] = 255;
        colors[i * 3 + 2] = 0;
      }
      
      // 设置属性
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      console.log('点云几何体属性已设置');
      
      // 创建材质
      const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true
      });
      
      // 创建点云
      this.pointCloud = new THREE.Points(geometry, material);
      this.threeJsScene.add(this.pointCloud);
      console.log('点云已添加到场景');
            
      // 添加一个红色网格作为参考
      const gridHelper = new THREE.GridHelper(1000, 10, 0xff0000, 0xffffff);
      this.threeJsScene.add(gridHelper);
      
      // 添加三个坐标轴
      const axesHelper = new THREE.AxesHelper(500);
      this.threeJsScene.add(axesHelper);
      
      console.log('添加了参考网格和坐标轴');
      
      // 开始渲染循环
      console.log('初始化完成，开始点云渲染循环');
      this.animatePointCloud();
      
      console.log('点云初始化完成');
    } catch (error) {
      console.error('创建点云时出错:', error, error.stack);
      this.cleanupPointCloud(); // 清理已创建的资源
      throw error;
    }
  }
  
  // 清理点云资源
  cleanupPointCloud() {
    const THREE = window.THREE;
    if (!THREE) return;
    
    // 停止渲染循环
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // 清理Three.js资源
    if (this.threeJsControls) {
      this.threeJsControls.dispose();
      this.threeJsControls = null;
    }
    
    if (this.threeJsRenderer) {
      this.threeJsRenderer.dispose();
      this.threeJsRenderer = null;
    }
    
    if (this.threeJsScene) {
      // 清理场景中的对象
      while(this.threeJsScene.children.length > 0) { 
        const object = this.threeJsScene.children[0];
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
        this.threeJsScene.remove(object);
      }
      this.threeJsScene = null;
    }
    
    this.threeJsCamera = null;
    
    // 清理点云对象
    if (this.pointCloud) {
      if (this.pointCloud.geometry) {
        this.pointCloud.geometry.dispose();
      }
      if (this.pointCloud.material) {
        this.pointCloud.material.dispose();
      }
      this.pointCloud = null;
    }
    
    // 从DOM中移除点云Canvas
    if (this.pointCloudCanvas && this.pointCloudCanvas.parentNode) {
      this.pointCloudCanvas.parentNode.removeChild(this.pointCloudCanvas);
      this.pointCloudCanvas = null;
    }
  }
  
  // 渲染点云动画
  animatePointCloud() {
    const THREE = window.THREE;
    if (!THREE) {
      console.error('[Camera] 点云渲染失败: THREE.js未加载');
      return;
    }
    
    if (!this.threeJsRenderer || !this.threeJsScene || !this.threeJsCamera) {
      console.error('[Camera] 无法启动点云动画循环：渲染器、场景或摄像机未初始化');
      console.log('[Camera] 渲染器状态:', this.threeJsRenderer ? '已创建' : '未创建');
      console.log('[Camera] 场景状态:', this.threeJsScene ? '已创建' : '未创建'); 
      console.log('[Camera] 相机状态:', this.threeJsCamera ? '已创建' : '未创建');
      return;
    }
    
    // 避免重复启动
    if (this.animationFrameId) {
      console.log('[Camera] 点云动画循环已在运行中，不需要重复启动, ID:', this.animationFrameId);
      return;
    }
    
    console.log('[Camera] 启动点云渲染循环');
    
    // 跟踪帧数以便调试
    this.frameCount = 0;
    this.animationStartTime = Date.now();
    this.lastFrameTime = Date.now();
    
    // 设置一个正常帧率的基准
    const targetFrameRate = 60;
    const minFrameTime = 1000 / targetFrameRate;
    
    // 定义动画函数
    const animate = () => {
      // 安全检查 - 如果退出点云模式，则停止动画循环
      if (this.viewMode !== 'pointCloud') {
        console.log('[Camera] 退出点云模式，停止动画循环');
        this.animationFrameId = null;
        return;
      }
      
      // 如果点云已经被清理，停止动画循环
      if (!this.pointCloud || !this.threeJsRenderer || !this.threeJsScene || !this.threeJsCamera) {
        console.error('[Camera] 点云渲染中断: 点云或渲染组件已被清理');
        console.log('[Camera] 点云状态:', this.pointCloud ? '存在' : '已清理');
        console.log('[Camera] 渲染器状态:', this.threeJsRenderer ? '存在' : '已清理');
        this.animationFrameId = null;
        return;
      }
      
      // 计算帧时间
      const now = Date.now();
      const frameDelta = now - this.lastFrameTime;
      
      // 跟踪帧
      this.frameCount++;
      if (this.frameCount % 10 === 0) {
        console.log(`[Camera] 点云渲染帧: ${this.frameCount}, 帧间隔: ${frameDelta}ms`);
        
        // 验证点云和场景状态
        console.log(`[Camera] 点云状态检查: 点数=${this.pointCloud.geometry.attributes.position.count}, 场景子对象数=${this.threeJsScene.children.length}`);
      }
      
      // 如果帧时间太短，延迟执行以控制帧率
      // if (frameDelta < minFrameTime) {
      //   console.log(`[Camera] 帧间隔过短: ${frameDelta}ms < ${minFrameTime}ms, 延迟执行`);
      //   this.animationFrameId = setTimeout(() => {
      //     console.log('[Camera] 延迟帧执行中...');
      //     this.animationFrameId = requestAnimationFrame(animate);
      //   }, minFrameTime - frameDelta);
      //   return;
      // }
      
      // 继续执行动画帧
      this.animationFrameId = requestAnimationFrame(animate);
      this.lastFrameTime = now;
      
      try {
        // 检查是否在使用远程点云数据
        if (this.remotePointCloudActive) {
          // 检查是否长时间未收到数据
          const timeSinceLastData = now - this.lastReceivedDataTime;
          if (timeSinceLastData > 10000) { // 如果超过10秒未收到数据
            console.warn(`[Camera] 已有${Math.floor(timeSinceLastData/1000)}秒未收到点云数据，点云可能已停止传输`);
            
            // 在画面上显示警告
            if (this.threeJsRenderer) {
              // 创建临时Canvas显示警告
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = this.pointCloudCanvas.width;
              tempCanvas.height = this.pointCloudCanvas.height;
              const ctx = tempCanvas.getContext('2d');
              
              // 绘制半透明背景
              ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
              ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
              
              // 绘制警告文本
              ctx.font = '20px Arial';
              ctx.fillStyle = 'red';
              ctx.textAlign = 'center';
              ctx.fillText('点云数据接收中断', tempCanvas.width / 2, tempCanvas.height / 2);
              ctx.font = '16px Arial';
              ctx.fillStyle = 'white';
              ctx.fillText('请检查连接或重新启动应用', tempCanvas.width / 2, tempCanvas.height / 2 + 30);
              
              // 创建纹理并显示在场景中
              const texture = new THREE.CanvasTexture(tempCanvas);
              const material = new THREE.SpriteMaterial({ map: texture });
              const sprite = new THREE.Sprite(material);
              sprite.scale.set(tempCanvas.width, tempCanvas.height, 1);
              
              // 添加到场景
              this.threeJsScene.add(sprite);
            }
          }
        }
        
        // 更新控制器
        if (this.threeJsControls) {
          this.threeJsControls.update();
        }
        
        // 渲染场景
        // if (this.frameCount % 10 === 0) {
          // console.log(`[Camera] 渲染点云帧 ${this.frameCount} - 开始渲染`);
        // }
        this.threeJsRenderer.render(this.threeJsScene, this.threeJsCamera);
        // if (this.frameCount % 10 === 0) {
          // console.log(`[Camera] 渲染点云帧 ${this.frameCount} - 渲染完成`);
        // }
      } catch (error) {
        console.error(`[Camera] 点云渲染错误 [帧 ${this.frameCount}]:`, error);
      }
    };
    
    // 启动帧循环
    console.log('[Camera] 开始第一次点云动画帧请求');
    this.animationFrameId = requestAnimationFrame(animate);
    console.log('[Camera] 点云动画帧请求已提交, ID:', this.animationFrameId);
  }
  
  // 接收点云数据
  receivePointCloudData(positions, colors) {
    const THREE = window.THREE;
    if (!THREE) {
      console.error('[Camera] 接收点云数据失败: THREE.js未加载');
      return;
    }
    
    console.log(`[Camera] 接收点云数据: 数据长度=${positions ? positions.length/3 : 0}个点`);
    
    if (!this.remotePointCloudActive) {
      console.log('[Camera] 首次接收远程点云数据，激活远程点云模式');
      this.remotePointCloudActive = true;
      
      // 确保点云已初始化
      if (this.viewMode !== 'pointCloud') {
        console.log('[Camera] 接收到点云数据但当前不在点云模式，切换到点云模式');
        this.setViewMode('pointCloud');
      }
    }
    
    // 检查点云是否已经初始化
    if (!this.pointCloud || !this.pointCloud.geometry) {
      console.error('[Camera] 点云对象或几何体未初始化，无法更新点云数据');
      console.log('[Camera] 当前视图模式:', this.viewMode);
      console.log('[Camera] 点云对象状态:', this.pointCloud ? '已创建' : '未创建');
      if (this.pointCloud) {
        console.log('[Camera] 点云几何体状态:', this.pointCloud.geometry ? '已创建' : '未创建');
      }
      return;
    }
    
    // 记录接收数据时间
    this.lastReceivedDataTime = Date.now();
    
    // 数据有效性验证
    if (!positions || !colors || positions.length === 0 || colors.length === 0) {
      console.error('[Camera] 接收到无效的点云数据: 数据为空');
      return;
    }
    
    if (positions.length !== colors.length) {
      console.error(`[Camera] 点云数据长度不匹配: 位置(${positions.length}) 颜色(${colors.length})`);
      return;
    }
    
    if (positions.length % 3 !== 0) {
      console.error(`[Camera] 点云数据长度必须是3的倍数: 位置(${positions.length})`);
      return;
    }
    
    // 测量性能
    const startTime = performance.now();
    
    try {
      // 确保点云几何体已经创建
      if (!this.pointCloud || !this.pointCloud.geometry) {
        console.warn('[Camera] 点云几何体未初始化，尝试重新创建');
        
        if (this.viewMode !== 'pointCloud') {
          console.log('[Camera] 当前不在点云模式，切换到点云模式');
          this.setViewMode('pointCloud');
        }
        
        if (!this.pointCloud || !this.pointCloud.geometry) {
          console.error('[Camera] 无法创建点云几何体，无法显示远程点云数据');
          return;
        }
      }
      
      // 获取点云几何体
      const geometry = this.pointCloud.geometry;
      
      // 计算点的数量
      const numPoints = positions.length / 3;
      
      // 如果接收到的点数量与当前几何体不同，需要重新分配缓冲区
      if (geometry.attributes.position.count !== numPoints) {
        console.log(`[Camera] 点云大小变化: 从 ${geometry.attributes.position.count} 变为 ${numPoints} 个点`);
        
        // 创建新的缓冲区
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        console.log('[Camera] 创建了新的点云缓冲区');
      } else {
        // 复用现有缓冲区，只更新数据
        const positionArray = geometry.attributes.position.array;
        const colorArray = geometry.attributes.color.array;
        
        // 复制数据
        for (let i = 0; i < positions.length; i++) {
          positionArray[i] = positions[i];
          colorArray[i] = colors[i];
        }
        
        // 标记属性需要更新
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        console.log('[Camera] 更新了现有点云缓冲区数据');
      }
      
      // 更新包围球以确保正确渲染
      geometry.computeBoundingSphere();
      console.log(`[Camera] 点云包围球半径: ${geometry.boundingSphere.radius}, 中心: [${geometry.boundingSphere.center.x}, ${geometry.boundingSphere.center.y}, ${geometry.boundingSphere.center.z}]`);
      
      // 记录帧计数
      this.receivedFramesCount++;
      
      // 性能日志
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      console.log(`[Camera] 点云处理完成: 帧=${this.receivedFramesCount}, 耗时=${processingTime.toFixed(2)}ms, 点数=${numPoints}`);
      
      // 检查是否需要开始渲染循环
      if (this.threeJsRenderer && (!this.animationFrameId || this.receivedFramesCount === 1)) {
        console.log('[Camera] 点云数据已更新，确保渲染循环正在运行');
        this.animatePointCloud();
      }
    } catch (error) {
      console.error('[Camera] 处理点云数据时出错:', error, error.stack);
    }
  }
  
  // 关闭摄像头
  close() {
    console.log('关闭摄像头资源');
    
    // 停止帧循环
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // 停止模拟
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    
    // 停止媒体流
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // 清理点云资源
    this.cleanupPointCloud();
    
    // 移除视频元素
    if (this.videoElement && this.videoElement.parentNode) {
      this.videoElement.srcObject = null;
      this.videoElement.parentNode.removeChild(this.videoElement);
      this.videoElement = null;
    }
    
    this.isRunning = false;
    console.log('摄像头已关闭');
  }

  // 从摄像头或Canvas获取视频流
  async getVideoStream() {
    console.log('[Camera] 尝试获取视频流');
    
    // 首先检查是否有本地视频元素流
    if (this.videoElement && this.videoElement.srcObject) {
      console.log('[Camera] 从视频元素获取流');
      return this.videoElement.srcObject;
    }
    
    // 如果有Canvas并且正在运行，从Canvas获取流
    if (this.localCanvas) {
      try {
        console.log('[Camera] 尝试从Canvas获取流');
        const stream = this.localCanvas.captureStream(30); // 30fps
        
        const tracks = stream.getTracks();
        console.log('[Camera] 从Canvas获取的流包含轨道:', tracks.map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          readyState: t.readyState
        })));
        
        if (tracks.length > 0) {
          return stream;
        }
      } catch (error) {
        console.error('[Camera] 从Canvas获取流失败:', error);
      }
    }
    
    // 如果都失败了，尝试重新获取摄像头流
    try {
      console.log('[Camera] 尝试重新获取摄像头流');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      
      console.log('[Camera] 成功获取新的摄像头流');
      return stream;
    } catch (error) {
      console.error('[Camera] 获取摄像头流失败:', error);
      return null;
    }
  }
}

console.log('标准摄像头模块加载完成');

// 导出 CameraManager 类
module.exports = {
  CameraManager
}; 