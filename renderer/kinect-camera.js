// kinect-camera.js - Kinect Azure 摄像头模块
console.log('加载 Kinect 摄像头模块...');

// 导入模块
// 尝试导入 kinect-azure 库，如果不可用则捕获错误
let KinectAzure = null;
let kinectAvailable = false;

try {
  // 检查平台 - Kinect仅在Windows上可用
  const isWindows = typeof window !== 'undefined' && 
                   window.navigator && 
                   window.navigator.platform && 
                   (window.navigator.platform.indexOf('Win') >= 0);
  
  if (isWindows) {
    KinectAzure = require('kinect-azure');
    kinectAvailable = true;
    console.log('Kinect Azure 库已成功加载');
  } else {
    console.log('非Windows平台，Kinect Azure功能不可用');
    kinectAvailable = false;
  }
} catch (error) {
  console.warn('Kinect Azure 库加载失败，将使用标准摄像头', error);
  kinectAvailable = false;
}

// 导入标准摄像头作为备选
const { CameraManager } = require('./camera');

// 导入THREE.js (如果通过CDN加载，这里可以省略)
let THREE = null;
try {
  THREE = window.THREE;
  if (!THREE) {
    console.warn('THREE.js库未通过全局变量找到，尝试使用require导入');
    THREE = require('three');
  }
  console.log('WGD: 3js加载成功')
} catch (error) {
  console.warn('THREE.js库加载失败，可能会影响点云功能', error);
}

// KinectCameraManager 类 - 负责管理 Kinect 摄像头或回退到标准摄像头
class KinectCameraManager {
  // 静态初始化方法，返回 Promise
  static async initialize() {
    console.log('初始化 Kinect 摄像头管理器...');
    
    const manager = new KinectCameraManager();
    const result = await manager.detectKinect();
    return manager;
  }
  
  constructor() {
    console.log('创建 KinectCameraManager 实例');
    
    // 基本属性初始化
    this.isRunning = false;
    
    // 使用新的分层设计查找元素
    this.colorCanvas = document.getElementById('localVideoCanvas');
    this.pointCloudCanvas = document.getElementById('localPointCloudCanvas');
    
    // 如果找不到元素，可能是在旧结构中，做兼容处理
    if (!this.colorCanvas) {
      console.log('未找到新的分层结构元素，尝试使用旧版元素结构');
      this.colorCanvas = document.getElementById('localVideo');
    }
    
    this.colorCtx = this.colorCanvas ? this.colorCanvas.getContext('2d') : null;
    
    // Kinect 相关属性
    this.kinect = null;
    this.isKinectMode = false;
    this.usingKinect = false;
    
    // 标准摄像头作为备选
    this.standardCamera = null;
    
    // 帧回调函数和动画帧 ID
    this.onFrameCallback = null;
    this.animationFrameId = null;
    
    // 点云相关属性
    this.viewMode = 'color'; // 'color' 或 'pointCloud'
    this.pointCloudEnabled = false;
    this.threeJsRenderer = null;
    this.threeJsScene = null;
    this.threeJsCamera = null;
    this.threeJsControls = null;
    this.pointCloud = null;
    this.lastDepthData = null;
    this.lastColorData = null;
    this.depthModeRange = null;
    
    // 动画相关属性
    this.frameCount = 0;
    this.animationStartTime = 0;
    this.lastFrameTime = 0;
    
    // 远程数据相关属性
    this.lastReceivedDataTime = 0;
    this.receivedFramesCount = 0;
    this.remotePointCloudActive = false;
    
    // 绑定模式切换事件
    const viewModeSelect = document.getElementById('viewModeSelect');
    if (viewModeSelect) {
      viewModeSelect.addEventListener('change', (event) => {
        this.setViewMode(event.target.value);
      });
    }
  }
  
  // 检测 Kinect 设备
  async detectKinect() {
    try {
      if (!kinectAvailable) {
        console.log('Kinect Azure 库不可用，将使用标准摄像头');
        this.isKinectMode = false;
        
        // 初始化标准摄像头
        this.standardCamera = await CameraManager.initialize();
        return false;
      }
      
      // 确保安全地尝试创建Kinect实例
      this.kinect = new KinectAzure();
      const isOpen = this.kinect.open();
      
      if (isOpen) {
        console.log('Kinect 设备已成功打开');
        this.isKinectMode = true;
        
        // 显示 Kinect 控制区域
        const kinectControls = document.getElementById('kinectControls');
        if (kinectControls) {
          kinectControls.style.display = 'flex';
        }
        
        return true;
      } else {
        console.warn('Kinect 设备无法打开，将使用标准摄像头');
        this.isKinectMode = false;
        
        // 初始化标准摄像头
        this.standardCamera = await CameraManager.initialize();
        return false;
      }
    } catch (error) {
      console.error('Kinect 设备初始化失败:', error);
      this.isKinectMode = false;
      
      try {
        // 初始化标准摄像头
        this.standardCamera = await CameraManager.initialize();
      } catch (camError) {
        console.error('标准摄像头初始化失败:', camError);
      }
      
      return false;
    }
  }
  
