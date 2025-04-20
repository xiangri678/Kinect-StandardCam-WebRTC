// kinect-camera.js - Kinect Azure 摄像头模块
console.log('加载 Kinect 摄像头模块...');

// 导入模块
// 尝试导入 kinect-azure 库，如果不可用则捕获错误
let KinectAzure = null;
let kinectAvailable = false;
// 检查平台 - Kinect仅在Windows上可用
let isWindows = typeof window !== 'undefined' && 
                  window.navigator && 
                  window.navigator.platform && 
  (window.navigator.platform.indexOf('Win') >= 0);
var lastTransferPointCloudDataTime = 0;

try { 
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
  console.log('THREE.js加载成功')
} catch (error) {
  console.warn('THREE.js库加载失败，可能会影响点云功能', error);
}

// 深度图像数据
let depthImageData = null;
// 红外图像数据
let infraredImageData = null;

// KinectCameraManager 类 - 负责管理 Kinect 摄像头或回退到标准摄像头
class KinectCameraManager {
  // 静态初始化方法，返回 Promise
  static async initialize() {
    console.log("初始化 Kinect 摄像头管理器...");

    const manager = new KinectCameraManager();
    const result = await manager.detectKinect();
    return manager;
  }

  constructor() {
    console.log("创建 KinectCameraManager 实例");

    // 基本属性初始化
    this.isRunning = false;
    this.localCanvas = document.getElementById("localCanvas");
    this.remoteCanvas = document.getElementById("remoteCanvas");
    this.colorCanvas = document.getElementById("localCanvas"); // 用于渲染点云的 canva，后续判断 isMac 后再重新赋值
    this.depthCanvas = document.getElementById("depthCanvas"); // 用于渲染深度图的 canva
    this.infraredCanvas = document.getElementById("infraredCanvas"); // 用于渲染红外图的 canva
    this.colorCtx = this.colorCanvas ? this.colorCanvas.getContext("2d") : null;
    this.depthCtx = this.depthCanvas ? this.depthCanvas.getContext("2d") : null;
    this.infraredCtx = this.infraredCanvas ? this.infraredCanvas.getContext("2d") : null;

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
    this.viewMode = "color"; // 'color' 或 'pointCloud'
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

    // 动画相关属性
    this.frameCount = 0;
    this.animationStartTime = 0;
    this.lastFrameTime = 0;
    this.lastFpsUpdateTime = 0;
    this.lastMemoryCheckTime = 0;
    this.lastFpsCount = 0;
    this.lastMemoryUsage = 0;

    // 远程数据相关属性
    this.lastReceivedDataTime = 0;
    this.receivedFramesCount = 0;
    this.remotePointCloudActive = false;

    // 绑定方法，确保它们可以在任何上下文中正确引用this
    this.renderDepthFrameAsBlueToRed = this.renderDepthFrameAsBlueToRed.bind(this);
    this.renderIrFrameAsGreyScale = this.renderIrFrameAsGreyScale.bind(this);
    this.map = this.map.bind(this);
    this.hsvToRgb = this.hsvToRgb.bind(this);
    this.renderDepthFrameToCanvas = this.renderDepthFrameToCanvas.bind(this);

    // 绑定模式切换事件
    const viewModeSelect = document.getElementById("viewModeSelect");
    if (viewModeSelect) {
      viewModeSelect.addEventListener("change", (event) => {
        console.log(
          "KinectCameraManager: 视图模式选择器已更改，即将调用 setViewMode"
        );
        this.setViewMode(event.target.value);
      });
    }
  }

  // 检测 Kinect 设备
  async detectKinect() {
    try {
      if (!kinectAvailable) {
        console.log("Kinect Azure 库不可用，将使用标准摄像头");
        this.isKinectMode = false;

        // 初始化标准摄像头
        this.standardCamera = await CameraManager.initialize();
        return false;
      }

      // 确保安全地尝试创建Kinect实例
      this.kinect = new KinectAzure();
      const isOpen = this.kinect.open();

      if (isOpen) {
        console.log("Kinect 设备已成功打开");
        this.isKinectMode = true;

        // 显示 Kinect 控制区域
        const kinectControls = document.getElementById("kinectControls");
        if (kinectControls) {
          kinectControls.style.display = "flex";
        }

        return true;
      } else {
        console.warn("Kinect 设备无法打开，将使用标准摄像头");
        this.isKinectMode = false;

        // 初始化标准摄像头
        this.standardCamera = await CameraManager.initialize();
        return false;
      }
    } catch (error) {
      console.error("Kinect 设备初始化失败:", error);
      this.isKinectMode = false;

      try {
        // 初始化标准摄像头
        this.standardCamera = await CameraManager.initialize();
      } catch (camError) {
        console.error("标准摄像头初始化失败:", camError);
      }

      return false;
    }
  }

  // 初始化摄像头
  initialize() {
    console.log(
      `初始化摄像头 - 模式: ${this.isKinectMode ? "Kinect" : "标准"}`
    );

    if (!this.isKinectMode && this.standardCamera) {
      // 使用标准摄像头初始化
      return this.standardCamera.initialize();
    }

    // 确保 Canvas 已就绪
    if (!this.colorCanvas) {
      console.error("Canvas 元素未找到");
      return false;
    }

    // 如果要启用点云，创建点云 Canvas
    if (this.viewMode === "pointCloud") {
      this.setupPointCloud();
    }

    // 绘制测试图案
    this.drawTestPattern();

    console.log("初始化完成");
    return true;
  }

