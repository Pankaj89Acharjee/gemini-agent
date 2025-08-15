import 'dotenv/config'
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatMessageHistory } from "langchain/memory";
import { getSQLToolkit } from "./sql-toolkit";
import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ToolInterface } from '@langchain/core/tools';
import { pull } from "langchain/hub";



const LLM_Model = process.env.LLM_MODEL || 'gemini-1.5-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

export const model = new ChatGoogleGenerativeAI({
    model: LLM_Model,
    apiKey: geminiApiKey,
    temperature: 0.5,
});

const prompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        `You are a helpful assistant for the "SmartWeld" IoT application.
         You have access to a database with welding telemetry data.
         
         You have access to the following tools:
         {tools}
         
         Use the following format:
         
         Question: the input question you must answer
         Thought: you should always think about what to do
         Action: the action to take, should be one of [{tool_names}]
         Action Input: the input to the action
         Observation: the result of the action
         ... (this Thought/Action/Action Input/Observation can repeat N times)
         Thought: I now know the final answer
         Final Answer: the final answer to the original input question`,
    ],
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
]);


const messageHistory = new ChatMessageHistory();


export async function getConversationalResponse(input: string, sessionId: string): Promise<any> {
    console.log("User message: ", input, sessionId);
    // Create agent with SQL toolkit
    const toolkit = getSQLToolkit(model);
    const tools = toolkit.getTools();

    // Get the official React prompt
    const reactPrompt = await pull("hwchase17/react");

    const agent = await createReactAgent({
        llm: model,
        tools: tools as ToolInterface[],
        prompt: reactPrompt as any,
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true, // Set to true to see agent's thought process
        maxIterations: 3, // Limit iterations to prevent loops
        handleParsingErrors: true, // Handle parsing errors gracefully
    });

    const result = await agentExecutor.invoke({
        input: input
    });

    return { content: result.output };


    // const agentWithHistory = new RunnableWithMessageHistory({
    //     runnable: agentExecutor,
    //     getMessageHistory: (_sessionId) => messageHistory,
    //     inputMessagesKey: "input",
    //     historyMessagesKey: "chat_history",
    // });

    // const result = await agentWithHistory.invoke(
    //     { input },
    //     {
    //         configurable: {
    //             sessionId: sessionId
    //         }
    //     }
    // );
    // return result;
}
