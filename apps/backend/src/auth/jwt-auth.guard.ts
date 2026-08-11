import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenBlacklistService } from './token-blacklist.service';
import { Role } from './enums/role.enum';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for public route
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    // Dev-only bypass: requires an explicit opt-in flag, never active in
    // production even if NODE_ENV is misconfigured. This app gates physical
    // access — NODE_ENV alone must not grant an unauthenticated SUPER_ADMIN.
    const devBypassEnabled =
      process.env.DEV_AUTH_BYPASS === 'true' &&
      process.env.NODE_ENV !== 'production';
    if (devBypassEnabled && !token) {
      // Create mock user with configurable role
      const defaultRole =
        (process.env.DEV_DEFAULT_ROLE as Role) || Role.SUPER_ADMIN;
      request['user'] = {
        sub: 'dev-user-id',
        username: 'dev-user',
        role: defaultRole,
      };
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      // Verify with the module-configured secret (same one used for signing).
      // Never read process.env here: an env/config mismatch between sign and
      // verify once logged every user out seconds after login.
      const payload = await this.jwtService.verifyAsync(token);

      // Then check if token is blacklisted
      const isBlacklisted =
        await this.tokenBlacklistService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('Session expired. Please login again.');
      }

      // Ensure role is present
      const userRole = payload.role || 'EMPLOYEE';

      // Token tracking is bookkeeping, not authorization. A database or Redis
      // hiccup here must not log out a user whose token has already been
      // verified and found not blacklisted.
      try {
        const activeTokens =
          await this.tokenBlacklistService.getActiveTokensByUser(
            payload.sub,
            userRole,
          );

        // Track the current token if it's not already tracked
        if (!activeTokens.includes(token)) {
          await this.tokenBlacklistService.trackUserToken(
            payload.sub,
            userRole,
            token,
          );
        }
      } catch (trackingError) {
        console.error('Token tracking failed:', trackingError.message);
      }

      request['user'] = {
        ...payload,
        role: userRole,
      };
      return true;
    } catch (error) {
      console.error('Token validation failed:', error.message);
      throw new UnauthorizedException(error.message || 'Invalid token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
