"use client";
import React, { useState, useEffect } from "react";

type ConversationIntent = "summary" | "compare" | "spec" | "blank";

const templates = [
  {
    intent: "summary" as ConversationIntent,
    title: "要約ノート",
    description: "資料を放り込んで要点3つにまとめる",
    emoji: "📝",
    color: "bg-blue-50 border-blue-200 hover:bg-blue-100",
    examplePrompt: "この資料の要点を3つに整理して、それぞれ具体例とともに説明してください。"
  },
  {
    intent: "compare" as ConversationIntent,
    title: "比較ノート", 
    description: "AとBの差分を表形式で比較分析",
    emoji: "⚖️",
    color: "bg-green-50 border-green-200 hover:bg-green-100",
    examplePrompt: "複数の選択肢を比較して、メリット・デメリットを表形式で整理してください。"
  },
  {
    intent: "spec" as ConversationIntent,
    title: "仕様ドラフト",
    description: "要件からアウトライン・仕様書を作成",
    emoji: "📋", 
    color: "bg-purple-50 border-purple-200 hover:bg-purple-100",
    examplePrompt: "以下の要件から、システムの仕様書のアウトラインを作成してください。"
  },
  {
    intent: "blank" as ConversationIntent,
    title: "白紙から",
    description: "自由な形式でチャットを開始",
    emoji: "💬",
    color: "bg-slate-50 border-slate-200 hover:bg-slate-100",
    examplePrompt: ""
  }
];

export function NewConversationModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (intent: ConversationIntent, title?: string) => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<ConversationIntent | null>(null);
  const [customTitle, setCustomTitle] = useState("");

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSelectedTemplate(null);
      setCustomTitle("");
    }
  }, [open]);

  const handleCreate = () => {
    if (!selectedTemplate) return;
    
    const template = templates.find(t => t.intent === selectedTemplate);
    const title = customTitle.trim() || template?.title || "新規会話";
    
    onCreate(selectedTemplate, title);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-xl font-bold text-slate-800">新しい会話を作成</h2>
              <p className="text-sm text-slate-500 mt-1">テンプレートを選択して始めましょう</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              aria-label="モーダルを閉じる"
            >
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Template Selection */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {templates.map(template => (
                <button
                  key={template.intent}
                  onClick={() => setSelectedTemplate(template.intent)}
                  className={`
                    text-left p-4 rounded-xl border-2 transition-all duration-200
                    ${selectedTemplate === template.intent 
                      ? 'border-blue-500 bg-blue-50 shadow-md' 
                      : template.color
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{template.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 mb-1">
                        {template.title}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {template.description}
                      </p>
                      {template.examplePrompt && (
                        <div className="mt-2 text-xs text-slate-500 italic">
                          例: {template.examplePrompt}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Title Input */}
            {selectedTemplate && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  会話のタイトル（任意）
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={templates.find(t => t.intent === selectedTemplate)?.title}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={50}
                />
                <div className="text-xs text-slate-400 mt-1">
                  {customTitle.length}/50
                </div>
              </div>
            )}

            {/* Selected Template Preview */}
            {selectedTemplate && (
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">
                    {templates.find(t => t.intent === selectedTemplate)?.emoji}
                  </span>
                  <span className="font-medium text-slate-700">
                    {customTitle.trim() || templates.find(t => t.intent === selectedTemplate)?.title}
                  </span>
                </div>
                {templates.find(t => t.intent === selectedTemplate)?.examplePrompt && (
                  <div className="text-sm text-slate-600">
                    初回メッセージ例: 「{templates.find(t => t.intent === selectedTemplate)?.examplePrompt}」
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 p-6 border-t bg-slate-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedTemplate}
              className={`
                px-6 py-2.5 rounded-lg font-medium transition-colors
                ${selectedTemplate
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }
              `}
            >
              作成して開始
            </button>
          </div>
        </div>
      </div>
    </>
  );
}