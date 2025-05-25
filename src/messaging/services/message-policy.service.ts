import { Injectable } from '@nestjs/common';
import { MessageAuditService } from './message-audit.service';
import { MessagePauseService } from './message-pause.service';

export interface RateLimitCheck {
  allowed: boolean;
  limit: number;
  count: number;
  reason?: string;
}

export interface PolicyCheckOptions {
  tenantId: string;
  userId: number;
  groupId?: number;
  eventId?: number;
  skipRateLimit?: boolean;
  skipPauseCheck?: boolean;
  systemReason?: string; // Allow certain system emails through pause
}

/**
 * Service for checking messaging policies (rate limits, pause status)
 * Minimal dependencies, works in event contexts
 */
@Injectable()
export class MessagePolicyService {
  constructor(
    private readonly auditService: MessageAuditService,
    private readonly pauseService: MessagePauseService,
  ) {}

  async checkPolicies(options: PolicyCheckOptions): Promise<{
    allowed: boolean;
    reason?: string;
    rateLimit?: RateLimitCheck;
  }> {
    try {
      // Check if messaging is paused
      if (!options.skipPauseCheck) {
        const pauseStatus = await this.pauseService.isMessagingPaused();
        if (pauseStatus.paused) {
          // Allow critical system messages through pause
          const criticalReasons = ['user_signup', 'password_reset', 'account_verification'];
          if (!options.systemReason || !criticalReasons.includes(options.systemReason)) {
            return {
              allowed: false,
              reason: `Messaging is paused: ${pauseStatus.reason}`,
            };
          }
        }
      }

      // Check rate limits
      if (!options.skipRateLimit) {
        const rateLimit = await this.auditService.checkRateLimit(
          options.tenantId,
          options.userId,
          options.groupId,
          options.eventId,
        );

        if (!rateLimit.allowed) {
          return {
            allowed: false,
            reason: `Rate limit exceeded: ${rateLimit.count}/${rateLimit.limit}`,
            rateLimit,
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking message policies:', error);
      // Default to allowing if policy check fails
      return { allowed: true, reason: 'Policy check failed, allowing by default' };
    }
  }

  async logPolicyViolation(options: {
    tenantId: string;
    userId: number;
    action: 'draft_created' | 'message_sent' | 'review_requested' | 'message_approved' | 'message_rejected' | 'rate_limit_exceeded' | 'message_send_skipped' | 'system_message_sent' | 'system_message_skipped';
    reason: string;
    additionalData?: any;
  }): Promise<void> {
    try {
      await this.auditService.logAction(
        options.tenantId,
        options.userId,
        options.action,
        {
          additionalData: {
            reason: options.reason,
            ...options.additionalData,
          },
        },
      );
    } catch (error) {
      console.error('Error logging policy violation:', error);
    }
  }
}