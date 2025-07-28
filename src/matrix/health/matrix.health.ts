import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import axios from 'axios';
import { MatrixCoreService } from '../services/matrix-core.service';
import { MatrixBotService } from '../services/matrix-bot.service';
import { fetchTenants } from '../../utils/tenant-config';

@Injectable()
export class MatrixHealthIndicator extends HealthIndicator {
  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    private readonly matrixBotService: MatrixBotService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Get Matrix server configuration from core service
      const config = this.matrixCoreService.getConfig();
      const baseUrl = config.baseUrl;

      // Basic server availability check
      let serverAvailable = false;
      try {
        const serverInfoUrl = `${baseUrl}/_matrix/client/versions`;
        const serverInfoResponse = await axios.get(serverInfoUrl, {
          timeout: 2000, // 2 second timeout
        });
        serverAvailable = serverInfoResponse.status === 200;
      } catch (_serverCheckError) {
        // Don't log as error during startup - Matrix might not be ready yet
        console.debug(
          'Matrix server check failed (server may not be ready yet):',
          _serverCheckError.message,
        );
        serverAvailable = false;
      }

      // Bot authentication check - only if server is available
      let botAuthenticated = false;
      let botFunctional = false;

      if (serverAvailable) {
        try {
          // Get first valid tenant to test bot authentication
          const tenants = fetchTenants();
          const testTenant = tenants.find(t => t.id && t.matrixConfig);
          
          if (testTenant) {
            // Try to authenticate bot for health check
            await this.matrixBotService.authenticateBot(testTenant.id);
            botAuthenticated = this.matrixBotService.isBotAuthenticated();
            
            // If bot is authenticated, test basic functionality
            if (botAuthenticated) {
              botFunctional = true; // Bot service handles its own health internally
            }
          }
        } catch (_botError) {
          botAuthenticated = false;
          botFunctional = false;
        }
      }

      const data = {
        serverAvailable,
        botAuthenticated,
        botFunctional,
        serverUrl: baseUrl,
      };

      // Consider healthy if server is available and bot is functional
      const isHealthy = serverAvailable && botFunctional;

      if (isHealthy) {
        return this.getStatus(key, true, data);
      }

      throw new HealthCheckError(
        'Matrix health check failed',
        this.getStatus(key, false, data),
      );
    } catch (error) {
      // General error handling
      const config = this.matrixCoreService.getConfig();
      return this.getStatus(key, false, {
        message: error.message,
        serverUrl: config.baseUrl,
        error: error.toString(),
      });
    }
  }
}
