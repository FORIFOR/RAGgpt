"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "../../components/Layout";

// Types
type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  documentsCount: number;
  status: "active" | "indexing" | "error";
  createdAt: number;
  updatedAt: number;
  size: number;
  language: string;
  tags: string[];
};

type Document = {
  id: string;
  name: string;
  size: number;
  pages: number;
  status: "uploaded" | "indexing" | "completed" | "error";
  uploadedAt: number;
  language: string;
  type: string;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const timeAgo = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return "今";
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  if (days < 7) return `${days}日前`;
  return new Date(timestamp).toLocaleDateString('ja-JP');
};

export default function KnowledgeBasePage() {
  const router = useRouter();
  
  // Mock data
  const [knowledgeBases] = useState<KnowledgeBase[]>([
    {
      id: "kb1",
      name: "プロジェクト資料",
      description: "プロジェクト関連のドキュメント一式",
      documentsCount: 24,
      status: "active",
      createdAt: Date.now() - 86400000 * 5,
      updatedAt: Date.now() - 3600000,
      size: 15728640,
      language: "ja",
      tags: ["プロジェクト", "仕様書"]
    },
    {
      id: "kb2", 
      name: "技術仕様書",
      description: "システム技術仕様とAPI設計書",
      documentsCount: 12,
      status: "indexing",
      createdAt: Date.now() - 86400000 * 2,
      updatedAt: Date.now() - 1800000,
      size: 8388608,
      language: "ja",
      tags: ["技術", "API"]
    },
    {
      id: "kb3",
      name: "法務資料",
      description: "契約書と法的文書",
      documentsCount: 8,
      status: "error",
      createdAt: Date.now() - 86400000 * 7,
      updatedAt: Date.now() - 86400000,
      size: 4194304,
      language: "ja",
      tags: ["法務", "契約"]
    }
  ]);

  const [sortBy, setSortBy] = useState<"name" | "updated" | "created" | "size">("updated");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "indexing" | "error">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const getStatusBadge = (status: string) => {
    const styles = {
      active: "bg-green-100 text-green-800 border-green-200",
      indexing: "bg-yellow-100 text-yellow-800 border-yellow-200",
      error: "bg-red-100 text-red-800 border-red-200"
    };
    
    const labels = {
      active: "アクティブ",
      indexing: "インデクシング中",
      error: "エラー"
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  const filteredAndSortedKBs = knowledgeBases
    .filter(kb => {
      const matchesSearch = !searchQuery || 
        kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kb.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kb.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = filterStatus === "all" || kb.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name, 'ja');
        case "created":
          return b.createdAt - a.createdAt;
        case "size":
          return b.size - a.size;
        case "updated":
        default:
          return b.updatedAt - a.updatedAt;
      }
    });

  const handleKBClick = (kbId: string) => {
    router.push(`/knowledge-base/${kbId}`);
  };

  const handleDeleteKB = (kbId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("この知識ベースを削除しますか？この操作は取り消せません。")) {
      // TODO: Delete KB
      console.log("Delete KB:", kbId);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">知識ベース</h1>
            <p className="text-slate-600">ドキュメントを管理し、知識ベースを構築します</p>
          </div>
          
          <button
            onClick={() => router.push('/knowledge-base/new')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>新しい知識ベース</span>
          </button>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="知識ベースを検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-slate-700">ステータス:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">すべて</option>
                <option value="active">アクティブ</option>
                <option value="indexing">インデクシング中</option>
                <option value="error">エラー</option>
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-slate-700">並び順:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="updated">更新日時</option>
                <option value="created">作成日時</option>
                <option value="name">名前</option>
                <option value="size">サイズ</option>
              </select>
            </div>
          </div>
        </div>

        {/* Knowledge Bases Grid */}
        {filteredAndSortedKBs.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchQuery || filterStatus !== "all" ? "該当する知識ベースが見つかりません" : "まだ知識ベースがありません"}
            </h3>
            <p className="text-slate-500 mb-6">
              {searchQuery || filterStatus !== "all" ? "検索条件を変更してみてください" : "最初の知識ベースを作成して始めましょう"}
            </p>
            {(!searchQuery && filterStatus === "all") && (
              <button
                onClick={() => router.push('/knowledge-base/new')}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                知識ベースを作成
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedKBs.map((kb) => (
              <div
                key={kb.id}
                onClick={() => handleKBClick(kb.id)}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 text-lg mb-1 group-hover:text-blue-600 transition-colors truncate">
                      {kb.name}
                    </h3>
                    {getStatusBadge(kb.status)}
                  </div>
                  
                  <div className="relative ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Show context menu
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-slate-600 text-sm mb-4 overflow-hidden"
                   style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {kb.description}
                </p>

                {/* Tags */}
                {kb.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {kb.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">
                        {tag}
                      </span>
                    ))}
                    {kb.tags.length > 3 && (
                      <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">
                        +{kb.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{kb.documentsCount}</div>
                    <div className="text-xs text-slate-500">ドキュメント</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{formatFileSize(kb.size)}</div>
                    <div className="text-xs text-slate-500">サイズ</div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100">
                  <span>作成: {timeAgo(kb.createdAt)}</span>
                  <span>更新: {timeAgo(kb.updatedAt)}</span>
                </div>

                {/* Progress bar for indexing */}
                {kb.status === "indexing" && (
                  <div className="mt-3">
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div className="bg-yellow-500 h-1.5 rounded-full animate-pulse" style={{width: "45%"}}></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">インデクシング中...</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}