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

    /**
     * Override authenticate to capture id_token from Apple's token exchange.
     * 
     * passport-apple only reads id_token from req.body (form_post),
     * but with response_type=code, Apple doesn't send id_token in the body.
     * The id_token comes from the token exchange response instead.
     * We intercept it here so it's available via profile AND req._appleRawIdToken.
     */
    authenticate(req: any, options?: any) {
        const self = this as any;
        const oauth2 = self._oauth2;
        const originalGetToken = oauth2.getOAuthAccessToken.bind(oauth2);

        oauth2.getOAuthAccessToken = (
            code: string,
            grantParams: any,
            cb: Function,
        ) => {
            originalGetToken(
                code,
                grantParams,
                (err: any, accessToken: string, refreshToken: string, results: any) => {
                    if (!err && results?.id_token) {
                        // Store raw JWT on request (per-request, no race conditions)
                        req._appleRawIdToken = results.id_token;
                        // Set on strategy so passport-apple's userProfile() returns decoded token
                        try {
                            self.idToken = jwt.decode(results.id_token);
                        } catch (e) {
                            console.error('🍎 Failed to decode id_token from token exchange:', e);
                        }
                    }
                    cb(err, accessToken, refreshToken, results);
                },
            );
        };

        return (Strategy.prototype as any).authenticate.call(this, req, options);
    }

    async validate(
        req: any,
        accessToken: string,
        refreshToken: string,
        params: any,    // Token exchange response: { access_token, id_token, ... }
        profile: any,   // From userProfile(): decoded id_token or {}
    ): Promise<any> {
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
        // SOURCE 1: params.id_token (token exchange response)
        //   With callbackArity=6, passport-oauth2 passes the full
        //   token response as 'params'. Contains the raw id_token JWT.
        // ===========================================================
        if (params?.id_token && typeof params.id_token === 'string') {
            rawIdTokenJwt = params.id_token;
            console.log('   ✅ SOURCE 1: Found id_token in params (token exchange)');
        }

        // ===========================================================
        // SOURCE 2: req._appleRawIdToken (from our authenticate override)
        //   Fallback if callbackArity didn't work (older @nestjs/passport)
        // ===========================================================
        if (!rawIdTokenJwt && req?._appleRawIdToken) {
            rawIdTokenJwt = req._appleRawIdToken;
            console.log('   ✅ SOURCE 2: Found id_token in req._appleRawIdToken');
        }

        // ===========================================================
        // SOURCE 3: req.body.id_token (Apple form_post, if response_type included id_token)
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
                hasAppleRawIdToken: !!req?._appleRawIdToken,
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