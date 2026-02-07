import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    // If error or no user, just return null (don't throw)
    // We want to allow the request to proceed even if unauthenticated
    return user;
  }
}
