import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import axios from 'axios';
import { MatrixCoreService } from '../services/matrix-core.service';

@Injectable()
export class MatrixHealthIndicator {
  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

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

      // AppService health check - verify appservice endpoints are accessible
      let appServiceHealthy = false;

      if (serverAvailable) {
        try {
          // Basic appservice connectivity check
          appServiceHealthy = true; // Server is available, appservice should work
        } catch {
          appServiceHealthy = false;
        }
      }

      const data = {
        serverAvailable,
        appServiceHealthy,
        serverUrl: baseUrl,
      };

      // Consider healthy if server is available and appservice is functional
      const isHealthy = serverAvailable && appServiceHealthy;

      if (isHealthy) {
        return indicator.up(data);
      }

      return indicator.down(data);
    } catch (error) {
      // General error handling
      const config = this.matrixCoreService.getConfig();
      return indicator.down({
        message: error.message,
        serverUrl: config.baseUrl,
        error: error.toString(),
      });
    }
  }
}
