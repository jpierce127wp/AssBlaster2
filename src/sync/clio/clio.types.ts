/** Clio task representation */
export interface ClioTask {
  id: number;
  etag: string;
  name: string;
  description: string | null;
  priority: string;
  due_at: string | null;
  status: string;
  matter: { id: number } | null;
  assignee: { id: number } | null;
  created_at: string;
  updated_at: string;
}

/** Clio task create/update payload */
export interface ClioTaskPayload {
  data: {
    name: string;
    description?: string;
    priority?: string;
    due_at?: string;
    status?: string;
    matter?: { id: number };
    assignee?: { id: number };
  };
}

/** Clio OAuth tokens */
export interface ClioTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}
