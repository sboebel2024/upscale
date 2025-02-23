import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { spawn, exec } from "child_process";
import OpenAI from "openai";
import fs, { watch } from "fs";
import path, { resolve } from "path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";


// Configure paths
const OUTPUT_DIR = path.join(__dirname, "generated_files");
let hit: boolean = false;

[OUTPUT_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Configure server
dotenv.config();
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: "http://localhost:5173", // Allow only your frontend
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));

app.use("/generated-files", express.static(OUTPUT_DIR));


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_2});

const extractPythonCode = (text: string): string => {
    let match = text.match(/```python([\s\S]*?)```/);
    return match ? match[1].trim() : "";
};

function detectPythonCode(content: string): boolean { 
    let match = content.match(/```python([\s\S]*)/);
    return !!match; 
}

function detectFullPythonCode(content: string): boolean {
    let match = content.match(/```python([\s\S]*?)```/);
    return !!match; 
}

const injectCustomShowObject = (code: string, stepFilePath: string): string => {
    // Define the custom Python function using backticks for multiline template literals
    const customShowObject = `
def show_object(obj, name=None, options=None, parent=None, **kwargs):
    import os
    step_file_path = "${stepFilePath.replace(".3mf", ".step")}"
    if os.path.exists(step_file_path):
        os.remove(step_file_path)  # Force overwrite by deleting the existing file
        print(f"🗑️ Removed existing file: {step_file_path}")
    
    stl_file_path = "${stepFilePath.replace(".3mf", ".step")}"
    if os.path.exists(stl_file_path):
        os.remove(stl_file_path)  # Force overwrite by deleting the existing file
        print(f"🗑️ Removed existing file: {stl_file_path}")

    tmf_file_path = "${stepFilePath}"
    if os.path.exists(tmf_file_path):
        os.remove(tmf_file_path)  # Force overwrite by deleting the existing file
        print(f"🗑️ Removed existing file: {tmf_file_path}")

    from cadquery import exporters
    # Export the object to a STEP file instead of visualizing it
    exporters.export(obj, "${stepFilePath}", exporters.ExportTypes.THREEMF)
    exporters.export(obj, "${stepFilePath.replace(".3mf", ".stl")}", exporters.ExportTypes.STL)
    exporters.export(obj, "${stepFilePath.replace(".3mf", ".step")}", exporters.ExportTypes.STEP)
`;

    // Return the combined Python code
    return `${customShowObject}\n${code}`;
}

const runPythonCode = async (code: string, ip: string, socket: Socket): Promise<ExecutionResult> => {
    console.log('Py code running...');

    let stepFilePath;
    let stepFilename;

    

    if (!sessions[ip]?.stepFilePath) {
        stepFilename = `${Date.now()}.3mf`;
        stepFilePath= path.join(OUTPUT_DIR, stepFilename);
        sessions[ip].stepFilePath = stepFilename;
    } else {
        stepFilePath = path.join(OUTPUT_DIR, sessions[ip].stepFilePath);
        stepFilename = sessions[ip].stepFilePath;
    }

    const fullCode = injectCustomShowObject(code, stepFilePath);


    return new Promise((resolve) => {
        let stepFileUrl;
        const pythonProcess = spawn("./cadEnv/bin/python3", ["-c", fullCode], {
            env: { ...process.env, VIRTUAL_ENV: "./cadEnv"}
        });

            let stdoutOutput = "";
        let stderrOutput = "";

        pythonProcess.stdout.on("data", (data) => {
        stdoutOutput += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
        stderrOutput += data.toString();
        });

        pythonProcess.on("close", (exitCode) => {
            stepFileUrl = fs.existsSync(stepFilePath) ? `/download/${stepFilename}` : null;

            // Store execution logs in memory
            if (sessions[ip]) {
                if (stdoutOutput.trim()) sessions[ip].history.push(`Python stdout:\n${stdoutOutput}`);
                if (stderrOutput.trim()) sessions[ip].history.push(`Python stderr:\n${stderrOutput}`);
            }

            resolve({ stepFileUrl, stdout: stdoutOutput, stderr: stderrOutput });
        });

    });
}

const streamAIResponse = async (prompt: string, socket: Socket, session: UserSession, ip: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are an assistant whose job it is to create CadQuery Python files. Show your CadQuery objects with the show_object method. ALWAYS create solid objects and try not to create wires. If you can, reuse the code that you have written before. You may use NumPy for math operations."},
                    { role: "user", content: prompt }
                ],
                stream: true
            });

            let fullResponse = "";
    
            for await (const chunk of stream) {
                if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
                    const token = chunk.choices[0].delta.content || "";
                    fullResponse += token;
                    if (detectPythonCode(fullResponse)) {

                        if (hit) {
                            socket.emit("delta", {content: "[DONE]"});
                        } else {
                            hit = true;
                        }

                        if (!(token.includes("python"))) {
                            socket.emit("python_delta", { content: token });
                        }


                        
                        if (detectFullPythonCode(fullResponse)) {
                            const session = sessions[ip]; 
                            const pythonCode: string = extractPythonCode(fullResponse);
                            console.log('Python code found: ', pythonCode);
                            socket.emit("startViewerBuffer");
                            runPythonCode(pythonCode, ip, socket).then((executionResult: ExecutionResult) => {
                                const stepFilename = sessions[ip].stepFilePath;
                                setTimeout(() => {
                                    socket.emit("stepFilePath", {content: stepFilename});
                                }, 250);
                                let executionMessage = "";

                                if (executionResult.stdout) {
                                    executionMessage += `Program Output: ${executionResult.stdout}\n`;
                                }
                                if (executionResult.stderr) {
                                    executionMessage += `Execution Errors:\n${executionResult.stderr}\n`;
                                }
                                if ((!executionResult.stderr) || (!executionResult.stdout)) {
                                    executionMessage += "Succesfully rendered!\n"
                                }
                                if (executionResult.stdout) session.history.push(`Python stdout:\n${executionResult.stdout}`);
                                if (executionResult.stderr) session.history.push(`Python stderr:\n${executionResult.stderr}`);
                        
                                console.log(executionMessage);
                        
                                socket.emit("program_output", {
                                    content: executionMessage
                                });
                                socket.emit("delta", {
                                    content: "[DONE]"
                                });
                                socket.emit("endViewerBuffer");
                            });
                            return;
                        }
                    } else {
                        socket.emit("delta", { content: token });
                    }
                }
            }

            resolve(fullResponse);
        } catch (e) {
            console.error("Stream errror: ", e);
            reject(e);
        }
    });
};

function deleteFile(filename: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use the appropriate command for your OS
      const command = `rm src/generated_files/${filename}`;

      if (!fs.existsSync(`src/generated_files/${filename}`)) {
        console.warn(`⚠️ File already deleted or not found: src/generated_files/${filename}`);
        return resolve(); // Silently ignore
      }
  
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Error deleting file: ${stderr}`);
          return reject(error);
        }
        console.log(`✅ File deleted: ${filename}`);
        resolve();
      });
    });
  }


