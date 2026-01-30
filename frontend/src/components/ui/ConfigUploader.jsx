/**
 * 配置上传组件。
 *
 * 支持拖拽或选择文件上传到后端，并将解析后的拓扑转换为前端数据结构。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../stores';
import { uploadTopologyFile } from '../../features/topology/topologyApi';
import { buildFrontendTopology } from '../../features/topology/topologyTransform';

/**
 * ConfigUploader：上传拓扑配置文件并触发回调。
 *
 * @param {{onConfigLoaded?: (topology:any)=>void}} props 组件属性。
 * @returns {JSX.Element} 上传组件。
 */
const ConfigUploader = ({ onConfigLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);
  const { setLoading, addNotification, setNetworkTopology } = useAppStore();
  
  /**
   * 上传超时时间（毫秒）。
   * @type {number}
   */
  const UPLOAD_TIMEOUT_MS = 300000;

  /**
   * 处理文件上传：调用后端接口并更新全局拓扑状态。
   *
   * @param {File} file 上传的文件对象。
   * @returns {Promise<void>} 无返回值。
   */
  const handleFileUpload = async (file) => {
    if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml') && !file.name.endsWith('.json')) {
      setErrorMessage('请上传 YAML 或 JSON 配置文件');
      setUploadStatus('error');
      return;
    }
    
    setUploadStatus('loading');
    setLoading('config-upload', true);
    setErrorMessage('');
    
    try {
      let cfg;
      try {
        cfg = await uploadTopologyFile(file, UPLOAD_TIMEOUT_MS);
      } catch (err) {
        throw new Error('后端处理失败: ' + err.message);
      }

      const topo = buildFrontendTopology(cfg);
      
      setNetworkTopology(topo);
      if (onConfigLoaded) onConfigLoaded(topo);
      setUploadStatus('success');
      
      addNotification({ type: 'success', title: '配置已加载', message: `拓扑就绪: ${topo.name}` });
      
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => { setUploadStatus('idle'); }, 3000);

    } catch (error) {
      const msg = error.message;
      setErrorMessage(msg);
      setUploadStatus('error');
      addNotification({ type: 'error', title: '加载失败', message: msg });
    } finally {
      setLoading('config-upload', false);
    }
  };
  
  /**
   * 拖拽悬停：阻止默认行为并设置拖拽态。
   *
   * @param {DragEvent} e 拖拽事件。
   */
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  /**
   * 拖拽离开：阻止默认行为并取消拖拽态。
   *
   * @param {DragEvent} e 拖拽事件。
   */
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  /**
   * 拖拽释放：读取文件并触发上传。
   *
   * @param {DragEvent} e 拖拽事件。
   */
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };
  
  /**
   * 文件选择：从 input 读取文件并触发上传。
   *
   * @param {Event} e input change 事件。
   */
  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };
  
  return (
    <div className="max-w-3xl w-full mx-auto p-6 bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl animate-fade-in">
      <h3 className="flex items-center gap-3 text-xl font-bold text-white mb-6">
        <div className="p-2 bg-blue-500/20 rounded-lg">
           <Upload className="w-6 h-6 text-blue-400" />
        </div>
        上传网络配置
      </h3>
      
      <div
        className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-300 flex flex-col items-center justify-center min-h-[300px] group ${
          isDragging 
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' 
            : uploadStatus === 'error'
              ? 'border-red-500/50 bg-red-500/5'
              : uploadStatus === 'success'
                ? 'border-green-500/50 bg-green-500/5'
                : 'border-slate-600 bg-slate-800/30 hover:border-blue-400/50 hover:bg-slate-800/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml,.json"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        {uploadStatus === 'loading' && (
          <div className="text-center animate-pulse">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-blue-400 font-medium">正在解析配置...</p>
          </div>
        )}
        
        {uploadStatus === 'success' && (
          <div className="text-center animate-bounce-short">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-green-400 font-medium text-lg">配置加载成功！</p>
          </div>
        )}
        
        {uploadStatus === 'error' && (
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-red-400 font-medium text-lg mb-2">配置加载失败</p>
            <p className="text-red-300/70 text-sm max-w-md mx-auto">{errorMessage}</p>
          </div>
        )}
        
        {uploadStatus === 'idle' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
               <FileText className="w-10 h-10 text-slate-400 group-hover:text-blue-400 transition-colors" />
            </div>
            <p className="text-lg text-slate-200 font-medium mb-2">将配置文件拖拽至此处</p>
            <p className="text-slate-500 text-sm mb-6">或者</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              浏览文件
            </button>
            <p className="mt-6 text-xs text-slate-500">
              支持 YAML (.yaml, .yml) 和 JSON (.json) 格式
            </p>
          </div>
        )}
      </div>
      
      <div className="mt-8 bg-slate-800/30 rounded-xl p-6 border border-slate-700/30">
        <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-4">配置格式指南</h4>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-blue-400">•</span>
            <span><code className="bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-200">topology</code>: 拓扑信息 (name, type)</span>
          </li>
          <li className="flex items-start gap-2">
             <span className="text-blue-400">•</span>
             <span><code className="bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-200">devices</code>: 设备列表 (id, name, role, device_type, mgmt_ip 等)</span>
          </li>
          <li className="flex items-start gap-2">
             <span className="text-blue-400">•</span>
             <span><code className="bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-200">links</code>: 链路列表 (id, src_device, dst_device 等)</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ConfigUploader;
