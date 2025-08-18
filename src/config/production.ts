export const productionConfig = {
    // Server settings
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Security settings
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true
    },
    
    // Rate limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    },
    
    // Database settings
    database: {
        maxConnections: 10,
        idleTimeout: 30000,
        acquireTimeout: 60000
    },
    
    // LLM settings
    llm: {
        model: process.env.LLM_MODEL || 'gemini-1.5-flash',
        temperature: 0,
        maxOutputTokens: 2048,
        timeout: 30000
    },
    
    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.NODE_ENV === 'production' ? 'json' : 'simple'
    },
    
    // Monitoring
    monitoring: {
        enabled: process.env.MONITORING_ENABLED === 'true',
        metricsPort: process.env.METRICS_PORT || 9090
    }
};