  // 初始化摄像头
  initialize() {
    console.log(`初始化摄像头 - 模式: ${this.isKinectMode ? 'Kinect' : '标准'}`);
    
    if (!this.isKinectMode && this.standardCamera) {
      // 使用标准摄像头初始化
      return this.standardCamera.initialize();
    }
    
    // 确保 Canvas 已就绪
    if (!this.colorCanvas) {
      console.error('Canvas 元素未找到');
      return false;
    }
    
    // 如果要启用点云，创建点云 Canvas
    if (this.viewMode === 'pointCloud') {
      this.setupPointCloud();
    }
    
    // 绘制测试图案
    this.drawTestPattern();
    
    console.log('初始化完成');
    return true;
  }
  
  // 设置视图模式
  setViewMode(mode) {
    if (mode !== 'color' && mode !== 'pointCloud') {
      console.error('无效的视图模式:', mode);
      return;
    }
    console.log('设置视图模式:', mode);
    
    // 如果点云模式不可用，则强制使用彩色模式
    if (mode === 'pointCloud' && (!THREE || !this.checkWebGLSupport())) {
      console.error('点云模式不可用: THREE.js库未加载或WebGL不受支持');
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
      return;
    }
    
    // 停止渲染循环但不关闭设备
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // 记住旧的回调函数，用于后续重新应用
    const previousCallback = this.onFrameCallback;
    
    // 更新视图模式
    this.viewMode = mode;
    this.pointCloudEnabled = (mode === 'pointCloud');
    
    // 使用分层设计切换视图模式
    if (this.colorCanvas && this.pointCloudCanvas) {
      if (mode === 'pointCloud') {
        // 隐藏颜色层，显示点云层
        this.colorCanvas.style.display = 'none';
        this.pointCloudCanvas.style.display = 'block';
        
        // 设置点云
        try {
          this.setupPointCloud();
          console.log('点云初始化完成');
          
          // 如果之前有回调，确保点云Canvas也应用相同的回调
          if (previousCallback) {
            console.log('将回调函数应用到点云Canvas');
            this.onFrameCallback = previousCallback;
          }
        } catch (e) {
          console.error('设置点云模式失败:', e);
          // 切回彩色模式
          this.viewMode = 'color';
          this.pointCloudEnabled = false;
          
          // 显示颜色层，隐藏点云层
          this.colorCanvas.style.display = 'block';
          this.pointCloudCanvas.style.display = 'none';
          
          // 清理点云资源
          this.cleanupPointCloud();
          
          // 更新选择器
          const viewModeSelect = document.getElementById('viewModeSelect');
          if (viewModeSelect) {
            viewModeSelect.value = 'color';
          }
          
          // 恢复回调
          this.onFrameCallback = previousCallback;
          
          return;
        }
      } else {
        // 显示颜色层，隐藏点云层
        this.colorCanvas.style.display = 'block';
        this.pointCloudCanvas.style.display = 'none';
        
        // 清理点云资源
        this.cleanupPointCloud();
        
        // 恢复回调到彩色Canvas
        this.onFrameCallback = previousCallback;
        console.log('切换到彩色视频模式，恢复回调到彩色Canvas');
      }
    } else {
      console.error('无法找到分层容器元素，无法切换视图模式');
    }
    
    // 确保更新媒体流
    setTimeout(() => {
      this.updateMediaStream();
      
      // 向远程对等方发送模式切换通知
      if (window.notifyRemoteModeChange) {
        console.log('通知远程用户模式已切换为:', mode);
        window.notifyRemoteModeChange(mode);
      }
      
      // 如果是点云模式，设置WebRTC的点云模式
      if (mode === 'pointCloud' && window.webrtcManager) {
        console.log('启用WebRTC点云数据传输模式');
        window.webrtcManager.setPointCloudMode(true);
      } else if (window.webrtcManager) {
        window.webrtcManager.setPointCloudMode(false);
      }
    }, 500); // 延迟500ms确保Canvas已经准备好
  }
  
