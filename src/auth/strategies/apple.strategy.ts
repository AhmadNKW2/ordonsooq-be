// strategies/apple.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
//                                              ↓↓↓ THIS IS THE KEY FIX
export class AppleStrategy extends PassportStrategy(Strategy, 'apple', 6) {
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

        const formatKey = (key: string): string => {
            if (!key) return key;
            return key.replace(/\\n/g, '\n');
        };

        const finalPrivateKey = privateKeyString ? formatKey(privateKeyString) : undefined;

        super({
            clientID,
            teamID,
            keyID,
            ...(finalPrivateKey
                ? { privateKeyString: finalPrivateKey }
                : { privateKeyLocation }),
            callbackURL,
            passReqToCallback: true,
            scope: ['name', 'email'],
        });
    }

    async validate(
        req: any,
        accessToken: string,
        refreshToken: string,
        params: any,    // passport-apple passes id_token string as 4th arg
        profile: any,   // From userProfile(): decoded id_token or {}
    ): Promise<any> {
        const callbackShape = {
            paramsType: typeof params,
            isParamsString: typeof params === 'string',
            hasParamsIdToken:
                !!params &&
                typeof params === 'object' &&
                typeof params.id_token === 'string',
            hasBodyIdToken: typeof req?.body?.id_token === 'string',
            hasBodyUser: !!req?.body?.user,
        };

        console.log('🍎 [AppleStrategy] validate() callback shape:', callbackShape);
        console.log('🍎 [AppleStrategy] validate() called');
        console.log('   params keys:', params ? Object.keys(params) : 'null');
        console.log('   params.id_token exists:', !!params?.id_token);
        console.log('   profile keys:', profile ? Object.keys(profile) : 'null');
        console.log('   req._appleRawIdToken exists:', !!req?._appleRawIdToken);
        console.log('   req.body.id_token exists:', !!req?.body?.id_token);
        console.log('   req.body.user exists:', !!req?.body?.user);

        let appleId = '';
        let email = '';
        let firstName = '';
        let lastName = '';
        let rawIdTokenJwt = '';

        // ===========================================================
        // SOURCE 1: params as raw id_token string (passport-apple behavior)
        // ===========================================================
        if (typeof params === 'string' && params) {
            rawIdTokenJwt = params;
            console.log('   ✅ SOURCE 1: Found raw id_token in params string');
        }

        // ===========================================================
        // SOURCE 2: params.id_token (compat fallback if strategy returns object)
        // ===========================================================
        if (!rawIdTokenJwt && params?.id_token && typeof params.id_token === 'string') {
            rawIdTokenJwt = params.id_token;
            console.log('   ✅ SOURCE 2: Found id_token in params object');
        }

        // ===========================================================
        // SOURCE 3: req.body.id_token (Apple form_post)
        // ===========================================================
        if (!rawIdTokenJwt && req?.body?.id_token && typeof req.body.id_token === 'string') {
            rawIdTokenJwt = req.body.id_token;
            console.log('   ✅ SOURCE 3: Found id_token in req.body');
        }

        // Decode the JWT to extract sub (Apple ID) and email
        if (rawIdTokenJwt) {
            try {
                const decoded = jwt.decode(rawIdTokenJwt);
                if (decoded && typeof decoded === 'object') {
                    appleId = decoded['sub'] || '';
                    email = decoded['email'] || '';
                    console.log('   ✅ Decoded JWT → appleId:', appleId, '| email:', email);
                }
            } catch (e) {
                console.error('   ❌ Failed to decode id_token JWT:', e);
            }
        }

        // ===========================================================
        // SOURCE 4: profile object (decoded id_token from passport-apple
        //   userProfile, populated by our authenticate override)
        // ===========================================================
        if (!appleId && profile && typeof profile === 'object' && Object.keys(profile).length > 0) {
            if (profile.sub) {
                appleId = profile.sub;
                email = email || profile.email || '';
                console.log('   ✅ SOURCE 4: Found sub in profile');
            } else if (profile.id) {
                appleId = profile.id;
                email = email || profile.email || '';
                console.log('   ✅ SOURCE 4: Found id in profile');
            }
        }

        // ===========================================================
        // SOURCE 5: req.body.user (ONLY sent on FIRST authorization!)
        //   Apple sends name + email here only ONCE. You MUST save it.
        // ===========================================================
        if (req?.body?.user) {
            try {
                const userData =
                    typeof req.body.user === 'string'
                        ? JSON.parse(req.body.user)
                        : req.body.user;

                if (userData.name) {
                    firstName = userData.name.firstName || '';
                    lastName = userData.name.lastName || '';
                }
                if (!email && userData.email) {
                    email = userData.email;
                }
                console.log('   ✅ SOURCE 5: User data →', firstName, lastName, email);
            } catch (e) {
                console.error('   ❌ Failed to parse req.body.user:', e);
            }
        }

        // ===========================================================
        // FINAL VALIDATION
        // ===========================================================
        if (!appleId) {
            console.error('🍎 ❌ CRITICAL: Could not extract Apple ID from ANY source!');
            console.error('   Full debug:', JSON.stringify({
                paramsKeys: params ? Object.keys(params) : null,
                paramsType: typeof params,
                profileKeys: profile ? Object.keys(profile) : null,
                bodyKeys: req?.body ? Object.keys(req.body) : null,
            }, null, 2));
            throw new Error('Apple authentication failed: could not extract user ID');
        }

        const user = {
            appleId,
            email,
            firstName,
            lastName,
            accessToken,
            idToken: rawIdTokenJwt,
        };

        console.log('🍎 ✅ Apple auth successful:', JSON.stringify({
            appleId: user.appleId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
        }));

        return user;
    }
}