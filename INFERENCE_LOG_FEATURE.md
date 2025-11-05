# Inference Log Feature - Implementation Summary

## 功能概述

为模型推理过程添加了详细的实时日志显示功能，让用户可以清楚地看到推理的每个步骤。

## 新增功能

### 1. 日志显示区域
- 位置：在"Run Inference"按钮下方，推理结果上方
- 样式：终端风格（黑色背景，绿色文字）
- 可折叠：点击标题栏可以展开/折叠日志内容

### 2. 推理流程日志

#### Step 1: 信号分割 (0.5-1秒延迟)
```
[时间戳] ► Initializing inference pipeline for sample: a0001...
[时间戳] ► Segmenting signal into beat-to-beat intervals (1-second duration)...
[时间戳] ► ECG signal duration: 30.00s, PCG signal duration: 30.00s
[时间戳] ► Effective analysis duration: 30.00s
[时间戳] ✓ Total segments generated: 30 segments
```

#### Step 2: 数据预处理 (0.1-0.5秒延迟)
```
[时间戳] ► Applying data preprocessing pipeline...
[时间戳] ►   - Normalizing ECG and PCG signals to [0, 1] range
[时间戳] ►   - Applying bandpass filtering (ECG: 0.5-40Hz, PCG: 25-400Hz)
[时间戳] ►   - Extracting time-frequency features using wavelet transform
[时间戳] ✓ Data preprocessing completed
```

#### Step 3: 模型推理 (0.5-1秒延迟)
```
[时间戳] ► Running PACFNet model inference on 30 segments...
[时间戳] ►   Progress: 5/30 segments processed
[时间戳] ►   Progress: 10/30 segments processed
[时间戳] ►   Progress: 15/30 segments processed
[时间戳] ►   Progress: 20/30 segments processed
[时间戳] ►   Progress: 25/30 segments processed
[时间戳] ►   Progress: 30/30 segments processed
[时间戳] ✓ Model inference completed for all 30 segments
```

#### Step 4: 结果聚合 (0.1-0.5秒延迟)
```
[时间戳] ► Aggregating predictions using majority voting strategy...
[时间戳] ►   - Abnormal votes: 28
[时间戳] ►   - Normal votes: 2
[时间戳] ✓ Final prediction: ABNORMAL (confidence: 93.3%)
[时间戳] ✓ Inference pipeline completed successfully
```

### 3. 自动行为
- 点击"Run Inference"后，日志区域自动显示
- 日志实时更新，自动滚动到最新条目
- 推理完成后，日志自动折叠（但仍可点击展开查看）
- 折叠后显示推理结果

### 4. 视觉反馈
- 普通日志：绿色 `►` 图标
- 成功日志：绿色 `✓` 图标
- 错误日志：红色 `✗` 图标
- 每条日志带有时间戳

## 技术实现

### HTML 结构
```html
<div id="inferenceLog">
  <div class="box">
    <div onclick="toggleInferenceLog()">
      <h5>Inference Log</h5>
      <span id="logToggleIcon">...</span>
    </div>
    <div id="logContent">
      <!-- 日志条目动态添加 -->
    </div>
  </div>
</div>
```

### JavaScript 函数
- `addLogEntry(message, type)`: 添加日志条目
- `clearLog()`: 清空日志
- `toggleInferenceLog()`: 切换日志显示/隐藏
- `randomDelay(min, max)`: 生成随机延迟
- `runInference()`: 异步推理函数（使用 async/await）

## 使用方法

1. 选择一个信号样本
2. 点击"Run Inference"按钮
3. 观察日志实时显示推理过程
4. 等待推理完成，日志自动折叠
5. 查看推理结果
6. 如需查看日志，点击"Inference Log"标题栏展开

## 延迟设置

- **Step 1 (分割)**: 0.5-1.0秒随机延迟
- **Step 2 (预处理)**: 0.1-0.5秒随机延迟
- **Step 3 (推理)**: 0.5-1.0秒随机延迟
- **Step 4 (聚合)**: 0.1-0.5秒随机延迟

总推理时间：约 1.2-3.0 秒（取决于随机延迟）

## 文件修改

1. `index.html`: 添加日志显示区域
2. `static/js/index.js`: 重写 `runInference()` 函数，添加日志功能

## 测试建议

1. 选择不同的信号样本测试
2. 观察日志是否正确显示
3. 检查日志折叠/展开功能
4. 验证推理结果是否正确显示
5. 测试错误情况（如未选择信号）

