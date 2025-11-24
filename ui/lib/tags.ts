export const TAG_MASTER = {
    doc_types: [
        "契約書",
        "見積",
        "議事録",
        "仕様書",
        "マニュアル",
        "報告書",
        "企画書",
        "スライド",
        "請求書",
        "領収書",
        "その他"
    ],
    topics: [
        "補助金申請",
        "採用",
        "人事制度",
        "マーケティング",
        "開発",
        "インフラ",
        "セキュリティ",
        "法務",
        "財務",
        "広報",
        "営業"
    ],
    states: [
        "ドラフト",
        "レビュー待ち",
        "確定版",
        "社外共有用",
        "アーカイブ"
    ],
};

export type TagFilterState = {
    doc_type?: string | null;
    topic?: string | null;
    state?: string | null;
};
