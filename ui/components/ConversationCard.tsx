"use client";
import React from "react";

type ConversationCardType = {
  id: string;
  title: string;
  intent: "summary"|"compare"|"spec"|"blank";
  lastActiveAt: string;
  sources: { id:string; label:string; kind:"pdf"|"url"|"md" }[];
  lastAnswerSummary: string;
  pinned: boolean;
  unread: number;
};

const pickEmoji = (intent: string) => {
  switch(intent) {
    case "summary": return "📝";
    case "compare": return "⚖️";
    case "spec": return "📋";
    default: return "💬";
  }
};

const iconOf = (kind: string) => {
  switch(kind) {
    case "pdf": return "📄";
    case "url": return "🔗";
    case "md": return "📝";
    default: return "📎";
  }
};

const timeAgo = (timestamp: string) => {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return "今";
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  if (days < 7) return `${days}日前`;
  return new Date(time).toLocaleDateString('ja-JP');
};

const getIntentLabel = (intent: string) => {
  switch(intent) {
    case "summary": return "要約";
    case "compare": return "比較";
    case "spec": return "仕様";
    default: return "自由";
  }
};

const getIntentColor = (intent: string) => {
  switch(intent) {
    case "summary": return "bg-blue-100 text-blue-700";
    case "compare": return "bg-green-100 text-green-700";
    case "spec": return "bg-purple-100 text-purple-700";
    default: return "bg-gray-100 text-gray-700";
  }
};

export function ConversationCard({ card, onOpen, onPeek }: {
  card: ConversationCardType; 
  onOpen: () => void; 
  onPeek: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.altKey) {
        onPeek();
      } else {
        onOpen();
      }
    }
  };

  return (
    <button 
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group relative w-full text-left rounded-2xl border bg-white p-4 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
      role="button"
      tabIndex={0}
      aria-label={`会話を開く: ${card.title}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl" role="img" aria-label={getIntentLabel(card.intent)}>
          {pickEmoji(card.intent)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 group-hover:text-slate-900 overflow-hidden"
               style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {card.title}
          </div>
        </div>
        {card.pinned && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            PIN
          </span>
        )}
      </div>

      {/* Meta Info */}
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getIntentColor(card.intent)}`}>
          {getIntentLabel(card.intent)}
        </span>
        <div className="text-xs text-slate-500">
          {timeAgo(card.lastActiveAt)}
        </div>
      </div>

      {/* Sources */}
      {card.sources.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5">
            {card.sources.slice(0, 3).map(source => (
              <span 
                key={source.id} 
                className="text-xs px-2 py-1 rounded-full border bg-slate-50 text-slate-600 flex items-center gap-1"
                title={source.label}
              >
                <span role="img" aria-label={source.kind}>
                  {iconOf(source.kind)}
                </span>
                <span className="max-w-[100px] truncate">
                  {source.label}
                </span>
              </span>
            ))}
            {card.sources.length > 3 && (
              <span className="text-xs px-2 py-1 rounded-full border bg-slate-50 text-slate-600">
                +{card.sources.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Last Answer Summary */}
      <div className="mb-4">
        <p className="text-sm text-slate-600 leading-relaxed overflow-hidden"
           style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {card.lastAnswerSummary}
        </p>
      </div>

      {/* Action Buttons (appear on hover) */}
      <div className="absolute right-3 bottom-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPeek();
          }}
          className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 shadow-sm transition-colors"
          title="プレビュー (Alt+Enter)"
        >
          プレビュー
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // TODO: 実装 - メニュー表示（名前変更・ピン・共有等）
          }}
          className="text-xs px-2 py-1.5 rounded-md border bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 shadow-sm transition-colors"
          title="その他のオプション"
        >
          ⋯
        </button>
      </div>

      {/* Unread Badge */}
      {card.unread > 0 && (
        <span 
          className="absolute -top-1 -right-1 text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 min-w-[20px] flex items-center justify-center font-medium"
          aria-label={`${card.unread}件の未読`}
        >
          {card.unread}
        </span>
      )}
    </button>
  );
}