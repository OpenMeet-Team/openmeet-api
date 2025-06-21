import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import axios from 'axios';
import { MatrixTokenManagerService } from '../services/matrix-token-manager.service';

@Injectable()
export class MatrixHealthIndicator extends HealthIndicator {
  constructor(private readonly tokenManager: MatrixTokenManagerService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const baseUrl = this.tokenManager['baseUrl']; // Access baseUrl from token manager
      const tokenState = this.tokenManager.getAdminTokenState();
      const adminToken = this.tokenManager.getAdminToken();

      // Basic checks that don't require auth
      let serverAvailable = false;
      try {
        // Do a quick check of Matrix server without requiring token
        const serverInfoUrl = `${baseUrl}/_matrix/client/versions`;
        const serverInfoResponse = await axios.get(serverInfoUrl, {
          timeout: 2000, // 2 second timeout
        });
        serverAvailable = serverInfoResponse.status === 200;
      } catch (_serverCheckError) {
        // Don't log as error during startup - Matrix might not be ready yet
        console.debug('Matrix server check failed (server may not be ready yet):', _serverCheckError.message);
        serverAvailable = false;
      }

      // Auth checks - only if server is available
      let tokenValid = false;
      let adminPrivilegesValid = false;

      if (serverAvailable && tokenState === 'valid' && adminToken) {
        try {
          // Check if token is valid using whoami endpoint
          const whoamiUrl = `${baseUrl}/_matrix/client/v3/account/whoami`;
          const whoamiResponse = await axios.get(whoamiUrl, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });

          tokenValid = whoamiResponse.status === 200;

          // Check admin privileges if token is valid
          if (tokenValid) {
            try {
              // Try admin endpoint
              const adminUrl = `${baseUrl}/_synapse/admin/v2/users?from=0&limit=1`;
              const adminResponse = await axios.get(adminUrl, {
                headers: { Authorization: `Bearer ${adminToken}` },
              });

              adminPrivilegesValid = adminResponse.status === 200;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_adminError) {
              adminPrivilegesValid = false;
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_tokenError) {
          tokenValid = false;

          // Report invalid token if it fails the health check
          if (tokenState === 'valid') {
            // Use the async method, but don't block health check on completion
            void this.tokenManager.reportTokenInvalid();
          }
        }
      }

      const data = {
        serverAvailable,
        tokenState,
        tokenValid,
        adminPrivilegesValid,
        serverUrl: baseUrl,
      };

      // Consider healthy if server is available and either token is valid or being regenerated
      const isHealthy =
        serverAvailable && (tokenValid || tokenState === 'regenerating');

      if (isHealthy) {
        return this.getStatus(key, true, data);
      }

      throw new HealthCheckError(
        'Matrix server check failed',
        this.getStatus(key, false, data),
      );
    } catch (error) {
      // General error handling
      return this.getStatus(key, false, {
        message: error.message,
        serverUrl: this.tokenManager['baseUrl'],
        error: error.toString(),
      });
    }
  }
}
