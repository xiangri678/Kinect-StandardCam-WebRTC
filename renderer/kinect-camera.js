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
    this.colorCanvas = document.getElementById('localVideo');
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
    this.pointCloudCanvas = null;
    this.pointCloudEnabled = false;
    this.threeJsRenderer = null;
    this.threeJsScene = null;
    this.threeJsCamera = null;
    this.threeJsControls = null;
    this.pointCloud = null;
    this.lastDepthData = null;
    this.lastColorData = null;
    this.depthModeRange = null;
    
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
    
    console.log(`切换视图模式: ${mode}`);
    
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
    
    // 检测是否为Mac系统
    const isMac = navigator.platform.indexOf('Mac') !== -1;
    console.log(`当前系统: ${isMac ? 'Mac OS' : '非Mac系统'}`);
    
    // 更新视图模式
    this.viewMode = mode;
    this.pointCloudEnabled = (mode === 'pointCloud');
    
    // 模式切换 - 显示/隐藏相应的Canvas
    if (mode === 'pointCloud') {
      // 设置点云
      try {
        this.setupPointCloud();
        
        // Mac系统特殊处理 - 保持两个Canvas都可见，但使用z-index控制
        if (isMac) {
          console.log('Mac系统特殊处理：保持原始Canvas可见');
          
          // 调整原始Canvas，防止隐藏
          if (this.colorCanvas) {
            this.colorCanvas.style.display = 'block';
            this.colorCanvas.style.position = 'absolute';
            this.colorCanvas.style.zIndex = '1';
          }
          
          // 调整点云Canvas
          if (this.pointCloudCanvas) {
            this.pointCloudCanvas.style.position = 'absolute';
            this.pointCloudCanvas.style.zIndex = '2';
            // 使用相同的样式以确保叠放正确
            if (this.colorCanvas && this.colorCanvas.parentNode) {
              const parentStyle = window.getComputedStyle(this.colorCanvas.parentNode);
              this.pointCloudCanvas.style.top = this.colorCanvas.offsetTop + 'px';
              this.pointCloudCanvas.style.left = this.colorCanvas.offsetLeft + 'px';
            }
          }
        } else {
          // 非Mac系统 - 隐藏彩色Canvas
          if (this.colorCanvas) {
            this.colorCanvas.style.display = 'none';
          }
        }
        
        // 如果之前有回调，确保点云Canvas也应用相同的回调
        if (previousCallback && this.pointCloudCanvas) {
          console.log('将回调函数应用到点云Canvas');
          this.onFrameCallback = previousCallback;
        }
      } catch (e) {
        console.error('设置点云模式失败:', e);
        // 切回彩色模式
        this.viewMode = 'color';
        this.pointCloudEnabled = false;
        
        // 确保彩色Canvas可见
        if (this.colorCanvas) {
          this.colorCanvas.style.display = 'block';
          this.colorCanvas.style.position = '';
          this.colorCanvas.style.zIndex = '';
        }
        
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
      // 清理点云资源
      this.cleanupPointCloud();
      
      // 恢复彩色Canvas样式
      if (this.colorCanvas) {
        this.colorCanvas.style.display = 'block';
        // 移除可能添加的定位样式
        if (isMac) {
          this.colorCanvas.style.position = '';
          this.colorCanvas.style.zIndex = '';
        }
      }
      
      // 恢复回调到彩色Canvas
      this.onFrameCallback = previousCallback;
    }
    
    // 确保更新媒体流
    setTimeout(() => {
      this.updateMediaStream();
      
      // 向远程对等方发送模式切换通知 - 如果存在相关函数
      if (window.notifyRemoteModeChange) {
        console.log('通知远程用户模式已切换为:', mode);
        window.notifyRemoteModeChange(mode);
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
  
  // 设置点云 Canvas
  setupPointCloudCanvas() {
    if (!THREE) {
      console.error('THREE.js库未加载，无法设置点云Canvas');
      return;
    }

    // 创建场景和摄像机
    this.threeJsScene = new THREE.Scene();
    
    // 使用与colorCanvas相同尺寸
    const width = this.colorCanvas.width || 640;
    const height = this.colorCanvas.height || 480;
    
    // 摄像机
    this.threeJsCamera = new THREE.PerspectiveCamera(30, width / height, 1, 10000);
    this.threeJsCamera.position.set(0, 0, 2000);
    this.threeJsCamera.lookAt(0, 0, 0);
    
    // 渲染器
    this.threeJsRenderer = new THREE.WebGLRenderer({
      canvas: this.colorCanvas,
      alpha: true
    });
    this.threeJsRenderer.setSize(width, height);
    
    // 添加轨道控制器
    if (window.THREE && window.THREE.OrbitControls) {
      this.threeJsControls = new window.THREE.OrbitControls(this.threeJsCamera, this.colorCanvas);
    } else {
      console.warn('THREE.OrbitControls未找到，将禁用3D视图控制');
    }
  }
  
  // 设置点云 - 使用单独的Canvas元素
  setupPointCloud() {
    if (!THREE) {
      console.error('THREE.js库未加载，无法设置点云');
      throw new Error('THREE.js库未加载');
    }

    if (!this.checkWebGLSupport()) {
      console.error('WebGL不被此浏览器支持，无法使用点云功能');
      throw new Error('WebGL不支持');
    }
    
    try {
      // 清理任何已存在的点云Canvas
      this.cleanupPointCloud();
      
      // 创建新的Canvas元素用于点云
      this.pointCloudCanvas = document.createElement('canvas');
      this.pointCloudCanvas.width = 640;
      this.pointCloudCanvas.height = 480;
      this.pointCloudCanvas.style.display = 'block';
      this.pointCloudCanvas.id = 'pointCloudCanvas'; // 添加ID便于调试
      
      // 将点云Canvas添加到DOM中，替换彩色Canvas的位置
      if (this.colorCanvas && this.colorCanvas.parentNode) {
        this.colorCanvas.parentNode.insertBefore(this.pointCloudCanvas, this.colorCanvas.nextSibling);
      } else {
        document.body.appendChild(this.pointCloudCanvas);
      }
      
      // 创建Three.js场景
      this.threeJsScene = new THREE.Scene();
      
      // 摄像机
      const width = this.pointCloudCanvas.width;
      const height = this.pointCloudCanvas.height;
      this.threeJsCamera = new THREE.PerspectiveCamera(30, width / height, 1, 10000);
      this.threeJsCamera.position.set(0, 0, 2000);
      this.threeJsCamera.lookAt(0, 0, 0);
      
      // 渲染器 - 使用新创建的Canvas
      this.threeJsRenderer = new THREE.WebGLRenderer({
        canvas: this.pointCloudCanvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true // 确保可以从Canvas中读取数据
      });
      this.threeJsRenderer.setSize(width, height);
      this.threeJsRenderer.setClearColor(0x000000, 0);
      
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
        } else {
          console.warn('未找到OrbitControls，3D视图将不可旋转');
        }
      } catch (error) {
        console.warn('初始化OrbitControls失败:', error);
      }
      
      // 深度图尺寸
      const DEPTH_WIDTH = 640;
      const DEPTH_HEIGHT = 576;
      const numPoints = DEPTH_WIDTH * DEPTH_HEIGHT;
      
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
        
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
      }
      
      // 设置属性
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      // 创建材质
      const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true
      });
      
      // 创建点云
      this.pointCloud = new THREE.Points(geometry, material);
      this.threeJsScene.add(this.pointCloud);
      
      // 更新WebRTC的媒体流以使用新的Canvas
      this.updateMediaStream();
      
      // 开始渲染循环
      this.animatePointCloud();
      
    } catch (error) {
      console.error('创建点云时出错:', error);
      this.cleanupPointCloud(); // 清理已创建的资源
      throw error;
    }
  }
  
  // 更新WebRTC媒体流以使用当前活跃的Canvas
  updateMediaStream() {
    try {
      // 目标Canvas是点云模式下的pointCloudCanvas，否则是colorCanvas
      const targetCanvas = this.viewMode === 'pointCloud' ? this.pointCloudCanvas : this.colorCanvas;
      
      if (!targetCanvas) {
        console.error('没有可用的Canvas来更新媒体流');
        return;
      }
      
      console.log(`尝试更新媒体流使用: ${this.viewMode}模式的Canvas`);
      
      // Mac系统上特别处理 - 使用captureStream方法
      try {
        // 确保Canvas可见性，以便于捕获
        targetCanvas.style.opacity = '1';
        
        // 最简单的方法：将点云Canvas内容绘制到原始Canvas上（两种方法都尝试）
        if (this.viewMode === 'pointCloud' && this.colorCanvas && this.colorCtx) {
          console.log('将点云Canvas内容复制到原始Canvas');
          
          // 方法1: drawImage
          try {
            this.colorCtx.clearRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
            this.colorCtx.drawImage(targetCanvas, 0, 0, this.colorCanvas.width, this.colorCanvas.height);
            console.log('使用drawImage方法复制成功');
          } catch (e) {
            console.warn('使用drawImage复制失败:', e);
            
            // 方法2: 通过ImageData复制
            try {
              const tempCtx = targetCanvas.getContext('2d');
              if (tempCtx) {
                const imageData = tempCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
                this.colorCtx.putImageData(imageData, 0, 0);
                console.log('使用ImageData方法复制成功');
              }
            } catch (e2) {
              console.warn('通过ImageData复制失败:', e2);
            }
          }
          
          // 对Mac用户，原始Canvas是WebRTC实际使用的，所以保持可见
          if (navigator.platform.indexOf('Mac') !== -1) {
            this.colorCanvas.style.display = 'block';
            this.pointCloudCanvas.style.display = 'block';
            this.pointCloudCanvas.style.position = 'absolute';
            this.pointCloudCanvas.style.opacity = '0';  // 不可见但保持运行
          }
        }
      } catch (copyError) {
        console.warn('复制Canvas内容失败:', copyError);
      }
      
      // 尝试直接替换视频轨道 - 最可靠的方法
      if (window.localStream) {
        try {
          const originalCanvas = this.colorCanvas; // 总是使用原始Canvas
          const stream = originalCanvas.captureStream(30); // 30fps
          
          if (stream && stream.getVideoTracks().length > 0) {
            const videoTrack = stream.getVideoTracks()[0];
            
            // 获取当前的视频轨道
            const oldTracks = window.localStream.getVideoTracks();
            
            // 停止旧轨道
            oldTracks.forEach(track => track.stop());
            
            // 移除旧轨道
            oldTracks.forEach(track => window.localStream.removeTrack(track));
            
            // 添加新轨道
            window.localStream.addTrack(videoTrack);
            
            console.log('已更新媒体轨道');
            
            // 如果有peerConnection，更新发送器
            if (window.pc) {
              const senders = window.pc.getSenders();
              senders.forEach(sender => {
                if (sender.track && sender.track.kind === 'video') {
                  sender.replaceTrack(videoTrack).then(() => {
                    console.log('替换视频轨道成功');
                  }).catch(err => {
                    console.error('替换视频轨道失败:', err);
                  });
                }
              });
            }
            
            return; // 成功更新
          } else {
            console.warn('获取视频轨道失败');
          }
        } catch (streamError) {
          console.warn('直接更新流失败:', streamError);
        }
      } else {
        console.warn('找不到localStream对象');
      }
      
      // 如果页面中存在更新媒体流的函数，则调用它
      if (window.updateCanvasMediaStream && typeof window.updateCanvasMediaStream === 'function') {
        window.updateCanvasMediaStream(this.colorCanvas); // 始终使用原始Canvas
        console.log('已通知WebRTC更新使用Canvas元素');
      }
    } catch (error) {
      console.error('更新媒体流时出错:', error);
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
      this.pointCloudCanvas = null;
    }
  }
  
  // 渲染点云动画
  animatePointCloud() {
    if (!this.threeJsRenderer || !this.threeJsScene || !this.threeJsCamera) {
      return;
    }
    
    const animate = () => {
      if (this.viewMode !== 'pointCloud') {
        return;
      }
      
      this.animationFrameId = requestAnimationFrame(animate);
      
      try {
        if (this.threeJsControls) {
          this.threeJsControls.update();
        }
        
        this.threeJsRenderer.render(this.threeJsScene, this.threeJsCamera);
        
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
        // 出错时取消动画
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    };
    
    animate();
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
    
    this.pointCloud.geometry.attributes.position.needsUpdate = true;
    this.pointCloud.geometry.attributes.color.needsUpdate = true;
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
}

// 导出 KinectCameraManager 类
module.exports = {
  KinectCameraManager
}; 