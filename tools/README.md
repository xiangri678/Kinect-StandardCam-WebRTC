# Performance Testing Tools

This directory contains tools for performance testing and analysis of the WebRTC-Kinect system.

## Performance Telemetry

The system includes built-in telemetry collection for measuring various performance aspects:

1. **End-to-end latency** - Broken down into capture, processing, transmission, and rendering components
2. **System resource utilization** - CPU, GPU, and memory usage
3. **Kinect depth data quality** - Depth accuracy, RGB-D alignment, and invalid pixel rate
4. **WebRTC connection performance** - ICE gathering time, connection establishment time
5. **Long-term stability** - Frame rate, memory growth, exceptions

## How to Test

1. Start the application using `npm start` or `yarn start`
2. Connect to a room and conduct your testing
3. Performance data will be automatically collected while the application runs
4. When you end the session, a performance report will be generated automatically
5. The report will be saved to your user data directory (accessible via the link shown in the app)

## Analyzing Telemetry Data

For more detailed analysis after collection, use the `analyze-telemetry.js` script:

```
npm run analyze -- --input /path/to/telemetry-data.json --output ./reports
```

Parameters:
- `--input` or `-i`: Path to the telemetry JSON data file (required)
- `--output` or `-o`: Output directory for reports (default: ./performance_reports)

The script generates:
1. A comprehensive HTML report with statistical summaries
2. Chart images showing the performance metrics over time
3. Console output with summary statistics

## Test Scenarios

For comprehensive testing, we recommend running the following test scenarios:

### 1. Latency Testing
- Run 5-minute sessions with varying amounts of movement
- Test with both standard camera and Kinect (if available)
- Test under different network conditions (LAN, WAN, simulated poor network)

### 2. Resource Usage Testing
- Monitor CPU/GPU usage during extended sessions (30+ minutes)
- Test with different numbers of concurrent users
- Test with point cloud mode enabled vs. disabled

### 3. Kinect Quality Testing
- Test depth accuracy at different distances (1m, 2m, 3m, 4m)
- Test with different lighting conditions
- Test with different subject materials (reflective, transparent, etc.)

### 4. Connection Performance Testing
- Test connection establishment under various network conditions
- Test reconnection behavior after network interruptions
- Measure connection time with different ICE server configurations

### 5. Long-term Stability Testing
- Run 24-hour continuous test to detect memory leaks or performance degradation
- Periodically introduce network disruptions to test recovery
- Monitor frame rate stability over extended periods 

---

# 性能测试工具

此目录包含用于对 WebRTC-Kinect 系统进行性能测试与分析的工具。

## 性能遥测 (Performance Telemetry)

该系统包含内置的遥测数据收集功能，用于测量以下关键性能指标：

1.  **端到端延迟** - 分解为捕获、处理、传输和渲染组件
2.  **系统资源利用率** - CPU、GPU 及内存使用情况
3.  **Kinect 深度数据质量** - 深度精度、RGB-D 对齐情况及无效像素率
4.  **WebRTC 连接性能** - ICE 候选收集时间、连接建立时间
5.  **长期稳定性** - 帧率、内存增长情况、异常

## 如何进行测试

1.  使用 `npm start` 或 `yarn start` 启动应用程序
2.  连接到一个房间并进行您的测试
3.  应用程序运行时，性能数据将被自动收集
4.  当您结束会话时，系统将自动生成一份性能报告
5.  报告将保存到您的用户数据目录（可通过应用程序中显示的链接访问）

## 分析遥测数据

若需在数据收集后进行更详细的分析，请使用 `analyze-telemetry.js` 脚本：

```bash
npm run analyze -- --input /path/to/telemetry-data.json --output ./reports
```

参数说明：
- `--input` 或 `-i`：遥测 JSON 数据文件的路径（必需）
- `--output` 或 `-o`：报告的输出目录（默认为：`./performance_reports`）

该脚本会生成：
1.  一份包含统计摘要的综合性 HTML 报告
2.  显示性能指标随时间变化的图表图片
3.  包含汇总统计信息的控制台输出

## 测试场景

为了进行全面测试，我们建议运行以下测试场景：

### 1. 延迟测试
- 运行 5 分钟的测试会话，包含不同程度的运动
- 使用标准摄像头和 Kinect（如果可用）分别进行测试
- 在不同的网络条件下测试（局域网 LAN、广域网 WAN、模拟弱网环境）

### 2. 资源使用测试
- 在较长时段（30 分钟以上）的会话中监控 CPU/GPU 使用率
- 测试不同并发用户数量下的情况
- 分别在启用和禁用点云模式下进行测试

### 3. Kinect 质量测试
- 在不同距离（1米、2米、3米、4米）测试深度精度
- 在不同的光照条件下测试
- 使用不同材质的测试对象（如反光、透明材质等）进行测试

### 4. 连接性能测试
- 在各种网络条件下测试连接建立过程
- 测试网络中断后的重连行为
- 测量使用不同 ICE 服务器配置时的连接时间

### 5. 长期稳定性测试
- 运行 24 小时的连续测试，以检测内存泄漏或性能下降
- 周期性地引入网络中断以测试恢复能力
- 在长时间内监控帧率的稳定性


---

测试模块实现总结：

**性能遥测模块 (Performance Telemetry Module):**

*   创建了 `renderer/performance-telemetry.js` - 这是一个用于收集各类性能指标的综合性模块。
*   追踪端到端延迟（覆盖捕获、处理、传输、渲染各阶段）。
*   监控系统资源占用（CPU、内存）。
*   记录 Kinect 质量数据（如深度图精度、RGBD 对齐情况、无效像素率）。
*   测量 WebRTC 连接性能（例如 ICE 候选收集时间、连接建立时间）。
*   追踪稳定性指标（如帧率、内存增长情况、异常捕获）。

**性能可视化模块 (Performance Visualization):**

*   创建了 `renderer/performance-visualizer.js` - 该模块使用 Chart.js 对收集到的性能指标进行可视化展示。
*   为每个指标类别生成实时图表。
*   支持将报告导出为 HTML 格式。

**分析工具 (Analysis Tool):**

*   创建了 `tools/analyze-telemetry.js` - 这是一个独立的脚本，用于对收集到的遥测数据进行深度分析。
*   基于已保存的遥测数据生成统计报告和图表。
*   生成包含汇总统计信息的详细 HTML 报告。

**与应用程序集成 (Integration with Application):**

*   在 `app.js` 中添加了遥测系统的初始化逻辑。
*   在关键组件 (`kinect-camera.js` 和 `webrtc.js`) 中集成了遥测数据采集（埋点）。
*   添加了用于访问性能数据和报告的用户界面（UI）元素。
*   添加了清理逻辑，以确保数据被正确收集和导出。

**运行性能测试的步骤：**

1.  使用 `npm start` 命令启动应用程序。
2.  连接到一个房间，进行您的测试。
3.  性能数据将被自动收集。
4.  结束会话以生成性能报告。
5.  如需进行深度分析，请使用分析工具，命令为：`npm run analyze -- --input /path/to/telemetry-data.json`

**这些工具使您能够收集进行以下五种核心测试类型所需的数据：**

1.  包含组件分解的端到端延迟测试
2.  CPU/GPU 资源监控
3.  Kinect 深度数据质量评估
4.  WebRTC 连接建立性能测试
5.  长期稳定性测试

这些可视化结果和分析工具将帮助您识别系统瓶颈、优化性能，并确保系统在不同条件下的可靠性。

---