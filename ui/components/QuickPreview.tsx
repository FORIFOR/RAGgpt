"use client";
import React, { useEffect } from "react";

type Conversation = { 
  id: string; 
  title: string; 
  updatedAt: number; 
  pinned?: boolean; 
  tags?: string[];
  intent?: "summary"|"compare"|"spec"|"blank";
  lastAnswerSummary?: string;
  sources?: { id: string; label: string; kind: "pdf"|"url"|"md" }[];
  unread?: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

const iconOf = (kind: string) => {
  switch(kind) {
    case "pdf": return "📄";
    case "url": return "🔗";
    case "md": return "📝";
    default: return "📎";
  }
};

const getIntentLabel = (intent: string) => {
  switch(intent) {
    case "summary": return "要約ノート";
    case "compare": return "比較ノート";
    case "spec": return "仕様ドラフト";
    default: return "フリーチャット";
  }
};

export function QuickPreview({ conversation, onClose, onOpen }: {
  conversation: Conversation;
  onClose: () => void;
  onOpen: () => void;
}) {
  // Load recent messages for this conversation
  const [messages, setMessages] = React.useState<Message[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`rag.messages.${conversation.id}`);
      if (stored) {
        const allMessages = JSON.parse(stored) as Message[];
        // Show last 3 turns (6 messages max)
        setMessages(allMessages.slice(-6));
      }
    } catch (e) {
      console.warn('Failed to load messages for preview', e);
    }
  }, [conversation.id]);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 truncate">
              {conversation.title}
            </h2>
            <div className="text-sm text-slate-500">
              {getIntentLabel(conversation.intent || "blank")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-full"
            aria-label="プレビューを閉じる"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* Sources */}
          {conversation.sources && conversation.sources.length > 0 && (
            <div className="p-4 border-b bg-slate-50">
              <h3 className="text-sm font-medium text-slate-700 mb-2">主要ソース</h3>
              <div className="space-y-2">
                {conversation.sources.map(source => (
                  <div key={source.id} className="flex items-center gap-2 text-sm">
                    <span role="img" aria-label={source.kind}>
                      {iconOf(source.kind)}
                    </span>
                    <span className="text-slate-600 truncate">
                      {source.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Messages */}
          <div className="p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">最近のやりとり</h3>
            
            {messages.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-8">
                まだメッセージがありません
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map(message => (
                  <div key={message.id} className="group">
                    <div className="flex items-start gap-2 mb-1">
                      <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                        message.role === 'user' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {message.role === 'user' ? 'あなた' : 'AI'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(message.createdAt).toLocaleTimeString('ja-JP', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <div className="text-sm text-slate-700 leading-relaxed pl-2 border-l-2 border-slate-100 overflow-hidden"
                         style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                      {message.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t bg-slate-50 space-y-2">
          <button
            onClick={onOpen}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            続きから再開
          </button>
          <button
            onClick={() => {
              // TODO: 実装 - 新しい質問を追加してから開く
              onOpen();
            }}
            className="w-full border border-slate-300 text-slate-700 py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors"
          >
            新しい質問
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => {
                // TODO: 実装 - スナップショット表示
                onOpen();
              }}
              className="w-full text-sm text-slate-500 py-1.5 px-4 hover:text-slate-700 transition-colors"
            >
              スナップショットを見る
            </button>
          )}
        </div>
      </div>
    </>
  );
}