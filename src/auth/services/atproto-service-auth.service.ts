import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdResolver } from '@atproto/identity';
import { verifySignature } from '@atproto/crypto';
import { UserAtprotoIdentityService } from '../../user-atproto-identity/user-atproto-identity.service';
import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';
import { LoginResponseDto } from '../dto/login-response.dto';
import { AuthProvidersEnum } from '../auth-providers.enum';

@Injectable()
export class AtprotoServiceAuthService {
  private readonly logger = new Logger(AtprotoServiceAuthService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private idResolver: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly userAtprotoIdentityService: UserAtprotoIdentityService,
    private readonly authService: AuthService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getIdResolver(): any {
    if (!this.idResolver) {
      const didPlcUrl = this.configService.get<string>('DID_PLC_URL', {
        infer: true,
      });
      this.idResolver = new IdResolver(didPlcUrl ? { plcUrl: didPlcUrl } : {});
    }
    return this.idResolver;
  }

  /**
   * Verify a PDS-signed service auth JWT and exchange it for OpenMeet tokens.
   *
   * The JWT is signed by the user's PDS via com.atproto.server.getServiceAuth.
   * We verify:
   *   1. JWT structure and claims (aud, lxm, exp, iss)
   *   2. Cryptographic signature against the user's DID document
   *   3. User exists in OpenMeet (auto-created if not)
   *
   * If no OpenMeet account exists for the DID, a minimal user is auto-created
   * with an atproto identity record. When the user later does a full Bluesky
   * OAuth login, the identity table lookup matches them to the same account.
   *
   * @param token - PDS-signed JWT
   * @param tenantId - Tenant identifier
   * @returns OpenMeet login tokens
   */
  async verifyAndExchange(
    token: string,
    tenantId: string,
  ): Promise<LoginResponseDto> {
    // Step 1: Split and decode JWT
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new BadRequestException('Malformed JWT: expected 3 parts');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    let payload: Record<string, unknown>;
    try {
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString(
        'utf-8',
      );
      payload = JSON.parse(payloadJson);
    } catch {
      throw new BadRequestException('Malformed JWT: invalid payload encoding');
    }

    // Step 2: Validate claims
    const { iss, aud, lxm, exp } = payload as {
      iss?: string;
      aud?: string;
      lxm?: string;
      exp?: number;
    };

    if (!iss) {
      throw new BadRequestException('JWT missing required claim: iss');
    }

    const serviceDid =
      this.configService.get<string>('SERVICE_DID', { infer: true }) ||
      'did:web:api.openmeet.net';

    if (aud !== serviceDid) {
      this.logger.warn(
        `Service auth rejected: aud mismatch (got ${aud}, expected ${serviceDid})`,
      );
      throw new UnauthorizedException('Invalid audience');
    }

    if (lxm !== 'net.openmeet.auth') {
      this.logger.warn(
        `Service auth rejected: lxm mismatch (got ${lxm}, expected net.openmeet.auth)`,
      );
      throw new UnauthorizedException('Invalid lexicon method');
    }

    const now = Math.floor(Date.now() / 1000);

    if (!exp || exp < now) {
      throw new UnauthorizedException('Token expired');
    }

    const MAX_TOKEN_LIFETIME_SECONDS = 300; // 5 minutes generous cap
    if (exp > now + MAX_TOKEN_LIFETIME_SECONDS) {
      throw new UnauthorizedException('Token expiry too far in the future');
    }

    // Step 3: Resolve user's DID document and get signing key
    const idResolver = this.getIdResolver();

    let signingKey: string;
    let resolvedHandle: string | undefined;
    let resolvedPdsUrl: string | undefined;
    try {
      const atprotoData = await idResolver.did.resolveAtprotoData(iss);
      signingKey = atprotoData.signingKey;
      resolvedHandle = atprotoData.handle;
      resolvedPdsUrl = atprotoData.pds;
    } catch (error) {
      // Fallback to public PLC for BYOD/Bluesky DIDs when using private PLC
      const didPlcUrl = this.configService.get<string>('DID_PLC_URL', {
        infer: true,
      });
      if (didPlcUrl) {
        this.logger.debug(
          `DID resolution failed on private PLC for ${iss}, trying public plc.directory`,
        );
        try {
          const publicResolver = new IdResolver();
          const atprotoData = await publicResolver.did.resolveAtprotoData(iss);
          signingKey = atprotoData.signingKey;
          resolvedHandle = atprotoData.handle;
          resolvedPdsUrl = atprotoData.pds;
        } catch {
          this.logger.warn(
            `Service auth rejected: DID resolution failed on both private and public PLC for ${iss}`,
          );
          throw new UnauthorizedException('Could not resolve DID');
        }
      } else {
        this.logger.warn(
          `Service auth rejected: DID resolution failed for ${iss}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new UnauthorizedException('Could not resolve DID');
      }
    }

    // Step 4: Verify JWT signature
    // The signature is over the header.payload portion of the JWT
    const signingInput = `${headerB64}.${payloadB64}`;
    const signingInputBytes = new TextEncoder().encode(signingInput);
    const signatureBytes = Buffer.from(signatureB64, 'base64url');

    const isValid = await verifySignature(
      signingKey,
      signingInputBytes,
      new Uint8Array(signatureBytes),
    );

    if (!isValid) {
      this.logger.warn(`Service auth rejected: invalid signature for ${iss}`);
      throw new UnauthorizedException('Invalid signature');
    }

    // Step 5: Look up user by DID
    const identity = await this.userAtprotoIdentityService.findByDid(
      tenantId,
      iss,
    );

    if (!identity) {
      this.logger.log(
        `Service auth: auto-creating user for DID ${iss} in tenant ${tenantId}`,
      );

      const socialData = {
        id: iss,
        email: '',
        firstName: resolvedHandle || iss,
        lastName: '',
      };

      const loginResponse = await this.authService.validateSocialLogin(
        AuthProvidersEnum.atprotoService,
        socialData,
        tenantId,
      );

      if (loginResponse.user?.ulid) {
        await this.userAtprotoIdentityService.create(tenantId, {
          userUlid: loginResponse.user.ulid,
          did: iss,
          handle: resolvedHandle || null,
          pdsUrl: resolvedPdsUrl || 'https://bsky.social',
          isCustodial: false,
          pdsCredentials: null,
        });
      }

      return loginResponse;
    }

    // Step 6: Load the full user object via userUlid and create login session
    const user = await this.userService.findByUlid(identity.userUlid, tenantId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Service auth successful for DID ${iss} (user ${user.ulid}) in tenant ${tenantId}`,
    );

    return this.authService.createLoginSession(
      user,
      AuthProvidersEnum.atprotoService,
      null,
      tenantId,
    );
  }
}