  // 启动摄像头流
  async startStreaming(onFrameCallback) {
    console.log(`启动摄像头流 - 模式: ${this.isKinectMode ? 'Kinect' : '标准'}, 视图: ${this.viewMode}`);
    this.onFrameCallback = onFrameCallback;
    
    // 检查是否已经运行
    if (this.isRunning) {
      console.log('摄像头流已在运行中');
      return true;
    }
    
    if (!this.isKinectMode && this.standardCamera) {
      // 使用标准摄像头
      this.usingKinect = false;
      return this.standardCamera.startStreaming(onFrameCallback);
    }
    
    try {
      // 使用 Kinect
      this.usingKinect = true;
      
      // 启动 Kinect 摄像头
      this.kinect.startCameras({
        color_format: KinectAzure.K4A_IMAGE_FORMAT_COLOR_BGRA32,
        color_resolution: KinectAzure.K4A_COLOR_RESOLUTION_720P,
        camera_fps: KinectAzure.K4A_FRAMES_PER_SECOND_30,
        depth_mode: KinectAzure.K4A_DEPTH_MODE_NFOV_UNBINNED,
        synchronized_images_only: true,
        include_color_to_depth: true,
        flip_BGRA_to_RGBA: true
      });
      
      // 获取深度模式范围
      this.depthModeRange = this.kinect.getDepthModeRange(KinectAzure.K4A_DEPTH_MODE_NFOV_UNBINNED);
      
      // 根据视图模式来设置相应的处理方式
      if (this.viewMode === 'pointCloud') {
        this.setupPointCloud();
      }
      
      // 启动监听
      this.kinect.startListening((data) => {
        if (this.viewMode === 'color') {
          this.processKinectFrame(data);
        } else if (this.viewMode === 'pointCloud') {
          this.processKinectFrameWithPointCloud(data);
        }
      });
      
      this.isRunning = true;
      return true;
    } catch (error) {
      console.error('启动 Kinect 流失败:', error);
      
      // 回退到标准摄像头
      if (!this.standardCamera) {
        this.standardCamera = await CameraManager.initialize();
        this.standardCamera.initialize();
      }
      
      this.usingKinect = false;
      this.isKinectMode = false;
      return this.standardCamera.startStreaming(onFrameCallback);
    }
  }
  
  // 处理 Kinect 帧 (仅彩色图像)
  processKinectFrame(data) {
    if (!data.colorImageFrame || !data.colorImageFrame.imageData) {
      return;
    }
    
    // 确保 Canvas 尺寸与图像一致
    if (this.colorCanvas.width !== data.colorImageFrame.width || 
        this.colorCanvas.height !== data.colorImageFrame.height) {
      this.colorCanvas.width = data.colorImageFrame.width;
      this.colorCanvas.height = data.colorImageFrame.height;
    }
    
    // 创建 ImageData 并渲染到 Canvas
    const imageData = this.colorCtx.createImageData(data.colorImageFrame.width, data.colorImageFrame.height);
    imageData.data.set(new Uint8ClampedArray(data.colorImageFrame.imageData));
    this.colorCtx.putImageData(imageData, 0, 0);
    
    // 调用回调函数
    if (this.onFrameCallback) {
      this.onFrameCallback(this.colorCanvas);
    }
  }
  
  // 设置点云
  setupPointCloud() {
    if (!THREE) {
      console.error('THREE.js库未加载，无法设置点云');
      throw new Error('THREE.js库未加载');
    }
    
    if (!this.checkWebGLSupport()) {
      console.error('WebGL不被此浏览器支持，无法使用点云功能');
      throw new Error('WebGL不支持');
    }
    
    console.log('开始设置点云...');
    
    // 清理任何已有的点云渲染器
    this.cleanupPointCloud();
    
    try {
      // 使用已有的点云层Canvas
      if (!this.pointCloudCanvas) {
        console.error('无法找到点云Canvas元素');
        throw new Error('点云Canvas元素不存在');
      }
      
      // 设置点云Canvas大小
      this.pointCloudCanvas.width = 640;
      this.pointCloudCanvas.height = 480;
      
      // 创建Three.js场景
      this.threeJsScene = new THREE.Scene();
      
      // 创建相机
      this.threeJsCamera = new THREE.PerspectiveCamera(30, this.pointCloudCanvas.width / this.pointCloudCanvas.height, 1, 10000);
      this.threeJsCamera.position.set(0, 0, 2000);
      this.threeJsCamera.lookAt(0, 0, 0);
      
      // 创建WebGL渲染器
      this.threeJsRenderer = new THREE.WebGLRenderer({
        canvas: this.pointCloudCanvas,
        antialias: true,
        alpha: true
      });
      this.threeJsRenderer.setSize(this.pointCloudCanvas.width, this.pointCloudCanvas.height);
      this.threeJsRenderer.setClearColor(0x000000, 0);
      
      // 添加轨道控制器
      try {
        const OrbitControls = window.THREE.OrbitControls || THREE.OrbitControls;
        if (OrbitControls) {
          this.threeJsControls = new OrbitControls(this.threeJsCamera, this.pointCloudCanvas);
          this.threeJsControls.enableDamping = true;
          this.threeJsControls.dampingFactor = 0.25;
        } else {
          console.warn('未找到OrbitControls，点云将不可旋转');
        }
      } catch (error) {
        console.warn('初始化OrbitControls失败:', error);
      }
      
      // 创建点云几何体
      const DEPTH_WIDTH = 640;
      const DEPTH_HEIGHT = 576;
      const numPoints = DEPTH_WIDTH * DEPTH_HEIGHT;
      
      const geometry = new THREE.BufferGeometry();
      
      // 创建点云顶点位置和颜色缓冲区
      const positions = new Float32Array(numPoints * 3);
      const colors = new Float32Array(numPoints * 3);
      
      // 初始化点位置
      for (let i = 0; i < numPoints; i++) {
        const x = (i % DEPTH_WIDTH) - DEPTH_WIDTH * 0.5;
        const y = DEPTH_HEIGHT / 2 - Math.floor(i / DEPTH_WIDTH);
        
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = 0;
        
        colors[i * 3] = 0.2;
        colors[i * 3 + 1] = 0.2;
        colors[i * 3 + 2] = 0.2;
      }
      
      // 设置几何体属性
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      // 创建点云材质
      const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true
      });
      
