"use client";
import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "../../../components/Layout";

interface UploadFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "completed" | "error";
  progress: number;
  error?: string;
}

const SUPPORTED_FILE_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/markdown': 'Markdown',
  'text/plain': 'Text',
  'text/html': 'HTML'
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("ja");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  
  // Upload state
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, []);

  const addFiles = (files: File[]) => {
    const newFiles: UploadFile[] = files
      .filter(file => Object.keys(SUPPORTED_FILE_TYPES).includes(file.type))
      .map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        status: "pending" as const,
        progress: 0
      }));

    setUploadFiles(prev => [...prev, ...newFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const simulateUpload = async (file: UploadFile) => {
    // Simulate upload progress
    setUploadFiles(prev => prev.map(f => 
      f.id === file.id ? { ...f, status: "uploading" } : f
    ));

    for (let progress = 0; progress <= 100; progress += 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      setUploadFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, progress } : f
      ));
    }

    // Simulate processing
    setUploadFiles(prev => prev.map(f => 
      f.id === file.id ? { ...f, status: "processing" } : f
    ));

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Complete
    setUploadFiles(prev => prev.map(f => 
      f.id === file.id ? { ...f, status: "completed", progress: 100 } : f
    ));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      alert("知識ベース名を入力してください");
      return;
    }

    if (uploadFiles.length === 0) {
      alert("少なくとも1つのファイルをアップロードしてください");
      return;
    }

    setIsCreating(true);

    try {
      // Upload files sequentially
      for (const file of uploadFiles) {
        if (file.status === "pending") {
          await simulateUpload(file);
        }
      }

      // Create knowledge base
      const kbData = {
        name: name.trim(),
        description: description.trim(),
        language,
        tags,
        isPublic,
        files: uploadFiles.map(f => f.file.name)
      };

      console.log("Creating KB:", kbData);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Redirect to the new KB
      router.push('/knowledge-base/new-kb-id'); // In real app, use actual KB ID
    } catch (error) {
      console.error("Failed to create KB:", error);
      alert("知識ベースの作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) {
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case "pending":
        return (
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "uploading":
      case "processing":
        return (
          <svg className="w-4 h-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case "completed":
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case "error":
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-sm text-slate-500 mb-2">
            <button onClick={() => router.push('/knowledge-base')} className="hover:text-slate-700">
              知識ベース
            </button>
            <span>/</span>
            <span>新規作成</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">新しい知識ベース</h1>
          <p className="text-slate-600">ドキュメントをアップロードして知識ベースを作成します</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Configuration */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">基本設定</h2>
              
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    知識ベース名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: プロジェクト資料"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    maxLength={100}
                  />
                  <p className="text-xs text-slate-500 mt-1">{name.length}/100</p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    説明
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="この知識ベースの目的や内容について説明してください"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-slate-500 mt-1">{description.length}/500</p>
                </div>

                {/* Language */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    主要言語
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ja">日本語</option>
                    <option value="en">English</option>
                    <option value="auto">自動検出</option>
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    タグ
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={handleTagKeyPress}
                      placeholder="タグを入力してEnterを押す"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                      onClick={addTag}
                      disabled={!tagInput.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-sm"
                    >
                      追加
                    </button>
                  </div>
                </div>

                {/* Access Control */}
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">他のユーザーと共有する</span>
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    チェックを入れると、この知識ベースを他のユーザーも閲覧・検索できるようになります
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: File Upload */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">ファイルアップロード</h2>
              
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging 
                    ? 'border-blue-400 bg-blue-50' 
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <svg className="w-12 h-12 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="mb-4">
                  <p className="text-lg font-medium text-slate-900 mb-1">
                    ファイルをドラッグ＆ドロップ
                  </p>
                  <p className="text-sm text-slate-500">
                    または
                  </p>
                </div>
                <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  ファイルを選択
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.md,.txt,.html"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-500 mt-4">
                  対応形式: PDF, DOCX, Markdown, TXT, HTML (最大50MB)
                </p>
              </div>

              {/* File List */}
              {uploadFiles.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-3">
                    アップロード予定ファイル ({uploadFiles.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {uploadFiles.map((uploadFile) => (
                      <div key={uploadFile.id} className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg">
                        {getFileIcon(uploadFile.file.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {uploadFile.file.name}
                          </p>
                          <div className="flex items-center space-x-2">
                            <p className="text-xs text-slate-500">
                              {formatFileSize(uploadFile.file.size)}
                            </p>
                            {uploadFile.status === "uploading" && (
                              <p className="text-xs text-blue-600">
                                {uploadFile.progress}%
                              </p>
                            )}
                            {uploadFile.status === "processing" && (
                              <p className="text-xs text-yellow-600">処理中</p>
                            )}
                            {uploadFile.status === "completed" && (
                              <p className="text-xs text-green-600">完了</p>
                            )}
                            {uploadFile.error && (
                              <p className="text-xs text-red-600">{uploadFile.error}</p>
                            )}
                          </div>
                          {uploadFile.status === "uploading" && (
                            <div className="w-full bg-slate-200 rounded-full h-1 mt-1">
                              <div 
                                className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                                style={{ width: `${uploadFile.progress}%` }}
                              ></div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(uploadFile.status)}
                          {uploadFile.status === "pending" && (
                            <button
                              onClick={() => removeFile(uploadFile.id)}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-8 border-t border-slate-200">
          <button
            onClick={() => router.push('/knowledge-base')}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            キャンセル
          </button>
          
          <button
            onClick={handleCreate}
            disabled={!name.trim() || uploadFiles.length === 0 || isCreating}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isCreating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>作成中...</span>
              </>
            ) : (
              <span>知識ベースを作成</span>
            )}
          </button>
        </div>
      </div>
    </Layout>
  );
}