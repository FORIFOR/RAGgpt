export type MessageRole = 'user' | 'assistant' | 'system';

export type Citation = {
  id: string;
  title: string;
  location: string;
  uri?: string;
  preview?: string;
  anchor_phrase?: string | null;
  anchor_char_start?: number | null;
  anchor_char_end?: number | null;
};

export type Message = {
  id: string;
  role: MessageRole;
  text: string;
  citations?: Citation[];
  createdAt: number;
};

export type Source = Citation;

export type Thread = {
  id: string;
  title: string;
  pinned?: boolean;
  unread?: boolean;
  updatedAt: number;
};

export type Workspace = {
  id: string;
  name: string;
};

export type SearchCandidate = {
  title?: string;
  content?: string;
  source_uri?: string;
  page?: number;
  section?: string | null;
  hybrid_score?: number;
};

export type ChatSSEToken = { type: 'token'; text: string };
export type ChatSSEDone = { type: 'done'; citations: Citation[] };
export type ChatSSEEvent = ChatSSEToken | ChatSSEDone | { type: 'message' };
