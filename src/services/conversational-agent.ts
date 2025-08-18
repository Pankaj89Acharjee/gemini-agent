import 'dotenv/config';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatMessageHistory } from "langchain/memory";
import { getSQLToolkit } from "./sql-toolkit";
import { ToolInterface } from '@langchain/core/tools';

const LLM_Model = process.env.LLM_MODEL || 'gemini-1.5-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

export const model = new ChatGoogleGenerativeAI({
    model: LLM_Model,
    apiKey: geminiApiKey,
    temperature: 0, // More deterministic output
    maxOutputTokens: 2048, // Increased for multi-step reasoning
});

const messageHistory = new ChatMessageHistory();

// Simple classifier for basic queries
async function classifyQuery(input: string): Promise<{ type: 'simple' | 'complex', action?: string }> {
    const lowerInput = input.toLowerCase();
    
    // First, check for schema-related queries that should be complex
    if (lowerInput.includes('table') || lowerInput.includes('schema') || lowerInput.includes('structure') || 
        lowerInput.includes('column') || lowerInput.includes('database structure') || 
        lowerInput.includes('how many tables') || lowerInput.includes('what tables')) {
        return { type: 'complex' };
    }
    
    // Check for SQL-related queries
    if (lowerInput.includes('sql') || lowerInput.includes('query') || lowerInput.includes('select')) {
        return { type: 'complex' };
    }
    
    // Check for multi-step or analysis queries
    if (lowerInput.includes('compare') || lowerInput.includes('analyze') || lowerInput.includes('relationship') ||
        lowerInput.includes('between') || lowerInput.includes('and') || lowerInput.includes('then')) {
        return { type: 'complex' };
    }

    const classifierPrompt = `You are a SmartWeld assistant classifier. Analyze this user question and determine if it's simple or complex.

User question: "${input}"

Simple queries (use quick tools):
- count_records: For questions about total/how many telemetry records (NOT tables)
- latest_data: For questions about recent/latest telemetry data  
- active_devices: For questions about active devices
- high_temperature: For questions about high temperature records
- exceeded_current: For questions about current threshold violations

Complex queries (need advanced reasoning):
- Questions about database structure, tables, schema
- Questions requiring multiple steps
- Questions about data relationships
- Questions requiring custom SQL
- Questions requiring analysis or comparison

IMPORTANT: If the question asks about "tables", "schema", "database structure", or "how many tables", it should be classified as COMPLEX, not simple.

Respond with ONLY: "simple:action_name" or "complex" (e.g., "simple:count_records" or "complex")`;

    const classifierResponse = await model.invoke([["human", classifierPrompt]]);
    const response = classifierResponse.content.toString().trim().toLowerCase();
    
    if (response.startsWith('simple:')) {
        const action = response.split(':')[1];
        return { type: 'simple', action };
    } else {
        return { type: 'complex' };
    }
}

// Lightweight agent for simple queries
async function handleSimpleQuery(input: string, action: string): Promise<string> {
    const toolkit = await getSQLToolkit(model);
    const tools = toolkit.getTools();
    const quickTool = tools.find(t => t.name === 'smartweld_quick_query');

    if (quickTool) {
        return await quickTool._call(action);
    } else {
        return "Error: Quick query tool not available";
    }
}

