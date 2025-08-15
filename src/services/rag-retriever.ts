import 'dotenv/config'
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createRetrieverTool } from "langchain/tools/retriever";

const RAG_DIRECTORY = process.env.RAG_DIRECTORY || 'reports';
const VECTOR_STORE_PATH = process.env.VECTOR_STORE_PATH || './vector-store';

const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: "embedding-001", // or "text-embedding-004"
});


async function createVectorStore() {
    console.log("Checking for existing vector store...");
    try {
        // Try to load the vector store from disk
        const vectorStore = await FaissStore.load(VECTOR_STORE_PATH, embeddings);
        console.log("✅ Vector store loaded from disk.");
        return vectorStore;
    } catch (e) {
        console.log("No existing vector store found. Creating a new one...");
        // If it fails, it means the store doesn't exist, so create it
        const loader = new DirectoryLoader(RAG_DIRECTORY, {
            ".pdf": (path) => new PDFLoader(path),
        });

        const docs = await loader.load();
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const splitDocs = await splitter.splitDocuments(docs);

        const vectorStore = await FaissStore.fromDocuments(splitDocs, embeddings);
        await vectorStore.save(VECTOR_STORE_PATH);
        console.log("✅ New vector store created and saved to disk.");
        return vectorStore;
    }
}

export async function getRAGRetrieverTool() {
    const vectorStore = await createVectorStore();
    const retriever = vectorStore.asRetriever();

    const retrieverTool = createRetrieverTool(retriever, {
        name: "smartweld_document_retriever",
        description:
            "Searches and returns information from SmartWeld anomaly reports and technical documents. Use it for questions about specific incidents, error report summaries, or equipment maintenance procedures found in documents.",
    });

    return retrieverTool;
}
