// strategies/apple.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
    constructor(private configService: ConfigService) {
        const clientID = configService.get<string>('APPLE_CLIENT_ID');
        const teamID = configService.get<string>('APPLE_TEAM_ID');
        const keyID = configService.get<string>('APPLE_KEY_ID');
        const callbackURL = configService.get<string>('APPLE_CALLBACK_URL');
        const privateKeyString = configService.get<string>('APPLE_PRIVATE_KEY');
        const privateKeyLocation = configService.get<string>('APPLE_PRIVATE_KEY_LOCATION');

        if (!clientID || !teamID || !keyID || !callbackURL) {
            throw new Error('Apple OAuth config missing in .env');
        }

        if (!privateKeyString && !privateKeyLocation) {
            throw new Error('Either APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_LOCATION must be set');
        }

        super({
            clientID,
            teamID,
            keyID,
            // Use privateKeyString if available, otherwise use privateKeyLocation
            ...(privateKeyString
                ? { privateKeyString: privateKeyString.replace(/\\n/g, '\n') }
                : { privateKeyLocation }
            ),
            callbackURL,
            passReqToCallback: true,
            scope: ['name', 'email'],
        });
    }

    async validate(
        req: any,
        accessToken: string,
        refreshToken: string,
        idToken: any,
        profile: any,
        done: (err: any, user: any) => void,
    ): Promise<any> {
        try {
            let firstName = '';
            let lastName = '';
            let email = '';
            let appleId = '';

            // Extract Apple ID from idToken
            if (idToken && idToken.sub) {
                appleId = idToken.sub;
            }

            // Extract email from idToken (most reliable)
            if (idToken && idToken.email) {
                email = idToken.email;
            }

            // On first login, Apple sends user data in req.body.user
            if (req.body && req.body.user) {
                try {
                    const userData = typeof req.body.user === 'string'
                        ? JSON.parse(req.body.user)
                        : req.body.user;

                    if (userData.name) {
                        firstName = userData.name.firstName || '';
                        lastName = userData.name.lastName || '';
                    }

                    if (userData.email && !email) {
                        email = userData.email;
                    }
                } catch (e) {
                    console.error('Error parsing Apple user data:', e);
                }
            }

            // Fallback to profile if available
            if (profile) {
                if (!appleId && profile.id) {
                    appleId = profile.id;
                }
                if (!email && profile.email) {
                    email = profile.email;
                }
                if (profile.name) {
                    if (!firstName) firstName = profile.name.firstName || '';
                    if (!lastName) lastName = profile.name.lastName || '';
                }
            }

            const user = {
                appleId,
                email,
                firstName,
                lastName,
                accessToken,
                idToken,
            };

            done(null, user);
        } catch (error) {
            done(error, null);
        }
    }
}