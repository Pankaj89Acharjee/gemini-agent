import 'dotenv/config';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { getSQLToolkit } from "./sql-toolkit";

const LLM_Model = process.env.LLM_MODEL || 'gemini-1.5-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

// Create the LLM model
const model = new ChatGoogleGenerativeAI({
    model: LLM_Model,
    apiKey: geminiApiKey,
    temperature: 0,
    maxOutputTokens: 2048,
});

export class SmartWeldLangGraphAgent {
    private tools: any[];

    constructor() {
        this.tools = [];
    }

    async initialize() {
        try {
            // Get our custom SmartWeld tools
            const toolkit = await getSQLToolkit(model);
            this.tools = toolkit.getTools();

            console.log("🔧 LangGraph Agent - Available tools:", this.tools.map(t => t.name));
            console.log("✅ LangGraph Agent initialized successfully");
        } catch (error) {
            console.error("❌ Error initializing LangGraph Agent:", error);
            throw error;
        }
    }

    async processMessage(input: string, sessionId: string): Promise<string> {
        try {
            console.log("🚀 LangGraph Agent - Processing message:", input, "Session:", sessionId);

            // Bind tools to the model
            const modelWithTools = model.bindTools(this.tools);

            // Initialize messages array
            const messages = [
                new HumanMessage(`You are a SmartWeld assistant that can help users query their IoT welding database. 
                
Available tools:
${this.tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

User question: ${input}

Please use the appropriate tools to answer the user's question. If you need to use multiple tools, do so step by step.`)
            ];

            // ReAct loop - Reason and Act
            let maxIterations = 5;
            let iteration = 0;

            while (iteration < maxIterations) {
                iteration++;
                console.log(`🔄 ReAct iteration ${iteration}`);

                // Get the model's response
                const response = await modelWithTools.invoke(messages);
                messages.push(response);

                // Check if the response contains tool calls
                if (response.tool_calls && response.tool_calls.length > 0) {
                    console.log(`🔧 Executing ${response.tool_calls.length} tool call(s)`);

                    // Execute each tool call
                    for (const toolCall of response.tool_calls) {
                        const toolName = toolCall.name;
                        const toolArgs = toolCall.args;

                        console.log(`⚡ Executing tool: ${toolName} with args:`, toolArgs);

                        // Find the tool
                        const tool = this.tools.find(t => t.name === toolName);
                        if (tool) {
                            try {
                                // Execute the tool
                                const result = await tool._call(toolArgs.input);
                                console.log(`✅ Tool result:`, result.substring(0, 100) + "...");

                                // Add tool result to messages
                                messages.push(new ToolMessage({
                                    content: result,
                                    tool_call_id: toolCall.id
                                }));
                            } catch (error) {
                                console.error(`❌ Tool execution error:`, error);
                                messages.push(new ToolMessage({
                                    content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
                                    tool_call_id: toolCall.id
                                }));
                            }
                        } else {
                            console.error(`❌ Tool not found: ${toolName}`);
                            messages.push(new ToolMessage({
                                content: `Tool not found: ${toolName}`,
                                tool_call_id: toolCall.id
                            }));
                        }
                    }
                } else {
                    // No tool calls, we have a final answer
                    console.log("✅ Final answer generated");
                    break;
                }
            }

            // Get the final response
            const finalResponse = messages[messages.length - 1];
            console.log("✅ LangGraph Agent - Response generated");
            
            return finalResponse.content.toString();

        } catch (error) {
            console.error("❌ Error in LangGraph Agent:", error);
            throw error;
        }
    }
}

// Create a singleton instance
let agentInstance: SmartWeldLangGraphAgent | null = null;

export async function getLangGraphAgent(): Promise<SmartWeldLangGraphAgent> {
    if (!agentInstance) {
        agentInstance = new SmartWeldLangGraphAgent();
        await agentInstance.initialize();
    }
    return agentInstance;
}

export async function getConversationalResponse(input: string, sessionId: string): Promise<any> {
    try {
        const agent = await getLangGraphAgent();
        const response = await agent.processMessage(input, sessionId);
        return { content: response };
    } catch (error) {
        console.error("❌ Error in conversational response:", error);
        return {
            content: `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}. Please try rephrasing your question.`
        };
    }
}
