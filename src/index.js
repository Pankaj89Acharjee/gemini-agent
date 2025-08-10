import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)


//Mock function for Smartweld for getting Tempertatiere
function getTemperature(deviceID, temperature = 99) {
    return {
        deviceId: deviceID,
        temperature: 79.5,
        unit: 'Celcius',
        status: temperature > 80 ? 'High' : 'Normal'
    }
}



//Tool Definition
const ToolDefinitions = [
    {
        function_declarations: [
            {
                name: 'getTemperature',
                description: 'Gets the temperature of the specified device',
                parameters: {
                    type: "object",
                    properties: {
                        deviceID: {
                            type: "string",
                            description: "Device Id"
                        }
                    },
                    required: ["deviceID"]
                }
            }
        ]
    }
];



//Toolcall schema for output
const ToolCallSchema = z.object({
    action: z.literal('getTemperature'),
    args: z.object({
        deviceID: z.string().min(1, "Device Id cannot be empty"),
    }),
});




async function myAgent(userRequest) {
    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        tools: ToolDefinitions,
        toolConfig: {
            functionCallingConfig: {
                mode: 'AUTO'
            }
        }
    })

    const systemPrompt = `You are a Smartweld AI Agent. Your primary goal is to assist users with device-related queries. If a user asks for a device's temperature, use the available 'getTemperature' tool. Otherwise, provide helpful advice or information.`


    console.log("Sending req to Gemini...")

    const chat = model.startChat({
        history: [
            {
                role: 'user',
                parts: [{ text: systemPrompt }]
            }
        ]
    })

    const result = await chat.sendMessage(userRequest)

    const aiOutput = result.response

    // Check for function calls in the response
    console.log("Raw response candidates:", JSON.stringify(aiOutput.candidates, null, 2))

    const functionCalls = aiOutput.functionCalls()


    //Checking if the Model has used the Tool call
    if (functionCalls && functionCalls.length > 0) {
        console.log("✅ AI made function call(s):", functionCalls)


        for (const functionCall of functionCalls) {
            console.log("Function call detaiuls", functionCall)

            if (functionCall.name === 'getTemperature') {
                const deviceIDNumber = functionCall.args.deviceID
                console.log(`Calling getTemperature fx with deviceID: ${deviceIDNumber}`)

                const toolCallResult = getTemperature(deviceIDNumber)
                console.log("Tool call result", toolCallResult)

                //Sending the functiopn call result back to the model to continue the conversation
                const functionResponse = [{
                    functionResponse: {
                        name: 'getTemperature',
                        response: toolCallResult
                    }
                }]

                const finalResult = await chat.sendMessage(functionResponse)
                console.log("Final AI response:", finalResult.response.text())
            } else {
                console.warn(`⚠️ Unrecognized function called: ${functionCall.name}`)
            }
        }
    } else {
        const textResponse = aiOutput.text()
        if (textResponse) {
            console.log("❌ AI did not make a function call.")
            console.log("Agent text response:", textResponse)
        } else {
            console.log("❌ No function calls or text response found")
            console.log("Raw response structure:", aiOutput)
        }
    }
}




// Running the Agent
console.log("\n--- Agent Run 1: Requesting temperature ---");
myAgent("What is the temperature of device 01222?");

console.log("\n--- Agent Run 2: General query ---");
myAgent("Hello, how are you today?");

console.log("\n--- Agent Run 3: Invalid device ID (should still attempt tool call) ---");
myAgent("Can you check device XYZ123's temperature?");