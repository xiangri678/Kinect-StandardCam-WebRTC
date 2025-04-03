# I3DCD：Kinect-WebRTC 中间件

一个强大的中间件解决方案，将 Azure Kinect 相机无缝集成到 WebRTC 视频通信应用中。该中间件提供了 Kinect 设备数据采集、处理和 WebRTC 传输的完整能力，让开发者能够轻松构建基于 Kinect 的实时通信应用。

## 核心优势

- **无缝集成** - 简化 Kinect 相机与 WebRTC 技术的集成流程
- **跨设备兼容** - 支持 Kinect 设备与标准摄像头设备间的实时通信
- **高性能传输** - 优化的数据处理和传输机制确保低延迟
- **灵活可扩展** - 模块化设计便于开发者进行功能定制和扩展
- **多人会议支持** - 原生支持多点连接的视频会议场景

## 技术规格

- **支持设备**: Azure Kinect DK
- **运行环境**: Node.js v14+ 和 Electron
- **数据处理**: 支持深度数据、骨骼跟踪、RGB视频流处理
- **传输协议**: WebRTC (基于 SimplePeer 封装)
- **信令机制**: Socket.IO
- **兼容浏览器**: Chrome 72+, Firefox 65+, Safari 12+, Edge 79+

## 快速开始

### 环境准备

1. 安装必要的依赖项:

```bash
npm install
```

2. 安装 Kinect SDK（仅适用于有 Azure Kinect 设备的 Windows 用户）:

   - Azure Kinect Sensor SDK v1.4.1
   - Azure Kinect Body Tracking SDK v1.1.0
3. 配置 Kinect 设备:

```bash
# 将 kinect-azure 库文件放置在项目根目录
git clone https://github.com/yourusername/kinect-azure.git
```

### 基本使用

```javascript
// 引入中间件
const KinectWebRTC = require('./main');

// 初始化
const kinectMiddleware = new KinectWebRTC({
  roomId: 'test-room',
  serverUrl: 'http://your-signaling-server:3001',
  username: 'user1',
  withKinect: true  // 使用Kinect摄像头，false则使用标准摄像头
});

// 启动中间件
kinectMiddleware.start();

// 监听连接事件
kinectMiddleware.on('peerConnected', (peerId) => {
  console.log(`与 ${peerId} 建立连接`);
});

// 监听数据接收
kinectMiddleware.on('dataReceived', (data) => {
  console.log('接收到数据:', data);
});
```

## 架构设计

中间件由以下核心模块组成:

- **设备管理模块** - 负责 Kinect 相机的初始化、配置和数据采集
- **数据处理模块** - 处理 Kinect 原始数据，包括深度数据处理、骨骼识别等
- **媒体流处理** - 视频流和音频流的采集与预处理
- **WebRTC 传输层** - 负责P2P连接建立和媒体数据传输
- **信令管理** - 处理连接建立过程中的信令交换
- **异构设备适配** - 确保 Kinect 与普通摄像头之间的兼容性

### 系统架构图

```
┌───────────────────────────────────────┐
│          Kinect-WebRTC 中间件          │
├─────────────────┬─────────────────────┤
│  Kinect 设备管理  │    WebRTC 连接管理   │
├─────────────────┼─────────────────────┤
│  数据处理与转换   │      信令服务        │
├─────────────────┴─────────────────────┤
│            应用程序接口 (API)           │
└───────────────────────────────────────┘
          ▲                  ▲
          │                  │
┌─────────┴──────┐  ┌────────┴───────┐
│  Kinect 应用    │  │ 普通摄像头应用  │
└────────────────┘  └────────────────┘
```

## API 文档

### 主要类和方法

#### KinectWebRTC 类

