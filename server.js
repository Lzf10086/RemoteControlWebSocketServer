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

// ============================================================
// 手机连接
// ============================================================

let phoneA = null;
let phoneB = null;

// ============================================================
// 配对信息
// ============================================================

let pairCode = null;

// ============================================================
// 服务器状态
// ============================================================

setInterval(() => {

    console.log(
        "SERVER STATUS:",
        "A=",
        phoneA !== null,
        "B=",
        phoneB !== null,
        "A_OPEN=",
        phoneA?.readyState === WebSocket.OPEN,
        "B_OPEN=",
        phoneB?.readyState === WebSocket.OPEN,
        "A_PAIRED=",
        phoneA?.paired === true,
        "B_PAIRED=",
        phoneB?.paired === true
    );

}, 30000);

// ============================================================
// 生成 6 位验证码
// ============================================================

function generatePairCode() {

    return Math.floor(
        100000 + Math.random() * 900000
    ).toString();
}

// ============================================================
// 发送消息
// ============================================================

function send(ws, message) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {

        ws.send(message);

        return true;
    }

    return false;
}

// ============================================================
// 发送 JSON
// ============================================================

function sendJson(ws, data) {

    send(
        ws,
        JSON.stringify(data)
    );
}

// ============================================================
// 发送状态
// ============================================================

function sendStatus() {

    const message = {

        type: "STATUS",

        phoneA:
            phoneA !== null &&
            phoneA.readyState === WebSocket.OPEN,

        phoneB:
            phoneB !== null &&
            phoneB.readyState === WebSocket.OPEN,

        paired:
            phoneA !== null &&
            phoneB !== null &&
            phoneA.paired === true &&
            phoneB.paired === true
    };

    sendJson(phoneA, message);
    sendJson(phoneB, message);
}

// ============================================================
// 首页
// ============================================================

app.get("/", (req, res) => {

    res.send(
        "RemoteControl WebSocket Server OK"
    );
});

// ============================================================
// 状态
// ============================================================

app.get("/status", (req, res) => {

    res.json({

        phoneA:
            phoneA !== null &&
            phoneA.readyState === WebSocket.OPEN,

        phoneB:
            phoneB !== null &&
            phoneB.readyState === WebSocket.OPEN,

        paired:
            phoneA !== null &&
            phoneB !== null &&
            phoneA.paired === true &&
            phoneB.paired === true,

        pairCodeExists:
            pairCode !== null
    });
});

// ============================================================
// WebSocket 连接
// ============================================================

