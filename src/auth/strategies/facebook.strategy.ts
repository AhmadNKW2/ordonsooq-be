import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('FACEBOOK_APP_ID');
    const clientSecret = configService.get<string>('FACEBOOK_APP_SECRET');
    const callbackURL = configService.get<string>('FACEBOOK_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error(
        'Facebook OAuth config missing. Check FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_CALLBACK_URL in .env',
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'public_profile'],
      profileFields: ['id', 'displayName', 'photos', 'email', 'name'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user: any, info?: any) => void,
  ): Promise<any> {
    console.log('📘 [FacebookStrategy] validate() called');

    const { name, emails, photos } = profile;
    const user = {
      email: emails && emails[0] ? emails[0].value : null,
      firstName: name ? name.givenName : profile.displayName,
      lastName: name ? name.familyName : '',
      picture: photos && photos[0] ? photos[0].value : null,
      accessToken,
    };

    const logMessage = `
--- Facebook Profile Response ---
${JSON.stringify(profile, null, 2)}
-------------------------------
`;
    console.log(logMessage);
    console.log('📘 ✅ Facebook auth user prepared:', JSON.stringify({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      picture: user.picture,
    }));

    done(null, user);
  }
}
