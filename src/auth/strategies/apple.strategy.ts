// strategies/apple.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

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
            // Force Apple to return id_token in the POST body to ensure we have it
            authorizationURL: 'https://appleid.apple.com/auth/authorize?response_mode=form_post&response_type=code%20id_token',
        });
    }

    async validate(...args: any[]): Promise<any> {
        console.log('=== APPLE STRATEGY VALIDATE DEBUG START ===');
        const req = args[0]; 
        const accessToken = args[1];
        const refreshToken = args[2];
        const idToken = args[3];
        const profile = args[4];

        console.log('1. accessToken exists:', !!accessToken);
        console.log('2. refreshToken exists:', !!refreshToken);
        console.log('3. idToken (arg) type:', typeof idToken);
        console.log('3a. idToken (arg) value:', JSON.stringify(idToken));
        
        if (req && req.body) {
             console.log('4. req.body keys:', Object.keys(req.body));
             // Log useful parts of body without dumping everything if it's huge
             if (req.body.user) console.log('4a. req.body.user:', req.body.user);
             if (req.body.id_token) console.log('4b. req.body.id_token exists (length):', req.body.id_token.length);
        }

        try {
            let firstName = '';
            let lastName = '';
            let email = '';
            let appleId = '';

            // Handle idToken string vs object manually to be safe
            let decodedIdToken = idToken;
            if (typeof idToken === 'string') {
                try {
                    decodedIdToken = jwt.decode(idToken);
                } catch (e) {
                    console.error('AppleStrategy: Failed to decode idToken string:', e);
                }
            }

            // Extract Apple ID from decoded token
            if (decodedIdToken && decodedIdToken.sub) {
                appleId = decodedIdToken.sub;
            }

            // Fallback: Check req.body.id_token if appleId is explicitly missing
            // We forced response_type='code id_token', so it SHOULD be in req.body now.
            if (!appleId && req && req.body && req.body.id_token) {
                 console.log('AppleStrategy: Attempting to decode req.body.id_token');
                 try {
                     const bodyToken = jwt.decode(req.body.id_token);
                     if (bodyToken && typeof bodyToken === 'object') {
                         if (bodyToken['sub']) {
                             appleId = bodyToken['sub'];
                             console.log('AppleStrategy: Successfully extracted appleId from req.body.id_token');
                         }
                         if (bodyToken['email'] && !email) email = bodyToken['email'];
                     }
                 } catch (e) {
                     console.error('AppleStrategy: Failed to decode req.body.id_token:', e);
                 }
            }

            // Extract email from idToken (most reliable)
            if (decodedIdToken && decodedIdToken.email) {
                email = decodedIdToken.email;
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