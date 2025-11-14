"use client";
import React, { useState } from "react";

export type Citation = {
  id: string;
  documentId: string;
  documentTitle: string;
  page?: number;
  quote: string;
  url?: string;
  timestamp: number;
  verified: boolean;
  confidence?: number;
  context?: string;
  lineNumber?: number;
  chunkId?: string;
};

interface CitationChipProps {
  citation: Citation;
  showDetails?: boolean;
  onVerify?: (citationId: string) => void;
  onEdit?: (citationId: string, newQuote: string) => void;
  variant?: "compact" | "detailed";
  showVerificationStatus?: boolean;
}

export function CitationChip({ 
  citation, 
  showDetails = false, 
  onVerify,
  onEdit,
  variant = "compact",
  showVerificationStatus = true
}: CitationChipProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedQuote, setEditedQuote] = useState(citation.quote);

  const handleSaveEdit = () => {
    if (onEdit && editedQuote.trim() !== citation.quote) {
      onEdit(citation.id, editedQuote.trim());
    }
    setIsEditing(false);
  };

  const getDocumentIcon = () => {
    if (citation.url) {
      return "🔗";
    }
    const extension = citation.documentTitle.split('.').pop()?.toLowerCase();
    switch (extension) {
      case "pdf":
        return "📄";
      case "doc":
      case "docx":
        return "📝";
      case "txt":
        return "📄";
      default:
        return "📄";
    }
  };

  const getVerificationIcon = () => {
    if (citation.verified) {
      return (
        <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    } else {
      return (
        <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    }
  };

  const formatTimestamp = (timestamp: number) => {
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

  if (variant === "compact") {
    return (
      <div
        className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs cursor-pointer transition-colors ${
          citation.verified 
            ? "bg-green-100 text-green-800 hover:bg-green-200" 
            : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
        title={`${citation.documentTitle}${citation.page ? ` (p.${citation.page})` : ""}`}
      >
        <span className="text-xs">{getDocumentIcon()}</span>
        {showVerificationStatus && getVerificationIcon()}
        <span className="font-medium">
          {citation.documentTitle.length > 20 
            ? `${citation.documentTitle.substring(0, 20)}...` 
            : citation.documentTitle}
        </span>
        {citation.page && <span className="text-gray-600">p.{citation.page}</span>}
        {citation.confidence && (
          <span className="text-gray-500">
            {Math.round(citation.confidence * 100)}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getDocumentIcon()}</span>
          <div>
            <div className="font-medium text-sm text-gray-900">
              {citation.documentTitle}
              {citation.page && <span className="text-gray-500 ml-1">(p.{citation.page})</span>}
              {citation.lineNumber && <span className="text-gray-500 ml-1">:{citation.lineNumber}</span>}
            </div>
            <div className="text-xs text-gray-500">
              {formatTimestamp(citation.timestamp)}
              {citation.confidence && (
                <span className="ml-2">
                  信頼度: {Math.round(citation.confidence * 100)}%
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          {showVerificationStatus && (
            <div className="flex items-center space-x-1">
              {getVerificationIcon()}
              <span className="text-xs text-gray-500">
                {citation.verified ? "検証済み" : "未検証"}
              </span>
            </div>
          )}
          
          {onVerify && !citation.verified && (
            <button
              onClick={() => onVerify(citation.id)}
              className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded"
            >
              検証
            </button>
          )}
        </div>
      </div>

      {/* Quote */}
      <div className="bg-gray-50 rounded-lg p-3">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editedQuote}
              onChange={(e) => setEditedQuote(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 resize-none"
              rows={3}
            />
            <div className="flex space-x-2">
              <button
                onClick={handleSaveEdit}
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedQuote(citation.quote);
                }}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <blockquote className="text-sm text-gray-700 italic">
              "{citation.quote}"
            </blockquote>
            {onEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className="absolute top-0 right-0 text-xs text-gray-400 hover:text-gray-600"
                title="引用を編集"
              >
                ✏️
              </button>
            )}
          </div>
        )}
      </div>

      {/* Context (if available) */}
      {citation.context && showDetails && (
        <div className="border-t border-gray-200 pt-3">
          <div className="text-xs text-gray-500 mb-1">コンテキスト:</div>
          <div className="text-sm text-gray-600">
            {citation.context}
          </div>
        </div>
      )}

      {/* Metadata */}
      {showDetails && (
        <div className="border-t border-gray-200 pt-3 text-xs text-gray-500 space-y-1">
          <div>引用ID: {citation.id}</div>
          {citation.chunkId && <div>チャンクID: {citation.chunkId}</div>}
          {citation.url && (
            <div>
              URL: <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {citation.url}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Audit log component for citation tracking
interface CitationAuditLogProps {
  citations: Citation[];
  onExport?: () => void;
}

export function CitationAuditLog({ citations, onExport }: CitationAuditLogProps) {
  const [sortBy, setSortBy] = useState<"timestamp" | "document" | "verified">("timestamp");
  const [filterVerified, setFilterVerified] = useState<"all" | "verified" | "unverified">("all");

  const filteredAndSortedCitations = citations
    .filter(citation => {
      switch (filterVerified) {
        case "verified":
          return citation.verified;
        case "unverified":
          return !citation.verified;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "timestamp":
          return b.timestamp - a.timestamp;
        case "document":
          return a.documentTitle.localeCompare(b.documentTitle);
        case "verified":
          return Number(b.verified) - Number(a.verified);
        default:
          return 0;
      }
    });

  const verifiedCount = citations.filter(c => c.verified).length;
  const totalCount = citations.length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">引用監査ログ</h3>
          <p className="text-sm text-gray-600">
            {totalCount}件の引用のうち{verifiedCount}件が検証済み
            ({totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0}%)
          </p>
        </div>
        
        {onExport && (
          <button
            onClick={onExport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            監査ログをエクスポート
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4 mb-4">
        <div>
          <label className="text-xs text-gray-700 mr-2">並び順:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            <option value="timestamp">時系列</option>
            <option value="document">文書名</option>
            <option value="verified">検証状態</option>
          </select>
        </div>
        
        <div>
          <label className="text-xs text-gray-700 mr-2">フィルター:</label>
          <select
            value={filterVerified}
            onChange={(e) => setFilterVerified(e.target.value as any)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            <option value="all">すべて</option>
            <option value="verified">検証済みのみ</option>
            <option value="unverified">未検証のみ</option>
          </select>
        </div>
      </div>

      {/* Citation List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredAndSortedCitations.map(citation => (
          <CitationChip
            key={citation.id}
            citation={citation}
            variant="detailed"
            showDetails={true}
          />
        ))}
        
        {filteredAndSortedCitations.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📋</div>
            <div>条件に該当する引用がありません</div>
          </div>
        )}
      </div>
    </div>
  );
}