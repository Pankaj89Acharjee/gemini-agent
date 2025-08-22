import 'dotenv/config';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
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
    description: "Execute SQL queries and perform comprehensive data analysis. This tool can automatically explore the database, find relevant tables, and return structured data with visualizations. Use for any data-related questions.",
    func: async (input) => {
        try {
            // Enhanced input with context for better table discovery
            const enhancedInput = `
                Context: User is asking about data analysis. Be proactive in:
                1. Finding relevant tables automatically
                2. Providing complete data with visualizations
                3. Including insights and recommendations

                User Query: ${input}

                Return a proper JSON response with summary, data, visualizations, insights, and recommendations.
                If you need to explore tables first, do it automatically without asking.
            `;

            const response = await langchainTool(enhancedInput);
            return response.content || "No data found.";
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return JSON.stringify({
                summary: `Analysis error: ${errorMessage}`,
                data: [],
                visualizations: [{
                    type: "text",
                    title: "Error",
                    data: `Unable to analyze data: ${errorMessage}`
                }],
                insights: [],
                recommendations: ["Check database connection", "Verify table names", "Try a simpler query"]
            });
        }
    }
});

// Create tools
const createTools = () => [
    new ListTablesTool(sequelize),
    new GetTableSchemaTool(sequelize),
    createSQLAnalysisTool(),
    // Add a workflow helper tool
    new DynamicTool({
        name: "workflow-helper",
        description: "Helps plan and execute multi-step database queries efficiently",
        func: async (input) => {
            return `Workflow suggestions for: "${input}"
                    1. List available tables to understand data structure
                    2. Identify tables related to the query (e.g., sensor_downtime, device_logs, etc.)  
                    3. Get schema of relevant tables if needed
                    4. Execute SQL analysis to retrieve and visualize data
                    5. Provide insights and recommendations

                    Use the tools in sequence for best results.`;
        }
    })
];

// System message for the agent
const SYSTEM_MESSAGE = `
    You are SmartWeld AI - an intelligent database assistant that provides React-friendly responses.

    CRITICAL BEHAVIOR RULES:
    🚀 BE PROACTIVE: When users ask about data, immediately explore and find it
    🎯 USE TOOLS AUTOMATICALLY: Don't ask permission, just use the appropriate tools
    🔍 BE INTELLIGENT: Make reasonable assumptions about table names and data

    TOOL SELECTION & WORKFLOW:
    1. For data queries (like "sensor downtime", "device data", "telemetry"):
    - First: Use list-database-tables to see available tables
    - Then: Use get-table-schema for relevant tables if needed
    - Finally: Use sql-analysis-tool to get the actual data

    2. Table name intelligence:
    - "sensor downtime" → look for tables like: sensor_downtime, downtime_logs, sensor_logs
    - "device data" → look for: devices, device_info, device_telemetry
    - "telemetry" → look for: telemetry, device_telemetry, sensor_data

    3. NEVER respond with "I need to find" - instead DO the finding!

    MANDATORY RESPONSE FORMAT (JSON only):
    {
    "summary": "Clear explanation of findings",
    "data": [...], // Raw data array - MUST include actual data when found
    "visualizations": [
        {
        "type": "table|bar_chart|pie_chart|line_chart|metric_card",
        "title": "Descriptive title",
        "data": [...], // Processed data for visualization
        "config": {
            "xAxis": "column_name",
            "yAxis": "column_name"
        }
        }
    ],
    "insights": ["Data-driven insights"],
    "recommendations": ["Actionable recommendations"]
    }

    VISUALIZATION GUIDELINES:
    - table: Always include for raw data display
    - bar_chart: For comparisons, rankings, quantities
    - pie_chart: For categorical breakdowns, status distributions  
    - line_chart: For time-based data, trends
    - metric_card: For key numbers, totals, counts

    EXAMPLES OF GOOD BEHAVIOR:
    ❌ "I need to find sensor downtime data"
    ✅ *Uses tools* → "Found 5 downtime records in sensor_downtime_logs table"

    ❌ "Could you specify which table?"
    ✅ *Lists tables, identifies relevant ones* → Shows actual data

    ALWAYS be helpful, proactive, and provide complete responses with actual data.`;


// Creating an agent function
const createAgent = async () => {
    const llm = createLLM();
    const tools = createTools();

    return createReactAgent({
        llm,
        tools,
        messageModifier: SYSTEM_MESSAGE
    });
};

// Main conversation handler Agent Function
export const getConversationalResponse = async (input: string, sessionId = null) => {
    console.log("🚀 SmartWeld AI - Processing:", input);

    try {
        const agent = await createAgent();

        // Enhanced input with explicit instructions for data queries
        const enhancedInput = `
User Query: ${input}

INSTRUCTIONS FOR THIS QUERY:
    - If asking about data/tables/records: Use list-database-tables FIRST, then sql-analysis-tool
    - If asking about "downtime", "sensor", "telemetry": These likely exist as tables - find and query them
    - If asking for "latest X records": Use SQL with ORDER BY and LIMIT
    - ALWAYS return proper JSON format with visualizations
    - Be proactive - don't ask for clarification, find the data!

    Expected response: Complete JSON with actual data, not placeholder responses.
        `;

        const result = await agent.invoke({
            messages: [["user", enhancedInput]]
        });

        // Extract final response from the message chain
        const messages = result.messages || [];
        const finalMessage = messages[messages.length - 1];
        let content = finalMessage?.content || "I couldn't generate a response.";

        // Clean up the response to remove markdown formatting
        if (typeof content === 'string') {
            content = content.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
        }

        // Try to parse as JSON, fallback to string format
        let parsedContent;
        try {
            parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
        } catch (parseError) {
            console.warn("Failed to parse as JSON:", parseError);
            // If not valid JSON, create a structured response
            parsedContent = {
                summary: content,
                data: null,
                visualizations: [{
                    type: "text",
                    title: "Response",
                    data: content
                }],
                insights: ["Response was not in expected JSON format"],
                recommendations: ["Agent needs to return proper JSON structure"]
            };
        }

        console.log("✅ Response generated");
        return {
            content: parsedContent,
            sessionId
        };

    } catch (error) {
        console.error("❌ Agent Error:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
            content: {
                summary: `Error: ${errorMessage}`,
                data: null,
                visualizations: [{
                    type: "text",
                    title: "Error",
                    data: `I encountered an error: ${errorMessage}. Please try rephrasing your question.`
                }],
                insights: [],
                recommendations: ["Try rephrasing your question", "Check if the data exists", "Verify table/column names"]
            },
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


export default {
    getConversationalResponse,
    testAgent
};