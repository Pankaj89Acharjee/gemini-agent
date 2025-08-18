import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getConversationalResponse } from './services/conversational-agent';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'SmartWeld Agentic AI Server is running',
        timestamp: new Date().toISOString()
    });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        console.log(`📨 Received message: "${message}" from session: ${sessionId || 'unknown'}`);

        // Use the conversational agent for intelligent responses
        const response = await getConversationalResponse(message, sessionId || 'default');

        console.log(`✅ Response generated for session: ${sessionId || 'default'}`);

        res.json({ reply: response.content });
    } catch (error) {
        console.error('❌ Error in chat endpoint:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 SmartWeld Agentic AI Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
});