// Robust advanced agent for complex queries
async function handleComplexQuery(input: string): Promise<string> {
    try {
        const toolkit = await getSQLToolkit(model);
        const tools = toolkit.getTools();

        console.log("🔧 Advanced Agent - Available tools:", tools.map(t => t.name));

        // Check for specific schema-related queries first
        const lowerInput = input.toLowerCase();
        if (lowerInput.includes('schema') || lowerInput.includes('tables') || lowerInput.includes('structure') || lowerInput.includes('columns')) {
            console.log("📊 Detected schema query, using database info tool");
            const dbInfoTool = tools.find(t => t.name === 'smartweld_database_info');
            if (dbInfoTool) {
                // Check if it's specifically asking for table count
                if (lowerInput.includes('how many tables') || lowerInput.includes('number of tables') || lowerInput.includes('count of tables')) {
                    const tablesInfo = await dbInfoTool._call('tables');
                    return `Here are the tables in the SmartWeld database:\n\n${tablesInfo}`;
                } else {
                    const schemaInfo = await dbInfoTool._call('schema');
                    return `Here's the SmartWeld database schema:\n\n${schemaInfo}`;
                }
            }
        }

        // Check for SQL-related queries
        if (lowerInput.includes('sql') || lowerInput.includes('query') || lowerInput.includes('select')) {
            console.log("🔍 Detected SQL query request");
            const sqlTool = tools.find(t => t.name === 'smartweld_sql_query');
            if (sqlTool) {
                // Try to extract a simple query or provide guidance
                if (lowerInput.includes('count')) {
                    const result = await sqlTool._call('SELECT COUNT(*) as total FROM DeviceTelemetries');
                    return `Here's the count of telemetry records:\n\n${result}`;
                } else if (lowerInput.includes('latest') || lowerInput.includes('recent')) {
                    const result = await sqlTool._call('SELECT * FROM DeviceTelemetries ORDER BY timestamp DESC LIMIT 5');
                    return `Here are the latest telemetry records:\n\n${result}`;
                }
            }
        }

        // Create a custom multi-step reasoning agent for other complex queries
        const reasoningPrompt = `You are an advanced SmartWeld assistant that can perform multi-step reasoning to answer complex questions.

Available tools:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

User question: "${input}"

Think step by step about how to answer this question. You can use multiple tools if needed.

Step 1: Determine what information you need
Step 2: Choose the appropriate tool(s) to get that information
Step 3: Execute the tool(s) and analyze the results
Step 4: Provide a comprehensive answer

Available tool actions:
- smartweld_quick_query: Use for 'count_records', 'latest_data', 'active_devices', 'high_temperature', 'exceeded_current'
- smartweld_sql_query: Use for custom SQL queries (only SELECT statements)
- smartweld_database_info: Use for 'schema', 'tables', 'sample_data'

Respond with your reasoning and the tools you want to use.`;

        const reasoningResponse = await model.invoke([["human", reasoningPrompt]]);
        console.log("🧠 Reasoning:", reasoningResponse.content);

        // Extract tool usage from reasoning
        const reasoning = reasoningResponse.content.toString();

        // Check if we need database info first
        if (reasoning.toLowerCase().includes('schema') || reasoning.toLowerCase().includes('tables')) {
            const dbInfoTool = tools.find(t => t.name === 'smartweld_database_info');
            if (dbInfoTool) {
                const schemaInfo = await dbInfoTool._call('schema');
                console.log("📊 Schema info retrieved");

                // Now ask for the specific query
                const followUpPrompt = `Based on this schema information:
${schemaInfo}

Now answer the user's question: "${input}"

Use the appropriate tool to get the specific data needed.`;

                const followUpResponse = await model.invoke([["human", followUpPrompt]]);
                const followUp = followUpResponse.content.toString();

                // Try to extract and execute the appropriate tool
                if (followUp.toLowerCase().includes('sql') || followUp.toLowerCase().includes('query')) {
                    const sqlTool = tools.find(t => t.name === 'smartweld_sql_query');
                    if (sqlTool) {
                        // Extract SQL query from the response (simplified approach)
                        const sqlMatch = followUp.match(/SELECT.*?;/i);
                        if (sqlMatch) {
                            const sqlQuery = sqlMatch[0];
                            const result = await sqlTool._call(sqlQuery);
                            return `Based on the database schema and your question, here's the result:\n\n${result}`;
                        }
                    }
                }
            }
        }

        // Fallback: try to use quick query if it makes sense
        if (reasoning.toLowerCase().includes('count') || reasoning.toLowerCase().includes('how many')) {
            const quickTool = tools.find(t => t.name === 'smartweld_quick_query');
            if (quickTool) {
                const result = await quickTool._call('count_records');
                return `Based on your question about counting records:\n\n${result}`;
            }
        }

        // If all else fails, provide a helpful response
        return `I understand you're asking: "${input}". This is a complex query that requires multi-step reasoning. 

Available tools I can use:
- Database schema information
- Custom SQL queries
- Quick data queries

Please try rephrasing your question to be more specific, or ask about:
- Database structure (tables, columns)
- Specific data counts or summaries
- Recent telemetry data
- Device information`;

    } catch (error) {
        console.error("❌ Error in advanced agent:", error);
        throw error;
    }
}

export async function getConversationalResponse(input: string, sessionId: string): Promise<any> {
    console.log("🚀 Hybrid Agent - User message:", input, "Session:", sessionId);

    try {
        // First, classify the query
        const classification = await classifyQuery(input);
        console.log("📊 Query classification:", classification);

        if (classification.type === 'simple' && classification.action) {
            // Use lightweight agent for simple queries
            console.log("⚡ Using lightweight agent for simple query");
            const result = await handleSimpleQuery(input, classification.action);
            return { content: result };
        } else {
            // Use advanced agent for complex queries
            console.log("🧠 Using advanced agent for complex query");
            const result = await handleComplexQuery(input);
            return { content: result };
        }

    } catch (error) {
        console.error("❌ Error in hybrid agent:", error);

        // Fallback to simple response if both agents fail
        return {
            content: `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}. Please try rephrasing your question.`
        };
    }
}
