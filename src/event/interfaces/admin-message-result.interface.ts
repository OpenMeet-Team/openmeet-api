export interface AdminMessageResult {
  success: boolean;
  messageId: string;
  deliveredCount: number;
  failedCount: number;
  errors?: string[];
}
