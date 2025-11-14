"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layout } from "../../components/Layout";

// Types
type SearchResult = {
  id: string;
  title: string;
  content: string;
  kbName: string;
  kbId: string;
  documentId: string;
  page?: number;
  score: number;
  highlights: string[];
  documentType: string;
  lastModified: number;
};

type KnowledgeBase = {
  id: string;
  name: string;
  documentsCount: number;
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

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // State
  const [query, setQuery] = useState(searchParams?.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKB, setSelectedKB] = useState<string>('all');
  const [documentType, setDocumentType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'title'>('relevance');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  
  // Mock data
  const [knowledgeBases] = useState<KnowledgeBase[]>([
    { id: 'kb1', name: 'プロジェクト資料', documentsCount: 24 },
    { id: 'kb2', name: '技術仕様書', documentsCount: 12 },
    { id: 'kb3', name: '法務資料', documentsCount: 8 },
  ]);

  // Mock search results
  const mockResults: SearchResult[] = [
    {
      id: 'r1',
      title: 'API設計書.pdf',
      content: 'RESTful APIの設計パターンについて詳しく説明されています。エンドポイントの設計原則やHTTPメソッドの適切な使用方法について記載されています。',
      kbName: '技術仕様書',
      kbId: 'kb2',
      documentId: 'doc1',
      page: 12,
      score: 0.95,
      highlights: ['API設計', 'RESTful', 'エンドポイント'],
      documentType: 'pdf',
      lastModified: Date.now() - 1800000
    },
    {
      id: 'r2',
      title: '要件定義書.docx',
      content: 'システム要件の詳細な定義が記載されています。機能要件と非機能要件の両方について具体的な仕様が明記されています。',
      kbName: 'プロジェクト資料',
      kbId: 'kb1',
      documentId: 'doc2',
      page: 5,
      score: 0.87,
      highlights: ['要件定義', 'システム要件', '機能要件'],
      documentType: 'docx',
      lastModified: Date.now() - 3600000
    },
    {
      id: 'r3',
      title: 'セキュリティガイドライン.md',
      content: 'アプリケーションセキュリティのベストプラクティスについて説明しています。認証、認可、データ保護の観点から具体的な実装方法を提示しています。',
      kbName: '技術仕様書',
      kbId: 'kb2',
      documentId: 'doc3',
      score: 0.82,
      highlights: ['セキュリティ', '認証', 'データ保護'],
      documentType: 'markdown',
      lastModified: Date.now() - 7200000
    }
  ];

  // Load search history from localStorage
  useEffect(() => {
    try {
      const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
      setSearchHistory(history.slice(0, 10)); // Keep last 10 searches
    } catch (e) {
      console.warn('Failed to load search history');
    }
  }, []);

  // Perform search
  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Filter mock results based on query and filters
      let filteredResults = mockResults.filter(result => 
        result.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        result.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        result.highlights.some(h => h.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      // Apply filters
      if (selectedKB !== 'all') {
        filteredResults = filteredResults.filter(r => r.kbId === selectedKB);
      }

      if (documentType !== 'all') {
        filteredResults = filteredResults.filter(r => r.documentType === documentType);
      }

      // Sort results
      filteredResults.sort((a, b) => {
        switch (sortBy) {
          case 'relevance':
            return b.score - a.score;
          case 'date':
            return b.lastModified - a.lastModified;
          case 'title':
            return a.title.localeCompare(b.title, 'ja');
          default:
            return 0;
        }
      });

      setResults(filteredResults);
      
      // Update search history
      if (searchQuery.trim() && !searchHistory.includes(searchQuery.trim())) {
        const newHistory = [searchQuery.trim(), ...searchHistory].slice(0, 10);
        setSearchHistory(newHistory);
        localStorage.setItem('searchHistory', JSON.stringify(newHistory));
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  // Handle filter changes
  useEffect(() => {
    if (query.trim()) {
      performSearch(query);
    }
  }, [selectedKB, documentType, sortBy]);

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'docx':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'markdown':
        return (
          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights.length) return text;
    
    let highlightedText = text;
    highlights.forEach(highlight => {
      const regex = new RegExp(`(${highlight})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
    });
    
    return highlightedText;
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">ドキュメント検索</h1>
          <p className="text-slate-600">知識ベース内のドキュメントを検索します</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Filters */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-6">
              <h3 className="font-medium text-slate-900 mb-4">フィルター</h3>
              
              {/* Knowledge Base Filter */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">知識ベース</label>
                <select
                  value={selectedKB}
                  onChange={(e) => setSelectedKB(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">すべて</option>
                  {knowledgeBases.map(kb => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name} ({kb.documentsCount})
                    </option>
                  ))}
                </select>
              </div>

              {/* Document Type Filter */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">ファイル形式</label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">すべて</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">Word文書</option>
                  <option value="markdown">Markdown</option>
                  <option value="txt">テキスト</option>
                </select>
              </div>

              {/* Sort Order */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">並び順</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="relevance">関連度</option>
                  <option value="date">更新日時</option>
                  <option value="title">タイトル</option>
                </select>
              </div>

              {/* Search History */}
              {searchHistory.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">最近の検索</h4>
                  <div className="space-y-1">
                    {searchHistory.slice(0, 5).map((historyQuery, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setQuery(historyQuery);
                          performSearch(historyQuery);
                        }}
                        className="block w-full text-left text-sm text-slate-600 hover:text-blue-600 p-2 rounded hover:bg-slate-50 truncate"
                      >
                        {historyQuery}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="mb-6">
              <div className="relative">
                <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="知識ベース内を検索..."
                  className="w-full pl-12 pr-4 py-4 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || loading}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    '検索'
                  )}
                </button>
              </div>
            </form>

            {/* Results */}
            {loading ? (
              <div className="text-center py-12">
                <svg className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-slate-600">検索中...</p>
              </div>
            ) : results.length === 0 && query.trim() ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-medium text-slate-900 mb-2">検索結果が見つかりません</h3>
                <p className="text-slate-500 mb-4">「{query}」に一致するドキュメントが見つかりませんでした</p>
                <p className="text-sm text-slate-400">
                  • キーワードを変更してみてください<br/>
                  • より一般的な用語を使用してみてください<br/>
                  • フィルターを調整してみてください
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-lg font-medium text-slate-900 mb-2">検索を始めましょう</h3>
                <p className="text-slate-500">上の検索バーにキーワードを入力してください</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    「<span className="font-medium">{query}</span>」の検索結果 {results.length}件
                  </p>
                </div>

                {results.map((result) => (
                  <div key={result.id} className="bg-white rounded-xl border border-slate-200 p-6 hover:border-slate-300 hover:shadow-sm transition-all">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        {getDocumentIcon(result.documentType)}
                        <div>
                          <h3 className="font-medium text-slate-900 hover:text-blue-600 cursor-pointer">
                            {result.title}
                            {result.page && (
                              <span className="text-sm text-slate-500 ml-2">p.{result.page}</span>
                            )}
                          </h3>
                          <div className="flex items-center space-x-2 text-xs text-slate-500">
                            <span>{result.kbName}</span>
                            <span>•</span>
                            <span>{timeAgo(result.lastModified)}</span>
                            <span>•</span>
                            <span>関連度: {Math.round(result.score * 100)}%</span>
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => router.push(`/n/new?kb=${result.kbId}`)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        このKBで質問
                      </button>
                    </div>

                    {/* Content */}
                    <div 
                      className="text-slate-700 text-sm leading-relaxed mb-3"
                      dangerouslySetInnerHTML={{ 
                        __html: highlightText(result.content, result.highlights) 
                      }}
                    />

                    {/* Keywords */}
                    {result.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.highlights.map((highlight, index) => (
                          <span key={index} className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                            {highlight}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">読み込み中...</p>
          </div>
        </div>
      </Layout>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