wss.on(
    "connection",
    (ws, request) => {

        const url =
            new URL(
                request.url,
                `http://${request.headers.host}`
            );

        const role =
            url.searchParams.get("role");

        console.log(
            "WebSocket connected:",
            role
        );

        // ====================================================
        // 检查角色
        // ====================================================

        if (
            role !== "A" &&
            role !== "B"
        ) {

            console.log(
                "Invalid role"
            );

            ws.close(
                1008,
                "Invalid role"
            );

            return;
        }

        // ====================================================
        // A 连接
        // ====================================================

        if (role === "A") {

            // 如果已经有正常的 A
            if (
                phoneA &&
                phoneA.readyState === WebSocket.OPEN
            ) {

                console.log(
                    "Phone A already connected, rejecting new connection"
                );

                send(
                    ws,
                    "ALREADY_CONNECTED:A"
                );

                ws.close(
                    1000,
                    "Phone A already connected"
                );

                return;
            }

            phoneA = ws;

            ws.role = "A";
            ws.paired = false;

            pairCode =
                generatePairCode();

            console.log(
                "Phone A connected"
            );

            console.log(
                "New pair code:",
                pairCode
            );

            send(
                ws,
                `PAIR_CODE:${pairCode}`
            );

            sendStatus();

            // =================================================
            // A 消息
            // =================================================

            ws.on(
                "message",
                (data) => {

                    handleMessage(
                        ws,
                        data.toString()
                    );
                }
            );

            // =================================================
            // A 断开
            // =================================================

            ws.on(
                "close",
                (code, reason) => {

                    console.log(
                        "WebSocket closed: A",
                        "code=",
                        code,
                        "reason=",
                        reason.toString()
                    );

                    handleDisconnect(ws);
                }
            );

            // =================================================
            // A 错误
            // =================================================

            ws.on(
                "error",
                (error) => {

                    console.error(
                        "Phone A WebSocket error:",
                        error.message
                    );
                }
            );

            return;
        }

        // ====================================================
        // B 连接
        // ====================================================
if (role === "B") {
    // 如果之前已经有 B，关闭旧连接
    if (
        phoneB &&
        phoneB !== ws
    ) {

        console.log(
            "Closing old Phone B"
        );

        try {
            phoneB.close();
        } catch (e) {
            console.log(
                "Error closing old Phone B:",
                e.message
            );
        }
    }

    // 新 B 成为当前 B
    phoneB = ws;

    ws.role = "B";
    ws.paired = false;

    console.log(
        "Phone B connected"
    );

    // B 等待配对
    send(
        ws,
        "WAITING_FOR_PAIR"
    );

    sendStatus();

    // =================================================
    // B 消息
    // =================================================

    ws.on(
        "message",
        (data) => {

            handleMessage(
                ws,
                data.toString()
            );

        }
    );

    // =================================================
    // B 断开
    // =================================================

    ws.on(
        "close",
        (code, reason) => {

            console.log(
                "WebSocket closed: B",
                "code=",
                code,
                "reason=",
                reason.toString()
            );

            handleDisconnect(
                ws
            );

        }
    );

    // =================================================
    // B 错误
    // =================================================

    ws.on(
        "error",
        (error) => {

            console.error(
                "Phone B WebSocket error:",
                error.message
            );

        }
    );

    return;
}
    }
);

// ============================================================
// 处理消息
// ============================================================