interface ExecutionResult {
    stepFileUrl: string | null;
    stdout: string;
    stderr: string;
}

// Configure Memory
type UserSession = { ip: string; history: string[], stepFilePath: string; };
const sessions: Record<string, UserSession> = {};

function createLimitedHistory(): string[] {
    return new Proxy<string[]>([], {
        set(target, property: string | symbol, value: string): boolean {
            // Only handle numeric index assignments
            if (typeof property === 'string' && !isNaN(Number(property))) {
                target[property as any] = value;

                // Ensure the history length never exceeds 10
                if (target.length > 10) {
                    target.shift(); // Remove the oldest entry
                }
            }

            return true; // Indicate the set operation was successful
        }
    });
}


io.on("connection", (socket: Socket) => {
    const ip = socket.handshake.address || "unknown";
    if (!sessions[ip]) {
        sessions[ip] = {
            ip,
            history: createLimitedHistory(), // Use the custom proxy-limited history
            stepFilePath: ""
        };
    }

    console.log(`🟢 Client connected w/ IP ${ip}`);

    socket.on("disconnect", () => {
        console.log("🔴 Client disconnected.");
        const session = sessions[ip];

        if (session && session.stepFilePath) {
            try {
                deleteFile(session.stepFilePath);
                console.log(`✅ STEP file deleted for IP ${ip}`);
            } catch (error) {
                console.error(`❌ Error deleting file for IP ${ip}:`, error);
            }
        } else {
            console.warn(`⚠️ No session found for IP ${ip}`);
        }
        delete sessions[ip];
    });

    socket.on("message", async (data) => {
        const prompt = data.message;
        console.log(`📩 Received prompt: ${prompt}`);

        const session = sessions[ip];
        session.history.push(`User: ${prompt}`);
        const fullPrompt = session.history.join("\n");

        try {
            socket.emit("clearPython")
            const aiResponse = await streamAIResponse(fullPrompt, socket, session, ip);
            console.log('AI response found: ', aiResponse);
            // socket.emit("response", {
            //     content: aiResponse,
            // });

            socket.emit("response")

            session.history.push(`AI: ${aiResponse}`);

                
        } catch (error) {
            console.error("❌ AI Streaming Error:", error);
            socket.emit("error", { error: "An error occurred while processing your message." });
        }

    });

    socket.on("rerun_python_code", async (data) => {
        console.log('Rerunning Python code...', data.pythonCode);
        const pythonCodeBkt = data.pythonCode;
        const pythonCode = pythonCodeBkt.replace("```", "");
        const session = sessions[ip];
        console.log('Python code found: ', pythonCode);
        socket.emit("startViewerBuffer");
        runPythonCode(pythonCode, ip, socket).then((executionResult: ExecutionResult) => {
            const stepFilename = sessions[ip].stepFilePath;
            setTimeout(() => {
                socket.emit("stepFilePath", {content: stepFilename});
            }, 250);
            let executionMessage = "";
            if (executionResult.stdout) {
                executionMessage += `Program Output: ${executionResult.stdout}\n`;
            }
            if (executionResult.stderr) {
                executionMessage += `Execution Errors:\n${executionResult.stderr}\n`;
            }
            if ((!executionResult.stderr) || (!executionResult.stdout)) {
                executionMessage += "Succesfully rendered!\n"
            }
            if (executionResult.stdout) session.history.push(`Python stdout:\n${executionResult.stdout}`);
            if (executionResult.stderr) session.history.push(`Python stderr:\n${executionResult.stderr}`);
    
            console.log(executionMessage);
    
            socket.emit("program_output", {
                content: executionMessage
            });
            socket.emit("delta", {
                content: "[DONE]"
            });
            socket.emit("endViewerBuffer");
        });
        return;

    });

});

const PORT = 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 WebSocket Server Running on port ${PORT}...`);
});