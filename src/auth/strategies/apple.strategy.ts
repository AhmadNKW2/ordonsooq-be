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

        const formatKey = (key: string): string => {
            if (!key) return key;
            return key.replace(/\\n/g, '\n');
        };

        const finalPrivateKey = privateKeyString ? formatKey(privateKeyString) : undefined;

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
            ...(finalPrivateKey
                ? { privateKeyString: finalPrivateKey }
                : { privateKeyLocation }
            ),
            callbackURL,
            passReqToCallback: true,
            scope: ['name', 'email'],       // ✅ Removed 'openid' — Apple doesn't use it
            // ✅ REMOVED authorizationURL override — it was causing duplicate parameters
        });
    }

    /**
     * Decode an id_token JWT string into its payload.
     * Returns null if decoding fails.
     */
    private decodeIdToken(token: string): Record<string, any> | null {
        try {
            const decoded = jwt.decode(token);
            if (decoded && typeof decoded === 'object') {
                return decoded as Record<string, any>;
            }
        } catch (e) {
            console.error('🍎 [AppleStrategy] Failed to decode JWT:', e);
        }
        return null;
    }

    /**
     * Check if a value is a non-empty object with actual data
     */
    private isValidPayload(obj: any): boolean {
        return obj && typeof obj === 'object' && Object.keys(obj).length > 0;
    }

    async validate(
        req: any,
        accessToken: string,
        refreshToken: string,
        idToken: any,
        profile: any,
    ): Promise<any> {
        console.log('🍎 [AppleStrategy] validate() called');
        console.log('   - accessToken exists:', !!accessToken);
        console.log('   - refreshToken exists:', !!refreshToken);
        console.log('   - idToken type:', typeof idToken, '| keys:', idToken ? Object.keys(idToken) : 'null');
        console.log('   - profile:', JSON.stringify(profile));
        console.log('   - req.body keys:', req?.body ? Object.keys(req.body) : 'none');
        console.log('   - req.body.id_token exists:', !!req?.body?.id_token);
        console.log('   - req.body.user exists:', !!req?.body?.user);

        let appleId = '';
        let email = '';
        let firstName = '';
        let lastName = '';
        let rawIdTokenString = '';

        // ===================================================================
        // SOURCE 1 (MOST RELIABLE): req.body.id_token
        // Apple sends this via form_post. Decode it ourselves.
        // ===================================================================
        if (req?.body?.id_token && typeof req.body.id_token === 'string') {
            rawIdTokenString = req.body.id_token;
            const decoded = this.decodeIdToken(rawIdTokenString);
            if (decoded) {
                appleId = decoded.sub || '';
                email = decoded.email || '';
                console.log('   ✅ SOURCE 1 (req.body.id_token) → appleId:', appleId, '| email:', email);
            }
        }

        // ===================================================================
        // SOURCE 2: idToken parameter from passport-apple
        // Sometimes it's the decoded payload, sometimes a JWT string,
        // sometimes {} (empty). Only use if SOURCE 1 failed.
        // ===================================================================
        if (!appleId && idToken) {
            if (typeof idToken === 'string') {
                // It's a raw JWT string
                rawIdTokenString = rawIdTokenString || idToken;
                const decoded = this.decodeIdToken(idToken);
                if (decoded) {
                    appleId = decoded.sub || '';
                    email = email || decoded.email || '';
                    console.log('   ✅ SOURCE 2 (idToken string) → appleId:', appleId);
                }
            } else if (this.isValidPayload(idToken) && idToken.sub) {
                // It's already a decoded payload object with actual data
                appleId = idToken.sub;
                email = email || idToken.email || '';
                console.log('   ✅ SOURCE 2 (idToken object) → appleId:', appleId);
            } else {
                console.log('   ⚠️ SOURCE 2: idToken is empty or invalid:', JSON.stringify(idToken));
            }
        }

        // ===================================================================
        // SOURCE 3: profile parameter from passport-apple
        // ===================================================================
        if (profile && this.isValidPayload(profile)) {
            if (!appleId && profile.id) appleId = profile.id;
            if (!email && profile.email) email = profile.email;
            if (profile.name) {
                firstName = firstName || profile.name.firstName || '';
                lastName = lastName || profile.name.lastName || '';
            }
            console.log('   ✅ SOURCE 3 (profile) → id:', profile.id, '| email:', profile.email);
        }

        // ===================================================================
        // SOURCE 4: req.body.user (ONLY sent on first authorization!)
        // Apple sends name/email here only once. You MUST store it.
        // ===================================================================
        if (req?.body?.user) {
            try {
                const userData = typeof req.body.user === 'string'
                    ? JSON.parse(req.body.user)
                    : req.body.user;

                if (userData.name) {
                    firstName = firstName || userData.name.firstName || '';
                    lastName = lastName || userData.name.lastName || '';
                }
                if (!email && userData.email) {
                    email = userData.email;
                }
                console.log('   ✅ SOURCE 4 (req.body.user) → firstName:', firstName, '| lastName:', lastName);
            } catch (e) {
                console.error('   ❌ SOURCE 4: Error parsing req.body.user:', e);
            }
        }

        // ===================================================================
        // FINAL VALIDATION
        // ===================================================================
        if (!appleId) {
            console.error('🍎 ❌ CRITICAL: Could not extract Apple ID from any source!');
            console.error('   Full req.body:', JSON.stringify(req?.body, null, 2));
            throw new Error('Apple authentication failed: could not extract user ID');
        }

        const user = {
            appleId,
            email,
            firstName,
            lastName,
            accessToken,
            idToken: rawIdTokenString || idToken,
        };

        console.log('🍎 ✅ Final user:', JSON.stringify({
            appleId: user.appleId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            hasAccessToken: !!user.accessToken,
            hasIdToken: !!user.idToken,
        }, null, 2));

        return user;
    }
}