import { writable } from "svelte/store";
import io from "socket.io-client";

let fullContent: string = "";

let pythonContent: string = "";


const socket: ReturnType<typeof io> = io("ws://xlr8.online");

export const messages = writable<{ sender: "user" | "ai"; text: string }[]>([]);
export const pythonCode = writable<string>("");
export const stepFileUrl = writable<string | null>(null);
export const viewerBuffer = writable<boolean>(false);
export const errorLog = writable<string>("");

const backendURL = process.env.BACKEND_URL || "https://xlr8.online";

export function sendMessageToAI(message: string) {
    messages.update((msgs) => [...msgs, { sender: "user",  text: message }]);
    socket.emit("message", {message});

}

export function runPythonCode(pythonCode: string) {
    console.log('Running socket event...');
    socket.emit("rerun_python_code", {pythonCode});
}

socket.on("response", (data: { content: string }) => {
    fullContent = data.content;
    messages.update((msgs) => [...msgs, {sender: "ai", text: fullContent}]);
});

socket.on("delta", (data: {content: string}) => {
    fullContent += data.content;
    messages.update((msgs) => {
        if (msgs.length === 0 || msgs[msgs.length -1].sender !== "ai") {
            return [...msgs, { sender: "ai", text: fullContent }];
        } else {
            if (data.content !== "[DONE]") {
                msgs[msgs.length - 1].text = fullContent;
            } else {
                fullContent = "";
            }
            
            return msgs;
        }
    });
});

socket.on("clearPython", () => {
    pythonCode.set("");
    pythonContent = "";
})

socket.on("python_delta", (data: {content: string}) => {
    pythonContent += data.content;
    pythonCode.update(() => pythonContent);
});

socket.on("stepFilePath", (data: {content: string}) => {
    const stepFilename = data.content;  
    const url = `${backendURL}/generated-files/${stepFilename}`;
    stepFileUrl.set(url);
});

socket.on("program_output", (data: {content: string}) => {
    errorLog.set(data.content);
});

socket.on("startViewerBuffer", () => {
    console.log("⏳ Buffer started via socket event");
    viewerBuffer.set(true);
});

socket.on("endViewerBuffer", () => {
    console.log("✅ Buffer ended via socket event");
    viewerBuffer.set(false); // Stop buffering
});
  


export { socket }