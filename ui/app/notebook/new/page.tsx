"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "../../../components/Layout";

export default function NewNotebookPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [notebookData, setNotebookData] = useState({
    title: "",
    description: "",
    template: "blank" as "blank" | "legal" | "medical" | "business",
    isPrivate: true,
    collaborators: [] as string[]
  });

  const templates = [
    {
      id: "blank",
      name: "空のノート",
      description: "白紙の状態から始めます",
      icon: "📝",
      features: ["自由な構成", "カスタム設定", "全機能利用可能"]
    },
    {
      id: "legal",
      name: "法務テンプレート", 
      description: "契約書や法的文書の分析に最適",
      icon: "⚖️",
      features: ["条項抽出", "リスク分析", "引用追跡", "監査ログ"]
    },
    {
      id: "medical",
      name: "医療テンプレート",
      description: "医療文献や診療記録の整理",
      icon: "🏥", 
      features: ["症例分析", "文献整理", "エビデンス追跡", "HIPAA準拠"]
    },
    {
      id: "business",
      name: "ビジネステンプレート",
      description: "企業資料や市場分析用",
      icon: "📊",
      features: ["データ分析", "レポート生成", "トレンド把握", "競合分析"]
    }
  ];

  const handleCreate = () => {
    // Generate notebook ID
    const notebookId = `notebook_${Date.now()}`;
    
    // In a real app, this would create the notebook via API
    console.log("Creating notebook:", { id: notebookId, ...notebookData });
    
    // Redirect to the new notebook
    router.push(`/notebook/${notebookId}`);
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">基本情報</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              ノート名 *
            </label>
            <input
              type="text"
              value={notebookData.title}
              onChange={(e) => setNotebookData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="例: 契約書レビュー"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              説明（任意）
            </label>
            <textarea
              value={notebookData.description}
              onChange={(e) => setNotebookData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="このノートの目的や内容について説明してください"
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-slate-600 hover:text-slate-800"
        >
          キャンセル
        </button>
        <button
          onClick={() => setStep(2)}
          disabled={!notebookData.title.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          次へ
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">テンプレート選択</h2>
        <p className="text-slate-600 mb-6">用途に応じたテンプレートを選択してください</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(template => (
            <div
              key={template.id}
              onClick={() => setNotebookData(prev => ({ ...prev, template: template.id as any }))}
              className={`p-4 border rounded-xl cursor-pointer transition-all ${
                notebookData.template === template.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="text-2xl">{template.icon}</div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900 mb-1">{template.name}</div>
                  <div className="text-sm text-slate-600 mb-3">{template.description}</div>
                  <div className="space-y-1">
                    {template.features.map((feature, index) => (
                      <div key={index} className="flex items-center space-x-2 text-xs text-slate-500">
                        <div className="w-1 h-1 bg-slate-400 rounded-full" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 text-slate-600 hover:text-slate-800"
        >
          戻る
        </button>
        <button
          onClick={() => setStep(3)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          次へ
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">プライバシー設定</h2>
        
        <div className="space-y-4">
          <div className="space-y-3">
            <label className="flex items-start space-x-3">
              <input
                type="radio"
                name="privacy"
                checked={notebookData.isPrivate}
                onChange={() => setNotebookData(prev => ({ ...prev, isPrivate: true }))}
                className="mt-1 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-slate-900">🔒 プライベート</div>
                <div className="text-sm text-slate-600">あなただけがアクセスできます</div>
              </div>
            </label>
            
            <label className="flex items-start space-x-3">
              <input
                type="radio"
                name="privacy"
                checked={!notebookData.isPrivate}
                onChange={() => setNotebookData(prev => ({ ...prev, isPrivate: false }))}
                className="mt-1 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-slate-900">👥 共有</div>
                <div className="text-sm text-slate-600">他のユーザーと共有できます</div>
              </div>
            </label>
          </div>

          {!notebookData.isPrivate && (
            <div className="ml-6 mt-4 p-4 bg-slate-50 rounded-lg">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                共同編集者のメールアドレス
              </label>
              <input
                type="email"
                placeholder="example@company.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-xs text-slate-500 mt-1">
                Enterキーで追加、複数のアドレスを追加できます
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-slate-50 rounded-lg p-4">
        <h3 className="font-medium text-slate-900 mb-3">設定内容の確認</h3>
        <div className="space-y-2 text-sm">
          <div><span className="text-slate-600">ノート名:</span> <span className="font-medium">{notebookData.title}</span></div>
          <div><span className="text-slate-600">テンプレート:</span> <span className="font-medium">{templates.find(t => t.id === notebookData.template)?.name}</span></div>
          <div><span className="text-slate-600">プライバシー:</span> <span className="font-medium">{notebookData.isPrivate ? "プライベート" : "共有"}</span></div>
          {notebookData.description && (
            <div><span className="text-slate-600">説明:</span> <span className="font-medium">{notebookData.description}</span></div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep(2)}
          className="px-4 py-2 text-slate-600 hover:text-slate-800"
        >
          戻る
        </button>
        <button
          onClick={handleCreate}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          ノートを作成
        </button>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">新しいノートを作成</h1>
          <p className="text-slate-600">3つのステップでノートを作成します</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center">
            {[1, 2, 3].map((stepNumber) => (
              <React.Fragment key={stepNumber}>
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  step >= stepNumber
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}>
                  {stepNumber}
                </div>
                {stepNumber < 3 && (
                  <div className={`flex-1 h-0.5 mx-4 ${
                    step > stepNumber ? "bg-blue-600" : "bg-slate-200"
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className={step >= 1 ? "text-blue-600" : "text-slate-500"}>基本情報</span>
            <span className={step >= 2 ? "text-blue-600" : "text-slate-500"}>テンプレート</span>
            <span className={step >= 3 ? "text-blue-600" : "text-slate-500"}>設定確認</span>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>
    </Layout>
  );
}