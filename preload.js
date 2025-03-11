const { ipcRenderer } = require('electron');

// 记录预加载脚本开始执行
console.log('预加载脚本开始执行');

// 由于contextIsolation为false，不使用contextBridge，直接修改window对象
try {
  // 暴露通信API
  window.electronAPI = {
    sendStatus: (status) => ipcRenderer.send('app-status', status)
  };
  console.log('electronAPI暴露成功');
} catch (error) {
  console.error('暴露electronAPI时出错:', error);
}

// 暴露Node.js的require功能
try {
  window.nodeRequire = {
    require: (moduleName) => {
      console.log(`尝试加载模块: ${moduleName}`);
      try {
        return require(moduleName);
      } catch (error) {
        console.error(`加载模块 ${moduleName} 失败:`, error);
        return null;
      }
    }
  };
  console.log('nodeRequire暴露成功');
} catch (error) {
  console.error('暴露nodeRequire时出错:', error);
}

// 记录预加载脚本完成执行
console.log('预加载脚本执行完成'); 