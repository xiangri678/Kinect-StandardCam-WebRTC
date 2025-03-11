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
    console.log('创建CameraManager实例');
    
    // 基本属性初始化
    this.isRunning = false;
    this.colorCanvas = document.getElementById('localVideo');
    this.colorCtx = this.colorCanvas ? this.colorCanvas.getContext('2d') : null;
    this.videoElement = null; // 用于显示摄像头视频的元素
    this.mediaStream = null; // 媒体流
    this.onFrameCallback = null; // 帧回调函数
    this.animationFrameId = null; // requestAnimationFrame的ID
    this.isSimulated = false; // 是否使用模拟模式
    this.simulationInterval = null; // 模拟模式的定时器
    
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
    
    // 尝试获取摄像头流
    try {
      // 请求获取摄像头权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      
      console.log('成功获取摄像头流');
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
      console.error('获取摄像头流失败:', error);
      console.log('切换到模拟模式');
      
      // 失败时切换到模拟模式
      this.isSimulated = true;
      this.startSimulatedStream();
      
      return true;
    }
  }
  
  // 开始帧循环
  startFrameLoop() {
    console.log('开始帧循环');
    
    const processFrame = () => {
      // 检查视频是否已准备好
      if (this.videoElement.readyState === 4) {
        // 调整Canvas尺寸以匹配视频
        if (this.colorCanvas.width !== this.videoElement.videoWidth || 
            this.colorCanvas.height !== this.videoElement.videoHeight) {
          this.colorCanvas.width = this.videoElement.videoWidth;
          this.colorCanvas.height = this.videoElement.videoHeight;
        }
        
        // 将视频帧绘制到Canvas
        this.colorCtx.drawImage(this.videoElement, 0, 0);
        
        // 调用帧回调
        if (this.onFrameCallback) {
          const frameData = {
            colorCanvas: this.colorCanvas,
            timestamp: Date.now(),
            width: this.colorCanvas.width,
            height: this.colorCanvas.height
          };
          
          this.onFrameCallback(frameData);
        }
      }
      
      // 继续下一帧
      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(processFrame);
      }
    };
    
    // 启动帧循环
    this.animationFrameId = requestAnimationFrame(processFrame);
  }
  
  // 绘制测试图案（当摄像头不可用时使用）
  drawTestPattern() {
    if (!this.colorCanvas || !this.colorCtx) {
      console.warn('Canvas上下文不可用，无法绘制测试图案');
      return;
    }
    
    console.log('绘制测试图案...');
    
    // 设置画布大小
    this.colorCanvas.width = 640;
    this.colorCanvas.height = 480;
    
    // 绘制渐变背景
    const gradient = this.colorCtx.createLinearGradient(0, 0, this.colorCanvas.width, this.colorCanvas.height);
    gradient.addColorStop(0, 'blue');
    gradient.addColorStop(1, 'purple');
    this.colorCtx.fillStyle = gradient;
    this.colorCtx.fillRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
    
    // 添加网格
    this.colorCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.colorCtx.lineWidth = 1;
    
    // 水平线
    for (let y = 0; y < this.colorCanvas.height; y += 40) {
      this.colorCtx.beginPath();
      this.colorCtx.moveTo(0, y);
      this.colorCtx.lineTo(this.colorCanvas.width, y);
      this.colorCtx.stroke();
    }
    
    // 垂直线
    for (let x = 0; x < this.colorCanvas.width; x += 40) {
      this.colorCtx.beginPath();
      this.colorCtx.moveTo(x, 0);
      this.colorCtx.lineTo(x, this.colorCanvas.height);
      this.colorCtx.stroke();
    }
    
    // 添加标准摄像头WebRTC的标题
    this.colorCtx.font = '24px Arial';
    this.colorCtx.fillStyle = 'white';
    this.colorCtx.textAlign = 'center';
    this.colorCtx.fillText('标准摄像头 WebRTC', this.colorCanvas.width / 2, 50);
    this.colorCtx.font = '16px Arial';
    this.colorCtx.fillText('请允许摄像头权限或等待摄像头初始化', this.colorCanvas.width / 2, 80);
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
          colorCanvas: this.colorCanvas,
          timestamp: Date.now(),
          isSimulated: true,
          width: this.colorCanvas.width,
          height: this.colorCanvas.height
        };
        
        this.onFrameCallback(frameData);
      }
    }, 33); // 约30fps
    
    console.log('模拟数据流已启动');
  }
  
  // 添加动画效果
  addAnimationEffects(phase) {
    if (!this.colorCtx) return;
    
    const ctx = this.colorCtx;
    const width = this.colorCanvas.width;
    const height = this.colorCanvas.height;
    
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
    if (!this.colorCtx) return;
    
    const ctx = this.colorCtx;
    const width = this.colorCanvas.width;
    const height = this.colorCanvas.height;
    
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
    
    // 移除视频元素
    if (this.videoElement && this.videoElement.parentNode) {
      this.videoElement.srcObject = null;
      this.videoElement.parentNode.removeChild(this.videoElement);
      this.videoElement = null;
    }
    
    this.isRunning = false;
    console.log('摄像头已关闭');
  }
}

console.log('标准摄像头模块加载完成');

// 导出 CameraManager 类
module.exports = {
  CameraManager
}; 