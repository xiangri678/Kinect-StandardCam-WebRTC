# I3DCD：Kinect-StandardCam-WebRTC 会议系统

这是一个基于WebRTC技术的视频会议应用程序，支持标准摄像头和Kinect设备。该应用可实现多人实时视频通话，无论用户是否拥有Kinect设备都能参与同一会议。

## 功能特点

- 兼容原有Kinect WebRTC应用程序的通信协议
- 支持多人会议
- 可以在没有Kinect库的普通电脑上运行
  - 提供视频和音频控制功能

- 包含详细的调试和日志功能

## 系统要求

- Node.js (推荐v14+)
- npm或yarn包管理器
- 兼容的摄像头设备
- 支持WebRTC的现代浏览器

## 快速开始

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/yourusername/StandardCam-WebRTC.git
cd StandardCam-WebRTC
```

2. 安装依赖项

```bash
npm install
```

3. Kinect库安装（可选）
对于使用Kinect设备的用户，需要安装Kinect库以激活 Azure Kinect 相机的特殊功能：

   - 从微软Azure官网下载安装本项目兼容的SDK版本：
     - Azure Kinect Sensor SDK v1.4.1
     - Azure Kinect Body Tracking SDK v1.1.0
   - 下载 kinect-azure 库，放在项目顶级目录下备用。kinect-azure 库实现了在 Node.js 环境中使用 Azure Kinect 相机。

4. 启动应用

```bash
npm start
```

### 基本使用

1. 启动应用后，在登录页面输入：

   - 房间ID (需与Kinect用户相同)
   - 用户名
   - 服务器地址 (默认为http://localhost:3001，或使用Kinect主机IP地址)
2. 点击"加入房间"连接到会议
3. 使用界面控件管理音视频

## 用户界面

- **本地视频区域**：显示您的摄像头画面
- **远程视频区域**：显示远程用户的视频
- **音频控制**：
  - 静音按钮：控制本地麦克风
  - 音量滑块：调整远程用户音量
- **视频控制**：开启/关闭摄像头
- **调试选项**：显示详细连接和传输信息

## 网络连接配置

### 服务器连接

为使StandardCam-WebRTC客户端能与Kinect设备用户通信，必须连接到相同的信令服务器：

- 本地测试：`http://localhost:3001`
- 局域网通信：使用Kinect主机IP，如 `http://192.168.1.100:3001`
- 公网通信：确保服务器可公网访问且端口已开放

### 防火墙配置

对于复杂网络环境，可能需要：

- 开放UDP端口进行P2P连接
- 配置TURN服务器穿透NAT/防火墙

## 故障排除

| 问题         | 可能的解决方案                             |
| ------------ | ------------------------------------------ |
| 摄像头不工作 | 检查浏览器权限；确认摄像头未被其他应用占用 |
| 连接失败     | 验证服务器地址；确认服务器运行状态         |
| ICE连接问题  | 启用调试模式查看详细错误信息；检查网络环境 |
| 音频质量差   | 检查麦克风设置；调整音量；避免环境噪音     |

## 技术架构

本应用基于以下技术开发：

- Electron - 跨平台桌面应用框架
- WebRTC - 实时通信技术
- Socket.IO - 用于信令服务
- SimplePeer - WebRTC连接封装
- HTML5 Canvas API - 视频处理

## 开发指南

### 目录结构

```
StandardCam-WebRTC/
├── main.js                # Electron主进程
├── renderer/              # 渲染进程相关文件
│   ├── app.js             # 应用主逻辑
│   ├── kinect-camera.js   # Kinect 客户端逻辑
│   ├── camera.js          # 非 Kinect 客户端逻辑
│   └── webrtc.js          # WebRTC连接管理
├── kinect-azure/          # Kinect库（可选）
└── index.html             # 主界面
```

### 构建与部署

```bash
# 构建应用
npm run build

# 打包为可执行文件
npm run package
```

## 许可证

MIT