      // 创建点云
      this.pointCloud = new THREE.Points(geometry, material);
      this.threeJsScene.add(this.pointCloud);
      
      // 更新WebRTC媒体流
      this.updateMediaStream();
      
      // 启动点云动画
      this.animatePointCloud();
      
      console.log('点云设置完成');
    } catch (error) {
      console.error('设置点云时发生错误:', error);
      throw error;
    }
  }
  
  /**
   * 更新媒体流
   */
  updateMediaStream() {
    // 首先检查canvas元素是否存在
    if (!this.colorCanvas) {
      console.error('无法更新媒体流: colorCanvas未初始化');
      return false;
    }
    
    try {
      // 根据当前视图模式处理媒体流更新
      if (this.viewMode === 'color' || this.viewMode === 'depth') {
        console.log(`更新媒体流: 使用${this.viewMode}模式下的视频流`);
        
        if (!window.localStream) {
          console.warn('localStream对象不存在，创建新的媒体流');
          window.localStream = new MediaStream();
        }
        
        // 获取Canvas流作为视频轨道
        const canvasStream = this.colorCanvas.captureStream(30); // 30fps
        const videoTracks = canvasStream.getVideoTracks();
        
        if (videoTracks.length === 0) {
          console.error('无法从Canvas获取视频轨道');
          return false;
        }
        
        // 更新本地流的视频轨道
        const oldTracks = window.localStream.getVideoTracks();
        // 移除旧轨道
        oldTracks.forEach(track => {
          window.localStream.removeTrack(track);
          track.stop();
        });
        
        // 添加新轨道
        window.localStream.addTrack(videoTracks[0]);
        console.log('媒体流视频轨道已成功更新');
        
        // 通知WebRTC管理器流已更新
        if (window.notifyStreamUpdated) {
          window.notifyStreamUpdated();
        }
        
        return true;
      } else if (this.viewMode === 'pointCloud') {
        console.log('点云模式: 通过数据通道传输点云数据，同时保持基本视频流');
        
        // 在点云模式下，我们仍然需要保持一个基本的视频流
        // 因为WebRTC依赖于视频轨道来保持连接
        
        // 显示一个静态图像，告知用户当前是点云模式
        if (this.colorCtx) {
          // 绘制背景
          this.colorCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          this.colorCtx.fillRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
          
          // 绘制文本
          this.colorCtx.font = '24px Arial';
          this.colorCtx.fillStyle = '#ffffff';
          this.colorCtx.textAlign = 'center';
          this.colorCtx.fillText('点云模式已激活', this.colorCanvas.width / 2, this.colorCanvas.height / 2 - 30);
          this.colorCtx.fillStyle = '#4CAF50';
          this.colorCtx.font = '20px Arial';
          this.colorCtx.fillText('正在通过数据通道传输点云数据...', this.colorCanvas.width / 2, this.colorCanvas.height / 2 + 10);
          
          // 绘制一个旋转的3D图标
          const centerX = this.colorCanvas.width / 2;
          const centerY = this.colorCanvas.height / 2 + 60;
          const size = 40;
          const angle = (Date.now() / 1000) % (Math.PI * 2);
          
          this.colorCtx.save();
          this.colorCtx.translate(centerX, centerY);
          this.colorCtx.rotate(angle);
          
          // 绘制一个简单的立方体
          this.colorCtx.strokeStyle = '#4CAF50';
          this.colorCtx.lineWidth = 2;
          this.colorCtx.beginPath();
          this.colorCtx.rect(-size/2, -size/2, size, size);
          this.colorCtx.stroke();
          
          this.colorCtx.beginPath();
          this.colorCtx.moveTo(-size/2, -size/2);
          this.colorCtx.lineTo(-size/2 + size/4, -size/2 - size/4);
          this.colorCtx.lineTo(size/2 + size/4, -size/2 - size/4);
          this.colorCtx.lineTo(size/2, -size/2);
          this.colorCtx.closePath();
          this.colorCtx.stroke();
          
          this.colorCtx.beginPath();
          this.colorCtx.moveTo(size/2, -size/2);
          this.colorCtx.lineTo(size/2 + size/4, -size/2 - size/4);
          this.colorCtx.lineTo(size/2 + size/4, size/2 - size/4);
          this.colorCtx.lineTo(size/2, size/2);
          this.colorCtx.closePath();
          this.colorCtx.stroke();
          
          this.colorCtx.restore();
        }
        
        // 确保存在一个媒体流
        if (!window.localStream) {
          console.warn('点云模式: localStream对象不存在，创建新的媒体流');
          window.localStream = new MediaStream();
        }
        
        // 获取Canvas流作为视频轨道
        const canvasStream = this.colorCanvas.captureStream(30); // 30fps
        const videoTracks = canvasStream.getVideoTracks();
        
        if (videoTracks.length === 0) {
          console.error('无法从Canvas获取视频轨道');
          return false;
        }
        
        // 更新本地流的视频轨道
        const oldTracks = window.localStream.getVideoTracks();
        // 移除旧轨道
        oldTracks.forEach(track => {
          window.localStream.removeTrack(track);
          track.stop();
        });
        
        // 添加新轨道
        window.localStream.addTrack(videoTracks[0]);
        console.log('点云模式: 已更新基本视频流以保持连接');
        
        // 通知WebRTC管理器流已更新
        if (window.notifyStreamUpdated) {
          window.notifyStreamUpdated();
        }
        
        return true;
      } else {
        console.error(`不支持的视图模式: ${this.viewMode}`);
        return false;
      }
    } catch (error) {
      console.error('更新媒体流时出错:', error);
      return false;
    }
  }

  // 清理点云资源，但不关闭Kinect连接
  cleanupPointCloud() {
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
      // this.pointCloudCanvas = null;
    }
  }
  
  // 渲染点云动画
  animatePointCloud() {
    if (!this.threeJsRenderer || !this.threeJsScene || !this.threeJsCamera) {
      console.error('无法启动点云动画循环：渲染器、场景或摄像机未初始化');
      return;
    }
    
    // 避免重复启动
    if (this.animationFrameId) {
      console.log('点云动画循环已在运行中，不需要重复启动');
      return;
    }
    
    console.log('启动点云渲染循环');
    
    // 跟踪帧数以便调试 - 使用类属性
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
        console.log('退出点云模式，停止动画循环');
        this.animationFrameId = null;
        return;
      }
      
      // 如果点云已经被清理，停止动画循环
      if (!this.pointCloud || !this.threeJsRenderer || !this.threeJsScene || !this.threeJsCamera) {
        console.log('点云或渲染组件已被清理，停止动画循环');
        this.animationFrameId = null;
        return;
      }
      
      // 计算帧时间
      const now = Date.now();
      const frameDelta = now - this.lastFrameTime;
      
      // 如果帧时间太短，延迟执行以控制帧率
      if (frameDelta < minFrameTime) {
        this.animationFrameId = setTimeout(() => {
          this.animationFrameId = requestAnimationFrame(animate);
        }, minFrameTime - frameDelta);
        return;
      }
      
      // 继续执行动画帧
      this.animationFrameId = requestAnimationFrame(animate);
      this.frameCount++;
      this.lastFrameTime = now;
      
      // 检查是否在使用远程点云数据
      if (this.remotePointCloudActive) {
        // 检查是否长时间未收到数据
        const timeSinceLastData = now - this.lastReceivedDataTime;
        if (timeSinceLastData > 10000) { // 如果超过10秒未收到数据
          console.warn(`已有${Math.floor(timeSinceLastData/1000)}秒未收到点云数据，点云可能已停止传输`);
          
          // 在画面上显示警告
          if (this.colorCtx) {
            this.colorCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.colorCtx.fillRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
            this.colorCtx.font = '24px Arial';
            this.colorCtx.fillStyle = '#ff3333';
            this.colorCtx.textAlign = 'center';
            this.colorCtx.fillText('点云数据接收中断', this.colorCanvas.width / 2, this.colorCanvas.height / 2 - 20);
            this.colorCtx.fillText(`已有${Math.floor(timeSinceLastData/1000)}秒未收到数据`, this.colorCanvas.width / 2, this.colorCanvas.height / 2 + 20);
          }
        }
      }
      
      // 每秒输出一次帧率信息
      if (now - this.animationStartTime > 5000) { // 每5秒记录一次
        const fps = this.frameCount / ((now - this.animationStartTime) / 1000);
        console.log(`点云渲染帧率: ${fps.toFixed(2)} FPS`);
        this.frameCount = 0;
        this.animationStartTime = now;
      }
      
      try {
        // 更新控制器
        if (this.threeJsControls) {
          this.threeJsControls.update();
        }
        
        // 检查点云是否需要更新
        if (this.pointCloud && this.pointCloud.geometry) {
          const geometry = this.pointCloud.geometry;
          
          if (geometry.attributes.position && geometry.attributes.position.needsUpdate ||
              geometry.attributes.color && geometry.attributes.color.needsUpdate) {
            
            // 标记属性已经被更新
            if (geometry.attributes.position) geometry.attributes.position.needsUpdate = true;
            if (geometry.attributes.color) geometry.attributes.color.needsUpdate = true;
            
            if (frameDelta > 100) { // 如果帧间隔过长(>100ms)，记录日志
              console.log(`点云数据已更新，渲染新帧 (帧间隔: ${frameDelta}ms)`);
            }
          }
        }
        
        // 渲染新帧 - 添加错误处理
        if (this.threeJsRenderer && this.threeJsScene && this.threeJsCamera) {
          this.threeJsRenderer.render(this.threeJsScene, this.threeJsCamera);
        }
        
        // 调用回调函数 - 使用点云Canvas
        if (this.onFrameCallback && this.pointCloudCanvas) {
          this.onFrameCallback(this.pointCloudCanvas);
        }
        
        // MAC端特殊处理：强制将点云内容复制到原Canvas
        if (navigator.platform.indexOf('Mac') !== -1 && this.colorCtx && this.pointCloudCanvas) {
          try {
            this.colorCtx.clearRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
            this.colorCtx.drawImage(this.pointCloudCanvas, 0, 0, this.colorCanvas.width, this.colorCanvas.height);
          } catch (e) {
            console.warn('Mac模式下复制Canvas失败:', e);
          }
        }
      } catch (error) {
        console.error('渲染点云时出错:', error);
        // 出错时继续尝试动画而不是立即停止
        console.log('尝试恢复点云渲染循环');
      }
    };
    
    // 立即开始动画循环
    this.animationFrameId = requestAnimationFrame(animate);
    
    // 添加安全检查 - 如果5秒后动画仍未运行，尝试重新启动
    setTimeout(() => {
      if (this.viewMode === 'pointCloud' && !this.animationFrameId) {
        console.log('动画循环可能已停止，尝试重新启动');
        this.animationFrameId = requestAnimationFrame(animate);
      }
    }, 5000);
  }
  
  // 处理 Kinect 帧 (带点云)
  processKinectFrameWithPointCloud(data) {
    if (!this.pointCloud || !this.threeJsRenderer) {
      console.warn('点云未初始化，无法处理帧');
      return;
    }
    
    // 确保有深度和颜色数据
    if (!data.depthImageFrame || !data.colorToDepthImageFrame) {
      return;
    }
    
    // 处理数据
    const depthData = Buffer.from(data.depthImageFrame.imageData);
    const colorData = Buffer.from(data.colorToDepthImageFrame.imageData);
    
    this.lastDepthData = depthData;
    this.lastColorData = colorData;
    
    // 更新点云
    this.updatePointCloud(depthData, colorData);
  }
  
  // 更新点云数据
  updatePointCloud(depthData, colorData) {
    if (!this.pointCloud || !this.depthModeRange) {
      console.warn('无法更新点云：点云对象或深度模式范围未设置');
      return;
    }

    const positions = this.pointCloud.geometry.attributes.position.array;
    const colors = this.pointCloud.geometry.attributes.color.array;

    // 读取深度和颜色数据
     for (let i = 0, j = 0; i < depthData.length; i += 2, j += 3) {
       const depthValue = depthData[i + 1] << 8 | depthData[i];
 
       const colorIndex = j / 3 * 4;
       const b = colorData[colorIndex + 0] / 255;
       const g = colorData[colorIndex + 1] / 255;
       const r = colorData[colorIndex + 2] / 255;
 
       if (depthValue > this.depthModeRange.min && depthValue < this.depthModeRange.max) {
         positions[j + 2] = depthValue;
 
         colors[j] = r;
         colors[j + 1] = g;
         colors[j + 2] = b;
       } else {
         positions[j + 2] = Number.MAX_VALUE;
 
         colors[j] = 0;
         colors[j + 1] = 0;
         colors[j + 2] = 0;
       }
     }
    
    this.pointCloud.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.pointCloud.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.pointCloud.geometry.attributes.position.needsUpdate = true;
    this.pointCloud.geometry.attributes.color.needsUpdate = true;

    console.log('position 和 color 原始数据：', positions, colors, Date.now());

     // 请求渲染一帧
     if (this.threeJsRenderer && this.threeJsScene && this.threeJsCamera) {
       this.threeJsRenderer.render(this.threeJsScene, this.threeJsCamera);
       console.log('[Kinect] 本地渲染了一帧点云');
     }

    this._lastUpdateTime = now;
    // 激进的节流：每1000ms最多更新一次
    if (this._lastUpdateTime && now - this._lastUpdateTime < 1000) {
      return;
    }

    // 激进的降采样：只保留50%的点
    const sampleRate = 2; // 改这里就可以调节点云密度，降采样率
    const downPositions = new Float32Array(Math.floor(this.pointCloud.geometry.attributes.position.array.length / sampleRate));
    const downColors = new Float32Array(Math.floor(this.pointCloud.geometry.attributes.color.array.length / sampleRate));
    
    // 读取深度和颜色数据，并进行降采样
    for (let i = 0, j = 0; i < depthData.length; i += 2 * sampleRate, j += 3) {
      const depthValue = depthData[i + 1] << 8 | depthData[i];
      
      const colorIndex = (j / 3) * 4 * sampleRate;
      const b = colorData[colorIndex + 0] / 255;
      const g = colorData[colorIndex + 1] / 255;
      const r = colorData[colorIndex + 2] / 255;
      
      if (depthValue > this.depthModeRange.min && depthValue < this.depthModeRange.max) {
        downPositions[j + 2] = depthValue;
        
        downColors[j] = r;
        downColors[j + 1] = g;
        downColors[j + 2] = b;
      } else {
        downPositions[j + 2] = Number.MAX_VALUE;
        
        downColors[j] = 0;
        downColors[j + 1] = 0;
        downColors[j + 2] = 0;
      }
    }
    
    console.log(`[Kinect] 点云数据降采样: ${depthData.length/2} -> ${downPositions.length/3} 个点`);
    
    // 如果是点云模式且WebRTC连接已建立，发送点云数据
    if (this.viewMode === 'pointCloud' && window.webrtcManager) {
      const isConnected = window.webrtcManager.isConnected;
      const hasDataChannel = window.webrtcManager.dataChannel;
      
      console.log(`[Kinect] 点云数据准备发送，WebRTC连接状态: ${isConnected ? '已连接' : '未连接'}, 数据通道状态: ${hasDataChannel ? '已创建' : '未创建'}`);
      
      if (isConnected && hasDataChannel) {
        console.log('[Kinect] 通过WebRTC数据通道发送点云数据');
        window.webrtcManager.sendPointCloudData(downPositions, downColors);
      } else if (isConnected && !hasDataChannel) {
        console.log('[Kinect] 尝试创建数据通道');
        window.webrtcManager.createDataChannel();
      }
    }
  }
  
  // 绘制测试图案
  drawTestPattern() {
    if (!this.colorCtx) return;
    
    const width = this.colorCanvas.width || 640;
    const height = this.colorCanvas.height || 480;
    
    // 绘制渐变背景
    const gradient = this.colorCtx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#4a4a4a');
    gradient.addColorStop(1, '#2a2a2a');
    this.colorCtx.fillStyle = gradient;
    this.colorCtx.fillRect(0, 0, width, height);
    
    // 绘制文本
    this.colorCtx.font = '24px Arial';
    this.colorCtx.fillStyle = '#ffffff';
    this.colorCtx.textAlign = 'center';
    this.colorCtx.fillText('Kinect 摄像头', width / 2, height / 2 - 50);
    this.colorCtx.fillText(this.isKinectMode ? '正在初始化...' : '未检测到设备，使用标准摄像头', width / 2, height / 2);
    
    // 绘制摄像头图标
    this.colorCtx.beginPath();
    this.colorCtx.arc(width / 2, height / 2 + 50, 30, 0, Math.PI * 2);
    this.colorCtx.fillStyle = '#3498db';
    this.colorCtx.fill();
    
    this.colorCtx.beginPath();
    this.colorCtx.arc(width / 2, height / 2 + 50, 15, 0, Math.PI * 2);
    this.colorCtx.fillStyle = '#2c3e50';
    this.colorCtx.fill();
  }
  
  // 关闭资源
  close() {
    console.log('关闭摄像头资源');
    
    if (this.kinect && this.usingKinect) {
      try {
        this.kinect.stopListening();
        this.kinect.close();
      } catch (error) {
        console.error('关闭 Kinect 时出错:', error);
      }
    }
    
    if (this.standardCamera && !this.usingKinect) {
      this.standardCamera.close();
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.threeJsControls) {
      this.threeJsControls.dispose();
      this.threeJsControls = null;
    }
    
    this.isRunning = false;
  }

  // 检查WebGL支持
  checkWebGLSupport() {
    // 实现检查WebGL支持的逻辑
    // 这里可以根据需要添加更多的检查逻辑
    return true; // 临时返回，实际实现需要根据实际情况调整
  }

  /**
   * 接收远程点云数据并显示
   * @param {Float32Array|Array} positions - 点云位置数据
   * @param {Float32Array|Array} colors - 点云颜色数据
   */
  receivePointCloudData(positions, colors) {
    if (!this.remotePointCloudActive) {
      console.log('首次接收远程点云数据，激活远程点云模式');
      this.remotePointCloudActive = true;
      this.initPointCloud(); // 确保点云已初始化
    }
    
    // 记录接收数据时间
    this.lastReceivedDataTime = Date.now();
    
    // 数据有效性验证
    if (!positions || !colors || positions.length === 0 || colors.length === 0) {
      console.error('接收到无效的点云数据: 数据为空');
      return;
    }
    
    if (positions.length !== colors.length) {
      console.error(`点云数据长度不匹配: 位置(${positions.length}) 颜色(${colors.length})`);
      return;
    }
    
    if (positions.length % 3 !== 0) {
      console.error(`点云数据长度必须是3的倍数: 位置(${positions.length})`);
      return;
    }
    
    // 测量性能
    const startTime = performance.now();
    
    try {
      // 确保点云几何体已经创建
      if (!this.pointCloud || !this.pointCloud.geometry) {
        console.warn('点云几何体未初始化，尝试重新创建');
        this.initPointCloud();
        
        if (!this.pointCloud || !this.pointCloud.geometry) {
          console.error('无法创建点云几何体，无法显示远程点云数据');
          return;
        }
      }
      
      // 获取点云几何体
      const geometry = this.pointCloud.geometry;
      
      // 计算点的数量
      const numPoints = positions.length / 3;
      
      // 如果接收到的点数量与当前几何体不同，需要重新分配缓冲区
      if (geometry.attributes.position.count !== numPoints) {
        console.log(`点云大小变化: 从 ${geometry.attributes.position.count} 变为 ${numPoints} 个点`);
        
        // 创建新的缓冲区
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
      } else {
        // 复用现有缓冲区，只更新数据
        const positionArray = geometry.attributes.position.array;
        const colorArray = geometry.attributes.color.array;
        
        // 复制数据
        for (let i = 0; i < positions.length; i++) {
          positionArray[i] = positions[i];
          colorArray[i] = colors[i];
        }
      }
      
      // 标记缓冲区需要更新
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      
      // 更新几何体边界
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      
      // 记录帧频
      this.frameCount = (this.frameCount || 0) + 1;
      const now = Date.now();
      if (!this.lastFpsTime) this.lastFpsTime = now;
      
      if (now - this.lastFpsTime > 5000) { // 每5秒输出一次
        const fps = this.frameCount / ((now - this.lastFpsTime) / 1000);
        console.log(`远程点云更新频率: ${fps.toFixed(1)} FPS`);
        this.frameCount = 0;
        this.lastFpsTime = now;
      }
      
      // 每10帧记录一次处理时间
      if (this.frameCount % 10 === 0) {
        const endTime = performance.now();
        console.log(`点云数据处理时间: ${(endTime - startTime).toFixed(2)}ms`);
      }
      
      // 在MAC上，需要将点云内容复制到彩色画布上
      if (navigator.platform.indexOf('Mac') !== -1 && this.colorCtx && this.pointCloudCanvas) {
        setTimeout(() => {
          try {
            this.colorCtx.clearRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
            this.colorCtx.drawImage(this.pointCloudCanvas, 0, 0);
          } catch (e) {
            console.warn('无法在MAC上复制点云画布:', e);
          }
        }, 0);
      }
    } catch (error) {
      console.error('处理远程点云数据时出错:', error);
    }
  }
}

// 导出 KinectCameraManager 类
module.exports = {
  KinectCameraManager
}; 