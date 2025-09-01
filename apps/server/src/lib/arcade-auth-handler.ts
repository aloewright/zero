import Arcade from '@arcadeai/arcadejs';

export interface AuthorizationState {
  toolName: string;
  userId: string;
  authId?: string;
  authUrl?: string;
  status: 'pending' | 'completed' | 'failed';
}

export class ArcadeAuthHandler {
  private arcade: Arcade;
  private pendingAuthorizations: Map<string, AuthorizationState> = new Map();

  constructor(apiKey: string) {
    this.arcade = new Arcade({ apiKey });
  }

  async requiresAuth(toolName: string, userId: string): Promise<AuthorizationState> {
    const cacheKey = `${userId}:${toolName}`;

    const cached = this.pendingAuthorizations.get(cacheKey);
    if (cached && cached.status === 'completed') {
      return cached;
    }

    try {
      const authResponse = await this.arcade.tools.authorize({
        tool_name: toolName,
        user_id: userId,
      });

      const state: AuthorizationState = {
        toolName,
        userId,
        authId: authResponse.id,
        authUrl: authResponse.url,
        status: authResponse.status === 'completed' ? 'completed' : 'pending',
      };

      this.pendingAuthorizations.set(cacheKey, state);
      return state;
    } catch (error) {
      console.error(`[ArcadeAuthHandler] Error checking auth for ${toolName}:`, error);
      return {
        toolName,
        userId,
        status: 'failed',
      };
    }
  }

  async waitForAuthorization(authId: string, userId: string): Promise<boolean> {
    try {
      const response = await this.arcade.auth.waitForCompletion(authId);

      if (response.status === 'completed') {
        // Update cache for all tools that might have been authorized
        for (const [key, state] of this.pendingAuthorizations.entries()) {
          if (state.userId === userId && state.authId === authId) {
            state.status = 'completed';
            this.pendingAuthorizations.set(key, state);
          }
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error(`[ArcadeAuthHandler] Error waiting for authorization:`, error);
      return false;
    }
  }

  getPendingAuthorizations(userId: string): AuthorizationState[] {
    const pending: AuthorizationState[] = [];

    for (const state of this.pendingAuthorizations.values()) {
      if (state.userId === userId && state.status === 'pending') {
        pending.push(state);
      }
    }

    return pending;
  }

  clearUserCache(userId: string) {
    for (const [key, state] of this.pendingAuthorizations.entries()) {
      if (state.userId === userId) {
        this.pendingAuthorizations.delete(key);
      }
    }
  }

  async authorizeTools(
    toolNames: string[],
    userId: string,
  ): Promise<{
    authorized: string[];
    pending: AuthorizationState[];
    failed: string[];
  }> {
    const authorized: string[] = [];
    const pending: AuthorizationState[] = [];
    const failed: string[] = [];

    for (const toolName of toolNames) {
      const authState = await this.requiresAuth(toolName, userId);

      if (authState.status === 'completed') {
        authorized.push(toolName);
      } else if (authState.status === 'pending') {
        pending.push(authState);
      } else {
        failed.push(toolName);
      }
    }

    return { authorized, pending, failed };
  }
}

let authHandler: ArcadeAuthHandler | null = null;

export function getArcadeAuthHandler(apiKey: string): ArcadeAuthHandler {
  if (!authHandler) {
    authHandler = new ArcadeAuthHandler(apiKey);
  }
  return authHandler;
}
