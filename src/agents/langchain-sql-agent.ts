import 'dotenv/config';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getSQLToolkit } from "./sql-toolkit";

const LLM_Model = process.env.LLM_MODEL || 'gemini-1.5-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const model = new ChatGoogleGenerativeAI({
    model: LLM_Model,
    apiKey: geminiApiKey,
    temperature: 0,
    maxOutputTokens: 2048,
});

export class LangChainSQLAgent {
    private sqlAgent: any;
    private db: any;
    private toolkit: any;

    constructor() {
        this.initializeAgent();
    }

    private async initializeAgent() {
        try {
            const sqlKit = await getSQLToolkit(model);
            this.sqlAgent = sqlKit.getAgent();
            this.db = sqlKit.getDatabase();
            this.toolkit = sqlKit.getTools();
            
            console.log("🚀 LangChain SQL Agent initialized successfully");
        } catch (error) {
            console.error("❌ Failed to initialize LangChain SQL Agent:", error);
            throw error;
        }
    }

    async processMessage(input: string, sessionId: string): Promise<string> {
        try {
            console.log("🧠 LangChain SQL Agent - Processing:", input);
            
            // Wait for agent to be initialized
            if (!this.sqlAgent) {
                await this.initializeAgent();
            }

            // Use the SQL Agent to process the query
            const result = await this.sqlAgent.invoke({
                input: input
            });

            console.log("✅ LangChain SQL Agent - Result:", result.output);
            
            return result.output;
        } catch (error) {
            console.error("❌ Error in LangChain SQL Agent:", error);
            
            // Fallback to direct SQL query if agent fails
            try {
                return await this.fallbackSQLQuery(input);
            } catch (fallbackError) {
                return `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}. Please try rephrasing your question.`;
            }
        }
    }

    private async fallbackSQLQuery(input: string): Promise<string> {
        console.log("🔄 Using fallback SQL query approach");
        
        // Simple keyword-based SQL generation as fallback
        const lowerInput = input.toLowerCase();
        
        if (lowerInput.includes('maximum') && lowerInput.includes('current') && lowerInput.includes('wm001')) {
            const query = `
                SELECT 
                    MAX(current) as max_current,
                    MIN(current) as min_current,
                    AVG(current) as avg_current,
                    COUNT(*) as total_readings
                FROM DeviceTelemetries 
                WHERE deviceId = 'WM001'
            `;
            
            const result = await this.db.run(query);
            return `📊 **Current Analysis for Device WM001**\n\n` +
                   `**Maximum Current**: ${result[0]?.max_current || 'N/A'}A\n` +
                   `**Minimum Current**: ${result[0]?.min_current || 'N/A'}A\n` +
                   `**Average Current**: ${result[0]?.avg_current ? result[0].avg_current.toFixed(2) : 'N/A'}A\n` +
                   `**Total Readings**: ${result[0]?.total_readings || 0}`;
        }
        
        if (lowerInput.includes('how many') && lowerInput.includes('device')) {
            const query = `SELECT COUNT(*) as device_count FROM Device`;
            const result = await this.db.run(query);
            return `📱 **Device Count**: ${result[0]?.device_count || 0} devices in the database`;
        }
        
        if (lowerInput.includes('tables')) {
            const tables = await this.db.getTableNames();
            return `📋 **Database Tables**: ${tables.join(', ')}`;
        }
        
        return "I'm having trouble processing your query. Please try rephrasing it.";
    }

    async getConversationHistory(sessionId: string): Promise<any[]> {
        // For now, return empty array - can be enhanced with persistent storage
        return [];
    }
}
