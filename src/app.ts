import 'dotenv/config'
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/dbConnection';

const app = express();


connectDB().then(() => {
    console.log("Database connected and synced")
}).catch((error) => {
    console.error("Error in connection", error)
})



export default app