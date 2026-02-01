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

        // Robust Key Formatting Helper
        const formatKey = (key: string): string => {
            if (!key) return key;
            // 1. If it has literal \n characters, replace them with real newlines
            let formatted = key.replace(/\\n/g, '\n');
            
            // 2. If it's acting as a single line but isn't wrapped properly, guard against common copy-paste errors
            // (Standard PEM keys should already have newlines)
            return formatted;
        };

        const finalPrivateKey = privateKeyString ? formatKey(privateKeyString) : undefined;
        
        // Debug Log (Safety: Only log headers/length, never the secret content)
        if (finalPrivateKey) {
            console.log('🍎 [AppleStrategy] Private Key Status:');
            console.log(`   - Length: ${finalPrivateKey.length}`);
            console.log(`   - Includes Header: ${finalPrivateKey.includes('BEGIN PRIVATE KEY')}`);
            console.log(`   - Newlines present: ${finalPrivateKey.includes('\n')}`);
        }

        super({
            clientID,
            teamID,
            keyID,
            // Use privateKeyString if available, otherwise use privateKeyLocation
            ...(finalPrivateKey
                ? { privateKeyString: finalPrivateKey }
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

            return user;
        } catch (error) {
            throw error;
        }
    }
}