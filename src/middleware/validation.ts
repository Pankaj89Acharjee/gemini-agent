import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Input validation schemas
const ChatRequestSchema = z.object({
    message: z.string()
        .min(1, 'Message cannot be empty')
        .max(1000, 'Message too long')
        .refine(msg => !msg.includes('DROP') && !msg.includes('DELETE') && !msg.includes('INSERT') && !msg.includes('UPDATE'), {
            message: 'Message contains forbidden SQL keywords'
        }),
    sessionId: z.string()
        .min(1, 'Session ID required')
        .max(100, 'Session ID too long')
        .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid session ID format')
});

// Rate limiting configuration
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

export const validateChatRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
        const validatedData = ChatRequestSchema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
            });
        }
        return res.status(500).json({ error: 'Internal validation error' });
    }
};

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const clientData = rateLimitMap.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
        rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
    }
    
    clientData.count++;
    next();
};

// Clean up old rate limit entries
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
        if (now > value.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, RATE_LIMIT_WINDOW);
