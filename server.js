const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);
const wss = new WebSocket.Server({
    server,
    path: "/ws"
});
let phoneA = null;
let phoneB = null;
app.get("/", (req, res) => {
    res.send("RemoteControl WebSocket Server OK");
});
app.get("/status", (req, res) => {
    res.json({
        phoneA: phoneA !== null,
        phoneB: phoneB !== null
    });
});
function send(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
    }
}
function sendStatus() {
    const message = JSON.stringify({
        type: "STATUS",
        phoneA: phoneA !== null,
        phoneB: phoneB !== null
    });
    send(phoneA, message);
    send(phoneB, message);
}
wss.on("connection", (ws, request) => {
    const url = new URL(
        request.url,
        `http://${request.headers.host}`
    );
    const role = url.searchParams.get("role");
    console.log("WebSocket connected:", role);
    if (role === "A") {
        if (phoneA) {
            phoneA.close();
        }
        phoneA = ws;
        ws.role = "A";
        console.log("Phone A connected");
    } else if (role === "B") {
        if (phoneB) {
            phoneB.close();
        }
        phoneB = ws;
        ws.role = "B";
        console.log("Phone B connected");
    } else {
        ws.close(1008, "Invalid role");
        return;
    }
    sendStatus();
    ws.on("message", (data) => {
        const message = data.toString();
        console.log(
            `[${ws.role}] ${message.substring(0, 100)}`
        );
        if (ws.role === "A") {
            // A → B
            send(phoneB, message);
        } else if (ws.role === "B") {
            // B → A
            send(phoneA, message);
        }
    });
    ws.on("close", () => {
        console.log(
            "WebSocket closed:",
            ws.role
        );
        if (ws.role === "A" && phoneA === ws) {
            phoneA = null;
        }
        if (ws.role === "B" && phoneB === ws) {
            phoneB = null;
        }
        sendStatus();
    });
    ws.on("error", (error) => {
        console.error(
            "WebSocket error:",
            error.message
        );
    });
});
server.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Server running on port ${PORT}`
    );
});