"use client";
import React, { useState } from "react";
import { Citation } from "./CitationChip";

export type ExportFormat = "pdf" | "docx" | "md" | "html";

export interface ExportableContent {
  title: string;
  content: string;
  citations: Citation[];
  metadata?: {
    author?: string;
    createdAt?: number;
    updatedAt?: number;
    tags?: string[];
    notebookId?: string;
  };
}

interface ExportDialogProps {
  content: ExportableContent;
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, options: ExportOptions) => Promise<void>;
}

export interface ExportOptions {
  format: ExportFormat;
  includeCitations: boolean;
  includeMetadata: boolean;
  citationStyle: "numeric" | "author-date" | "footnote";
  pageFormat?: "A4" | "Letter" | "A3";
  orientation?: "portrait" | "landscape";
  fontSize?: number;
  includeTableOfContents?: boolean;
  watermark?: string;
}

export function ExportDialog({ content, isOpen, onClose, onExport }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [options, setOptions] = useState<ExportOptions>({
    format: "pdf",
    includeCitations: true,
    includeMetadata: true,
    citationStyle: "numeric",
    pageFormat: "A4",
    orientation: "portrait",
    fontSize: 12,
    includeTableOfContents: false,
    watermark: ""
  });
  const [isExporting, setIsExporting] = useState(false);

  const formats = [
    {
      id: "pdf" as const,
      name: "PDF",
      description: "印刷に適した形式、引用付き",
      icon: "📄",
      features: ["固定レイアウト", "引用管理", "目次生成", "透かし対応"]
    },
    {
      id: "docx" as const,
      name: "Word文書",
      description: "編集可能な文書形式",
      icon: "📝",
      features: ["編集可能", "コメント機能", "追跡変更", "スタイル適用"]
    },
    {
      id: "md" as const,
      name: "Markdown",
      description: "軽量マークアップ形式",
      icon: "📋",
      features: ["プレーンテキスト", "バージョン管理", "軽量", "互換性"]
    },
    {
      id: "html" as const,
      name: "HTML",
      description: "ウェブ表示用形式",
      icon: "🌐",
      features: ["ウェブ表示", "インタラクティブ", "スタイル適用", "リンク対応"]
    }
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportOptions = { ...options, format: selectedFormat };
      await onExport(selectedFormat, exportOptions);
      onClose();
    } catch (error) {
      console.error("Export failed:", error);
      alert("エクスポートに失敗しました");
    } finally {
      setIsExporting(false);
    }
  };

  const updateOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">エクスポート</h2>
              <p className="text-gray-600 mt-1">
                ノートブックの内容を指定した形式でエクスポートします
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="エクスポートダイアログを閉じる"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">エクスポート形式</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formats.map(format => (
                <div
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${
                    selectedFormat === format.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl">{format.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 mb-1">{format.name}</div>
                      <div className="text-sm text-gray-600 mb-3">{format.description}</div>
                      <div className="flex flex-wrap gap-1">
                        {format.features.map((feature, index) => (
                          <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export Options */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">エクスポート設定</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* General Options */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-700">基本設定</h4>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={options.includeCitations}
                    onChange={(e) => updateOption("includeCitations", e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">引用を含める</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={options.includeMetadata}
                    onChange={(e) => updateOption("includeMetadata", e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">メタデータを含める</span>
                </label>

                {(selectedFormat === "pdf" || selectedFormat === "docx") && (
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={options.includeTableOfContents}
                      onChange={(e) => updateOption("includeTableOfContents", e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">目次を含める</span>
                  </label>
                )}

                {options.includeCitations && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      引用スタイル
                    </label>
                    <select
                      value={options.citationStyle}
                      onChange={(e) => updateOption("citationStyle", e.target.value as any)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="numeric">番号形式 [1], [2]</option>
                      <option value="author-date">著者-年形式 (Smith, 2023)</option>
                      <option value="footnote">脚注形式</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Format-specific Options */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-700">形式固有設定</h4>
                
                {(selectedFormat === "pdf" || selectedFormat === "docx") && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ページ形式
                      </label>
                      <select
                        value={options.pageFormat}
                        onChange={(e) => updateOption("pageFormat", e.target.value as any)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="A4">A4</option>
                        <option value="Letter">Letter</option>
                        <option value="A3">A3</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ページ向き
                      </label>
                      <select
                        value={options.orientation}
                        onChange={(e) => updateOption("orientation", e.target.value as any)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="portrait">縦向き</option>
                        <option value="landscape">横向き</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        フォントサイズ: {options.fontSize}pt
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="16"
                        value={options.fontSize}
                        onChange={(e) => updateOption("fontSize", parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        透かし（任意）
                      </label>
                      <input
                        type="text"
                        value={options.watermark}
                        onChange={(e) => updateOption("watermark", e.target.value)}
                        placeholder="例: 社外秘"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Preview Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-700 mb-2">エクスポート内容</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">タイトル:</span>
                <div className="font-medium">{content.title}</div>
              </div>
              <div>
                <span className="text-gray-600">文字数:</span>
                <div className="font-medium">{content.content.length.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-gray-600">引用数:</span>
                <div className="font-medium">{content.citations.length}</div>
              </div>
              <div>
                <span className="text-gray-600">更新日:</span>
                <div className="font-medium">
                  {content.metadata?.updatedAt 
                    ? new Date(content.metadata.updatedAt).toLocaleDateString('ja-JP')
                    : "未設定"
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 rounded"
            >
              キャンセル
            </button>
            
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isExporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>エクスポート中...</span>
                </>
              ) : (
                <>
                  <span>{selectedFormat.toUpperCase()}でエクスポート</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export utility functions
export class ExportService {
  static async exportToPDF(content: ExportableContent, options: ExportOptions): Promise<void> {
    // In a real implementation, this would use a PDF generation library like jsPDF or Puppeteer
    const pdfContent = this.generatePDFContent(content, options);
    
    // Mock implementation - would be replaced with actual PDF generation
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    this.downloadFile(blob, `${content.title}.pdf`);
  }

  static async exportToWord(content: ExportableContent, options: ExportOptions): Promise<void> {
    // In a real implementation, this would use a library like docx or mammoth
    const docxContent = this.generateWordContent(content, options);
    
    const blob = new Blob([docxContent], { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    });
    this.downloadFile(blob, `${content.title}.docx`);
  }

  static async exportToMarkdown(content: ExportableContent, options: ExportOptions): Promise<void> {
    const markdownContent = this.generateMarkdownContent(content, options);
    
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    this.downloadFile(blob, `${content.title}.md`);
  }

  static async exportToHTML(content: ExportableContent, options: ExportOptions): Promise<void> {
    const htmlContent = this.generateHTMLContent(content, options);
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    this.downloadFile(blob, `${content.title}.html`);
  }

  private static generatePDFContent(content: ExportableContent, options: ExportOptions): string {
    // Mock PDF content generation
    let result = `%PDF-1.4\n% Mock PDF content for: ${content.title}\n`;
    
    if (options.includeMetadata && content.metadata) {
      result += `% Metadata:\n`;
      result += `% Author: ${content.metadata.author || 'Unknown'}\n`;
      result += `% Created: ${content.metadata.createdAt ? new Date(content.metadata.createdAt).toISOString() : 'Unknown'}\n`;
    }
    
    result += `\n${content.content}\n`;
    
    if (options.includeCitations && content.citations.length > 0) {
      result += `\nReferences:\n`;
      content.citations.forEach((citation, index) => {
        const citationNumber = options.citationStyle === 'numeric' ? `[${index + 1}]` : `(${citation.documentTitle})`;
        result += `${citationNumber} ${citation.documentTitle}, ${citation.quote}\n`;
      });
    }
    
    return result;
  }

  private static generateWordContent(content: ExportableContent, options: ExportOptions): string {
    // Mock Word document generation
    let result = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${content.title}</title>\n</head>\n<body>\n`;
    
    if (options.includeTableOfContents) {
      result += `<div style="page-break-after: always;">\n<h1>目次</h1>\n<p>1. 本文</p>\n<p>2. 引用</p>\n</div>\n`;
    }
    
    result += `<h1>${content.title}</h1>\n`;
    result += `<div>${content.content.replace(/\n/g, '<br>')}</div>\n`;
    
    if (options.includeCitations && content.citations.length > 0) {
      result += `<h2>引用</h2>\n<ol>\n`;
      content.citations.forEach(citation => {
        result += `<li>${citation.documentTitle}: "${citation.quote}"</li>\n`;
      });
      result += `</ol>\n`;
    }
    
    result += `</body>\n</html>`;
    return result;
  }

  private static generateMarkdownContent(content: ExportableContent, options: ExportOptions): string {
    let result = `# ${content.title}\n\n`;
    
    if (options.includeMetadata && content.metadata) {
      result += `---\n`;
      result += `title: ${content.title}\n`;
      result += `author: ${content.metadata.author || 'Unknown'}\n`;
      result += `created: ${content.metadata.createdAt ? new Date(content.metadata.createdAt).toISOString() : 'Unknown'}\n`;
      result += `updated: ${content.metadata.updatedAt ? new Date(content.metadata.updatedAt).toISOString() : 'Unknown'}\n`;
      result += `---\n\n`;
    }
    
    result += `${content.content}\n\n`;
    
    if (options.includeCitations && content.citations.length > 0) {
      result += `## 引用\n\n`;
      content.citations.forEach((citation, index) => {
        const citationNumber = options.citationStyle === 'numeric' ? `${index + 1}` : citation.documentTitle;
        result += `${citationNumber}. **${citation.documentTitle}**: "${citation.quote}"\n`;
      });
    }
    
    return result;
  }

  private static generateHTMLContent(content: ExportableContent, options: ExportOptions): string {
    let result = `<!DOCTYPE html>\n<html lang="ja">\n<head>\n`;
    result += `<meta charset="utf-8">\n`;
    result += `<meta name="viewport" content="width=device-width, initial-scale=1">\n`;
    result += `<title>${content.title}</title>\n`;
    result += `<style>\n`;
    result += `body { font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif; line-height: 1.6; margin: 40px; }\n`;
    result += `h1 { color: #333; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }\n`;
    result += `h2 { color: #555; margin-top: 30px; }\n`;
    result += `.citation { background: #f3f4f6; padding: 10px; margin: 10px 0; border-left: 4px solid #3b82f6; }\n`;
    result += `.metadata { background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; }\n`;
    result += `</style>\n</head>\n<body>\n`;
    
    if (options.includeMetadata && content.metadata) {
      result += `<div class="metadata">\n`;
      result += `<h2>文書情報</h2>\n`;
      result += `<p><strong>作成者:</strong> ${content.metadata.author || '不明'}</p>\n`;
      result += `<p><strong>作成日:</strong> ${content.metadata.createdAt ? new Date(content.metadata.createdAt).toLocaleDateString('ja-JP') : '不明'}</p>\n`;
      result += `<p><strong>更新日:</strong> ${content.metadata.updatedAt ? new Date(content.metadata.updatedAt).toLocaleDateString('ja-JP') : '不明'}</p>\n`;
      result += `</div>\n`;
    }
    
    result += `<h1>${content.title}</h1>\n`;
    result += `<div>${content.content.replace(/\n/g, '<br>')}</div>\n`;
    
    if (options.includeCitations && content.citations.length > 0) {
      result += `<h2>引用</h2>\n`;
      content.citations.forEach((citation, index) => {
        result += `<div class="citation">\n`;
        result += `<strong>[${index + 1}] ${citation.documentTitle}</strong>\n`;
        if (citation.page) result += ` (p.${citation.page})`;
        result += `<br>「${citation.quote}」\n`;
        if (citation.url) result += `<br><a href="${citation.url}" target="_blank">${citation.url}</a>\n`;
        result += `</div>\n`;
      });
    }
    
    result += `</body>\n</html>`;
    return result;
  }

  private static downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Hook for using export functionality
export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  
  const exportContent = async (content: ExportableContent, format: ExportFormat, options: ExportOptions) => {
    setIsExporting(true);
    try {
      switch (format) {
        case 'pdf':
          await ExportService.exportToPDF(content, options);
          break;
        case 'docx':
          await ExportService.exportToWord(content, options);
          break;
        case 'md':
          await ExportService.exportToMarkdown(content, options);
          break;
        case 'html':
          await ExportService.exportToHTML(content, options);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } finally {
      setIsExporting(false);
    }
  };
  
  return { exportContent, isExporting };
}