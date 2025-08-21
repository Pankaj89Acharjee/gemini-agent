/// <reference types="node" />
import 'dotenv/config';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatMessageHistory } from "langchain/memory";
import { getSQLToolkit } from "./sql-toolkit";
import { ToolInterface } from '@langchain/core/tools';
import { langchainTool } from '../tools/langchainTool';
import { listDatabaseTables } from '../tools/listTableTool';
import { getTableSchema } from '../tools/getTableSchemaTool';
import sequelize from '../config/remoteDBConnection';

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

// Enhanced classifier for better query routing
async function classifyQuery(input: string): Promise<{ type: 'simple' | 'complex' | 'tool_specific', action?: string, tool?: string }> {
    const lowerInput = input.toLowerCase();

    // Check for specific tool requests
    if (lowerInput.includes('list tables') || lowerInput.includes('show tables') || lowerInput.includes('what tables')) {
        return { type: 'tool_specific', tool: 'listTables' };
    }

    if (lowerInput.includes('schema') || lowerInput.includes('structure') || lowerInput.includes('columns')) {
        return { type: 'tool_specific', tool: 'getSchema' };
    }

    // Check for SQL/database analysis queries
    if (lowerInput.includes('sql') || lowerInput.includes('query') || lowerInput.includes('select') ||
        lowerInput.includes('analyze') || lowerInput.includes('data') || lowerInput.includes('find')) {
        return { type: 'tool_specific', tool: 'langchain' };
    }

    // Check for simple queries
    if (lowerInput.includes('count') || lowerInput.includes('how many') || lowerInput.includes('latest')) {
        return { type: 'simple', action: 'count_records' };
    }

    // Default to complex for other queries
    return { type: 'complex' };
}

// Handle tool-specific queries
async function handleToolSpecificQuery(input: string, tool: string): Promise<string> {
    try {
        switch (tool) {
            case 'listTables':
                return await listDatabaseTables(sequelize);

            case 'getSchema':
                // Extract table name from input
                const tableMatch = input.match(/(?:table|schema|structure)\s+(?:of\s+)?['"]?(\w+)['"]?/i);
                if (tableMatch) {
                    const tableName = tableMatch[1];
                    return await getTableSchema(sequelize, tableName);
                } else {
                    return "Please specify a table name. Example: 'Show me the schema of users table'";
                }

            case 'langchain':
                const response = await langchainTool(input);
                return response.content;

            default:
                return "Unknown tool requested";
        }
    } catch (error) {
        console.error(`Error in tool ${tool}:`, error);
        return `Error executing ${tool}: ${error instanceof Error ? error.message : String(error)}`;
    }
}

// Lightweight agent for simple queries
async function handleSimpleQuery(input: string, action: string): Promise<string> {
    try {
        const toolkit = await getSQLToolkit(model);
        const tools = toolkit.getTools();
        const quickTool = tools.find(t => t.name === 'smartweld_quick_query');

        if (quickTool) {
            return await quickTool._call(action);
        } else {
            return "Error: Quick query tool not available";
        }
    } catch (error) {
        console.error("Error in simple query:", error);
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
}

// Robust advanced agent for complex queries
async function handleComplexQuery(input: string): Promise<string> {
    try {
        // For complex queries, use the langchain tool as it's most capable
        const response = await langchainTool(input);
        return response.content;
    } catch (error) {
        console.error("❌ Error in advanced agent:", error);
        return `Error processing complex query: ${error instanceof Error ? error.message : String(error)}`;
    }
}

export async function getConversationalResponse(input: string, sessionId: string): Promise<any> {
    console.log("🚀 Enhanced Agent - User message:", input, "Session:", sessionId);

    try {
        // First, classify the query
        const classification = await classifyQuery(input);
        console.log("📊 Query classification:", classification);

        if (classification.type === 'tool_specific' && classification.tool) {
            // Use specific tools for targeted queries
            console.log("🔧 Using specific tool:", classification.tool);
            const result = await handleToolSpecificQuery(input, classification.tool);
            return { content: result };
        } else if (classification.type === 'simple' && classification.action) {
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
        console.error("❌ Error in enhanced agent:", error);

        // Fallback to simple response if all agents fail
        return {
            content: `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}. Please try rephrasing your question.`
        };
    }
}
