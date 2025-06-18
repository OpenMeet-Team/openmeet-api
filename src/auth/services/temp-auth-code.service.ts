import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface TempAuthData {
  userId: number;
  tenantId: string;
  createdAt: number;
}

@Injectable()
export class TempAuthCodeService {
  private readonly authCodes = new Map<string, TempAuthData>();
  private readonly CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate a temporary auth code for a user
   */
  generateAuthCode(userId: number, tenantId: string): string {
    const code = randomBytes(32).toString('hex');

    this.authCodes.set(code, {
      userId,
      tenantId,
      createdAt: Date.now(),
    });

    // Clean up expired codes periodically
    this.cleanupExpiredCodes();

    console.log(
      `🎫 Generated temp auth code for user ${userId}, tenant ${tenantId}: ${code.substring(0, 8)}...`,
    );
    return code;
  }

  /**
   * Validate and consume a temporary auth code
   */
  validateAndConsumeAuthCode(code: string): TempAuthData | null {
    const authData = this.authCodes.get(code);

    if (!authData) {
      console.log(`❌ Auth code not found: ${code.substring(0, 8)}...`);
      return null;
    }

    // Check if expired
    if (Date.now() - authData.createdAt > this.CODE_EXPIRY_MS) {
      console.log(`⏰ Auth code expired: ${code.substring(0, 8)}...`);
      this.authCodes.delete(code);
      return null;
    }

    // Consume the code (delete it after use)
    this.authCodes.delete(code);
    console.log(
      `✅ Auth code validated and consumed for user ${authData.userId}, tenant ${authData.tenantId}`,
    );

    return authData;
  }

  /**
   * Clean up expired auth codes
   */
  private cleanupExpiredCodes(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [code, data] of this.authCodes.entries()) {
      if (now - data.createdAt > this.CODE_EXPIRY_MS) {
        toDelete.push(code);
      }
    }

    toDelete.forEach((code) => this.authCodes.delete(code));

    if (toDelete.length > 0) {
      console.log(`🧹 Cleaned up ${toDelete.length} expired auth codes`);
    }
  }

  /**
   * Get current number of active codes (for debugging)
   */
  getActiveCodeCount(): number {
    this.cleanupExpiredCodes();
    return this.authCodes.size;
  }
}