function handleMessage(
    ws,
    message
) {

    console.log(
        `[${ws.role}] ${message.substring(0, 100)}`
    );

    // ========================================================
    // A 消息
    // ========================================================

    if (ws.role === "A") {

        // ----------------------------------------------------
        // A 请求新的验证码
        // ----------------------------------------------------

        if (
            message === "REQUEST_PAIR_CODE"
        ) {

            if (phoneA !== ws) {
                return;
            }

            pairCode =
                generatePairCode();

            ws.paired = false;

            send(
                ws,
                `PAIR_CODE:${pairCode}`
            );

            if (phoneB) {

                phoneB.paired = false;

                send(
                    phoneB,
                    "PAIR_RESET"
                );
            }

            console.log(
                "New pair code:",
                pairCode
            );

            sendStatus();

            return;
        }

        // ----------------------------------------------------
        // A 尚未配对
        // ----------------------------------------------------

        if (
            !ws.paired ||
            !phoneB ||
            !phoneB.paired
        ) {

            console.log(
                "A not paired, message ignored"
            );

            return;
        }

        // ----------------------------------------------------
        // A → B：屏幕帧
        // ----------------------------------------------------

        if (
            message.startsWith("FRAME:")
        ) {

            console.log(
                "[A → B] FRAME:",
                message.length
            );

            const success =
                send(
                    phoneB,
                    message
                );

            if (!success) {

                console.log(
                    "[A → B] FRAME send failed"
                );
            }

            return;
        }

        // ----------------------------------------------------
        // A → B：普通消息
        // ----------------------------------------------------

        console.log(
            "[A → B]",
            message.substring(0, 100)
        );

        const success =
            send(
                phoneB,
                message
            );

        if (!success) {

            console.log(
                "[A → B] send failed"
            );
        }

        return;
    }

    // ========================================================
    // B 消息
    // ========================================================

    if (ws.role === "B") {

        // ----------------------------------------------------
        // B 输入验证码
        // ----------------------------------------------------

        if (
            message.startsWith("PAIR:")
        ) {

            const code =
                message
                    .substring("PAIR:".length)
                    .trim();

            console.log(
                "================================="
            );

            console.log(
                "B trying pair code:",
                code
            );

            console.log(
                "Current server pair code:",
                pairCode
            );

            console.log(
                "Phone A exists:",
                phoneA !== null
            );

            console.log(
                "Phone B exists:",
                phoneB !== null
            );

            console.log(
                "================================="
            );

            // ------------------------------------------------
            // 没有 A
            // ------------------------------------------------

            if (!phoneA) {

                console.log(
                    "PAIR FAILED: A_NOT_CONNECTED"
                );

                send(
                    ws,
                    "PAIR_FAILED:A_NOT_CONNECTED"
                );

                return;
            }

            // ------------------------------------------------
            // 没有验证码
            // ------------------------------------------------

            if (!pairCode) {

                console.log(
                    "PAIR FAILED: NO_PAIR_CODE"
                );

                send(
                    ws,
                    "PAIR_FAILED:NO_PAIR_CODE"
                );

                return;
            }

            // ------------------------------------------------
            // 验证码错误
            // ------------------------------------------------

            if (
                code !== pairCode
            ) {

                console.log(
                    "PAIR FAILED: INVALID_CODE"
                );

                console.log(
                    "B code:",
                    code
                );

                console.log(
                    "Server code:",
                    pairCode
                );

                send(
                    ws,
                    "PAIR_FAILED:INVALID_CODE"
                );

                return;
            }

            // ------------------------------------------------
            // 配对成功
            // ------------------------------------------------

            phoneA.paired = true;
            phoneB.paired = true;
            ws.paired = true;

            console.log(
                "================================="
            );

            console.log(
                "PAIR SUCCESS"
            );

            console.log(
                "Phone A and Phone B paired successfully"
            );

            console.log(
                "================================="
            );

            send(
                phoneA,
                "PAIR_SUCCESS"
            );

            send(
                phoneB,
                "PAIR_SUCCESS"
            );

            sendStatus();

            return;
        }

        // ----------------------------------------------------
        // B 尚未配对
        // ----------------------------------------------------

        if (
            !ws.paired ||
            !phoneA ||
            !phoneA.paired
        ) {

            console.log(
                "B not paired, message ignored"
            );

            return;
        }

        // ----------------------------------------------------
        // B 请求结束连接
        // ----------------------------------------------------

        if (
            message === "DISCONNECT_PAIR"
        ) {

            console.log(
                "B requested disconnect pair"
            );

            // A 解除配对
            if (phoneA) {

                phoneA.paired = false;

                send(
                    phoneA,
                    "PAIR_RESET"
                );
            }

            // B 解除配对
            if (phoneB) {

                phoneB.paired = false;

                send(
                    phoneB,
                    "PAIR_RESET"
                );
            }

            sendStatus();

            return;
        }

        // ----------------------------------------------------
        // B → A 普通控制命令
        // ----------------------------------------------------

        console.log(
            "[B → A]",
            message.substring(0, 100)
        );

        const success =
            send(
                phoneA,
                message
            );

        if (!success) {

            console.log(
                "[B → A] send failed"
            );
        }

        return;
    }
}

// ============================================================
// 断开连接
// ============================================================

function handleDisconnect(ws) {

    console.log(
        "================================="
    );

    console.log(
        "Handling disconnect:",
        ws.role
    );

    console.log(
        "ws.paired:",
        ws.paired
    );

    console.log(
        "================================="
    );

    // ========================================================
    // A 断开
    // ========================================================

    if (
        ws.role === "A" &&
        phoneA === ws
    ) {

        console.log(
            "Removing Phone A"
        );

        phoneA = null;

        pairCode = null;

        if (phoneB) {

            phoneB.paired = false;

            send(
                phoneB,
                "PAIR_RESET"
            );
        }
    }

    // ========================================================
    // B 断开
    // ========================================================

    if (
        ws.role === "B" &&
        phoneB === ws
    ) {

        console.log(
            "Removing Phone B"
        );

        phoneB = null;

        if (phoneA) {

            phoneA.paired = false;

            send(
                phoneA,
                "B_DISCONNECTED"
            );
        }
    }

    sendStatus();
}

// ============================================================
// 服务器启动
// ============================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );
    }
);