  // 设置视图模式
  setViewMode(mode) {
    // if (mode !== 'color' && mode !== 'pointCloud') {
    //   console.error('无效的视图模式:', mode);
    //   return;
    // }
    console.log("✔😈王冠达：正在设置视图模式");
    // 如果点云模式不可用，则强制使用彩色模式
    if (mode === "pointCloud" && (!THREE || !this.checkWebGLSupport())) {
      console.error("点云模式不可用: THREE.js库未加载或WebGL不受支持");
      alert("点云模式不可用: 您的浏览器可能不支持WebGL或THREE.js库未正确加载");

      // 更新视图模式选择器
      const viewModeSelect = document.getElementById("viewModeSelect");
      if (viewModeSelect) {
        viewModeSelect.value = "color";
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

    if (!isWindows) {
      this.colorCanvas = this.remoteCanvas;
      this.colorCtx = this.remoteCanvas.getContext("2d");
    }

    // 更新视图模式
    this.viewMode = mode;
    this.pointCloudEnabled = mode === "pointCloud";

    // 模式切换 - 显示/隐藏相应的Canvas
    if (mode === "pointCloud") {
      // 设置点云
      try {
        this.setupPointCloud();
        console.log("✔😈王冠达：点云初始化函数已通过");
        // 隐藏彩色Canvas
        if (this.colorCanvas) {
          this.colorCanvas.style.display = "none";
        }

        // 如果之前有回调，确保点云Canvas也应用相同的回调
        if (previousCallback && this.pointCloudCanvas) {
          console.log("将回调函数应用到点云Canvas");
          this.onFrameCallback = previousCallback;
        }
      } catch (e) {
        console.error("设置点云模式失败:", e);
        // 切回彩色模式
        this.viewMode = "color";
        this.pointCloudEnabled = false;

        // 确保彩色Canvas可见
        if (this.colorCanvas) {
          this.colorCanvas.style.display = "block";
          this.colorCanvas.style.position = "";
          this.colorCanvas.style.zIndex = "";
        }

        // 清理点云资源
        this.cleanupPointCloud();

        // 更新选择器
        const viewModeSelect = document.getElementById("viewModeSelect");
        if (viewModeSelect) {
          viewModeSelect.value = "color";
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
        this.colorCanvas.style.display = "block";
      }

      // 恢复回调到彩色Canvas
      this.onFrameCallback = previousCallback;
      console.log("切换到彩色视频模式，恢复回调到彩色Canvas");
    }

    // 确保更新媒体流
    setTimeout(() => {
      this.updateMediaStream();

      // 向远程对等方发送模式切换通知
      if (window.notifyRemoteModeChange) {
        console.log("通知远程用户模式已切换为:", mode);
        window.notifyRemoteModeChange(mode);
      }

      // 如果是点云模式，设置WebRTC的点云模式
      if (mode === "pointCloud" && window.webrtcManager) {
        console.log("启用WebRTC点云数据传输模式");
        window.webrtcManager.setPointCloudMode(true);
      } else if (window.webrtcManager) {
        window.webrtcManager.setPointCloudMode(false);
      }
    }, 500); // 延迟500ms确保Canvas已经准备好
  }

  // 启动摄像头流
  async startStreaming(onFrameCallback) {
    console.log(
      `启动摄像头流 - 模式: ${this.isKinectMode ? "Kinect" : "标准"}, 视图: ${
        this.viewMode
      }`
    );
    this.onFrameCallback = onFrameCallback;

    // 检查是否已经运行
    if (this.isRunning) {
      console.log("摄像头流已在运行中");
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
        flip_BGRA_to_RGBA: true,
        // include_body_index_map: true,
      });

      // 获取深度模式范围
      this.depthModeRange = this.kinect.getDepthModeRange(
        KinectAzure.K4A_DEPTH_MODE_NFOV_UNBINNED
      );

      // 根据视图模式来设置相应的处理方式
      if (this.viewMode === "pointCloud") {
        this.setupPointCloud();
      }

      // 启动监听
      this.kinect.startListening((data) => {
        window.statsKinect.update();
        if (this.viewMode === "pointCloud") {
          this.processKinectFrameWithPointCloud(data);
        } else {
          this.processKinectFrame(data, this.viewMode);
        }
      });

      const canvasStream = this.colorCanvas.captureStream(30); // 30fps
      webrtcManager.localStream = canvasStream;

      this.isRunning = true;
      return true;
    } catch (error) {
      console.error("启动 Kinect 流失败:", error);

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
  processKinectFrame(data, viewMode) {
    if (!data.colorImageFrame || !data.colorImageFrame.imageData) {
      return;
    }

    // 开始测量捕获时间
    if (window.telemetry) {
      window.telemetry.startCaptureTiming();
    }

    // 确保 Canvas 尺寸与图像一致
    if (
      this.colorCanvas.width !== data.colorImageFrame.width ||
      this.colorCanvas.height !== data.colorImageFrame.height
    ) {
      this.colorCanvas.width = data.colorImageFrame.width;
      this.colorCanvas.height = data.colorImageFrame.height;
    }

    // 开始测量处理时间
    if (window.telemetry) {
      window.telemetry.startProcessingTiming();
    }

    // 创建 ImageData 并渲染到 Canvas
    if (viewMode === "color") {
      const imageData = this.colorCtx.createImageData(
        data.colorImageFrame.width,
        data.colorImageFrame.height
      );
      imageData.data.set(new Uint8ClampedArray(data.colorImageFrame.imageData));
      // 清除Canvas，然后渲染彩色图像
      this.colorCtx.clearRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
      this.colorCtx.putImageData(imageData, 0, 0);
      
      // RGB模式下帧率和内存监控
      const now = Date.now();
      this.frameCount++;
      
      // 计算并记录FPS
      if (now - this.lastFpsUpdateTime >= 1000) { // 每秒更新一次FPS
        const elapsed = Math.max(0.001, (now - this.lastFpsUpdateTime) / 1000); // 确保不会除以0或负数
        const framesInPeriod = Math.max(0, this.frameCount - (this.lastFpsCount || 0)); // 确保帧数不为负
        const currentFps = Math.round(framesInPeriod / elapsed);
        
        // 记录FPS到性能遥测
        if (window.telemetry) {
          window.telemetry.recordFrameRate(currentFps);
        }
        
        this.lastFpsCount = this.frameCount;
        this.lastFpsUpdateTime = now;
      }
    } else if (viewMode === "depth") {
      // 先清除整个Canvas
      this.colorCtx.clearRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
      
      if (!depthImageData && data.depthImageFrame.width > 0) {
        depthImageData = this.colorCtx.createImageData(
          data.depthImageFrame.width,
          data.depthImageFrame.height
        );
      }
      if (depthImageData) {
        this.renderDepthFrameAsBlueToRed(
          this.colorCtx,
          depthImageData,
          data.depthImageFrame,
          this.depthModeRange
        );
      }
    } else if (viewMode === "infrared") {
      // 先清除整个Canvas
      this.colorCtx.clearRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
      
      if (!infraredImageData && data.irImageFrame.width > 0) {
        infraredImageData = this.colorCtx.createImageData(
          data.irImageFrame.width,
          data.irImageFrame.height
        );
      }
      if (infraredImageData) {
        this.renderIrFrameAsGreyScale(
          this.colorCtx,
          infraredImageData,
          data.irImageFrame
        );
      }
    }

    // 开始测量传输时间
    if (window.telemetry) {
      window.telemetry.startTransmissionTiming();
    }

    // 调用回调函数
    if (this.onFrameCallback) {
      this.onFrameCallback(this.colorCanvas);
    }
  }

  // 设置点云 Canvas
  setupPointCloudCanvas() {
    if (!THREE) {
      console.error("THREE.js库未加载，无法设置点云Canvas");
      return;
    }

    // 创建场景和摄像机
    this.threeJsScene = new THREE.Scene();

    // 使用与colorCanvas相同尺寸
    const width = this.colorCanvas.width || 640;
    const height = this.colorCanvas.height || 480;

    // 摄像机
    this.threeJsCamera = new THREE.PerspectiveCamera(
      30,
      width / height,
      1,
      10000
    );
    this.threeJsCamera.position.set(0, 0, 2000);
    this.threeJsCamera.lookAt(0, 0, 0);

    // 渲染器
    this.threeJsRenderer = new THREE.WebGLRenderer({
      canvas: this.colorCanvas,
      alpha: true,
    });
    this.threeJsRenderer.setSize(width, height);

    // 添加轨道控制器
    if (window.THREE && window.THREE.OrbitControls) {
      this.threeJsControls = new window.THREE.OrbitControls(
        this.threeJsCamera,
        this.colorCanvas
      );
    } else {
      console.warn("THREE.OrbitControls未找到，将禁用3D视图控制");
    }
  }

  // 设置点云 - 使用单独的Canvas元素
  setupPointCloud() {
    if (!THREE) {
      console.error("THREE.js库未加载，无法设置点云");
      throw new Error("THREE.js库未加载");
    }

    if (!this.checkWebGLSupport()) {
      console.error("WebGL不被此浏览器支持，无法使用点云功能");
      throw new Error("WebGL不支持");
    }

    try {
      // 清理任何已存在的点云Canvas
      this.cleanupPointCloud();

      // 创建新的Canvas元素用于点云
      this.pointCloudCanvas = document.createElement("canvas");
      this.pointCloudCanvas.width = 640;
      this.pointCloudCanvas.height = 480;
      this.pointCloudCanvas.style.display = "block";
      this.pointCloudCanvas.id = "pointCloudCanvas"; // 添加ID便于调试

      // 将点云Canvas添加到DOM中，替换彩色Canvas的位置
      if (this.colorCanvas && this.colorCanvas.parentNode) {
        this.colorCanvas.parentNode.insertBefore(
          this.pointCloudCanvas,
          this.colorCanvas.nextSibling
        );
      } else {
        document.body.appendChild(this.pointCloudCanvas);
      }

      // 创建Three.js场景
      this.threeJsScene = new THREE.Scene();

      // 摄像机
      const width = this.pointCloudCanvas.width;
      const height = this.pointCloudCanvas.height;
      this.threeJsCamera = new THREE.PerspectiveCamera(
        30,
        width / height,
        1,
        10000
      );
      this.threeJsCamera.position.set(0, 0, 2000);
      this.threeJsCamera.lookAt(0, 0, 0);

      // 渲染器 - 使用新创建的Canvas
      this.threeJsRenderer = new THREE.WebGLRenderer({
        canvas: this.pointCloudCanvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true, // 确保可以从Canvas中读取数据
      });
      this.threeJsRenderer.setSize(width, height);
      this.threeJsRenderer.setClearColor(0x000000, 0);
      this.threeJsRenderer.setPixelRatio(window.devicePixelRatio);

      // 添加轨道控制器
      try {
        // 尝试不同的可能位置来获取OrbitControls
        const OrbitControls =
          (window.THREE && window.THREE.OrbitControls) ||
          THREE.OrbitControls ||
          window.OrbitControls;

        if (OrbitControls) {
          this.threeJsControls = new OrbitControls(
            this.threeJsCamera,
            this.pointCloudCanvas
          );
          this.threeJsControls.enableDamping = true;
          this.threeJsControls.dampingFactor = 0.25;
        } else {
          console.warn("未找到OrbitControls，3D视图将不可旋转");
        }
      } catch (error) {
        console.warn("初始化OrbitControls失败:", error);
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
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      // 创建材质
      const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: THREE.VertexColors,
      });

      // 创建点云
      this.pointCloud = new THREE.Points(geometry, material);
      this.threeJsScene.add(this.pointCloud);

      // // 添加一个红色网格作为参考
      // const gridHelper = new THREE.GridHelper(1000, 10, 0xff0000, 0xffffff);
      // this.threeJsScene.add(gridHelper);

      // // 添加三个坐标轴
      // const axesHelper = new THREE.AxesHelper(500);
      // this.threeJsScene.add(axesHelper);

      // console.log("添加了参考网格和坐标轴");

      // 更新WebRTC的媒体流以使用新的Canvas
      this.updateMediaStream();

      // 开始渲染循环
      this.animatePointCloud();

      console.log("✔😈王冠达：点云初始化完成");
    } catch (error) {
      console.error("创建点云时出错:", error);
      this.cleanupPointCloud(); // 清理已创建的资源
      throw error;
    }
  }

  /**
   * 更新媒体流
   */
  updateMediaStream() {
    // 首先检查canvas元素是否存在
    if (!this.colorCanvas) {
      console.error("无法更新媒体流: colorCanvas未初始化");
      return false;
    }

    try {
      // End transmission timing and start rendering timing
      window.telemetry.startRenderingTiming();
      // 根据当前视图模式处理媒体流更新
      if (
        this.viewMode === "color" ||
        this.viewMode === "depth" ||
        this.viewMode === "infrared"
      ) {
        console.log(`更新媒体流: 使用${this.viewMode}模式下的视频流`);

        if (!window.localStream) {
          console.warn("localStream对象不存在，创建新的媒体流");
          window.localStream = new MediaStream();
        }

        // 获取Canvas流作为视频轨道
        const canvasStream = this.colorCanvas.captureStream(30); // 30fps
        const videoTracks = canvasStream.getVideoTracks();

        if (videoTracks.length === 0) {
          console.error("无法从Canvas获取视频轨道");
          return false;
        }

        // 更新本地流的视频轨道
        const oldTracks = window.localStream.getVideoTracks();
        // 移除旧轨道
        oldTracks.forEach((track) => {
          window.localStream.removeTrack(track);
          track.stop();
        });

        // 添加新轨道
        window.localStream.addTrack(videoTracks[0]);
        console.log("媒体流视频轨道已成功更新");

        // 通知WebRTC管理器流已更新
        if (window.notifyStreamUpdated) {
          window.notifyStreamUpdated();
        }

        return true;
      } else if (this.viewMode === "pointCloud") {
        console.log("点云模式: 通过数据通道传输点云数据，同时保持基本视频流");

        // 在点云模式下，我们仍然需要保持一个基本的视频流
        // 因为WebRTC依赖于视频轨道来保持连接

        // 显示一个静态图像，告知用户当前是点云模式
        if (this.colorCtx) {
          // 绘制背景
          this.colorCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
          this.colorCtx.fillRect(
            0,
            0,
            this.colorCanvas.width,
            this.colorCanvas.height
          );

          // 绘制文本
          this.colorCtx.font = "24px Arial";
          this.colorCtx.fillStyle = "#ffffff";
          this.colorCtx.textAlign = "center";
          this.colorCtx.fillText(
            "点云模式已激活",
            this.colorCanvas.width / 2,
            this.colorCanvas.height / 2 - 30
          );
          this.colorCtx.fillStyle = "#4CAF50";
          this.colorCtx.font = "20px Arial";
          this.colorCtx.fillText(
            "正在通过数据通道传输点云数据...",
            this.colorCanvas.width / 2,
            this.colorCanvas.height / 2 + 10
          );

          // 绘制一个旋转的3D图标
          const centerX = this.colorCanvas.width / 2;
          const centerY = this.colorCanvas.height / 2 + 60;
          const size = 40;
          const angle = (Date.now() / 1000) % (Math.PI * 2);

          this.colorCtx.save();
          this.colorCtx.translate(centerX, centerY);
          this.colorCtx.rotate(angle);

          // 绘制一个简单的立方体
          this.colorCtx.strokeStyle = "#4CAF50";
          this.colorCtx.lineWidth = 2;
          this.colorCtx.beginPath();
          this.colorCtx.rect(-size / 2, -size / 2, size, size);
          this.colorCtx.stroke();

          this.colorCtx.beginPath();
          this.colorCtx.moveTo(-size / 2, -size / 2);
          this.colorCtx.lineTo(-size / 2 + size / 4, -size / 2 - size / 4);
          this.colorCtx.lineTo(size / 2 + size / 4, -size / 2 - size / 4);
          this.colorCtx.lineTo(size / 2, -size / 2);
          this.colorCtx.closePath();
          this.colorCtx.stroke();

          this.colorCtx.beginPath();
          this.colorCtx.moveTo(size / 2, -size / 2);
          this.colorCtx.lineTo(size / 2 + size / 4, -size / 2 - size / 4);
          this.colorCtx.lineTo(size / 2 + size / 4, size / 2 - size / 4);
          this.colorCtx.lineTo(size / 2, size / 2);
          this.colorCtx.closePath();
          this.colorCtx.stroke();

          this.colorCtx.restore();
        }

        // 确保存在一个媒体流
        if (!window.localStream) {
          console.warn("点云模式: localStream对象不存在，创建新的媒体流");
          window.localStream = new MediaStream();
        }

        // 获取Canvas流作为视频轨道
        const canvasStream = this.colorCanvas.captureStream(30); // 30fps
        const videoTracks = canvasStream.getVideoTracks();

        if (videoTracks.length === 0) {
          console.error("无法从Canvas获取视频轨道");
          return false;
        }

        // 更新本地流的视频轨道
        const oldTracks = window.localStream.getVideoTracks();
        // 移除旧轨道
        oldTracks.forEach((track) => {
          window.localStream.removeTrack(track);
          track.stop();
        });

        // 添加新轨道
        window.localStream.addTrack(videoTracks[0]);
        console.log("点云模式: 已更新基本视频流以保持连接");

        // 通知WebRTC管理器流已更新
        if (window.notifyStreamUpdated) {
          window.notifyStreamUpdated();
        }

        // End rendering timing
        window.telemetry.endRenderingTiming();

        return true;
      } else {
        console.error(`不支持的视图模式: ${this.viewMode}`);
        return false;
      }
    } catch (error) {
      console.error("更新媒体流时出错:", error);
      // Record exception in telemetry
      window.telemetry.recordException();
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
      while (this.threeJsScene.children.length > 0) {
        const object = this.threeJsScene.children[0];
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
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
      console.error("无法启动点云动画循环：渲染器、场景或摄像机未初始化");
      return;
    }

    // 避免重复启动
    if (this.animationFrameId) {
      console.log("点云动画循环已在运行中，不需要重复启动");
      return;
    }

    console.log("启动点云渲染循环");

    // 跟踪帧数以便调试
    this.frameCount = 0;
    this.animationStartTime = Date.now();
    this.lastFrameTime = Date.now();
    this.lastFpsUpdateTime = Date.now();
    this.lastMemoryCheckTime = Date.now();

    // 设置一个正常帧率的基准
    const targetFrameRate = 60;
    const minFrameTime = 1000 / targetFrameRate;

    // 定义动画函数
    const animate = () => {
      // console.log('正在animate');
      // 安全检查 - 如果退出点云模式，则停止动画循环
      if (this.viewMode !== "pointCloud") {
        console.log("退出点云模式，停止动画循环");
        this.animationFrameId = null;
        return;
      }

      // 更新渲染性能统计
      if (window.statsRenderer) {
        window.statsRenderer.update();
      }

      // 如果点云已经被清理，停止动画循环
      if (
        !this.pointCloud ||
        !this.threeJsRenderer ||
        !this.threeJsScene ||
        !this.threeJsCamera
      ) {
        console.log("点云或渲染组件已被清理，停止动画循环");
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

      // 计算并记录FPS
      if (now - this.lastFpsUpdateTime >= 1000) { // 每秒更新一次FPS
        const elapsed = Math.max(0.001, (now - this.lastFpsUpdateTime) / 1000); // 确保不会除以0或负数
        const framesInPeriod = Math.max(0, this.frameCount - (this.lastFpsCount || 0)); // 确保帧数不为负
        const currentFps = Math.round(framesInPeriod / elapsed);
        
        // 记录FPS到性能遥测
        if (window.telemetry) {
          window.telemetry.recordFrameRate(currentFps);
        }
        
        this.lastFpsCount = this.frameCount;
        this.lastFpsUpdateTime = now;
      }

      // 继续执行动画帧
      this.animationFrameId = requestAnimationFrame(animate);
      this.frameCount++;
      this.lastFrameTime = now;

      // 检查是否在使用远程点云数据
      if (this.remotePointCloudActive) {
        // 检查是否长时间未收到数据
        const timeSinceLastData = now - this.lastReceivedDataTime;
        if (timeSinceLastData > 10000) {
          // 如果超过10秒未收到数据
          console.warn(
            `已有${Math.floor(
              timeSinceLastData / 1000
            )}秒未收到点云数据，点云可能已停止传输`
          );

          // 在画面上显示警告
          if (this.colorCtx) {
            this.colorCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
            this.colorCtx.fillRect(
              0,
              0,
              this.colorCanvas.width,
              this.colorCanvas.height
            );
            this.colorCtx.font = "24px Arial";
            this.colorCtx.fillStyle = "#ff3333";
            this.colorCtx.textAlign = "center";
            this.colorCtx.fillText(
              "点云数据接收中断",
              this.colorCanvas.width / 2,
              this.colorCanvas.height / 2 - 20
            );
            this.colorCtx.fillText(
              `已有${Math.floor(timeSinceLastData / 1000)}秒未收到数据`,
              this.colorCanvas.width / 2,
              this.colorCanvas.height / 2 + 20
            );
          }
        }
      }

      // 每秒输出一次帧率信息
      if (now - this.animationStartTime > 5000) {
        // 每5秒记录一次
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

          if (
            (geometry.attributes.position &&
              geometry.attributes.position.needsUpdate) ||
            (geometry.attributes.color && geometry.attributes.color.needsUpdate)
          ) {
            // 标记属性已经被更新
            if (geometry.attributes.position)
              geometry.attributes.position.needsUpdate = true;
            if (geometry.attributes.color)
              geometry.attributes.color.needsUpdate = true;

            if (frameDelta > 100) {
              // 如果帧间隔过长(>100ms)，记录日志
              console.log(`点云数据已更新，渲染新帧 (帧间隔: ${frameDelta}ms)`);
            }
          }
        }

        // 开始测量渲染时间
        if (window.telemetry) {
          window.telemetry.startRenderingTiming();
        }

        // 渲染新帧 - 添加错误处理
        if (this.threeJsRenderer && this.threeJsScene && this.threeJsCamera) {
          this.threeJsRenderer.render(this.threeJsScene, this.threeJsCamera);
        }

        // 调用回调函数 - 使用点云Canvas
        if (this.onFrameCallback && this.pointCloudCanvas) {
          this.onFrameCallback(this.pointCloudCanvas);
        }

        // 结束渲染时间测量
        if (window.telemetry) {
          window.telemetry.endRenderingTiming();
        }
      } catch (error) {
        console.error("渲染点云时出错:", error);
        // 出错时继续尝试动画而不是立即停止
        console.log("尝试恢复点云渲染循环");
      }
    };

    // 立即开始动画循环
    this.animationFrameId = requestAnimationFrame(animate);

    // 添加安全检查 - 如果5秒后动画仍未运行，尝试重新启动
    setTimeout(() => {
      if (this.viewMode === "pointCloud" && !this.animationFrameId) {
        console.log("动画循环可能已停止，尝试重新启动");
        this.animationFrameId = requestAnimationFrame(animate);
      }
    }, 5000);
  }

  // 处理 Kinect 帧 (带点云)
  processKinectFrameWithPointCloud(data) {
    if (!this.pointCloud || !this.threeJsRenderer) {
      console.warn("点云未初始化，无法处理帧");
      return;
    }

    // 开始测量捕获时间
    if (window.telemetry) {
      window.telemetry.startCaptureTiming();
    }

    // 确保有深度和颜色数据
    if (!data.depthImageFrame || !data.colorToDepthImageFrame) {
      return;
    }

    // 开始测量处理时间
    if (window.telemetry) {
      window.telemetry.startProcessingTiming();
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
      console.warn("无法更新点云：点云对象或深度模式范围未设置");
      return;
    }

    const positions = this.pointCloud.geometry.attributes.position.array;
    const colors = this.pointCloud.geometry.attributes.color.array;
    const DEPTH_WIDTH = 640;
    const DEPTH_HEIGHT = 576;

    // 读取深度和颜色数据
    for (let i = 0, j = 0; i < depthData.length; i += 2, j += 3) {
      const depthValue = (depthData[i + 1] << 8) | depthData[i];

      const colorIndex = (j / 3) * 4;
      const b = colorData[colorIndex + 0] / 255;
      const g = colorData[colorIndex + 1] / 255;
      const r = colorData[colorIndex + 2] / 255;

      if (
        depthValue > this.depthModeRange.min &&
        depthValue < this.depthModeRange.max
      ) {
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

    this.pointCloud.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.pointCloud.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3)
    );
    this.pointCloud.geometry.attributes.position.needsUpdate = true;
    this.pointCloud.geometry.attributes.color.needsUpdate = true;

    // 开始测量传输时间
    if (window.telemetry) {
      window.telemetry.startTransmissionTiming();
    }

    // 请求渲染一帧
    if (this.threeJsRenderer && this.threeJsScene && this.threeJsCamera) {
      this.threeJsRenderer.render(this.threeJsScene, this.threeJsCamera);
      // console.log("[Kinect] 本地渲染了一帧点云");
    }

    // 激进的降采样：只保留部分点
    const sampleRate = 36; // 采样率 // 计算点的数量而不是直接用数组长度
    const numOriginalPoints = depthData.length / 2; // 深度数据中的点数
    const numSampledPoints = Math.floor(numOriginalPoints / sampleRate); // 采样后的点数
    const downPositions = new Float32Array(numSampledPoints * 3); // 每个点3个坐标(x,y,z)
    const downColors = new Float32Array(numSampledPoints * 3); // 每个点3个颜色值(r,g,b)

    console.log(
      "原始点数:",
      numOriginalPoints,
      "采样后点数:",
      numSampledPoints
    ); // 读取深度和颜色数据，并进行降采样
    for (let i = 0, j = 0; i < depthData.length; i += 2 * sampleRate, j += 3) {
      // 计算当前深度像素索引
      const pixelIndex = i / 2; // 计算在原始positions数组中的对应索引位置

      const origPosIndex = pixelIndex * 3; // 直接使用原始点云中的X和Y坐标
      if (
        origPosIndex <
        this.pointCloud.geometry.attributes.position.array.length - 2
      ) {
        downPositions[j] =
          this.pointCloud.geometry.attributes.position.array[origPosIndex]; // X
        downPositions[j + 1] =
          this.pointCloud.geometry.attributes.position.array[origPosIndex + 1]; // Y
      } else {
        // 超出范围时使用计算的坐标
        const x = (pixelIndex % DEPTH_WIDTH) - DEPTH_WIDTH * 0.5;
        const y = DEPTH_HEIGHT / 2 - Math.floor(pixelIndex / DEPTH_WIDTH);
        downPositions[j] = x;
        downPositions[j + 1] = y;
      }
      const depthValue = (depthData[i + 1] << 8) | depthData[i];

      const colorIndex = (j / 3) * 4 * sampleRate;
      const b = colorData[colorIndex + 0] / 255;
      const g = colorData[colorIndex + 1] / 255;
      const r = colorData[colorIndex + 2] / 255;

      if (
        depthValue > this.depthModeRange.min &&
        depthValue < this.depthModeRange.max
      ) {
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

    console.log(
      `[Kinect] 点云数据降采样: ${depthData.length / 2} -> ${
        downPositions.length / 3
      } 个点`
    );

    // 如果是点云模式且WebRTC连接已建立，发送点云数据
    if (this.viewMode === "pointCloud" && window.webrtcManager) {
      const isConnected = window.webrtcManager.isConnected;
      const hasDataChannel = window.webrtcManager.dataChannel;

      const combinedBuffer = new Float32Array(
        downPositions.length + downColors.length
      );
      combinedBuffer.set(downPositions);
      combinedBuffer.set(downColors, downPositions.length);
      window.webrtcManager.peers["Mac用户"].send(combinedBuffer.buffer);
    }
  }

  // 绘制测试图案
  drawTestPattern() {
    if (!this.colorCtx) return;

    const width = this.colorCanvas.width || 640;
    const height = this.colorCanvas.height || 480;

    // 绘制渐变背景
    const gradient = this.colorCtx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#4a4a4a");
    gradient.addColorStop(1, "#2a2a2a");
    this.colorCtx.fillStyle = gradient;
    this.colorCtx.fillRect(0, 0, width, height);

    // 绘制文本
    this.colorCtx.font = "24px Arial";
    this.colorCtx.fillStyle = "#ffffff";
    this.colorCtx.textAlign = "center";
    this.colorCtx.fillText("Kinect 摄像头", width / 2, height / 2 - 50);
    this.colorCtx.fillText(
      this.isKinectMode ? "正在初始化..." : "未检测到设备，使用标准摄像头",
      width / 2,
      height / 2
    );

    // 绘制摄像头图标
    this.colorCtx.beginPath();
    this.colorCtx.arc(width / 2, height / 2 + 50, 30, 0, Math.PI * 2);
    this.colorCtx.fillStyle = "#3498db";
    this.colorCtx.fill();

    this.colorCtx.beginPath();
    this.colorCtx.arc(width / 2, height / 2 + 50, 15, 0, Math.PI * 2);
    this.colorCtx.fillStyle = "#2c3e50";
    this.colorCtx.fill();
  }

  // 关闭资源
  close() {
    console.log("关闭摄像头资源");

    if (this.kinect && this.usingKinect) {
      try {
        this.kinect.stopListening();
        this.kinect.close();
      } catch (error) {
        console.error("关闭 Kinect 时出错:", error);
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
      console.log("首次接收远程点云数据，激活远程点云模式");
      this.remotePointCloudActive = true;
      this.initPointCloud(); // 确保点云已初始化
    }

    // 记录接收数据时间
    this.lastReceivedDataTime = Date.now();

    // 数据有效性验证
    if (
      !positions ||
      !colors ||
      positions.length === 0 ||
      colors.length === 0
    ) {
      console.error("接收到无效的点云数据: 数据为空");
      return;
    }

    if (positions.length !== colors.length) {
      console.error(
        `点云数据长度不匹配: 位置(${positions.length}) 颜色(${colors.length})`
      );
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
        console.warn("点云几何体未初始化，尝试重新创建");
        this.initPointCloud();

        if (!this.pointCloud || !this.pointCloud.geometry) {
          console.error("无法创建点云几何体，无法显示远程点云数据");
          return;
        }
      }

      // 获取点云几何体
      const geometry = this.pointCloud.geometry;

      // 计算点的数量
      const numPoints = positions.length / 3;

      // 如果接收到的点数量与当前几何体不同，需要重新分配缓冲区
      if (geometry.attributes.position.count !== numPoints) {
        console.log(
          `点云大小变化: 从 ${geometry.attributes.position.count} 变为 ${numPoints} 个点`
        );

        // 创建新的缓冲区
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(positions), 3)
        );
        geometry.setAttribute(
          "color",
          new THREE.BufferAttribute(new Float32Array(colors), 3)
        );
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

      if (now - this.lastFpsTime > 5000) {
        // 每5秒输出一次
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
      if (
        navigator.platform.indexOf("Mac") !== -1 &&
        this.colorCtx &&
        this.pointCloudCanvas
      ) {
        setTimeout(() => {
          try {
            this.colorCtx.clearRect(
              0,
              0,
              this.colorCanvas.width,
              this.colorCanvas.height
            );
            this.colorCtx.drawImage(this.pointCloudCanvas, 0, 0);
          } catch (e) {
            console.warn("无法在MAC上复制点云画布:", e);
          }
        }, 0);
      }
    } catch (error) {
      console.error("处理远程点云数据时出错:", error);
    }
  }

  // 从Kinect或Canvas获取视频流
  async getVideoStream() {
    console.log("[KinectCamera] 尝试获取视频流");

    // 如果使用标准相机，则从标准相机获取流
    if (!this.isKinectMode && this.standardCamera) {
      console.log("[KinectCamera] 使用标准摄像头获取视频流");
      return this.standardCamera.getVideoStream();
    }

    // 如果有Canvas并且正在运行，从Canvas获取流
    if (this.colorCanvas) {
      try {
        console.log("[KinectCamera] 尝试从colorCanvas获取流");
        const stream = this.colorCanvas.captureStream(30); // 30fps

        const tracks = stream.getTracks();
        console.log(
          "[KinectCamera] 从Canvas获取的流包含轨道:",
          tracks.map((t) => ({
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState,
          }))
        );

        if (tracks.length > 0) {
          // 更新本地流并通知WebRTC
          window.localStream = stream;

          // 通知WebRTC管理器流已更新
          if (window.notifyStreamUpdated) {
            window.notifyStreamUpdated();
          }

          return stream;
        }
      } catch (error) {
        console.error("[KinectCamera] 从Canvas获取流失败:", error);
      }
    }

    // 更新媒体流
    this.updateMediaStream();

    // 如果都失败了，返回null
    console.error("[KinectCamera] 无法获取视频流");
    return null;
  }

  renderDepthFrameToCanvas = (
    ctx,
    canvasImageData,
    imageFrame,
    depthModeRange
  ) => {
    canvasImageData.data.set(imageFrame.imageData);
    ctx.putImageData(canvasImageData, 0, 0);
  };

  renderDepthFrameAsBlueToRed = (
    ctx,
    canvasImageData,
    imageFrame,
    depthModeRange
  ) => {
    const newPixelData = Buffer.from(imageFrame.imageData);
    const pixelArray = canvasImageData.data;
    let depthPixelIndex = 0;
    const range = 2 / 3;

    for (let i = 0; i < canvasImageData.data.length; i += 4) {
      const depthValue = Math.min(
        depthModeRange.max,
        Math.max(
          depthModeRange.min,
          (newPixelData[depthPixelIndex + 1] << 8) |
            newPixelData[depthPixelIndex]
        )
      );
      let hue = this.map(depthValue, depthModeRange.min, depthModeRange.max, 0, 1);
      hue *= range;
      hue = range - hue;
      const rgb = this.hsvToRgb(hue, 1, 1);

      pixelArray[i] = rgb[0];
      pixelArray[i + 1] = rgb[1];
      pixelArray[i + 2] = rgb[2];
      pixelArray[i + 3] = 0xff;
      depthPixelIndex += 2;
    }
    
    imageFrame.height = this.colorCanvas.height;
    imageFrame.width = this.colorCanvas.height;
    // 计算偏移量以居中显示
    const canvasWidth = this.colorCanvas.width;
    const canvasHeight = this.colorCanvas.height;
    const imageWidth = imageFrame.width;
    const imageHeight = imageFrame.height;
    const offsetX = Math.floor((canvasWidth - imageWidth) / 2);
    const offsetY = Math.floor((canvasHeight - imageHeight) / 2);
    
    // 在居中位置绘制图像
    ctx.putImageData(canvasImageData, offsetX, offsetY);
  };

  map = (value, inputMin, inputMax, outputMin, outputMax) => {
    return (
      ((value - inputMin) * (outputMax - outputMin)) / (inputMax - inputMin) +
      outputMin
    );
  };

  /**
   * https://gist.github.com/mjackson/5311256
   * Converts an HSV color value to RGB. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
   * Assumes h, s, and v are contained in the set [0, 1] and
   * returns r, g, and b in the set [0, 255].
   *
   * @param   Number  h       The hue
   * @param   Number  s       The saturation
   * @param   Number  v       The value
   * @return  Array           The RGB representation
   */
  hsvToRgb = (h, s, v) => {
    let r, g, b;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0:
        (r = v), (g = t), (b = p);
        break;
      case 1:
        (r = q), (g = v), (b = p);
        break;
      case 2:
        (r = p), (g = v), (b = t);
        break;
      case 3:
        (r = p), (g = q), (b = v);
        break;
      case 4:
        (r = t), (g = p), (b = v);
        break;
      case 5:
        (r = v), (g = p), (b = q);
        break;
    }

    return [r * 255, g * 255, b * 255];
  };

  renderIrFrameAsGreyScale = (ctx, canvasImageData, imageFrame) => {
    const newPixelData = Buffer.from(imageFrame.imageData);
    const pixelArray = canvasImageData.data;
    const maxValue = 255 << 8;
    let incomingPixelIndex = 0;
    for (let i = 0; i < canvasImageData.data.length; i += 4) {
      const irValue =
        (newPixelData[incomingPixelIndex + 1] << 8) |
        newPixelData[incomingPixelIndex];
      const normalizedValue = irValue; //this.map(irValue, 0, maxValue, 0, 255);
      pixelArray[i] = normalizedValue;
      pixelArray[i + 1] = normalizedValue;
      pixelArray[i + 2] = normalizedValue;
      pixelArray[i + 3] = 0xff;
      incomingPixelIndex += 2;
    }

    imageFrame.height = this.colorCanvas.height;
    imageFrame.width = this.colorCanvas.height;
    // 计算偏移量以居中显示
    const canvasWidth = this.colorCanvas.width;
    const canvasHeight = this.colorCanvas.height;
    const imageWidth = imageFrame.width;
    const imageHeight = imageFrame.height;
    const offsetX = Math.floor((canvasWidth - imageWidth) / 2);
    const offsetY = Math.floor((canvasHeight - imageHeight) / 2);
    
    // 在居中位置绘制图像
    ctx.putImageData(canvasImageData, offsetX, offsetY);
  };
}

// 导出 KinectCameraManager 类
module.exports = {
  KinectCameraManager
}; 