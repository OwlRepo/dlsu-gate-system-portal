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

    // Development mode: bypass authentication if no token provided
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (isDevelopment && !token) {
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
      // First verify if token is valid
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      // Then check if token is blacklisted
      const isBlacklisted =
        await this.tokenBlacklistService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('Session expired. Please login again.');
      }

      // Ensure role is present
      const userRole = payload.role || 'EMPLOYEE';

      // Get active tokens for the user
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
