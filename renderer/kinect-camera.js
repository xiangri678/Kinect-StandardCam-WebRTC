// kinect-camera.js - Kinect Azure 摄像头模块
console.log('加载 Kinect 摄像头模块...');

// 导入模块
// 尝试导入 kinect-azure 库，如果不可用则捕获错误
let KinectAzure = null;
let kinectAvailable = false;

try {
  KinectAzure = require('kinect-azure');
  kinectAvailable = true;
  console.log('Kinect Azure 库已成功加载');
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
    if (!kinectAvailable) {
      console.log('Kinect Azure 库不可用，将使用标准摄像头');
      this.isKinectMode = false;
      
      // 初始化标准摄像头
      this.standardCamera = await CameraManager.initialize();
      return false;
    }
    
    try {
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
      
      // 初始化标准摄像头
      this.standardCamera = await CameraManager.initialize();
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
      this.setupPointCloudCanvas();
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
    
    console.log(`切换视图模式: ${mode}`);
    this.viewMode = mode;
    this.pointCloudEnabled = (mode === 'pointCloud');
    
    // 重新启动摄像头流以应用更改
    if (this.isRunning && this.isKinectMode) {
      this.close();
      this.initialize();
      this.startStreaming(this.onFrameCallback);
    }
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
  
  // 设置点云 
  setupPointCloud() {
    if (!THREE) {
      console.error('THREE.js库未加载，无法设置点云');
      return;
    }
    
    // 首先设置Canvas
    this.setupPointCloudCanvas();
    
    // 深度图尺寸
    const DEPTH_WIDTH = 640;
    const DEPTH_HEIGHT = 576;
    const numPoints = DEPTH_WIDTH * DEPTH_HEIGHT;
    
    // 创建几何体
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
    
    // 开始渲染循环
    this.animatePointCloud();
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
      
      if (this.threeJsControls) {
        this.threeJsControls.update();
      }
      
      this.threeJsRenderer.render(this.threeJsScene, this.threeJsCamera);
      
      // 调用回调函数
      if (this.onFrameCallback) {
        this.onFrameCallback(this.colorCanvas);
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
}

// 导出 KinectCameraManager 类
module.exports = {
  KinectCameraManager
}; 