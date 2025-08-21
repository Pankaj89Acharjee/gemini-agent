import 'dotenv/config';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ListTablesTool } from '../tools/listTableTool';
import { GetTableSchemaTool } from '../tools/getTableSchemaTool';
import { langchainTool } from '../tools/langchainTool';
import sequelize from '../config/remoteDBConnection';
import { DynamicTool } from '@langchain/core/tools';

// Environment setup
const LLM_Model = process.env.LLM_MODEL || 'gemini-2.0-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

// Initialize LLM model
const createLLM = () => new ChatGoogleGenerativeAI({
    model: LLM_Model,
    apiKey: geminiApiKey,
    temperature: 0,
    maxOutputTokens: 2048,
});

// Functional SQL Analysis Tool
const createSQLAnalysisTool = () => new DynamicTool({
    name: "sql-analysis-tool",
    description: "Execute SQL queries and perform data analysis using natural language. Use for complex queries, data analysis, joins, aggregations, and finding specific information in the database.",
    func: async (message) => {
        try {
            const response = await langchainTool(message);
            return response.content || "No data found.";
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `SQL analysis error: ${errorMessage}`;
        }
    }
});

// Create tools
const createTools = () => [
    new ListTablesTool(sequelize),
    new GetTableSchemaTool(sequelize),
    createSQLAnalysisTool()
];

// System message for the agent
const SYSTEM_MESSAGE = `

You are SmartWeld AI - an intelligent database assistant.

TOOL SELECTION RULES:
📋 Use "list-database-tables" for:
   - "show tables", "list tables", "what tables exist"
   - "table names", "database structure overview"

🔍 Use "get-table-schema" for:
   - "schema of X", "structure of X table", "columns in X"
   - "what fields does X have", "describe X table"

⚡ Use "sql-analysis-tool" for:
   - Data queries: "find", "show me", "get", "retrieve"
   - Analysis: "count", "sum", "average", "maximum", "minimum"
   - Filters: "where", "with condition", "that have"
   - Complex queries involving multiple tables or conditions

RESPONSE GUIDELINES:
- Always explain what tool you're using and why
- Provide clear, helpful answers
- If uncertain about table names, list tables first
- For complex queries, break down your approach`;

// Create agent function
const createAgent = async () => {
    const llm = createLLM();
    const tools = createTools();

    return createReactAgent({
        llm,
        tools,
        messageModifier: SYSTEM_MESSAGE
    });
};

// Main conversation handler
export const getConversationalResponse = async (message: string, sessionId = null) => {
    console.log("🚀 SmartWeld AI - Processing:", message);

    try {
        const agent = await createAgent();

        const result = await agent.invoke({
            messages: [["user", message]]
        });

        // Extract final response from the message chain
        const messages = result.messages || [];
        const finalMessage = messages[messages.length - 1];
        const content = finalMessage?.content || "I couldn't generate a response.";

        console.log("✅ Response generated");
        return {
            content: typeof content === 'string' ? content : JSON.stringify(content),
            sessionId
        };

    } catch (error) {
        console.error("❌ Agent Error:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
            content: `I encountered an error: ${errorMessage}. Please try rephrasing your question.`,
            sessionId
        };
    }
};

// Utility function to test the agent
export const testAgent = async () => {
    const testQueries = [
        "What tables are in the database?",
        "Show me the schema of the Device table",
        "Find the maximum current for device named 'Main Welding Unit'"
    ];

    for (const query of testQueries) {
        console.log(`\n🧪 Testing: "${query}"`);
        const result = await getConversationalResponse(query);
        console.log("📤 Response:", result.content);
        console.log("─".repeat(50));
    }
};

// Export for external use
export default {
    getConversationalResponse,
    testAgent
};