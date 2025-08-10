import type { IOutgoingMessage, Label, DeleteAllSpamResponse } from '../../types';
import { sanitizeTipTapHtml } from '../sanitize-tip-tap-html';
import type { MailManager, ManagerConfig, ParsedDraft, IGetThreadResponse } from './types';
import type { CreateDraftData } from '../schemas';
import { resend } from '../services';
import { v4 as uuidv4 } from 'uuid';
import { htmlToText } from '../../thread-workflow-utils/workflow-utils';

export class ResendMailManager implements MailManager {
  private resendClient;

  constructor(public config: ManagerConfig) {
    this.resendClient = resend();
  }

  public getScope(): string {
    return 'resend:send';
  }

  public async create(data: IOutgoingMessage): Promise<{ id?: string | null }> {
    try {
      const { html: processedMessage, inlineImages } = await sanitizeTipTapHtml(data.message);
      
      const emailData = {
        from: data.fromEmail || `${this.config.auth.email} <${this.config.auth.email}>`,
        to: data.to.map(recipient => recipient.email),
        cc: data.cc?.map(recipient => recipient.email),
        bcc: data.bcc?.map(recipient => recipient.email),
        subject: data.subject,
        html: processedMessage,
        text: await htmlToText(data.message),
        headers: {
          ...data.headers,
          ...(data.threadId && {
            'In-Reply-To': data.threadId,
            'References': data.threadId,
          }),
        },
        attachments: data.attachments?.map(att => ({
          filename: att.name,
          content: att.base64,
          type: att.type,
        })),
      };

      if (inlineImages.length > 0) {
        emailData.attachments = [
          ...(emailData.attachments || []),
          ...inlineImages.map(img => ({
            filename: img.cid,
            content: img.data,
            type: img.mimeType,
            disposition: 'inline',
            content_id: img.cid,
          })),
        ];
      }

      const result = await this.resendClient.emails.send(emailData);
      return { id: (result as any)?.data?.id || null };
    } catch (error) {
      console.error('ResendMailManager create error:', error);
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  public async sendDraft(id: string, data: IOutgoingMessage): Promise<void> {
    await this.create(data);
  }

  public async createDraft(_data: CreateDraftData): Promise<{ id?: string | null; success?: boolean; error?: string }> {
    try {
      const draftId = `draft_${uuidv4()}`;
      
      return { 
        id: draftId, 
        success: true 
      };
    } catch (error) {
      return { 
        id: null, 
        success: false, 
        error: `Failed to create draft: ${error}` 
      };
    }
  }

  public async getMessageAttachments(_id: string): Promise<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
    headers: { name: string; value: string }[];
    body: string;
  }[]> {
    throw new Error('getMessageAttachments not supported by Resend driver');
  }

  public async get(_id: string): Promise<IGetThreadResponse> {
    throw new Error('get not supported by Resend driver');
  }

  public async getDraft(_id: string): Promise<ParsedDraft> {
    throw new Error('getDraft not supported by Resend driver');
  }

  public async listDrafts(_params: { q?: string; maxResults?: number; pageToken?: string }): Promise<{
    threads: { id: string; historyId: string | null; $raw: unknown }[];
    nextPageToken: string | null;
  }> {
    throw new Error('listDrafts not supported by Resend driver');
  }

  public async delete(_id: string): Promise<void> {
    throw new Error('delete not supported by Resend driver');
  }

  public async list(_params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }): Promise<{
    threads: { id: string; historyId: string | null; $raw?: unknown }[];
    nextPageToken: string | null;
  }> {
    throw new Error('list not supported by Resend driver');
  }

  public async count(): Promise<{ count?: number; label?: string }[]> {
    throw new Error('count not supported by Resend driver');
  }

  public async getTokens(_code: string): Promise<{ tokens: { access_token?: string; refresh_token?: string; expiry_date?: number } }> {
    throw new Error('getTokens not supported by Resend driver');
  }

  public async getUserInfo(_tokens?: ManagerConfig['auth']): Promise<{ address: string; name: string; photo: string }> {
    return {
      address: this.config.auth.email,
      name: this.config.auth.email.split('@')[0],
      photo: '',
    };
  }

  public async listHistory<T>(_historyId: string): Promise<{ history: T[]; historyId: string }> {
    throw new Error('listHistory not supported by Resend driver');
  }

  public async markAsRead(_threadIds: string[]): Promise<void> {
    throw new Error('markAsRead not supported by Resend driver');
  }

  public async markAsUnread(_threadIds: string[]): Promise<void> {
    throw new Error('markAsUnread not supported by Resend driver');
  }

  public normalizeIds(id: string[]): { threadIds: string[] } {
    return { threadIds: id };
  }

  public async modifyLabels(
    _id: string[],
    _options: { addLabels: string[]; removeLabels: string[] },
  ): Promise<void> {
    throw new Error('modifyLabels not supported by Resend driver');
  }

  public async getAttachment(_messageId: string, _attachmentId: string): Promise<string | undefined> {
    throw new Error('getAttachment not supported by Resend driver');
  }

  public async getUserLabels(): Promise<Label[]> {
    return [];
  }

  public async getLabel(_id: string): Promise<Label> {
    throw new Error('getLabel not supported by Resend driver');
  }

  public async createLabel(_label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<void> {
    throw new Error('createLabel not supported by Resend driver');
  }

  public async updateLabel(
    _id: string,
    _label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void> {
    throw new Error('updateLabel not supported by Resend driver');
  }

  public async deleteLabel(_id: string): Promise<void> {
    throw new Error('deleteLabel not supported by Resend driver');
  }

  public async getEmailAliases(): Promise<{ email: string; name?: string; primary?: boolean }[]> {
    return [{ email: this.config.auth.email, primary: true }];
  }

  public async revokeToken(_token: string): Promise<boolean> {
    throw new Error('revokeToken not supported by Resend driver');
  }

  public async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    throw new Error('deleteAllSpam not supported by Resend driver');
  }
}
