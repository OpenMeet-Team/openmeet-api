import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const client = context.switchToWs().getClient();

      // Authentication is already handled in the gateway middleware
      // This guard just verifies that userId is present in socket data
      if (!client.data || !client.data.userId) {
        this.logger.warn('WS Auth guard: No user data found in socket');
        throw new WsException('Unauthorized access');
      }

      // Check if the user has Matrix credentials - for now, just log a warning
      if (!client.data.hasMatrixCredentials) {
        this.logger.warn(
          `User ${client.data.userId} missing Matrix credentials - some functionality may not work`,
        );
        // In development, allow access even without Matrix credentials
        // This is temporary for debugging purposes
        return true;

        // In production, enable this to enforce Matrix credentials:
        // throw new WsException('Matrix credentials required');
      }

      return true;
    } catch (error) {
      this.logger.error(`WS Auth Error: ${error.message}`);
      throw new WsException('Unauthorized access');
    }
  }
}
