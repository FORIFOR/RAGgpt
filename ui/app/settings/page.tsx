"use client";
import React, { useState } from "react";
import { Layout } from "../../components/Layout";

export default function SettingsPage() {
  // State for different settings
  const [activeTab, setActiveTab] = useState<"model" | "rag" | "system" | "users" | "monitoring">("model");
  
  // Model settings
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [defaultTemperature, setDefaultTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [enableLocalModel, setEnableLocalModel] = useState(true);
  
  // RAG settings
  const [defaultK, setDefaultK] = useState(8);
  const [enableRerank, setEnableRerank] = useState(false);
  const [defaultRetriever, setDefaultRetriever] = useState<"hybrid" | "bm25" | "embed">("hybrid");
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  
  // System settings
  const [autoIndexing, setAutoIndexing] = useState(true);
  const [maxFileSize, setMaxFileSize] = useState(50); // MB
  const [enableOcr, setEnableOcr] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [enableLogging, setEnableLogging] = useState(true);
  
  // User settings
  const [allowUserRegistration, setAllowUserRegistration] = useState(false);
  const [defaultUserRole, setDefaultUserRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [sessionTimeout, setSessionTimeout] = useState(24); // hours
  
  const tabs = [
    { id: "model", name: "モデル設定", icon: "🤖" },
    { id: "rag", name: "RAG設定", icon: "🔍" },
    { id: "system", name: "システム設定", icon: "⚙️" },
    { id: "users", name: "ユーザー管理", icon: "👥" },
    { id: "monitoring", name: "監視・ログ", icon: "📊" },
  ];

  const handleSaveSettings = () => {
    // TODO: Save settings to backend
    console.log("Saving settings...");
    alert("設定を保存しました");
  };

  const handleResetDefaults = () => {
    if (confirm("設定をデフォルト値にリセットしますか？")) {
      // Reset to defaults
      setSelectedModel("gpt-4o-mini");
      setDefaultTemperature(0.2);
      setMaxTokens(2048);
      setDefaultK(8);
      setEnableRerank(false);
      setDefaultRetriever("hybrid");
      setChunkSize(1000);
      setChunkOverlap(200);
      setSimilarityThreshold(0.7);
      alert("設定をリセットしました");
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">設定</h1>
          <p className="text-slate-600">システムとRAGパラメータを設定します</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <nav className="bg-white rounded-xl border border-slate-200 p-4 sticky top-6">
              <div className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span className="font-medium">{tab.name}</span>
                  </button>
                ))}
              </div>
            </nav>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              {/* Model Settings */}
              {activeTab === "model" && (
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">モデル設定</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        デフォルトモデル
                      </label>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="gpt-4o-mini">GPT-4o Mini (Cloud)</option>
                        <option value="gpt-oss-20b">Local LLM (20B)</option>
                        <option value="llama-3-8b">Llama 3 8B (Local)</option>
                        <option value="gemma-7b">Gemma 7B (Local)</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        新しいチャットで使用されるデフォルトのモデルです
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        デフォルト温度: {defaultTemperature}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={defaultTemperature}
                        onChange={(e) => setDefaultTemperature(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>決定的 (0.0)</span>
                        <span>創造的 (1.0)</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        最大トークン数
                      </label>
                      <input
                        type="number"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                        min="256"
                        max="8192"
                        step="256"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        1回の応答で生成する最大トークン数
                      </p>
                    </div>

                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={enableLocalModel}
                          onChange={(e) => setEnableLocalModel(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">ローカルモデルを有効化</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-1 ml-6">
                        ローカルGPUでのモデル実行を許可します
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* RAG Settings */}
              {activeTab === "rag" && (
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">RAG設定</h2>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          デフォルト検索数 (k)
                        </label>
                        <input
                          type="number"
                          value={defaultK}
                          onChange={(e) => setDefaultK(parseInt(e.target.value))}
                          min="1"
                          max="20"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          デフォルト検索手法
                        </label>
                        <select
                          value={defaultRetriever}
                          onChange={(e) => setDefaultRetriever(e.target.value as any)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="hybrid">ハイブリッド</option>
                          <option value="bm25">BM25</option>
                          <option value="embed">埋め込み</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={enableRerank}
                          onChange={(e) => setEnableRerank(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">デフォルトで再ランクを有効化</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          チャンクサイズ (文字)
                        </label>
                        <input
                          type="number"
                          value={chunkSize}
                          onChange={(e) => setChunkSize(parseInt(e.target.value))}
                          min="200"
                          max="2000"
                          step="100"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          チャンク重複 (文字)
                        </label>
                        <input
                          type="number"
                          value={chunkOverlap}
                          onChange={(e) => setChunkOverlap(parseInt(e.target.value))}
                          min="0"
                          max="500"
                          step="50"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        類似度閾値: {similarityThreshold}
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={similarityThreshold}
                        onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>低い (0.1)</span>
                        <span>高い (1.0)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* System Settings */}
              {activeTab === "system" && (
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">システム設定</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={autoIndexing}
                          onChange={(e) => setAutoIndexing(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">自動インデクシングを有効化</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-1 ml-6">
                        ファイルアップロード時に自動でインデクシングを開始します
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        最大ファイルサイズ (MB)
                      </label>
                      <input
                        type="number"
                        value={maxFileSize}
                        onChange={(e) => setMaxFileSize(parseInt(e.target.value))}
                        min="1"
                        max="500"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={enableOcr}
                          onChange={(e) => setEnableOcr(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">OCR機能を有効化</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-1 ml-6">
                        画像ファイルから文字を抽出します
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        データ保持期間 (日)
                      </label>
                      <input
                        type="number"
                        value={retentionDays}
                        onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                        min="7"
                        max="365"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        古いチャット履歴とログを自動削除する期間
                      </p>
                    </div>

                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={enableLogging}
                          onChange={(e) => setEnableLogging(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">詳細ログを有効化</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-1 ml-6">
                        システムの詳細な動作ログを記録します
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* User Management */}
              {activeTab === "users" && (
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">ユーザー管理</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={allowUserRegistration}
                          onChange={(e) => setAllowUserRegistration(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">新規ユーザー登録を許可</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        デフォルトユーザーロール
                      </label>
                      <select
                        value={defaultUserRole}
                        onChange={(e) => setDefaultUserRole(e.target.value as any)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="viewer">閲覧者</option>
                        <option value="editor">編集者</option>
                        <option value="admin">管理者</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        セッションタイムアウト (時間)
                      </label>
                      <input
                        type="number"
                        value={sessionTimeout}
                        onChange={(e) => setSessionTimeout(parseInt(e.target.value))}
                        min="1"
                        max="168"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* User List */}
                    <div className="border-t border-slate-200 pt-6">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">登録ユーザー</h3>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-2 bg-white rounded border">
                            <div>
                              <div className="font-medium text-sm">Local User</div>
                              <div className="text-xs text-slate-500">管理者</div>
                            </div>
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                              アクティブ
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Monitoring */}
              {activeTab === "monitoring" && (
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">監視・ログ</h2>
                  
                  <div className="space-y-6">
                    {/* System Status */}
                    <div>
                      <h3 className="text-sm font-medium text-slate-700 mb-3">システム状態</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="text-2xl font-bold text-green-600">99.9%</div>
                          <div className="text-sm text-green-700">稼働率</div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="text-2xl font-bold text-blue-600">245</div>
                          <div className="text-sm text-blue-700">総クエリ数</div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                          <div className="text-2xl font-bold text-purple-600">15.2 GB</div>
                          <div className="text-sm text-purple-700">ストレージ使用量</div>
                        </div>
                      </div>
                    </div>

                    {/* Resource Usage */}
                    <div>
                      <h3 className="text-sm font-medium text-slate-700 mb-3">リソース使用状況</h3>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>CPU使用率</span>
                            <span>45%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full" style={{width: "45%"}}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>メモリ使用率</span>
                            <span>67%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-yellow-600 h-2 rounded-full" style={{width: "67%"}}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>GPU使用率</span>
                            <span>23%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-green-600 h-2 rounded-full" style={{width: "23%"}}></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recent Logs */}
                    <div>
                      <h3 className="text-sm font-medium text-slate-700 mb-3">最近のログ</h3>
                      <div className="bg-slate-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                        <div className="space-y-2 text-xs font-mono">
                          <div className="flex items-center space-x-2">
                            <span className="text-green-600">[INFO]</span>
                            <span className="text-slate-500">2024-10-25 15:30:15</span>
                            <span>User query processed successfully</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-blue-600">[DEBUG]</span>
                            <span className="text-slate-500">2024-10-25 15:29:42</span>
                            <span>Knowledge base indexed: 24 documents</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-yellow-600">[WARN]</span>
                            <span className="text-slate-500">2024-10-25 15:28:11</span>
                            <span>High memory usage detected</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-green-600">[INFO]</span>
                            <span className="text-slate-500">2024-10-25 15:27:33</span>
                            <span>File uploaded successfully: API設計書.pdf</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-8 border-t border-slate-200">
                <button
                  onClick={handleResetDefaults}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  デフォルトにリセット
                </button>
                
                <button
                  onClick={handleSaveSettings}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  設定を保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}