import 'dotenv/config';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DataSource } from "typeorm";
import { SqlDatabase } from "@langchain/sql_db";
import { SqlToolkit } from "@langchain/sql_db";

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

export class LangGraphSQLAgent {
    private agent: any;
    private checkpointer: any;
    private db: any;

    constructor() {
        this.initializeAgent();
    }

    private async initializeAgent() {
        try {
            // Create TypeORM DataSource for SQLite
            const typeormDataSource = new DataSource({
                type: "sqlite",
                database: ".db.sequelize",
                synchronize: false,
                entities: [],
                logging: false
            });

            await typeormDataSource.initialize();

            // Create SqlDatabase from TypeORM DataSource
            this.db = await SqlDatabase.fromDataSourceParams({
                appDataSource: typeormDataSource,
                includesTables: ["DeviceTelemetries", "Device"],
                customDescription: {
                    "DeviceTelemetries": "Contains IoT telemetry data from welding devices with columns: id, deviceId, timestamp, temperature, gas, current, voltage, severity, possibleCause, recommendation, isCurrentExceeded, analysisTimestamp, isAnalysed",
                    "Device": "Contains device information with columns: id, deviceType, deviceId, deviceName, status"
                }
            });

            // Create SqlToolkit with the database and LLM
            const toolkit = new SqlToolkit(this.db, model);

            // Initialize memory to persist state between graph runs
            this.checkpointer = new MemorySaver();

            // Create ReAct agent with SQL tools
            this.agent = createReactAgent({
                llm: model,
                tools: toolkit.getTools(),
                checkpointSaver: this.checkpointer,
            });

            console.log("🚀 LangGraph SQL Agent initialized successfully");
            console.log("📊 Available tables:", await this.db.getTableNames());
        } catch (error) {
            console.error("❌ Failed to initialize LangGraph SQL Agent:", error);
            throw error;
        }
    }

    async processMessage(input: string, sessionId: string): Promise<string> {
        try {
            console.log("🧠 LangGraph SQL Agent - Processing:", input);
            
            // Wait for agent to be initialized
            if (!this.agent) {
                await this.initializeAgent();
            }

            // Use the LangGraph agent to process the query
            const agentFinalState = await this.agent.invoke(
                { messages: [new HumanMessage(input)] },
                { configurable: { thread_id: sessionId } }
            );

            const lastMessage = agentFinalState.messages[agentFinalState.messages.length - 1];
            const response = lastMessage.content;

            console.log("✅ LangGraph SQL Agent - Result:", response);
            
            return response;
        } catch (error) {
            console.error("❌ Error in LangGraph SQL Agent:", error);
            
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
        try {
            if (this.checkpointer) {
                const checkpoint = await this.checkpointer.get({ configurable: { thread_id: sessionId } });
                return checkpoint?.messages || [];
            }
            return [];
        } catch (error) {
            console.error("Error getting conversation history:", error);
            return [];
        }
    }
}