```javascript
/**
 * 创建新的 KinectWebRTC 实例
 * @param {Object} config - 配置参数
 * @param {string} config.roomId - 会议室ID
 * @param {string} config.serverUrl - 信令服务器URL
 * @param {string} config.username - 用户名
 * @param {boolean} config.withKinect - 是否使用Kinect相机
 */
constructor(config)

/**
 * 启动中间件
 * @return {Promise} 返回启动完成的Promise
 */
start()

/**
 * 停止中间件
 */
stop()

/**
 * 发送数据到远程对等方
 * @param {*} data - 要发送的数据
 * @param {string} [peerId] - 特定对等方ID，不指定则广播
 */
sendData(data, peerId)

/**
 * 注册事件处理函数
 * @param {string} event - 事件名称
 * @param {Function} callback - 回调函数
 */
on(event, callback)
```

### 事件列表

| 事件名称             | 描述                 | 参数           |
| -------------------- | -------------------- | -------------- |
| `connected`        | 成功连接到信令服务器 | 无             |
| `peerConnected`    | 与远程对等方建立连接 | peerId         |
| `peerDisconnected` | 与远程对等方断开连接 | peerId         |
| `dataReceived`     | 接收到数据           | data, peerId   |
| `streamReceived`   | 接收到媒体流         | stream, peerId |
| `error`            | 发生错误             | error          |

## 高级配置

### 传输优化

```javascript
const kinectMiddleware = new KinectWebRTC({
  // 基本配置
  roomId: 'test-room',
  serverUrl: 'http://localhost:3001',
  
  // 高级配置
  transport: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
    ],
    maxBitrate: 2000, // kbps
    optimizeQuality: true
  },
  
  // Kinect 数据配置
  kinectOptions: {
    depthMode: '720P',
    bodyTracking: true,
    rgbResolution: '1080P'
  }
});
```

## 应用场景

- **远程医疗** - 利用 Kinect 体感追踪功能进行远程康复指导
- **远程教育** - 3D 教学内容实时传输与互动
- **远程协作** - 增强现实场景中的远程协作与指导
- **虚拟活动** - 结合骨骼数据实现虚拟形象驱动的在线活动

## 目录结构

```
Kinect-WebRTC/
├── main.js                # 中间件入口
├── renderer/              # 核心功能模块
│   ├── app.js             # 应用主逻辑
│   ├── kinect-camera.js   # Kinect 设备管理模块
│   ├── camera.js          # 标准摄像头适配模块
│   └── webrtc.js          # WebRTC连接管理模块
├── kinect-azure/          # Kinect原生接口封装
└── examples/              # 示例代码和集成演示
    ├── simple-chat/       # 简单聊天应用示例
    └── ar-collaboration/  # AR协作示例
```

## 兼容性与性能

### 硬件要求

- **Kinect设备端**:

  - Azure Kinect DK
  - CPU: Intel i5-8400 或同等性能
  - RAM: 8GB+
  - GPU: NVIDIA GTX 1060 或同等性能
  - 带宽: 上行5Mbps以上
- **普通摄像头端**:

  - 支持WebRTC的设备和浏览器
  - 带宽: 上行2Mbps以上

### 性能指标

| 功能         | 延迟   | CPU占用 | 内存占用 |
| ------------ | ------ | ------- | -------- |
| RGB视频传输  | <150ms | 10-15%  | ~200MB   |
| 深度数据传输 | <200ms | 20-25%  | ~300MB   |
| 骨骼数据传输 | <100ms | 15-20%  | ~250MB   |

## 故障排除

| 问题               | 可能的解决方案                           |
| ------------------ | ---------------------------------------- |
| Kinect设备未检测到 | 检查USB连接，确认Kinect SDK安装正确      |
| 连接建立失败       | 验证信令服务器地址，检查网络防火墙设置   |
| 数据传输卡顿       | 检查带宽，降低视频质量设置，优化网络环境 |
| 骨骼跟踪异常       | 确保有足够光照，检查背景是否简单清晰     |

## 贡献指南

我们欢迎开发者参与项目完善，如需贡献代码请遵循以下流程:

1. Fork项目仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交Pull Request

## 许可证

MIT
