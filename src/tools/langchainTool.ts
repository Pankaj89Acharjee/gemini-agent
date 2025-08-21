import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SqlToolkit } from "langchain/agents/toolkits/sql";
import { DataSource } from "typeorm";
import { SqlDatabase } from "langchain/sql_db";
import { dbConfig } from "../config/dbConfig";

export const langchainTool = async (clientQuestion: string) => {
      const datasource = new DataSource({
            type: "postgres",
            host: dbConfig.host,
            port: dbConfig.port,
            username: dbConfig.user,
            password: dbConfig.pass,
            database: dbConfig.name,
            schema: dbConfig.schema || 'public',
            synchronize: false,
            logging: false,
      });

      try {
            await datasource.initialize();

            // Auto-discover all tables and relationships
            const db = await SqlDatabase.fromDataSourceParams({
                  appDataSource: datasource,
            });

            const llm = new ChatGoogleGenerativeAI({
                  model: "gemini-2.0-flash",
                  apiKey: process.env.GEMINI_API_KEY,
                  temperature: 0
            });

            const toolkit = new SqlToolkit(db, llm);
            const agentExecutor = createReactAgent({
                  llm,
                  tools: toolkit.getTools(),
                  messageModifier: "You are a SQL expert. When querying data that spans multiple tables, use appropriate JOINs to connect related tables."
            });

            const events = await agentExecutor.stream(
                  { messages: [["user", clientQuestion]] },
                  { streamMode: "values" }
            );

            let finalText = "";

            const getTextFromPart = (part: unknown): string => {
                  if (typeof part === "string") return part;
                  if (part && typeof (part as any) === "object") {
                        const p: any = part;
                        if (typeof p.text === "string") return p.text;
                        if (typeof p.content === "string") return p.content;
                  }
                  return "";
            };

            for await (const event of events) {
                  const lastMsg = event.messages[event.messages.length - 1];
                  const content = (lastMsg as any)?.content;
                  if (typeof content === "string") {
                        finalText = content;
                  } else if (Array.isArray(content)) {
                        const joined = content
                              .map((c: unknown) => getTextFromPart(c))
                              .join("");
                        if (joined.trim()) {
                              finalText = joined;
                        }
                  }
            }

            return { content: finalText };

      } catch (error) {
            console.error("Database error:", error);
            return { content: `Error: ${error}` };
      } finally {
            if (datasource.isInitialized) {
                  await datasource.destroy();
            }
      }
};

