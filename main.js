const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');

// 保持对主窗口的全局引用
let mainWindow;

// 创建信令服务器
const server = http.createServer();
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  path: '/socket.io', // 显式设置Socket.IO路径
  transports: ['websocket', 'polling'] // 支持的传输方式
});

// 处理WebRTC信令
io.on('connection', (socket) => {
  console.log('新客户端连接:', socket.id);

  // 发送欢迎消息
  socket.emit('server-message', {
    type: 'welcome',
    message: '已连接到信令服务器',
    socketId: socket.id
  });

  // 加入房间
  socket.on('join-room', (roomId, userId) => {
    console.log(`用户 ${userId} 加入房间 ${roomId}`);
    socket.join(roomId);
    
    // 通知房间内其他人有新用户加入
    socket.to(roomId).emit('user-connected', userId);
    
    // 发送加入确认
    socket.emit('room-joined', {
      room: roomId,
      id: userId
    });
    
    // 断开连接时通知其他用户
    socket.on('disconnect', () => {
      console.log(`用户 ${userId} 断开连接`);
      socket.to(roomId).emit('user-disconnected', userId);
    });
    
    // 转发信令消息
    socket.on('offer', (offer, targetUserId) => {
      console.log(`用户 ${userId} 发送offer到房间 ${roomId}`);
      // 记录offer类型用于调试
      console.log(`offer类型: ${typeof offer}, 包含类型: ${offer.type ? offer.type : '无'}`);
      socket.to(roomId).emit('offer', offer, userId);
    });
    
    socket.on('answer', (answer, targetUserId) => {
      console.log(`用户 ${userId} 发送answer到房间 ${roomId}`);
      // 记录answer类型用于调试
      console.log(`answer类型: ${typeof answer}, 包含类型: ${answer.type ? answer.type : '无'}`);
      socket.to(roomId).emit('answer', answer, userId);
    });
    
    socket.on('ice-candidate', (candidate, targetUserId) => {
      console.log(`用户 ${userId} 发送ICE候选到房间 ${roomId}`);
      // 记录candidate类型用于调试
      let candidateStr = '';
      try {
        candidateStr = JSON.stringify(candidate).substring(0, 100) + '...';
      } catch (e) {
        candidateStr = '无法序列化';
      }
      console.log(`candidate简略内容: ${candidateStr}`);
      socket.to(roomId).emit('ice-candidate', candidate, userId);
    });
  });
});

// 启动信令服务器
const PORT = 3001;
const HOST = '0.0.0.0'; // 监听所有网络接口，而不仅仅是localhost
server.listen(PORT, HOST, () => {
  console.log(`信令服务器运行在 http://${HOST}:${PORT}`);
  console.log(`可通过本机IP地址访问，例如 http://本机IP:${PORT}`);
});

function createWindow() {
  console.log('创建主窗口...');
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`预加载脚本路径: ${preloadPath}`);
  
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      // 为了快速保证应用可用，暂时放宽安全限制
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      preload: preloadPath,
      webSecurity: false // 临时禁用安全策略，仅用于调试
    },
    title: 'StandardCam WebRTC'
  });

  const indexPath = path.join(__dirname, 'renderer/index.html');
  console.log(`加载页面: ${indexPath}`);
  
  // 加载应用的 index.html
  mainWindow.loadFile(indexPath);

  // 打开开发者工具，用于调试
  // mainWindow.webContents.openDevTools();
  
  // 监听页面加载状态
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('页面加载完成');
  });
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('页面加载失败:', errorCode, errorDescription);
  });

  // 当窗口关闭时触发的事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建一个测试窗口（客户端）函数
function createClientWindow() {
  console.log('创建客户端测试窗口...');
  const preloadPath = path.join(__dirname, 'preload.js');
  
  // 创建客户端窗口
  const clientWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    x: 50, // 位置偏移，避免与主窗口重叠
    y: 50,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      preload: preloadPath,
      webSecurity: false
    },
    title: 'StandardCam WebRTC 客户端测试窗口'
  });

  const indexPath = path.join(__dirname, 'renderer/index.html');
  console.log(`客户端窗口加载页面: ${indexPath}`);
  
  // 加载应用的 index.html
  clientWindow.loadFile(indexPath);
  
  // 打开开发者工具
  clientWindow.webContents.openDevTools();
  
  // 窗口准备好后自动填充连接信息
  clientWindow.webContents.on('did-finish-load', () => {
    clientWindow.webContents.executeJavaScript(`
      document.getElementById('roomIdInput').value = '1';
      document.getElementById('userIdInput').value = '测试客户端';
      document.getElementById('serverUrlInput').value = 'http://localhost:3001';
      document.getElementById('connectionStatus').textContent = '准备连接到本地服务器';
    `);
  });
}

// 添加一个开发菜单，允许打开测试客户端窗口
function createApplicationMenu() {
  const { Menu } = require('electron');
  
  const template = [
    {
      label: '开发',
      submenu: [
        {
          label: '打开测试客户端窗口',
          click: () => createClientWindow()
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  console.log('Electron初始化完成，准备创建窗口...');
  createWindow();
  createApplicationMenu(); // 创建应用菜单

  app.on('activate', () => {
    // 在macOS上，当点击dock图标并且没有其他窗口打开时，通常会在应用程序中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  app.quit();
});

// IPC通信
ipcMain.on('app-status', (event, status) => {
  console.log('应用状态:', status);
}); 